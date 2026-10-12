'use server';

import { createClient, createClientServiceRole } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { PlayerDTO, Gender } from '@/types';
import {
  categorizePlayerForTournament,
  resolveInitialPlayerProfile,
} from '@/lib/services/tournament-category-config';
import { normalizePlayerDni, sanitizeDniInput } from '@/lib/utils/player-dni';
import { ExistingPlayerMatch, findExistingPlayerByIdentity } from '@/lib/utils/player-identity';
import { createPlayerForCoupleService } from '@/lib/services/players/create-player-for-couple';
import { registrationErrorDetails } from '@/lib/tournaments/registration-log';
/**
 * Buscar jugadores existentes por nombre, apellido o DNI
 */
export async function searchPlayer(searchTerm: string) {
  const supabase = await createClient();
  console.log(`[searchPlayer] Buscando jugadores con término: "${searchTerm}"`);
  
  // Limpiar y preparar el término de búsqueda
  const cleanTerm = searchTerm.trim().toLowerCase();
  
  try {
    // Primero, verificar si la tabla existe y tiene algún registro
    const { count, error: countError } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true });
      
    if (countError) {
      console.error("[searchPlayer] Error verificando tabla players:", countError);
    } else {
      console.log(`[searchPlayer] Total de jugadores en la tabla: ${count}`);
    }
    
    // Buscar jugadores por nombre, apellido o DNI que coincida con el término de búsqueda
    // Incluir TODOS los jugadores (reales y de prueba) para facilitar testing
    const { data, error } = await supabase
      .from('players')
      .select('id, first_name, last_name, dni')
      .or(`first_name.ilike.%${cleanTerm}%,last_name.ilike.%${cleanTerm}%,dni.ilike.%${cleanTerm}%`)
      .limit(20);
    
    if (error) {
      console.error("[searchPlayer] Error en la consulta:", error);
      throw new Error("No se pudo buscar jugadores: " + error.message);
    }
    
    console.log(`[searchPlayer] Resultados encontrados: ${data?.length || 0}`, data);
    
    // Si no hay resultados, intentar una búsqueda más flexible
    if (!data || data.length === 0) {
      console.log("[searchPlayer] Sin resultados, intentando búsqueda más flexible");
      
      // Intentar buscar todos los jugadores
      const { data: allPlayers, error: allPlayersError } = await supabase
        .from('players')
        .select('id, first_name, last_name, dni')
        .limit(20);
      
      if (allPlayersError) {
        console.error("[searchPlayer] Error obteniendo todos los jugadores:", allPlayersError);
        return [];
      }
      
      console.log(`[searchPlayer] Total jugadores obtenidos: ${allPlayers?.length || 0}`);
      
      // Filtrar manualmente los resultados
      const filteredResults = allPlayers?.filter(player => {
        const firstName = (player.first_name || '').toLowerCase();
        const lastName = (player.last_name || '').toLowerCase();
        const dni = (player.dni || '').toLowerCase();
        return firstName.includes(cleanTerm) || lastName.includes(cleanTerm) || dni.includes(cleanTerm);
      });
      
      console.log(`[searchPlayer] Resultados en segundo intento: ${filteredResults?.length || 0}`);
      return filteredResults || [];
    }
    
    return data;
  } catch (generalError) {
    console.error("[searchPlayer] Error general:", generalError);
    // Devolver array vacío en caso de error para evitar romper la UI
    return [];
  }
}

export async function checkPlayerIdentity({
  firstName,
  lastName,
  dni,
  gender,
}: {
  firstName: string
  lastName: string
  dni?: string | null
  gender?: string | null
}): Promise<{
  success: boolean
  exists: boolean
  matchedBy: "dni" | "name" | null
  player: ExistingPlayerMatch | null
  error?: string
  status?: number
}> {
  const normalizedFirstName = firstName.trim()
  const normalizedLastName = lastName.trim()

  if (!normalizedFirstName || !normalizedLastName) {
    return {
      success: false,
      exists: false,
      matchedBy: null,
      player: null,
      error: "firstName y lastName son requeridos",
      status: 400,
    }
  }

  try {
    const supabase = await createClient()
    const identityResult = await findExistingPlayerByIdentity({
      supabase,
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      dni: dni || null,
      gender: gender || null,
    })

    if (identityResult.error) {
      return {
        success: false,
        exists: false,
        matchedBy: null,
        player: null,
        error: identityResult.error,
        status: 500,
      }
    }

    if (!identityResult.player) {
      return {
        success: true,
        exists: false,
        matchedBy: null,
        player: null,
      }
    }

    return {
      success: true,
      exists: true,
      matchedBy: identityResult.matchedBy,
      player: {
        id: identityResult.player.id,
        first_name: identityResult.player.first_name,
        last_name: identityResult.player.last_name,
        dni: identityResult.player.dni,
        score: identityResult.player.score,
        category_name: identityResult.player.category_name,
      },
    }
  } catch (error: any) {
    console.error("[checkPlayerIdentity] Unexpected error:", error)
    return {
      success: false,
      exists: false,
      matchedBy: null,
      player: null,
      error: error?.message || "Error interno del servidor",
      status: 500,
    }
  }
}

