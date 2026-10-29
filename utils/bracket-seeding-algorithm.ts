// El cliente será pasado como parámetro desde el endpoint

import {
  filterOutDisqualifiedCouples,
  getActiveDisqualifiedCoupleIds,
} from '@/lib/services/tournament-disqualifications';

export interface CoupleRanking {
  couple_id: string;
  tournament_id: string;
  zone_id: string;
  position: number;
  wins: number;
  losses: number;
  games_for: number;
  games_against: number;
  games_difference: number;
  points: number;
  tie_info?: string;
  zones?: { name: string };
}

export interface BracketSeeding {
  P: number; // bracket size (potencia de 2)
  order: (number | 'BYE')[]; // posición -> seed (o BYE)
  position_by_seed: number[]; // seed -> posición
  first_round_pairs: [number, number][];
}

/**
 * ESTRATEGIAS DE ORDENAMIENTO PARA SEEDING
 * Estas funciones determinan el orden de las parejas para el seeding.
 * El algoritmo de serpenteo es independiente y funciona con cualquier ordenamiento.
 */

/**
 * Obtiene todas las parejas con sus datos de zona (función base para todas las estrategias)
 * INCLUYE DEDUPLICACION: Si una pareja aparece en multiples zonas, se queda con la mejor posicion
 */