/**
 * Helper function to check and categorize a player if they haven't been categorized yet
 * This function assigns the minimum score for the category and marks the player as categorized
 */
async function checkAndCategorizePlayer(
  playerId: string,
  tournament: { category_name?: string | null; category_config?: unknown } | string,
  supabase: any,
) {
  const normalizedTournament =
    typeof tournament === 'string'
      ? { category_name: tournament, category_config: null }
      : tournament;

  return categorizePlayerForTournament({
    playerId,
    supabase,
    tournament: normalizedTournament,
  });
}

/**
 * Registrar un jugador para un torneo
 * Si es un jugador existente, solo lo inscribe
 * Si es un jugador nuevo, lo crea primero con el score más bajo de la categoría
 */
export async function registerNewPlayer({ 
  playerId, 
  tournamentId, 
  playerData, 
  isExistingPlayer 
}: { 
  playerId?: string; 
  tournamentId: string; 
  playerData?: { first_name: string; last_name: string; gender: string; dni?: string | null };
  isExistingPlayer: boolean;
}) {
  const supabase = await createClient();
  console.log(`[registerNewPlayer] Inscribiendo jugador en torneo ${tournamentId}`, {
    playerId,
    isExistingPlayer,
    playerData
  });
  
  // Obtener información del torneo para saber la categoría
  const { data: tournamentData, error: tournamentError } = await supabase
    .from('tournaments')
    .select(`
      *,
      club:club_id (
        id, 
        name
      )
    `)
    .eq('id', tournamentId)
    .single();
  
  if (tournamentError) {
    console.error("[registerNewPlayer] Error fetching tournament:", tournamentError);
    throw new Error("No se pudo obtener información del torneo");
  }
  
  console.log("[registerNewPlayer] Datos del torneo:", tournamentData);
  
  // Determinar el nombre de la categoría
  let playerToRegister = playerId;
  
  // Si es un nuevo jugador, verificar si ya existe con ese DNI
  if (!isExistingPlayer && playerData) {
    const normalizedDni = normalizePlayerDni(playerData.dni);
    const existingPlayerResult = await findExistingPlayerByIdentity({
      supabase,
      firstName: playerData.first_name,
      lastName: playerData.last_name,
      dni: playerData.dni,
      gender: playerData.gender,
    });

    if (existingPlayerResult.error) {
      console.error("[registerNewPlayer] Error al buscar jugador existente:", existingPlayerResult.error);
    } else if (existingPlayerResult.player) {
      playerToRegister = existingPlayerResult.player.id;
      console.log(
        `[registerNewPlayer] Reutilizando jugador existente por ${existingPlayerResult.matchedBy}: ${playerToRegister}`,
      );
    }

    if (!playerToRegister) {
      const initialPlayerProfile = await resolveInitialPlayerProfile({
        supabase,
        tournament: tournamentData,
      });

      const newPlayerData = {
        first_name: playerData.first_name,
        last_name: playerData.last_name,
        gender: playerData.gender,
        dni: normalizedDni.dni,
        dni_is_temporary: normalizedDni.dniIsTemporary,
        score: initialPlayerProfile.score,
        category_name: initialPlayerProfile.categoryName,
        is_categorized: true,
        created_at: new Date().toISOString()
      };
      
      // Los nuevos jugadores se crean sin club asignado
      
      console.log("[registerNewPlayer] Datos para crear jugador:", newPlayerData);
      
      const { data: newPlayer, error: newPlayerError } = await supabase
        .from('players')
        .insert(newPlayerData)
        .select('id')
        .single();
        
      if (newPlayerError) {
        console.error("[registerNewPlayer] Error creating new player:", newPlayerError);
        throw new Error("No se pudo crear el nuevo jugador");
      }
      
      playerToRegister = newPlayer.id;
      console.log("[registerNewPlayer] Nuevo jugador creado con ID:", playerToRegister);
    }
  } else if (isExistingPlayer && playerId) {
    // Si es un jugador existente, verificar que exista y categorizar si es necesario
    console.log("[registerNewPlayer] Verificando jugador existente:", playerId);
    const { data: existingPlayer, error: existingPlayerError } = await supabase
      .from('players')
      .select('id, dni, dni_is_temporary, is_categorized, score')
      .eq('id', playerId)
      .single();
      
    if (existingPlayerError) {
      console.error("[registerNewPlayer] Error verificando jugador existente:", existingPlayerError);
      throw new Error("No se pudo verificar el jugador existente");
    }
    
    console.log("[registerNewPlayer] Jugador existente verificado:", existingPlayer);
    
    // Check if the player needs to be categorized for their first tournament
    const categorizationResult = await checkAndCategorizePlayer(playerId, tournamentData, supabase);
    
    if (!categorizationResult.success) {
      console.error("[registerNewPlayer] Error categorizing existing player:", categorizationResult.message);
      throw new Error(categorizationResult.message);
    }
    
    if (categorizationResult.wasCategorized) {
      console.log(`[registerNewPlayer] Player ${playerId} was categorized with score ${categorizationResult.newScore} for category ${categorizationResult.categoryName}`);
    } else {
      console.log(`[registerNewPlayer] Player ${playerId} was already categorized`);
    }
  }
  
  // Verificar que no esté ya inscrito
  const { data: existingInscription, error: existingInscriptionError } = await supabase
    .from('inscriptions')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('player_id', playerToRegister);
    
  if (existingInscriptionError) {
    console.error("[registerNewPlayer] Error checking existing inscription:", existingInscriptionError);
    throw new Error("No se pudo verificar si el jugador ya está inscrito");
  }
  
  if (existingInscription && existingInscription.length > 0) {
    console.log("[registerNewPlayer] El jugador ya está inscrito:", existingInscription);
    throw new Error("El jugador ya está inscrito en este torneo");
  }
  
  // Inscribir al jugador en el torneo
  const { error: inscriptionError } = await supabase
    .from('inscriptions')
    .insert({
      player_id: playerToRegister,
      tournament_id: tournamentId,
      created_at: new Date().toISOString()
    });
    
  if (inscriptionError) {
    console.error("[registerNewPlayer] Error registering player:", inscriptionError);
    throw new Error("No se pudo inscribir al jugador en el torneo");
  }
  
  console.log("[registerNewPlayer] Jugador inscrito con éxito");
  
  // Revalidar la ruta para actualizar la UI
  try {
    console.log(`[registerNewPlayer] Revalidando ruta: /tournaments/${tournamentId}`);
    revalidatePath(`/tournaments/${tournamentId}`);
    // También revalidar la ruta principal de torneos
    revalidatePath('/tournaments');
  } catch (revalidateError) {
    console.error("[registerNewPlayer] Error al revalidar ruta:", revalidateError);
    // No lanzar error aquí para no interrumpir el flujo principal
  }
  
  return { success: true, message: "Jugador inscrito con éxito", playerId: playerToRegister };
} 

export async function getPlayerById(playerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId);
  if (error) {
    console.error("[getPlayerById] Error fetching player:", error);
    throw new Error("No se pudo obtener el jugador");
  }
  return data;
}

export async function getAllPlayersDTO(): Promise<PlayerDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('players')
    .select('id, first_name, last_name, dni, dni_is_temporary, score, category_name, gender');

  if (error) {
    console.error("[getAllPlayersDTO] Error fetching players:", error.message);
    throw new Error("No se pudo obtener los jugadores");
  }
  const playersDTO: PlayerDTO[] = [];
  for (const player of data) {
    playersDTO.push({
      id: player.id,
      first_name: player.first_name,
      last_name: player.last_name,
      dni: player.dni,
      dni_is_temporary: player.dni_is_temporary,
      score: player.score,
      category_name: player.category_name,
      gender: player.gender as Gender
    });
  }
  return playersDTO;
}

/**
 * Crear un jugador nuevo sin inscribirlo automáticamente al torneo
 * Esta función es útil cuando se está creando un jugador para formar una pareja
 */
export async function createPlayerForCouple({ 
  tournamentId, 
  playerData 
}: { 
  tournamentId: string; 
  playerData: {
    first_name: string;
    last_name: string;
    gender: string;
    dni?: string | null;
    phone?: string | null;
    forceCreateNew?: boolean;
  };
}) {
  const supabase = await createClient();
  return createPlayerForCoupleService(supabase, {
    tournamentId,
    playerData,
  });
}