async function getAllZonePositions(tournamentId: string, supabase: any): Promise<CoupleRanking[]> {
  const { data, error } = await supabase
    .from('zone_positions')
    .select(`
      couple_id,
      tournament_id,
      zone_id,
      position,
      wins,
      losses,
      games_for,
      games_against,
      games_difference,
      points,
      tie_info,
      zones!inner(name)
    `)
    .eq('tournament_id', tournamentId)
    .eq('is_definitive', true);

  if (error) {
    throw new Error(`Error fetching zone results: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  const disqualifiedCoupleIds = await getActiveDisqualifiedCoupleIds(tournamentId, supabase);
  const activeData = filterOutDisqualifiedCouples<CoupleRanking>(data as CoupleRanking[], disqualifiedCoupleIds);

  // DEDUPLICACION: Si una pareja aparece multiples veces, quedarse con la mejor posicion
  const coupleMap = new Map<string, CoupleRanking>();
  
  for (const couple of activeData) {
    const existing = coupleMap.get(couple.couple_id);
    
    if (!existing) {
      // Primera vez que vemos esta pareja
      coupleMap.set(couple.couple_id, couple);
    } else {
      // Pareja duplicada - quedarse con la mejor posicion (menor numero = mejor)
      // Si misma posicion, quedarse con mas puntos
      const shouldReplace = 
        couple.position < existing.position ||
        (couple.position === existing.position && couple.points > existing.points);
      
      if (shouldReplace) {
        console.warn(`[getAllZonePositions] Pareja duplicada detectada: ${couple.couple_id}. Reemplazando posicion ${existing.position} con ${couple.position}`);
        coupleMap.set(couple.couple_id, couple);
      } else {
        console.warn(`[getAllZonePositions] Pareja duplicada detectada: ${couple.couple_id}. Manteniendo posicion ${existing.position}, descartando ${couple.position}`);
      }
    }
  }

  const dedupedData = Array.from(coupleMap.values());
  
  if (dedupedData.length !== activeData.length) {
    console.warn(`[getAllZonePositions] Se eliminaron ${activeData.length - dedupedData.length} registros duplicados de ${activeData.length} totales`);
  }

  if (disqualifiedCoupleIds.size > 0) {
    console.log(`[getAllZonePositions] Excluidas ${data.length - activeData.length} parejas descalificadas del seeding`);
  }

  return dedupedData;
}

/**
 * ESTRATEGIA 1: Ordenamiento por performance general
 * Ordena por: posición → wins → diferencia → games a favor
 * Útil para zona única o cuando se quiere el mejor absoluto primero
 */
export async function getCouplesRankedByPerformance(tournamentId: string, supabase: any): Promise<CoupleRanking[]> {
  const allCouples = await getAllZonePositions(tournamentId, supabase);
  
  return allCouples.sort((a, b) => {
    // 1. Posición en zona (menor es mejor)
    if (a.position !== b.position) return a.position - b.position;
    
    // 2. Wins (más wins mejor)
    if (a.wins !== b.wins) return b.wins - a.wins;
    
    // 3. Diferencia de games (mayor mejor)
    if (a.games_difference !== b.games_difference) return b.games_difference - a.games_difference;
    
    // 4. Games a favor (más mejor)
    return b.games_for - a.games_for;
  });
}

/**
 * ESTRATEGIA 2: Ordenamiento round-robin por zonas
 * Ordena alternando entre zonas: 1A, 1B, 1C, 2A, 2B, 2C...
 * Ideal para torneos multi-zona donde queremos balancear zonas en el bracket
 */
export async function getCouplesRankedByZones(tournamentId: string, supabase: any): Promise<CoupleRanking[]> {
  const allCouples = await getAllZonePositions(tournamentId, supabase);
  
  if (allCouples.length === 0) return [];
  
  // Agrupar por posición (1, 2, 3...)
  const byPosition = new Map<number, CoupleRanking[]>();
  
  allCouples.forEach(couple => {
    if (!byPosition.has(couple.position)) {
      byPosition.set(couple.position, []);
    }
    byPosition.get(couple.position)!.push(couple);
  });
  
  // Ordenar cada grupo de posición por zona y luego por performance
  for (const [position, couples] of byPosition) {
    couples.sort((a, b) => {
      // 1. Ordenar por zone_name (Zona A, Zona B, Zona C...)
      const zoneNameA = a.zones?.name || '';
      const zoneNameB = b.zones?.name || '';
      if (zoneNameA !== zoneNameB) return zoneNameA.localeCompare(zoneNameB);
      
      // 2. En caso de empate en zona, ordenar por performance
      if (a.wins !== b.wins) return b.wins - a.wins;
      if (a.games_difference !== b.games_difference) return b.games_difference - a.games_difference;
      return b.games_for - a.games_for;
    });
  }
  
  // Construir resultado final alternando por zonas
  const result: CoupleRanking[] = [];
  const positions = Array.from(byPosition.keys()).sort((a, b) => a - b);
  
  for (const position of positions) {
    const couples = byPosition.get(position)!;
    result.push(...couples);
  }
  
  return result;
}

/**
 * ESTRATEGIA LEGACY: Mantener compatibilidad
 * Esta era la estrategia original - mantenerla para comparación/fallback
 */
export async function getCouplesRankedByZoneResults(tournamentId: string, supabase: any): Promise<CoupleRanking[]> {
  return getCouplesRankedByPerformance(tournamentId, supabase);
}

/**
 * Implementa el algoritmo de serpenteo para generar bracket positions
 * Basado en la especificación del archivo "Algoritmo bracket.txt"
 */
export function buildBracketSeeding(N: number): BracketSeeding {
  if (N <= 0) {
    return {
      P: 0,
      order: [],
      position_by_seed: [],
      first_round_pairs: []
    };
  }

  // Calcular P = siguiente potencia de 2 >= N
  let P = 1;
  while (P < N) {
    P *= 2;
  }

  let order: number[] = [];
  
  if (P === 1) {
    order = [1];
  } else {
    // Caso base: P >= 2
    order = [1, 2];
    
    // Duplicación iterativa
    while (order.length < P) {
      const m = order.length;
      const Nnew = 2 * m;
      const b: number[] = [];
      
      // Procesar pares consecutivos
      for (let i = 0; i < m; i += 2) {
        const x = order[i];
        const y = order[i + 1];
        
        // Patrón serpenteo: [x, Nnew+1-x, Nnew+1-y, y]
        b.push(x, Nnew + 1 - x, Nnew + 1 - y, y);
      }
      
      order = b;
    }
  }

  // Marcar BYEs (seeds > N)
  const orderWithByes: (number | 'BYE')[] = order.map(seed => seed > N ? 'BYE' : seed);

  // Construir position_by_seed
  const position_by_seed: number[] = new Array(N + 1); // 1-indexed
  for (let pos = 1; pos <= P; pos++) {
    const seed = orderWithByes[pos - 1];
    if (seed !== 'BYE' && typeof seed === 'number') {
      position_by_seed[seed] = pos;
    }
  }

  // Generar pares de primera ronda
  const first_round_pairs: [number, number][] = [];
  for (let pos = 1; pos <= P; pos += 2) {
    first_round_pairs.push([pos, pos + 1]);
  }

  return {
    P,
    order: orderWithByes,
    position_by_seed: position_by_seed.slice(1), // Remover índice 0 para que sea 0-indexed en la salida
    first_round_pairs
  };
}

/**
 * Actualiza la tabla tournament_couple_seeds con los seeds y bracket_positions calculados
 * INCLUYE VALIDACION DE DUPLICADOS: Lanza error si hay parejas duplicadas
 */
export async function updateTournamentCoupleSeeds(
  tournamentId: string,
  couplesRanked: CoupleRanking[],
  bracketSeeding: BracketSeeding,
  supabase: any
): Promise<void> {

  // VALIDACION DE DUPLICADOS: Verificar que no haya couple_ids repetidos
  const coupleIds = couplesRanked.map(c => c.couple_id);
  const uniqueCoupleIds = new Set(coupleIds);
  
  if (uniqueCoupleIds.size !== coupleIds.length) {
    // Encontrar los duplicados para el log
    const duplicates = coupleIds.filter((id, index) => coupleIds.indexOf(id) !== index);
    const uniqueDuplicates = [...new Set(duplicates)];
    
    console.error(`[updateTournamentCoupleSeeds] ERROR: Parejas duplicadas detectadas:`, uniqueDuplicates);
    throw new Error(`Parejas duplicadas detectadas en el seeding: ${uniqueDuplicates.join(', ')}. Esto indica un problema en zone_positions. Por favor, verifique y corrija los datos.`);
  }

  // Preparar los updates
  const updates = couplesRanked.map((couple, index) => {
    const seed = index + 1; // seed 1-indexed (1 es el mejor)
    const bracket_position = bracketSeeding.position_by_seed[index]; // 0-indexed array, pero posiciones son 1-indexed

    const updateData: any = {
      tournament_id: tournamentId,
      couple_id: couple.couple_id,
      seed,
      bracket_position
    };

    // Note: zone_id column doesn't exist in tournament_couple_seeds table anymore
    // Zone information is maintained in zone_positions table and linked via couple_id
    // This change fixes the "Could not find the 'zone_id' column" error for LONG tournaments

    return updateData;
  });

  // Primero, eliminar registros existentes para este torneo
  console.log(`[updateTournamentCoupleSeeds] 🗑️ Deleting existing seeds for tournament: ${tournamentId}`);

  const { error: deleteError } = await supabase
    .from('tournament_couple_seeds')
    .delete()
    .eq('tournament_id', tournamentId);

  if (deleteError) {
    throw new Error(`Error deleting existing seeds: ${deleteError.message}`);
  }

  console.log(`[updateTournamentCoupleSeeds] ✅ Existing seeds deleted successfully`);

  // Insertar nuevos registros
  console.log(`[updateTournamentCoupleSeeds] 📝 Inserting ${updates.length} new seeds (${uniqueCoupleIds.size} parejas unicas)`);

  const { error: insertError } = await supabase
    .from('tournament_couple_seeds')
    .insert(updates);

  if (insertError) {
    throw new Error(`Error inserting new seeds: ${insertError.message}`);
  }

  console.log(`[updateTournamentCoupleSeeds] ✅ ${updates.length} seeds inserted successfully`);
}

/**
 * Marca parejas como eliminadas en la tabla inscriptions
 * @param tournamentId ID del torneo
 * @param eliminatedCouples Array de couple_ids eliminados
 * @param eliminatedInRound Ronda donde ocurrió la eliminación
 * @param supabase Cliente de Supabase autenticado
 */
export async function markEliminatedCouples(
  tournamentId: string,
  eliminatedCouples: string[],
  eliminatedInRound: 'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL',
  supabase: any
): Promise<void> {
  if (eliminatedCouples.length === 0) {
    console.log(`[markEliminatedCouples] No couples to eliminate`);
    return;
  }

  console.log(`[markEliminatedCouples] 🚫 Marking ${eliminatedCouples.length} couples as eliminated in round: ${eliminatedInRound}`);

  const { error } = await supabase
    .from('inscriptions')
    .update({
      is_eliminated: true,
      eliminated_at: new Date().toISOString(),
      eliminated_in_round: eliminatedInRound
    })
    .eq('tournament_id', tournamentId)
    .in('couple_id', eliminatedCouples);

  if (error) {
    throw new Error(`Error marking couples as eliminated: ${error.message}`);
  }

  console.log(`[markEliminatedCouples] ✅ Successfully marked ${eliminatedCouples.length} couples as eliminated`);
}

/**
 * Marca una pareja específica como eliminada en un match específico
 * @param tournamentId ID del torneo
 * @param matchId ID del match donde ocurrió la eliminación
 * @param loserId ID de la pareja que perdió y fue eliminada
 * @param round Ronda donde ocurrió la eliminación
 * @param supabase Cliente de Supabase autenticado
 */
export async function updateEliminationStatus(
  tournamentId: string,
  matchId: string,
  loserId: string,
  round: 'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL',
  supabase: any
): Promise<{ success: boolean; error?: string }> {

  // Validar que no es un match de zona (no hay eliminaciones en zona)
  if (round === 'ZONE') {
    console.log(`[updateEliminationStatus] Skipping elimination for ZONE match ${matchId}`);
    return { success: true };
  }

  // Validar que el loserId no es null (evitar BYEs)
  if (!loserId) {
    console.log(`[updateEliminationStatus] No loser to eliminate in match ${matchId}`);
    return { success: true };
  }

  console.log(`[updateEliminationStatus] 🚫 Marking couple ${loserId} as eliminated in ${round} (match: ${matchId})`);

  try {
    const { error } = await supabase
      .from('inscriptions')
      .update({
        is_eliminated: true,
        eliminated_at: new Date().toISOString(),
        eliminated_in_round: round
      })
      .eq('tournament_id', tournamentId)
      .eq('couple_id', loserId);

    if (error) {
      console.error(`[updateEliminationStatus] Error updating elimination status:`, error);
      return { success: false, error: error.message };
    }

    console.log(`[updateEliminationStatus] ✅ Successfully marked couple ${loserId} as eliminated in ${round}`);
    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[updateEliminationStatus] Exception:`, error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Establece el estado completo de eliminación para un match (ROBUSTO)
 * Siempre marca ganador como NO eliminado y perdedor como eliminado
 * Funciona tanto para resultados iniciales como modificaciones
 */
export async function setCompleteEliminationState(
  tournamentId: string,
  matchId: string,
  winnerId: string,
  loserId: string,
  round: 'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL',
  supabase: any
): Promise<{ success: boolean; error?: string; operations: string[] }> {

  const operations: string[] = [];

  // Validar que no es match de zona
  if (round === 'ZONE') {
    console.log(`[setCompleteEliminationState] Skipping elimination for ZONE match ${matchId}`);
    return { success: true, operations: ['skipped-zone-match'] };
  }

  // Validar que ambas parejas existen
  if (!winnerId || !loserId) {
    console.log(`[setCompleteEliminationState] Skipping elimination - missing couples in match ${matchId}`);
    return { success: true, operations: ['skipped-missing-couples'] };
  }

  console.log(`[setCompleteEliminationState] 🔄 Setting complete elimination state for match ${matchId}`, {
    winner: winnerId,
    loser: loserId,
    round
  });

  try {
    // 1. SIEMPRE marcar ganador como NO eliminado (reparar inconsistencias)
    const { error: winnerError } = await supabase
      .from('inscriptions')
      .update({
        is_eliminated: false,
        eliminated_at: null,
        eliminated_in_round: null
      })
      .eq('tournament_id', tournamentId)
      .eq('couple_id', winnerId);

    if (winnerError) {
      console.error(`[setCompleteEliminationState] Error updating winner status:`, winnerError);
      return { success: false, error: winnerError.message, operations };
    }
    operations.push('winner-not-eliminated');

    // 2. SIEMPRE marcar perdedor como eliminado
    const { error: loserError } = await supabase
      .from('inscriptions')
      .update({
        is_eliminated: true,
        eliminated_at: new Date().toISOString(),
        eliminated_in_round: round
      })
      .eq('tournament_id', tournamentId)
      .eq('couple_id', loserId);

    if (loserError) {
      console.error(`[setCompleteEliminationState] Error updating loser status:`, loserError);
      return { success: false, error: loserError.message, operations };
    }
    operations.push('loser-eliminated');

    console.log(`[setCompleteEliminationState] ✅ Complete elimination state set successfully`);
    return { success: true, operations };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[setCompleteEliminationState] Exception:`, error);
    return { success: false, error: errorMessage, operations };
  }
}

/**
 * Revierte el estado de eliminación de una pareja (útil en modificaciones de resultados)
 * @param tournamentId ID del torneo
 * @param coupleId ID de la pareja que debe ser "des-eliminada"
 * @param supabase Cliente de Supabase autenticado
 */
export async function revertEliminationStatus(
  tournamentId: string,
  coupleId: string,
  supabase: any
): Promise<{ success: boolean; error?: string }> {

  if (!coupleId) {
    console.log(`[revertEliminationStatus] No couple to revert elimination`);
    return { success: true };
  }

  console.log(`[revertEliminationStatus] 🔄 Reverting elimination status for couple ${coupleId}`);

  try {
    const { error } = await supabase
      .from('inscriptions')
      .update({
        is_eliminated: false,
        eliminated_at: null,
        eliminated_in_round: null
      })
      .eq('tournament_id', tournamentId)
      .eq('couple_id', coupleId);

    if (error) {
      console.error(`[revertEliminationStatus] Error reverting elimination status:`, error);
      return { success: false, error: error.message };
    }

    console.log(`[revertEliminationStatus] ✅ Successfully reverted elimination for couple ${coupleId}`);
    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[revertEliminationStatus] Exception:`, error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Función principal para gestionar eliminaciones en cambios de resultado de matches
 * Maneja tanto el resultado inicial como las modificaciones de resultado
 * @param tournamentId ID del torneo
 * @param matchData Datos del match actual
 * @param newWinnerId ID del nuevo ganador
 * @param previousWinnerId ID del ganador anterior (null si es resultado inicial)
 * @param isModification True si es una modificación de resultado existente
 * @param supabase Cliente de Supabase autenticado
 */
export async function handleMatchEliminationUpdate(
  tournamentId: string,
  matchData: {
    id: string;
    round: 'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL';
    couple1_id: string | null;
    couple2_id: string | null;
    status: string;
  },
  newWinnerId: string,
  previousWinnerId: string | null,
  isModification: boolean,
  supabase: any
): Promise<{ success: boolean; error?: string; operations?: string[] }> {

  const operations: string[] = [];

  console.log(`[handleMatchEliminationUpdate] Processing elimination for match ${matchData.id}`, {
    round: matchData.round,
    newWinner: newWinnerId,
    previousWinner: previousWinnerId,
    isModification
  });

  try {
    // Validar que es un match eliminatorio
    if (matchData.round === 'ZONE') {
      console.log(`[handleMatchEliminationUpdate] Skipping elimination management for ZONE match`);
      return { success: true, operations: ['skipped-zone-match'] };
    }

    // Validar que ambas parejas existen (no es BYE)
    if (!matchData.couple1_id || !matchData.couple2_id) {
      console.log(`[handleMatchEliminationUpdate] Skipping elimination for BYE match`);
      return { success: true, operations: ['skipped-bye-match'] };
    }

    // Determinar el perdedor actual
    const currentLoserId = newWinnerId === matchData.couple1_id
      ? matchData.couple2_id
      : matchData.couple1_id;

    if (isModification && previousWinnerId) {
      // CASO: Modificación de resultado
      console.log(`[handleMatchEliminationUpdate] 🔄 Handling result modification`);

      // 1. Revertir eliminación del ganador anterior (que ahora pierde)
      const revertResult = await revertEliminationStatus(tournamentId, previousWinnerId, supabase);
      if (!revertResult.success) {
        return { success: false, error: `Failed to revert elimination: ${revertResult.error}` };
      }
      operations.push('reverted-previous-winner');

      // 2. Marcar como eliminado al nuevo perdedor
      const eliminateResult = await updateEliminationStatus(
        tournamentId,
        matchData.id,
        currentLoserId,
        matchData.round,
        supabase
      );
      if (!eliminateResult.success) {
        return { success: false, error: `Failed to eliminate new loser: ${eliminateResult.error}` };
      }
      operations.push('eliminated-new-loser');

    } else {
      // CASO: Resultado inicial
      console.log(`[handleMatchEliminationUpdate] ➕ Handling initial result`);

      // Solo marcar como eliminado al perdedor
      const eliminateResult = await updateEliminationStatus(
        tournamentId,
        matchData.id,
        currentLoserId,
        matchData.round,
        supabase
      );
      if (!eliminateResult.success) {
        return { success: false, error: `Failed to eliminate loser: ${eliminateResult.error}` };
      }
      operations.push('eliminated-loser');
    }

    console.log(`[handleMatchEliminationUpdate] ✅ Elimination management completed successfully`);
    return { success: true, operations };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[handleMatchEliminationUpdate] Exception:`, error);
    return { success: false, error: errorMessage, operations };
  }
}

/**
 * Estrategias de seeding disponibles
 */
export type SeedingStrategy = 'by-zones' | 'by-performance' | 'legacy';

/**
 * Función principal que orquesta todo el proceso de seeding
 * @param tournamentId ID del torneo
 * @param supabase Cliente de Supabase autenticado
 * @param strategy Estrategia de ordenamiento a usar
 */
export async function generateTournamentSeeding(
  tournamentId: string,
  supabase: any,
  strategy?: SeedingStrategy
): Promise<{
  couplesRanked: CoupleRanking[];
  bracketSeeding: BracketSeeding;
  totalCouples: number;
  strategy: SeedingStrategy;
}> {
  const { assertRegistrationExclusionsReviewed } = await import('@/lib/services/registration/registration-readiness')
  await assertRegistrationExclusionsReviewed(tournamentId)
  // 1. Auto-detect strategy based on tournament type if not provided
  if (!strategy) {
    console.log(`[generateTournamentSeeding] Auto-detecting strategy for tournament: ${tournamentId}`)

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('type')
      .eq('id', tournamentId)
      .single()

    if (tournamentError || !tournament) {
      console.warn(`[generateTournamentSeeding] Failed to auto-detect tournament type, defaulting to 'by-zones':`, tournamentError?.message)
      strategy = 'by-zones'
    } else {
      strategy = tournament.type === 'LONG' ? 'by-performance' : 'by-zones'
      console.log(`[generateTournamentSeeding] Auto-detected: ${tournament.type} → ${strategy}`)
    }
  }

  // 2. Seleccionar función de ordenamiento según estrategia
  let couplesRanked: CoupleRanking[];

  switch (strategy) {
    case 'by-zones':
      console.log(`[generateTournamentSeeding] Using BY-ZONES strategy (round-robin)`);
      couplesRanked = await getCouplesRankedByZones(tournamentId, supabase);
      break;
      
    case 'by-performance':
      console.log(`[generateTournamentSeeding] Using BY-PERFORMANCE strategy (best absolute)`);
      couplesRanked = await getCouplesRankedByPerformance(tournamentId, supabase);
      break;
      
    case 'legacy':
      console.log(`[generateTournamentSeeding] Using LEGACY strategy (compatibility)`);
      couplesRanked = await getCouplesRankedByZoneResults(tournamentId, supabase);
      break;
      
    default:
      throw new Error(`Unknown seeding strategy: ${strategy}`);
  }
  
  if (couplesRanked.length === 0) {
    throw new Error('No couples found with definitive zone positions');
  }

  // ✅ APLICAR FILTRO DE QUALIFYING ADVANCEMENT PARA TORNEOS LONG
  let finalCouplesRanked = couplesRanked;

  // Obtener configuración de qualifying advancement para torneos LONG
  const { data: rankingConfig } = await supabase
    .from('tournament_ranking_config')
    .select('qualifying_advancement_settings')
    .eq('tournament_id', tournamentId)
    .eq('is_active', true)
    .single();

  if (rankingConfig?.qualifying_advancement_settings?.enabled) {
    const couplesAdvance = rankingConfig.qualifying_advancement_settings.couples_advance;
    if (couplesAdvance && couplesAdvance < couplesRanked.length) {
      // Separar parejas que avanzan y las que se eliminan
      finalCouplesRanked = couplesRanked.slice(0, couplesAdvance);
      const eliminatedCouples = couplesRanked.slice(couplesAdvance);

      console.log(`[generateTournamentSeeding] 🎯 Qualifying advancement: ${couplesAdvance} couples advance out of ${couplesRanked.length}`);
      console.log(`[generateTournamentSeeding] 🚫 ${eliminatedCouples.length} couples will be eliminated in ZONE phase`);

      // Marcar parejas eliminadas en la tabla inscriptions
      if (eliminatedCouples.length > 0) {
        const eliminatedCoupleIds = eliminatedCouples.map(c => c.couple_id);
        await markEliminatedCouples(tournamentId, eliminatedCoupleIds, 'ZONE', supabase);
      }
    }
  }

  console.log(`[generateTournamentSeeding] Strategy ${strategy} produced ranking:`,
    finalCouplesRanked.slice(0, 6).map((c, i) => `Seed ${i+1}: ${c.zones?.name || c.zone_id} Pos ${c.position}`)
  );

  // 2. Generar bracket seeding con algoritmo serpenteo (independiente del ordenamiento)
  const bracketSeeding = buildBracketSeeding(finalCouplesRanked.length);

  // 3. Actualizar base de datos
  await updateTournamentCoupleSeeds(tournamentId, finalCouplesRanked, bracketSeeding, supabase);

  return {
    couplesRanked: finalCouplesRanked,
    bracketSeeding,
    totalCouples: finalCouplesRanked.length,
    strategy
  };
}