export async function getPlayerGender(playerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('players')
    .select('gender')
    .eq('id', playerId)
    .single();
  if (error) {
    console.error("[getPlayerGender] Error fetching player:", error);
    throw new Error("No se pudo obtener el género del jugador");
  }
  return data.gender;
}

const toPlainServerActionResult = <T,>(value: T): T => {
  return JSON.parse(JSON.stringify(value)) as T;
};

/**
 * Verificar si los jugadores tienen telefono registrado
 * Retorna informacion sobre ambos jugadores y cuales necesitan agregar telefono
 */
export async function checkPlayersPhones(player1Id: string, player2Id: string): Promise<{
  success: boolean;
  code?: string;
  player1: { id: string; firstName: string; lastName: string; phone: string | null; needsPhone: boolean } | null;
  player2: { id: string; firstName: string; lastName: string; phone: string | null; needsPhone: boolean } | null;
  bothHavePhone: boolean;
  atLeastOneHasPhone: boolean;
  noneHasPhone: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  console.log(`[checkPlayersPhones] Verificando telefonos de jugadores: ${player1Id}, ${player2Id}`);
  
  const { data: players, error } = await supabase
    .from('players')
    .select('id, first_name, last_name, phone')
    .in('id', [player1Id, player2Id]);
  
  if (error) {
    console.error("[checkPlayersPhones] players_query_failed", registrationErrorDetails(error));
    return toPlainServerActionResult({ 
      success: false, 
      player1: null, 
      player2: null, 
      bothHavePhone: false,
      atLeastOneHasPhone: false,
      noneHasPhone: true,
      error: "No se pudieron obtener los datos de los jugadores",
      code: 'players_query_failed'
    });
  }
  
  if (!players || players.length !== 2) {
    return toPlainServerActionResult({ 
      success: false, 
      player1: null, 
      player2: null, 
      bothHavePhone: false,
      atLeastOneHasPhone: false,
      noneHasPhone: true,
      error: "No se encontraron ambos jugadores",
      code: 'players_not_found'
    });
  }
  
  const p1 = players.find(p => p.id === player1Id);
  const p2 = players.find(p => p.id === player2Id);
  
  const player1Data = p1 ? {
    id: p1.id,
    firstName: p1.first_name || '',
    lastName: p1.last_name || '',
    phone: p1.phone,
    needsPhone: !p1.phone || p1.phone.trim() === ''
  } : null;
  
  const player2Data = p2 ? {
    id: p2.id,
    firstName: p2.first_name || '',
    lastName: p2.last_name || '',
    phone: p2.phone,
    needsPhone: !p2.phone || p2.phone.trim() === ''
  } : null;
  
  const player1HasPhone = player1Data && !player1Data.needsPhone;
  const player2HasPhone = player2Data && !player2Data.needsPhone;
  
  const bothHavePhone = !!(player1HasPhone && player2HasPhone);
  const atLeastOneHasPhone = !!(player1HasPhone || player2HasPhone);
  const noneHasPhone = !player1HasPhone && !player2HasPhone;
  
  console.log(`[checkPlayersPhones] Resultado: player1 hasPhone=${player1HasPhone}, player2 hasPhone=${player2HasPhone}, atLeastOneHasPhone=${atLeastOneHasPhone}, noneHasPhone=${noneHasPhone}`);
  
  return toPlainServerActionResult({
    success: true,
    player1: player1Data,
    player2: player2Data,
    bothHavePhone,
    atLeastOneHasPhone,
    noneHasPhone
  });
}

/**
 * Actualizar el telefono de un jugador
 */
export async function updatePlayerPhone(playerId: string, phone: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  console.log(`[updatePlayerPhone] Actualizando telefono del jugador ${playerId}`);
  
  if (!phone || phone.trim().length < 6) {
    return { success: false, error: "El telefono debe tener al menos 6 caracteres" };
  }
  
  const { data: updated, error } = await supabase
    .from('players')
    .update({ phone: phone.trim() })
    .eq('id', playerId)
    .select('id')
    .maybeSingle();
  
  if (error || !updated) {
    console.error("[updatePlayerPhone] phone_update_unconfirmed", registrationErrorDetails(error));
    return { success: false, error: "No se pudo actualizar el telefono" };
  }
  
  console.log(`[updatePlayerPhone] Telefono actualizado exitosamente`);
  return { success: true };
}
