import { createClient, createClientServiceRole } from "@/utils/supabase/server";
import { snakeAssignCouplesToZones } from "@/utils/zone-utils";
import { createApiResponse } from "@/utils/serialization";
import { validateCoupleMovement } from '@/utils/tournament-restrictions';
import { checkTournamentPermissions } from '@/utils/tournament-permissions';

import { MatchValidationService } from '@/lib/services/match-validation.service';
import { CoupleAvailabilityService } from '@/lib/services/couple-availability.service';
import { CorrectedDefinitiveAnalyzer } from '@/lib/services/corrected-definitive-analyzer'
import { SingleZoneDefinitiveAnalyzer } from '@/lib/services/single-zone-definitive-analyzer';
import { generatePlaceholderBracket } from '@/lib/services/bracket-generation-orchestrator';
import { ZoneFixturePlanner } from '@/lib/services/zone-fixture-planner.service';
import { ZoneRulesSyncService } from '@/lib/services/zone-rules-sync.service';
import { assessAmericanSingleZoneCandidate } from '@/lib/services/zone-match-recommendation/american-single-zone.service';
import {
  replaceZonePositionsAtomically,
} from '@/lib/services/zone-position/atomic-position-persistence';
import {
  applyAuthorizedZoneMembershipChanges,
  assertTournamentManagementPermission,
} from '@/lib/services/zone-position/zone-membership-transaction.service';
// import { Database } from "../../../../database.types"; // File not found

// -----------------------------------------------------------------------------
// Minimal Database interface declaration to satisfy TypeScript where the full
// generated Supabase types are not available in the frontend bundle. Extend it
// only with the tables actually referenced in this file to keep it lightweight
// and avoid breaking other imports. Replace with the real generated type when
// available.
// -----------------------------------------------------------------------------
interface Database {
  public: {
    Tables: {
      couples: {
        Row: {
          id: string
          player1_id: string
          player2_id: string
        }
      }
      inscriptions: {
        Row: {
          id: string
          tournament_id: string
          couple_id: string
          created_at: string
        }
      }
    }
  }
}

// NOTA: Algoritmo serpentino puro eliminado - ahora usamos Hybrid-Serpentino
// El Hybrid-Serpentino está implementado en bracket-seeding-algorithm.ts + bracket-generator.ts
// y proporciona las mismas garantías serpentinas pero con funcionalidad completa

// -----------------------------------------------------------------------------
// Tipos placeholder mínimos para evitar errores de compilación locales.
// En un refactor definitivo convendría importar los tipos reales desde
// '@/utils/bracket-generator' o '@/types'.
// -----------------------------------------------------------------------------

type Couple = {"couple_id": string, "player1": {id: string, first_name: string, last_name: string, score: number}, "player2": {id: string, first_name: string, last_name: string, score: number}};
type Zone = {
    id: string;
    name: string;
    created_at: string;
    couples: Couple[];
};

// Definición de tipos para las zonas
export type ZoneDefinition = {
  name: string; // El nombre legible/descriptivo de la zona
};

// Arreglo de zonas predefinidas
export const PREDEFINED_ZONES: ZoneDefinition[] = [
  { name: "Zona A" },
  { name: "Zona B" },
  { name: "Zona C" },
  { name: "Zona D" },
  { name: "Zona E" },
  { name: "Zona F" },
  { name: "Zona G" },
  { name: "Zona H" },
  { name: "Zona I" },
  { name: "Zona J" },
  { name: "Zona K" },
  { name: "Zona L" },
  { name: "Zona M" },
  { name: "Zona N" },
];



// Temporary types until missing imports are restored
type CoupleFromZone = {
  id: string;
  zoneId: string;
  zoneName: string;
  zonePosition: number;
  points: number;
  player1Name: string;
  player2Name: string;
};

type ZoneMatchHistory = {
  zoneId: string;
  zoneName: string;
  matches: Array<{
    couple1Id: string;
    couple2Id: string;
  }>;
};

// Tipos específicos para la consulta de inscripciones con parejas y jugadores
type PlayerDetails = any; // Simplified until Database types are available

type ZonePosition = {
  id: string;
  tournament_id: string;
  zone_id: string;
  couple_id: string;
  position: number;
  is_definitive: boolean;
  points: number;
  wins: number;
  losses: number;
  games_for: number;
  games_against: number;
  games_difference: number;
  player_score_total: number;
  tie_info: string | null;
  calculated_at: string;
  zone_name: string;
  zone_letter: string;
  couple_name: string;
  player1_name?: string;
  player2_name?: string;
};

type CoupleWithPlayers = Pick<Database['public']['Tables']['couples']['Row'], 'id' | 'player1_id' | 'player2_id'> & {
  player1: PlayerDetails[]; // **Corregido: Ahora es un arreglo**
  player2: PlayerDetails[]; // **Corregido: Ahora es un arreglo**
};

export type InscriptionWithCoupleAndPlayers = Pick<Database['public']['Tables']['inscriptions']['Row'], 'id' | 'tournament_id' | 'couple_id' | 'created_at'> & {
  couples: CoupleWithPlayers; // Sigue siendo un objeto CoupleWithPlayers (no un arreglo), ya que couple_id en inscriptions es una FK única para una inscripción de pareja.
};

export type AvailableCouple = {
  couple_id: string
  player1: {
    id: string
    first_name: string
    last_name: string
    score: number | null
  } | null
  player2: {
    id: string
    first_name: string
    last_name: string
    score: number | null
  } | null
}

export async function getTournamentCoupleInscriptions(
  tournamentId: string
): Promise<Couple[]> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("inscriptions")
    .select(`
      couples:couple_id (
        id,
        player1:player1_id (
          id,
          first_name,
          last_name,
          score
        ),
        player2:player2_id (
          id,
          first_name,
          last_name,
          score
        )
      )
    `)
    .eq("tournament_id", tournamentId) as { data: { couples: any }[] | null; error: any };

  if (error) {
    throw new Error(error.message);
  }

  if (!rows) return [];

  // Mapear a Couple
  const couples: Couple[] = rows.map((row) => {
    const c = row.couples;
    return {
      couple_id: c.id,
      player1: {
        id: c.player1[0]?.id,
        first_name: c.player1[0]?.first_name,
        last_name: c.player1[0]?.last_name,
        score: c.player1[0]?.score ?? 0,
      },
      player2: {
        id: c.player2[0]?.id,
        first_name: c.player2[0]?.first_name,
        last_name: c.player2[0]?.last_name,
        score: c.player2[0]?.score ?? 0,
      },
    };
  });

  // Ordenar de mayor a menor suma de score
  couples.sort((a, b) => {
    const totalA = (a.player1.score ?? 0) + (a.player2.score ?? 0);
    const totalB = (b.player1.score ?? 0) + (b.player2.score ?? 0);
    return totalB - totalA;
  });

  return couples;
}
// Mantener funciones existentes para compatibilidad
export type ZoneSkeleton = {
    name: string;   // "Zona A", "Zona B", etc.
    capacity: number; // 3 ó 4
    rounds_per_couple?: number | null;
    couples: Couple[];
  };
  
  export function createEmptyZones(totalCouples: number): ZoneSkeleton[] {
    if (totalCouples < 6) {
      throw new Error(`El torneo requiere al menos 6 parejas. Recibidas: ${totalCouples}.`);
    }
  
    let numZonesOf4 = 0;
    let numZonesOf3 = 0;
  
    switch (totalCouples % 4) {
      case 0:
        numZonesOf4 = totalCouples / 4;
        break;
      case 1:
        if (totalCouples < 9) {
          throw new Error(`No se pueden formar zonas con ${totalCouples} parejas (resto 1). Se requieren al menos 9.`);
        }
        numZonesOf4 = Math.floor(totalCouples / 4) - 2;
        numZonesOf3 = 3;
        break;
      case 2:
        numZonesOf4 = Math.floor(totalCouples / 4) - 1;
        numZonesOf3 = 2;
        break;
      case 3:
        numZonesOf4 = Math.floor(totalCouples / 4);
        numZonesOf3 = 1;
        break;
    }
  
    const zones: ZoneSkeleton[] = [];
    let zoneCounter = 0;
  
    const pushZone = (cap: number) => {
      zones.push({
        name: `Zona ${String.fromCharCode(65 + zoneCounter)}`,
        capacity: cap,
        couples: [],
      });
      zoneCounter++;
    };
  
    for (let i = 0; i < numZonesOf4; i++) pushZone(4);
    for (let i = 0; i < numZonesOf3; i++) pushZone(3);
  
    return zones;
  } 

export async function createTournamentZones(tournamentId: string) {
  await assertTournamentManagementPermission(tournamentId)
  const supabase = await createClient();
  const couples = await getTournamentCoupleInscriptions(tournamentId);
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('type, format_type, format_config')
    .eq('id', tournamentId)
    .single();

  if (tournamentError || !tournament) {
    throw new Error(tournamentError?.message || 'No se pudo obtener el formato del torneo');
  }

  const plan = ZoneFixturePlanner.planForTournament(tournament, couples.length);
  if (!plan.isValid) {
    throw new Error(plan.errors.join(' '));
  }

  const skeletons = plan.zones.map((zone) => ({
    name: zone.name,
    capacity: zone.size,
    rounds_per_couple: zone.matchesPerCouple,
    couples: [] as Couple[],
  }));

  const zones =
    plan.zoneMode === 'SINGLE_ZONE'
      ? skeletons.map((zone) => ({ ...zone, couples }))
      : snakeAssignCouplesToZones(couples, skeletons);

  // Persistir en la base de datos
  // 1) Insertar filas en "zones" y quedarnos con sus IDs generados
  const zonesToInsert = zones.map((z) => ({
    tournament_id: tournamentId,
    name: z.name,
    capacity: z.couples.length, // capacidad real (3 o 4)
    max_couples: z.capacity ?? z.couples.length,
    rounds_per_couple: 'rounds_per_couple' in z ? z.rounds_per_couple || null : null,
  }));

  const { data: insertedZones, error: insertZonesErr } = await supabase
    .from("zones")
    .insert(zonesToInsert)
    .select();

  if (insertZonesErr) throw new Error(insertZonesErr.message);

  // 2) Mapear nombre → id recién creado para poder crear zone_couples
  const idByName: Record<string, string> = {};
  insertedZones?.forEach((z: any) => {
    idByName[z.name] = z.id;
  });

  const membershipChanges: Array<{
    couple_id: string
    from_zone_id: null
    to_zone_id: string
    to_position: number
  }> = [];

  zones.forEach((z) => {
    const zoneId = idByName[z.name];
    let position = 1; // Contador de posición por zona

    z.couples.forEach((c) => {
      membershipChanges.push({
        couple_id: c.couple_id,
        from_zone_id: null,
        to_zone_id: zoneId,
        to_position: position++,
      });
    });
  });

  if (membershipChanges.length > 0) {
    await applyAuthorizedZoneMembershipChanges(tournamentId, membershipChanges);
  }

  // 4) Devolver zonas con IDs asignados
  const zonesWithIds = zones.map((z) => ({ ...z, id: idByName[z.name] }));

  return zonesWithIds;
}

// -----------------------------------------------------------------------------
//  Helpers
// -----------------------------------------------------------------------------

/** Cuenta cuántas parejas hay actualmente en una zona */
async function countCouplesInZone(zoneId: string, supabase: any): Promise<number> {
  const { count } = await supabase
    .from("zone_positions")  // ✅ Cambio: leer de zone_positions
    .select("*", { head: true, count: "exact" })
    .eq("zone_id", zoneId);
  return count ?? 0;
}

/** Devuelve true si la zona pertenece al torneo */
async function zoneBelongsToTournament(zoneId: string, tournamentId: string, supabase: any): Promise<boolean> {
  const { data, error } = await supabase
    .from("zones")
    .select("tournament_id")
    .eq("id", zoneId)
    .single();
  if (error || !data) return false;
  return data.tournament_id === tournamentId;
}

/** Verifica si una pareja ha jugado partidos finalizados en una zona específica */
async function coupleHasFinishedMatchesInZone(coupleId: string, zoneId: string, supabase: any): Promise<boolean> {
  const { count } = await supabase
    .from("matches")
    .select("*", { head: true, count: "exact" })
    .eq("zone_id", zoneId)
    .eq("status", "FINISHED")
    .or(`couple1_id.eq.${coupleId},couple2_id.eq.${coupleId}`);
  return (count ?? 0) > 0;
}

/** Verifica si una pareja tiene partidos activos (IN_PROGRESS o FINISHED) en cualquier zona del torneo */
async function coupleHasActiveMatchesInTournament(coupleId: string, tournamentId: string, supabase: any): Promise<boolean> {
  const { count } = await supabase
    .from("matches")
    .select("*", { head: true, count: "exact" })
    .eq("tournament_id", tournamentId)
    .in("status", ["IN_PROGRESS", "FINISHED"])
    .or(`couple1_id.eq.${coupleId},couple2_id.eq.${coupleId}`);
  return (count ?? 0) > 0;
}

/** 
 * Obtiene la lista de parejas de una zona que YA NO PUEDEN jugar más partidos
 * 🔥 NUEVA LÓGICA INTELIGENTE: Solo bloquear parejas que alcanzaron su límite máximo
 */
export async function getCouplesWithFinishedMatches(
  tournamentId: string,
  zoneId: string
): Promise<{
  success: boolean
  coupleIds?: string[]
  error?: string
}> {
  // Usar el nuevo servicio inteligente que considera límites reales por zona
  const result = await CoupleAvailabilityService.getUnavailableCouplesInZone(tournamentId, zoneId);
  
  if (!result.success) {
    return createApiResponse({ 
      success: false, 
      error: result.error || "Error al verificar disponibilidad de parejas" 
    });
  }

  return createApiResponse({ 
    success: true, 
    coupleIds: result.coupleIds || [] 
  });
}

/** Obtiene la lista de todas las parejas del torneo que tienen partidos activos (IN_PROGRESS o FINISHED) */
export async function getAllCouplesWithActiveMatches(
  tournamentId: string
): Promise<{
  success: boolean
  coupleIds?: string[]
  error?: string
}> {
  const supabase = await createClient()

  // Obtener parejas que tienen partidos activos (IN_PROGRESS o FINISHED) en cualquier zona del torneo
  const { data: matches, error } = await supabase
    .from("matches")
    .select("couple1_id, couple2_id")
    .eq("tournament_id", tournamentId)
    .in("status", ["IN_PROGRESS", "FINISHED"])

  if (error) {
    return createApiResponse({ success: false, error: error.message })
  }

  // Extraer IDs únicos de parejas
  const coupleIds = new Set<string>()
  matches?.forEach((match) => {
    coupleIds.add(match.couple1_id)
    coupleIds.add(match.couple2_id)
  })

  return createApiResponse({ success: true, coupleIds: Array.from(coupleIds) })
}

// -----------------------------------------------------------------------------
//  A) Agregar pareja a zona con capacidad 3/4
// -----------------------------------------------------------------------------

/**
 * Inserta la pareja en la zona si todavía hay lugar.
 * La capacidad esperada se pasa como parámetro para mayor flexibilidad.
 */
export async function addCoupleToZone(
  tournamentId: string,
  coupleId: string,
  zoneId: string,
  capacity: 3 | 4 | 5 = 3
): Promise<{ success: boolean; message?: string }> {
  try {
    await assertTournamentManagementPermission(tournamentId)
  } catch (permissionError: any) {
    return createApiResponse({ success: false, message: permissionError.message })
  }

  const supabase = await createClient();

  // 1. Validar zona ↔ torneo
  if (!(await zoneBelongsToTournament(zoneId, tournamentId, supabase))) {
    return createApiResponse({ success: false, message: "La zona no pertenece al torneo" });
  }

  // 2. Verificar que la pareja no tenga partidos activos en el torneo
  const hasActiveMatches = await coupleHasActiveMatchesInTournament(coupleId, tournamentId, supabase);
  if (hasActiveMatches) {
    return createApiResponse({ 
      success: false, 
      message: "No se puede agregar una pareja que tiene partidos activos en el torneo" 
    });
  }

  // 3. ¿Pareja ya está en alguna zona de este torneo?
  const { count: coupleExists } = await supabase
    .from("zone_positions")  // ✅ Cambio: leer de zone_positions
    .select("*, zones!inner(tournament_id)", { head: true, count: "exact" })
    .eq("couple_id", coupleId)
    .eq("zones.tournament_id", tournamentId);
  if ((coupleExists ?? 0) > 0) {
    return createApiResponse({ success: false, message: "La pareja ya pertenece a una zona" });
  }

  // 4. Capacidad
  const capacitySync = await ZoneRulesSyncService.syncZoneRulesForZone(supabase, zoneId);
  if (!capacitySync.success) {
    return createApiResponse({ success: false, message: capacitySync.error || "Error sincronizando reglas de zona" });
  }

  const current = await countCouplesInZone(zoneId, supabase);
  const maxAllowedCouples = Math.max(capacity, capacitySync.maxCouples || capacity);
  if (current >= maxAllowedCouples) {
    return createApiResponse({ success: false, message: "La zona está completa" });
  }

  // 5. ✅ SIEMPRE insertar en zone_positions (nueva fuente de verdad)
  try {
    await applyAuthorizedZoneMembershipChanges(tournamentId, [{
      couple_id: coupleId,
      from_zone_id: null,
      to_zone_id: zoneId,
      to_position: current + 1,
    }]);
  } catch (membershipError: any) {
    return createApiResponse({ success: false, message: membershipError.message || "Error al asignar zona" });
  }

  const syncResult = await ZoneRulesSyncService.syncZoneRulesForZone(supabase, zoneId);
  if (!syncResult.success) {
    return createApiResponse({ success: false, message: syncResult.error || "Error sincronizando reglas de zona" });
  }

  try {
    await updateZonePositions(tournamentId, zoneId);
  } catch (recalcError: any) {
    console.error('[addCoupleToZone] Error recalculando posiciones:', recalcError);
    return createApiResponse({
      success: false,
      message: `La pareja fue asignada, pero no se pudo recalcular la zona: ${recalcError.message}`,
    });
  }

  return createApiResponse({ success: true });



}

// -----------------------------------------------------------------------------
//  B) Mover pareja a otra zona (si hay lugar)
// -----------------------------------------------------------------------------

export async function moveCoupleToZone(
  tournamentId: string,
  fromZoneId: string,
  toZoneId: string,
  coupleId: string,
  capacityDest: 3 | 4 | 5 = 3
): Promise<{ success: boolean; message?: string }> {
  try {
    await assertTournamentManagementPermission(tournamentId)
  } catch (permissionError: any) {
    return createApiResponse({ success: false, message: permissionError.message })
  }

  const supabase = await createClient();

  // 1. Validar zonas ↔ torneo
  const belongsFrom = await zoneBelongsToTournament(fromZoneId, tournamentId, supabase);
  const belongsTo = await zoneBelongsToTournament(toZoneId, tournamentId, supabase);
  if (!belongsFrom || !belongsTo) return createApiResponse({ success: false, message: "Zona inválida" });

  // 2. Verificar que la pareja no tenga partidos activos en el torneo
  const hasActiveMatches = await coupleHasActiveMatchesInTournament(coupleId, tournamentId, supabase);
  if (hasActiveMatches) {
    return createApiResponse({ 
      success: false, 
      message: "No se puede mover una pareja que tiene partidos activos en el torneo" 
    });
  }

  // 3. Capacidad destino
  const destinationCapacitySync = await ZoneRulesSyncService.syncZoneRulesForZone(supabase, toZoneId);
  if (!destinationCapacitySync.success) {
    return createApiResponse({ success: false, message: destinationCapacitySync.error || "Error sincronizando zona destino" });
  }

  const destCount = await countCouplesInZone(toZoneId, supabase);
  const maxDestinationCouples = Math.max(capacityDest, destinationCapacitySync.maxCouples || capacityDest);
  if (destCount >= maxDestinationCouples) return createApiResponse({ success: false, message: "Zona destino llena" });

  // 4. Calcular la siguiente posición disponible en la zona destino
  const { data: maxPositionData } = await supabase
    .from("zone_positions")
    .select("position")
    .eq("zone_id", toZoneId)
    .order("position", { ascending: false })
    .limit(1)
    .single();

  const nextPosition = maxPositionData ? maxPositionData.position + 1 : 1;

  // 5. Operaciones: borrar + insertar (zone_couples y zone_positions)
  // 5.1. Eliminar de zone_couples origen (mantener compatibilidad)
  try {
    await applyAuthorizedZoneMembershipChanges(tournamentId, [{
      couple_id: coupleId,
      from_zone_id: fromZoneId,
      to_zone_id: toZoneId,
      to_position: nextPosition,
    }]);
  } catch (membershipError: any) {
    return createApiResponse({
      success: false,
      message: membershipError.message || "Error al mover pareja",
    });
  }

  const moveSyncResults = await ZoneRulesSyncService.syncZoneRulesForZones(supabase, [fromZoneId, toZoneId]);
  const moveSyncError = moveSyncResults.find((result) => !result.success);
  if (moveSyncError) {
    return createApiResponse({ success: false, message: moveSyncError.error || "Error sincronizando reglas de zona" });
  }

  try {
    await updateZonePositions(tournamentId, fromZoneId);
    await updateZonePositions(tournamentId, toZoneId);
  } catch (recalcError: any) {
    console.error('[moveCoupleToZone] Error recalculando posiciones:', recalcError);
    return createApiResponse({
      success: false,
      message: `La pareja fue movida, pero no se pudieron recalcular las zonas: ${recalcError.message}`,
    });
  }

  return createApiResponse({ success: true });


}

// -----------------------------------------------------------------------------
//  C) Swap automático entre parejas de dos zonas
// -----------------------------------------------------------------------------

export async function swapCouplesBetweenZones(
  tournamentId: string,
  coupleId1: string,
  zoneId1: string,
  coupleId2: string,
  zoneId2: string
): Promise<{ success: boolean; message?: string }> {
  if (zoneId1 === zoneId2) return createApiResponse({ success: false, message: "Las zonas son iguales" });
  if (coupleId1 === coupleId2) return createApiResponse({ success: false, message: "Las parejas son iguales" });

  try {
    await assertTournamentManagementPermission(tournamentId)
  } catch (permissionError: any) {
    return createApiResponse({ success: false, message: permissionError.message })
  }

  const supabase = await createClient();

  // Validar zonas ↔ torneo
  const belong1 = await zoneBelongsToTournament(zoneId1, tournamentId, supabase);
  const belong2 = await zoneBelongsToTournament(zoneId2, tournamentId, supabase);
  if (!belong1 || !belong2) return createApiResponse({ success: false, message: "Zona inválida" });

  // Verificar que ninguna de las parejas tenga partidos activos en el torneo
  const hasActiveMatches1 = await coupleHasActiveMatchesInTournament(coupleId1, tournamentId, supabase);
  const hasActiveMatches2 = await coupleHasActiveMatchesInTournament(coupleId2, tournamentId, supabase);
  if (hasActiveMatches1 || hasActiveMatches2) {
    return createApiResponse({ 
      success: false, 
      message: "No se pueden intercambiar parejas que tienen partidos activos en el torneo" 
    });
  }

  const { data: currentPositions, error: positionsError } = await supabase
    .from("zone_positions")
    .select("zone_id, couple_id, position")
    .eq("tournament_id", tournamentId)
    .or(
      `and(zone_id.eq.${zoneId1},couple_id.eq.${coupleId1}),` +
      `and(zone_id.eq.${zoneId2},couple_id.eq.${coupleId2})`
    );

  if (positionsError || currentPositions?.length !== 2) {
    return createApiResponse({
      success: false,
      message: positionsError?.message || "No se encontraron ambas membresías para intercambiar",
    });
  }

  const position1 = currentPositions.find((position) => position.couple_id === coupleId1)?.position
  const position2 = currentPositions.find((position) => position.couple_id === coupleId2)?.position

  try {
    await applyAuthorizedZoneMembershipChanges(tournamentId, [
      {
        couple_id: coupleId1,
        from_zone_id: zoneId1,
        to_zone_id: zoneId2,
        to_position: position2 || 1,
      },
      {
        couple_id: coupleId2,
        from_zone_id: zoneId2,
        to_zone_id: zoneId1,
        to_position: position1 || 1,
      },
    ]);
  } catch (membershipError: any) {
    return createApiResponse({ success: false, message: membershipError.message || "Error al intercambiar parejas" });
  }

  const swapSyncResults = await ZoneRulesSyncService.syncZoneRulesForZones(supabase, [zoneId1, zoneId2]);
  const swapSyncError = swapSyncResults.find((result) => !result.success);
  if (swapSyncError) {
    return createApiResponse({ success: false, message: swapSyncError.error || "Error sincronizando reglas de zona" });
  }

  try {
    await updateZonePositions(tournamentId, zoneId1);
    await updateZonePositions(tournamentId, zoneId2);
  } catch (recalcError: any) {
    console.error('[swapCouplesBetweenZones] Error recalculando posiciones:', recalcError);
    return createApiResponse({
      success: false,
      message: `Las parejas fueron intercambiadas, pero no se pudieron recalcular las zonas: ${recalcError.message}`,
    });
  }

  return createApiResponse({ success: true });


}
// -----------------------------------------------------------------------------
// NUEVO: Crear zonas "vacías" (slots) sin asignar parejas
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
//  NUEVAS FUNCIONES: Obtener zonas completas + parejas disponibles
// -----------------------------------------------------------------------------

/**
 * Devuelve las zonas de un torneo con las parejas y jugadores embebidos.
 * Formato de salida compatible con el componente TournamentZones(X)Tab.
 */
export async function fetchTournamentZones(
  tournamentId: string,
): Promise<{
  success: boolean
  zones?: Array<{
    id: string
    name: string | null
    capacity?: number | null
    max_couples?: number | null
    couples: Array<{
      id: string
      player1_name: string
      player2_name: string
      position?: number
      stats: {
        played: number
        won: number
        lost: number
        scored: number
        conceded: number
        points: number
      }
      // Datos crudos para operaciones posteriores
      originalData?: any
    }>
  }>
  error?: string
}> {
  const supabase = await createClient()

  // 1. Traer zonas del torneo
  const { data: zoneRows, error } = await supabase
    .from("zones")
    .select("id, name, capacity, max_couples, created_at")
    .eq("tournament_id", tournamentId)
    .order("name", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[fetchTournamentZones] error:", error)
    return { success: false, error: error.message }
  }

  if (!zoneRows) return { success: true, zones: [] }

  // 2. Obtener posiciones calculadas desde zone_positions (si existen)
  const { data: savedPositions } = await supabase
    .from("zone_positions")
    .select(`
      *,
      couple:couples!zone_positions_couple_id_fkey(
        id,
        player1:player1_id(id, first_name, last_name, score),
        player2:player2_id(id, first_name, last_name, score)
      )
    `)
    .eq("tournament_id", tournamentId)
    .order("zone_id")
    .order("position")

  // 3. Transformar al formato esperado por frontend
  const zones = await Promise.all(
    zoneRows.map(async (z: any) => {
      // 3.a Buscar posiciones guardadas para esta zona
      const zonePositions = (savedPositions || []).filter(pos => pos.zone_id === z.id)
      
      let couples: any[] = []
      
      if (zonePositions.length > 0) {
        // Usar posiciones calculadas y guardadas
        couples = zonePositions.map((position: any) => {
          const couple = position.couple
          const player1 = Array.isArray(couple?.player1) ? couple.player1[0] : couple?.player1
          const player2 = Array.isArray(couple?.player2) ? couple.player2[0] : couple?.player2
          
          return {
            id: position.couple_id,
            player1_name: player1 ? `${player1.first_name || ''} ${player1.last_name || ''}`.trim() : "Jugador 1",
            player2_name: player2 ? `${player2.first_name || ''} ${player2.last_name || ''}`.trim() : "Jugador 2",
            position: position.position,
            stats: {
              played: (position.wins || 0) + (position.losses || 0),
              won: position.wins || 0,
              lost: position.losses || 0,
              scored: position.games_for || 0,
              conceded: position.games_against || 0,
              points: position.games_difference || 0, // Usando games difference como puntos principales
            },
            originalData: {
              ...couple,
              calculatedStats: {
                gamesDifference: position.games_difference,
                setsDifference: 0, // Not stored separately in current schema
                totalPlayerScore: position.player_score_total,
                positionTieInfo: position.tie_info,
                calculatedAt: position.calculated_at
              }
            },
          }
        })
      } else {
        // Fallback: obtener couples manualmente (modo legacy)
        const { data: coupleLinks } = await supabase
          .from("zone_couples")
          .select("couple_id")
          .eq("zone_id", z.id)

        if (coupleLinks && coupleLinks.length) {
          const ids = coupleLinks.map((cl) => cl.couple_id)
          const { data: coupleRows } = await supabase
            .from("couples")
            .select(
              `id,
               player1:player1_id ( id, first_name, last_name, score ),
               player2:player2_id ( id, first_name, last_name, score )`
            )
            .in("id", ids)

          couples = await Promise.all((coupleRows || []).map(async (couple: any) => {
            // Access the player data correctly
            const player1 = Array.isArray(couple.player1) ? couple.player1[0] : couple.player1
            const player2 = Array.isArray(couple.player2) ? couple.player2[0] : couple.player2
            
            // Calculate basic match statistics (legacy mode)
            const { data: matchStats } = await supabase
              .from("matches")
              .select("id, status, result_couple1, result_couple2, couple1_id, couple2_id, winner_id")
              .eq("zone_id", z.id)
              .or(`couple1_id.eq.${couple.id},couple2_id.eq.${couple.id}`)
              .eq("status", "FINISHED")
            
            let played = 0, won = 0, lost = 0, scored = 0, conceded = 0, setsWon = 0, setsLost = 0
            
            if (matchStats) {
              played = matchStats.length
              
              matchStats.forEach((match: any) => {
                if (match.couple1_id === couple.id) {
                  const couple1Score = match.result_couple1 || 0
                  const couple2Score = match.result_couple2 || 0
                  
                  scored += couple1Score
                  conceded += couple2Score
                  setsWon += couple1Score
                  setsLost += couple2Score
                  
                  if (match.winner_id === couple.id) won++
                  else lost++
                } else {
                  const couple1Score = match.result_couple1 || 0
                  const couple2Score = match.result_couple2 || 0
                  
                  scored += couple2Score
                  conceded += couple1Score
                  setsWon += couple2Score
                  setsLost += couple1Score
                  
                  if (match.winner_id === couple.id) won++
                  else lost++
                }
              })
            }
            
            const points = setsWon - setsLost
            
            return {
              id: couple.id,
              player1_name: player1 ? `${player1.first_name || ''} ${player1.last_name || ''}`.trim() : "Jugador 1",
              player2_name: player2 ? `${player2.first_name || ''} ${player2.last_name || ''}`.trim() : "Jugador 2",
              stats: {
                played,
                won,
                lost,
                scored,
                conceded,
                points,
              },
              originalData: couple,
            }
          }))
        }
      }

      return {
        id: z.id,
        name: z.name,
        capacity: z.capacity,
        max_couples: z.max_couples,
        couples,
      }
    })
  )

  // Ensure all data is properly serialized
  return createApiResponse({ success: true, zones })
}

/**
 * Devuelve las parejas inscriptas que aún no pertenecen a ninguna zona.
 */
export async function fetchAvailableCouples(
  tournamentId: string,
): Promise<{
  success: boolean
  couples?: AvailableCouple[]
  error?: string
}> {
  const supabase = await createClient()

  // 1. Obtener IDs de parejas que ya están en zonas del torneo
  const { data: zoneIdsData, error: zonesErr } = await supabase
    .from("zones")
    .select("id")
    .eq("tournament_id", tournamentId)

  if (zonesErr) {
    console.error("[fetchAvailableCouples] error fetching zones:", zonesErr)
    return { success: false, error: zonesErr.message }
  }

  const zoneIds = (zoneIdsData || []).map((z: any) => z.id)
  let assignedCoupleIds: string[] = []

  if (zoneIds.length > 0) {
    const { data: assigned, error: assignedErr } = await supabase
      .from("zone_couples")
      .select("couple_id")
      .in("zone_id", zoneIds)

    if (assignedErr) {
      console.error("[fetchAvailableCouples] error fetching assigned:", assignedErr)
      return { success: false, error: assignedErr.message }
    }

    assignedCoupleIds = (assigned || []).map((a: any) => a.couple_id)
  }

  // 2. Obtener inscripciones de parejas del torneo con una query más explícita
  const { data: inscriptionRows, error: inscErr } = await supabase
    .from("inscriptions")
    .select(`
      couple_id,
      couples!inner (
        id,
        player1:player1_id!inner (id, first_name, last_name, score),
        player2:player2_id!inner (id, first_name, last_name, score)
      )
    `)
    .eq("tournament_id", tournamentId)

  if (inscErr) {
    console.error("[fetchAvailableCouples] error fetching inscriptions:", inscErr)
    return { success: false, error: inscErr.message }
  }

  // Helper function to validate player data
  const isValidPlayer = (player: any) => 
    player && player.id && player.first_name && player.last_name

  // 3. Filtrar las que no están asignadas y procesar los datos
  const couples: AvailableCouple[] = (inscriptionRows || [])
    .filter((row: any) => !assignedCoupleIds.includes(row.couples.id))
    .map((row: any) => {
      const c = row.couples
      // Handle both array and single object cases from Supabase relationships
      const player1 = Array.isArray(c.player1) ? c.player1[0] : c.player1
      const player2 = Array.isArray(c.player2) ? c.player2[0] : c.player2
      
      console.log("[fetchAvailableCouples] Processing couple:", {
        couple_id: c.id,
        player1_exists: !!player1,
        player2_exists: !!player2,
        player1_valid: isValidPlayer(player1),
        player2_valid: isValidPlayer(player2)
      })

      // Validate that both players exist and have required fields
      if (!isValidPlayer(player1) || !isValidPlayer(player2)) {
        console.warn(`[fetchAvailableCouples] Skipping incomplete couple ${c.id}:`, { player1, player2 })
        return null
      }
      
      return {
        couple_id: c.id,
        player1: {
          id: player1.id,
          first_name: player1.first_name,
          last_name: player1.last_name,
          score: player1.score ?? 0
        },
        player2: {
          id: player2.id,
          first_name: player2.first_name,
          last_name: player2.last_name,
          score: player2.score ?? 0
        }
      }
    })
    .filter(Boolean) as AvailableCouple[] // Remove null entries from invalid couples

  // Ensure all data is properly serialized
  return createApiResponse({ success: true, couples })
}

// -----------------------------------------------------------------------------
//  FIN NUEVAS FUNCIONES
// -----------------------------------------------------------------------------

/**
 * Determina si un torneo debe usar el nuevo sistema de zonas o el legacy.
 * 
 * Por ahora, TODOS los torneos usan el sistema legacy para mantener estabilidad.
 * Más adelante se puede cambiar a true para habilitar el nuevo sistema gradualmente.
 * 
 * Factores que se pueden considerar en el futuro:
 * - Fecha de creación del torneo
 * - Flag específico del club
 * - Variables de entorno
 * - Configuración por torneo
 */
async function shouldTournamentUseNewSystem(tournamentId: string): Promise<boolean> {
  const supabase = await createClient()
  
  // 1. Verificar si existe la tabla zone_positions
  let hasZonePositionsTable = false
  try {
    await supabase.from('zone_positions').select('id').limit(1)
    hasZonePositionsTable = true
  } catch (error) {
    hasZonePositionsTable = false
  }

  if (!hasZonePositionsTable) {
    return false // Sin tabla, usar legacy
  }

  // 2. Obtener información del torneo
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('created_at')
    .eq('id', tournamentId)
    .single()

  if (!tournament) {
    return false // Sin torneo, usar legacy
  }

  // 3. Verificar si ya tiene datos en zone_positions
  const { data: zonePositions } = await supabase
    .from('zone_positions')
    .select('id')
    .eq('tournament_id', tournamentId)
    .limit(1)
  
  const hasZonePositionsData = zonePositions && zonePositions.length > 0

  // 4. Aplicar la misma lógica que system-type
  const tournamentCreatedAt = new Date(tournament.created_at)
  const cutoffDate = new Date('2025-08-14')
  
  // Usar nuevo sistema si:
  // - Tiene datos en zone_positions, O  
  // - Es un torneo creado después del cutoff
  return hasZonePositionsData ||
         tournamentCreatedAt >= cutoffDate
}

// -----------------------------------------------------------------------------
//  Acción de alto nivel: crear zonas y cambiar estado según sistema
// -----------------------------------------------------------------------------

export async function buildZonesAction(tournamentId: string): Promise<{
  success: boolean
  message?: string
  error?: string
  zones?: Zone[]
}> {
  const supabase = await createClient()

  // 1. Validar usuario autenticado
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) return { success: false, error: "User not authenticated" }

  // 2. Verificar permisos (CLUB + ORGANIZADOR + ADMIN)
  const permissions = await checkTournamentPermissions(user.id, tournamentId)
  if (!permissions.hasPermission) {
    return { success: false, error: "No tienes permisos para gestionar este torneo" }
  }

  // 3. Obtener status del torneo
  const { data: tournRow, error: tournErr } = await supabase
    .from("tournaments")
    .select("status")
    .eq("id", tournamentId)
    .single()

  if (tournErr || !tournRow) return { success: false, error: "Tournament not found" }

  const { status } = tournRow as { status: string }

  // 4. Evitar duplicar zonas si ya existen
  const { data: existingZones } = await supabase
    .from("zones")
    .select("id")
    .eq("tournament_id", tournamentId)
    .limit(1)
  if (existingZones && existingZones.length > 0)
    return { success: false, error: "El torneo ya tiene zonas creadas" }

  // 5. Crear y persistir zonas
  let zones: any[]
  try {
    zones = await createTournamentZones(tournamentId) as any[]
  } catch (e: any) {
    return { success: false, error: e.message }
  }

  // 5. Cambiar estado según el sistema a usar (si aún NOT_STARTED)
  if (status === "NOT_STARTED") {
    // Determinar si usar nuevo sistema o legacy
    const shouldUseNewSystem = await shouldTournamentUseNewSystem(tournamentId)
    
    if (shouldUseNewSystem) {
      // Nuevo sistema: ZONE_PHASE (permite seguir inscribiendo parejas y drag & drop)
      await supabase.from("tournaments").update({ 
        status: "ZONE_PHASE"
      }).eq("id", tournamentId)
    } else {
      // Sistema legacy: PAIRING (mantener compatibilidad con torneos existentes)
      await supabase.from("tournaments").update({ 
        status: "PAIRING" 
      }).eq("id", tournamentId)
    }
  }

  return createApiResponse({ success: true, zones, message: "Zonas creadas" })
}

// -----------------------------------------------------------------------------
//  FIN buildZonesAction
// -----------------------------------------------------------------------------
/**
 * Crea un partido de zona y, cuando aplica el recomendador, protege el fixture
 * restante justo antes del INSERT.
 *
 * expectedRecommendationRevision detecta una sugerencia que quedó vieja.
 * allowUnsafe permite un override explícito luego de advertir al organizador.
 */
export async function createMatchOfZone(
  tournamentId: string,
  zoneId: string,
  couple1Id: string,
  couple2Id: string,
  court: number,
  options: {
    expectedRecommendationRevision?: string
    allowUnsafe?: boolean
  } = {},
) {
  const supabase = await createClient()

  // 1. Validar usuario autenticado
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) return { success: false, error: "User not authenticated" }

  // 2. Verificar permisos (CLUB + ORGANIZADOR + ADMIN)
  const permissions = await checkTournamentPermissions(user.id, tournamentId)
  if (!permissions.hasPermission) {
    return { success: false, error: "No tienes permisos para gestionar este torneo" }
  }

  // 3. Verificar que la zona exista
  const { data: zoneRow, error: zoneErr } = await supabase
    .from("zones")
    .select("id")
    .eq("id", zoneId)
    .eq("tournament_id", tournamentId)
    .single()

  if (zoneErr || !zoneRow) return { success: false, error: "Zone not found" }

  // 4. Verificar que las parejas existan
  const { data: couple1Row, error: couple1Err } = await supabase
    .from("couples")
    .select("id")
    .eq("id", couple1Id)
    .single()

  if (couple1Err || !couple1Row) return { success: false, error: "Couple 1 not found" }

  const { data: couple2Row, error: couple2Err } = await supabase
    .from("couples")
    .select("id")
    .eq("id", couple2Id)
    .single()

  if (couple2Err || !couple2Row) return { success: false, error: "Couple 2 not found" }

  // 🔥 5. VALIDACIONES INTELIGENTES DE PARTIDO (REACTIVADAS)
  const validation = await MatchValidationService.validateMatchCreation(
    zoneId, couple1Id, couple2Id
  );

  if (!validation.isValid) {
    const errorMessages = validation.errors.map(err => err.message).join('. ');
    return { success: false, error: errorMessages };
  }

  // Incluir warnings en la respuesta si existen
  const warnings = validation.warnings || [];

  // 6. Para AMERICAN SINGLE_ZONE, verificar que el cruce conserve un cierre
  // completo. El servicio es agnóstico; este adaptador limita su activación.
  const recommendationAssessment = await assessAmericanSingleZoneCandidate(
    supabase,
    tournamentId,
    zoneId,
    { couple1Id, couple2Id },
  )

  if (recommendationAssessment.applicable) {
    if (recommendationAssessment.reason === 'ZONE_MISMATCH') {
      return { success: false, code: 'ZONE_MISMATCH', error: 'La zona no corresponde al torneo single-zone' }
    }

    if (
      options.expectedRecommendationRevision &&
      options.expectedRecommendationRevision !== recommendationAssessment.revision
    ) {
      return {
        success: false,
        code: 'RECOMMENDATION_STALE',
        error: 'Los partidos cambiaron desde que se generó la recomendación. Recalculá antes de crear.',
      }
    }

    if (recommendationAssessment.reason === 'COUPLE_BUSY') {
      return {
        success: false,
        code: 'COUPLE_IN_PROGRESS',
        error: 'Una de las parejas ya tiene un partido en curso.',
      }
    }

    if (!recommendationAssessment.safe && !options.allowUnsafe) {
      return {
        success: false,
        code: 'WOULD_BREAK_REMAINING_FIXTURE',
        requiresConfirmation: true,
        error: 'Este cruce puede dejar la zona sin una combinación completa de rivales nuevos.',
        diagnostics: recommendationAssessment.result?.diagnostics || [],
      }
    }
  }

  // 7. Crear el partido with IN_PROGRESS status
  const { data: matchRow, error: matchErr } = await supabase
    .from("matches")
    .insert({
      tournament_id: tournamentId,
      zone_id: zoneId,
      couple1_id: couple1Id,
      couple2_id: couple2Id,
      court: court,
      status: 'IN_PROGRESS', // Set status to IN_PROGRESS when creating
      round: 'ZONE', // Set round to ZONE for zone matches
    })
    .select()
    .single()

  if (matchErr || !matchRow) return { success: false, error: "Match not created" }

  // 🔒  Ensure the response is 100% serializable for Server Actions
  const safeMatch = {
    id: matchRow.id,
    zone_id: matchRow.zone_id,
    couple1_id: matchRow.couple1_id,
    couple2_id: matchRow.couple2_id,
    court: matchRow.court,
    created_at: matchRow.created_at,
  }

  return createApiResponse({ 
    success: true, 
    match: safeMatch,
    warnings: warnings.length > 0 ? warnings : undefined,
    recommendationRevision: recommendationAssessment.revision,
    unsafeOverrideApplied: Boolean(
      recommendationAssessment.applicable &&
      !recommendationAssessment.safe &&
      options.allowUnsafe
    ),
  })
}

/**
 * Guarda o actualiza el resultado de un partido.
 * Permite editar partidos finalizados, lo que causará un recálculo completo de las posiciones de zona.
 * 
 * @param tournamentId - ID del torneo
 * @param matchId - ID del partido
 * @param couple1Score - Puntaje de la pareja 1
 * @param couple2Score - Puntaje de la pareja 2 
 * @param couple1Id - ID de la pareja 1
 * @param couple2Id - ID de la pareja 2
 * @returns Resultado de la operación con posibles actualizaciones de posiciones
 */
export async function saveMatchResult(tournamentId: string, matchId: string, couple1Score: number, couple2Score: number, couple1Id: string, couple2Id: string) {
  const supabase = await createClient()

  // 1. Validar usuario autenticado
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) return { success: false, error: "User not authenticated" }

  // 2. Verificar permisos (CLUB + ORGANIZADOR + ADMIN)
  const permissions = await checkTournamentPermissions(user.id, tournamentId)
  if (!permissions.hasPermission) {
    return { success: false, error: "No tienes permisos para gestionar este torneo" }
  }

  // 3. Verificar que el partido exista y obtener su estado actual + couple IDs
  const { data: matchRow, error: matchErr } = await supabase
    .from("matches")
    .select("id, status, couple1_id, couple2_id")
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .single()

  if (matchErr || !matchRow) return { success: false, error: "Match not found" }

  const isEditingFinishedMatch = matchRow.status === 'FINISHED'
  if (couple1Score < 0 || couple2Score < 0) return { success: false, error: "Scores must be positive" }
  if (couple1Score === couple2Score) return { success: false, error: "Scores must be different" }

  // ✅ CORRECCIÓN: Determinar qué score corresponde a qué pareja en DB
  // El dialog puede pasar las parejas en cualquier orden (según la fila/columna de la matriz)
  // pero debemos guardar los scores en el orden correcto según la DB
  let dbCouple1Score: number;
  let dbCouple2Score: number;

  if (couple1Id === matchRow.couple1_id) {
    // Orden correcto: couple1 del dialog = couple1 de DB
    dbCouple1Score = couple1Score;
    dbCouple2Score = couple2Score;
  } else if (couple1Id === matchRow.couple2_id) {
    // Orden invertido: couple1 del dialog = couple2 de DB
    dbCouple1Score = couple2Score;
    dbCouple2Score = couple1Score;
  } else {
    return { success: false, error: "Couple IDs do not match the match record" }
  }

  // ✅ Calcular ganador según los scores correctos de DB
  const winnerId = dbCouple1Score > dbCouple2Score ? matchRow.couple1_id : matchRow.couple2_id;

  const {data: matchUpdate, error: matchUpdateErr} = await supabase
    .from("matches")
    .update({
      winner_id: winnerId,
      result_couple1: dbCouple1Score,
      result_couple2: dbCouple2Score,
      status: 'FINISHED', // Set status to FINISHED when result is saved
    })
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .select()
    .single()

  if (matchUpdateErr || !matchUpdate) return { success: false, error: "Match not updated" }

  // Get zone_id for the match to update positions
  const { data: matchWithZone, error: zoneErr } = await supabase
    .from("matches")
    .select("zone_id")
    .eq("id", matchId)
    .single()

  if (!zoneErr && matchWithZone?.zone_id) {
    // Update zone positions and check for bracket advancement
    try {
      const positionUpdate = await checkAndUpdateZonePositions(tournamentId, matchWithZone.zone_id)
      
      return createApiResponse({ 
        success: true, 
        match: matchUpdate,
        isEditingFinishedMatch,
        positionUpdate: {
          positionsUpdated: positionUpdate.positionsUpdated,
          bracketAdvanced: positionUpdate.bracketAdvanced,
          placeholdersResolved: positionUpdate.placeholdersResolved,
          message: positionUpdate.message
        }
      })
    } catch (error) {
      console.error('Error updating positions after match:', error)
      // Return success even if position update fails
      return createApiResponse({ success: true, match: matchUpdate, isEditingFinishedMatch })
    }
  }

  return createApiResponse({ success: true, match: matchUpdate, isEditingFinishedMatch })
}

export async function deleteMatch(tournamentId: string, matchId: string) {
  const supabase = await createClient()

  // 1. Validar usuario autenticado
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) return { success: false, error: "User not authenticated" }

  // 2. Verificar permisos (CLUB + ORGANIZADOR + ADMIN)
  const permissions = await checkTournamentPermissions(user.id, tournamentId)
  if (!permissions.hasPermission) {
    return { success: false, error: "No tienes permisos para gestionar este torneo" }
  }

  // 3. Verificar que el partido exista y obtener información
  const { data: matchRow, error: matchErr } = await supabase
    .from("matches")
    .select("id, status, zone_id")
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .single()

  if (matchErr || !matchRow) return { success: false, error: "Match not found" }

  // 4. Validar que el partido pueda ser eliminado
  // No permitir eliminar partidos que ya están FINISHED con resultado
  if (matchRow.status === "FINISHED") {
    return { success: false, error: "No se puede eliminar un partido que ya ha finalizado" }
  }

  // 5. Eliminar el partido
  const { error: deleteError } = await supabase
    .from("matches")
    .delete()
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)

  if (deleteError) return { success: false, error: "No se pudo eliminar el partido" }

  return createApiResponse({ success: true, message: "Partido eliminado correctamente" })
}

// =============================================================================
// PROGRESSIVE BRACKET GENERATION SYSTEM
// =============================================================================

/**
 * Tournament bracket status enumeration
 */
export enum TournamentBracketStatus {
  NOT_STARTED = 'NOT_STARTED',                 // Aún se pueden agregar parejas  
  REGISTRATION_LOCKED = 'REGISTRATION_LOCKED', // No más parejas nuevas
  BRACKET_GENERATED = 'BRACKET_GENERATED',     // Bracket creado con placeholders
  BRACKET_ACTIVE = 'BRACKET_ACTIVE'            // Matches del bracket en progreso
}

/**
 * Main function: Generate or update bracket if needed
 * Controls when and how brackets are generated/updated
 */
/**
 * Decide if bracket needs updating
 */
async function shouldUpdateBracket(tournament: any): Promise<boolean> {
  if (tournament.bracket_status === 'NOT_STARTED' && tournament.registration_locked) {
    return true // Primera generación después de cerrar registro
  }
  
  if (tournament.bracket_status === 'BRACKET_GENERATED') {
    // Verificar si hay cambios en posiciones de zona
    return await hasZonePositionChanges(tournament.id)
  }
  
  return false
}

/**
 * Check if zone positions have changed since last bracket generation
 */
async function hasZonePositionChanges(tournamentId: string): Promise<boolean> {
  // For now, return true to always allow updates
  // TODO: Implement actual change detection logic
  return true
}

/**
 * Get definitive couples for tournament with current positions
 */
async function getDefinitiveCouplesForTournament(tournamentId: string): Promise<CoupleFromZone[]> {
  const supabase = await createClient()
  
  // Obtener todas las parejas del torneo con sus posiciones actuales en zona
  const { data: couples, error } = await supabase
    .from('zone_couples')
    .select(`
      couple_id,
      couples (
        id,
        player1_id,
        player2_id,
        player1_details:player1_id (first_name, last_name),
        player2_details:player2_id (first_name, last_name)
      ),
      zones (
        id,
        name,
        tournament_id
      )
    `)
    .eq('zones.tournament_id', tournamentId)
  
  if (error) throw error
  
  // Calcular posiciones actuales basadas en matches de zona
  return await calculateCurrentZonePositions(couples || [])
}

/**
 * Calculate current zone positions based on match results
 */
async function calculateCurrentZonePositions(couples: any[]): Promise<CoupleFromZone[]> {
  const supabase = await createClient()
  
  const result: CoupleFromZone[] = []
  
  // Group couples by zone to calculate standings efficiently
  const zoneGroups = new Map<string, any[]>()
  
  for (const couple of couples) {
    if (!couple.couples || !couple.zones) continue
    
    const zoneData = couple.zones
    const zoneId = zoneData.id
    
    if (!zoneGroups.has(zoneId)) {
      zoneGroups.set(zoneId, [])
    }
    zoneGroups.get(zoneId)!.push(couple)
  }
  
  // Calculate standings for each zone
  for (const [zoneId, zoneCouples] of zoneGroups) {
    try {
      const standings = await calculateZoneStandings(zoneId)
      
      // Convert standings to CoupleFromZone format
      for (const coupleStanding of standings.couples) {
        const originalCouple = zoneCouples.find(c => c.couples.id === coupleStanding.coupleId)
        if (!originalCouple) continue
        
        const coupleData = originalCouple.couples
        const zoneData = originalCouple.zones
        
        // Handle the nested structure correctly
        const couple = Array.isArray(coupleData) ? coupleData[0] : coupleData
        const player1Details = couple.player1_details
        const player2Details = couple.player2_details
        
        const player1 = Array.isArray(player1Details) ? player1Details[0] : player1Details
        const player2 = Array.isArray(player2Details) ? player2Details[0] : player2Details
        
        result.push({
          id: coupleStanding.coupleId,
          zoneId: zoneData.id,
          zoneName: zoneData.name || 'Zona',
          zonePosition: coupleStanding.position, // Now using real calculated position
          points: coupleStanding.stats.points,
          player1Name: player1 ? `${player1.first_name} ${player1.last_name}` : 'Jugador 1',
          player2Name: player2 ? `${player2.first_name} ${player2.last_name}` : 'Jugador 2'
        })
      }
    } catch (error) {
      console.error(`Error calculating standings for zone ${zoneId}:`, error)
      // Fallback to old method for this zone
      for (const couple of zoneCouples) {
        const coupleData = couple.couples
        const zoneData = couple.zones
        
        const coupleObj = Array.isArray(coupleData) ? coupleData[0] : coupleData
        const player1Details = coupleObj.player1_details
        const player2Details = coupleObj.player2_details
        
        const player1 = Array.isArray(player1Details) ? player1Details[0] : player1Details
        const player2 = Array.isArray(player2Details) ? player2Details[0] : player2Details
        
        result.push({
          id: coupleObj.id,
          zoneId: zoneData.id,
          zoneName: zoneData.name || 'Zona',
          zonePosition: 1, // Fallback position
          points: 0,
          player1Name: player1 ? `${player1.first_name} ${player1.last_name}` : 'Jugador 1',
          player2Name: player2 ? `${player2.first_name} ${player2.last_name}` : 'Jugador 2'
        })
      }
    }
  }
  
  return result
}

/**
 * Get zone match history for tournament
 */
async function getZoneMatchHistoryForTournament(tournamentId: string): Promise<ZoneMatchHistory[]> {
  const supabase = await createClient()
  
  // Get all zones for tournament
  const { data: zones, error: zonesError } = await supabase
    .from('zones')
    .select('id, name')
    .eq('tournament_id', tournamentId)
  
  if (zonesError || !zones) return []
  
  const zoneHistory: ZoneMatchHistory[] = []
  
  for (const zone of zones) {
    // Get all finished matches in this zone
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('couple1_id, couple2_id')
      .eq('zone_id', zone.id)
      .eq('status', 'FINISHED')
    
    if (matchesError || !matches) continue
    
    zoneHistory.push({
      zoneId: zone.id,
      zoneName: zone.name || 'Zona',
      matches: matches.map(match => ({
        couple1Id: match.couple1_id,
        couple2Id: match.couple2_id
      }))
    })
  }
  
  return zoneHistory
}

/**
 * Save bracket to database
 */
async function saveBracketToDatabase(tournamentId: string, bracketResult: any): Promise<void> {
  const supabase = await createClient()
  
  console.log('[SAVE-BRACKET] Starting save process...')
  console.log('[SAVE-BRACKET] Bracket result structure:', {
    hasResult: !!bracketResult,
    resultType: typeof bracketResult,
    hasMatches: !!bracketResult?.matches,
    hasBracketPairings: !!bracketResult?.bracketPairings,
    resultKeys: bracketResult ? Object.keys(bracketResult) : []
  })
  
  // Validate bracket result structure
  if (!bracketResult || typeof bracketResult !== 'object') {
    console.error('[SAVE-BRACKET] Invalid bracket result: not an object')
    throw new Error('Invalid bracket result: must be an object')
  }

  try {
    // Delete existing bracket matches for this tournament
    console.log('[SAVE-BRACKET] Deleting existing bracket matches...')
    const { error: deleteError } = await supabase
      .from('matches')
      .delete()
      .eq('tournament_id', tournamentId)
      .in('type', ['ELIMINATION'])
    
    if (deleteError) {
      console.error('[SAVE-BRACKET] Error deleting existing matches:', deleteError)
      throw deleteError
    }

    // Handle different bracket result structures with defensive programming
    let matchesToInsert: any[] = []
    
    if (bracketResult?.bracketPairings && Array.isArray(bracketResult.bracketPairings)) {
      console.log('[SAVE-BRACKET] Processing bracketPairings structure...')
      matchesToInsert = processBracketPairings(tournamentId, bracketResult.bracketPairings)
      
    } else if (bracketResult?.matches && Array.isArray(bracketResult.matches)) {
      console.log('[SAVE-BRACKET] Processing matches structure...')
      matchesToInsert = processMatchesStructure(tournamentId, bracketResult.matches)
      
    } else {
      console.error('[SAVE-BRACKET] Invalid bracket result structure:', {
        hasBracketPairings: !!bracketResult?.bracketPairings,
        isBracketPairingsArray: Array.isArray(bracketResult?.bracketPairings),
        hasMatches: !!bracketResult?.matches,
        isMatchesArray: Array.isArray(bracketResult?.matches),
        availableKeys: bracketResult ? Object.keys(bracketResult) : []
      })
      throw new Error('Invalid bracket result: missing valid bracketPairings or matches array')
    }
    
    // Insert matches if any exist
    if (matchesToInsert.length > 0) {
      console.log(`[SAVE-BRACKET] Inserting ${matchesToInsert.length} bracket matches...`)
      
      // Log first match structure for debugging
      console.log('[SAVE-BRACKET] Sample match structure:', matchesToInsert[0])
      
      const { error: insertError } = await supabase
        .from('matches')
        .insert(matchesToInsert)
      
      if (insertError) {
        console.error('[SAVE-BRACKET] Error inserting matches:', insertError)
        throw insertError
      }
      
      console.log(`[SAVE-BRACKET] Successfully inserted ${matchesToInsert.length} matches`)
    } else {
      console.log('[SAVE-BRACKET] No matches to insert')
    }
    
    console.log('[SAVE-BRACKET] Bracket saved successfully')
    
  } catch (error) {
    console.error('[SAVE-BRACKET] Error saving bracket:', error)
    throw error
  }
}


function processBracketPairings(tournamentId: string, bracketPairings: any[]): any[] {
  return bracketPairings.map((pairing: any, index: number) => {
    // Validate pairing structure
    if (!pairing) {
      throw new Error(`Invalid pairing at index ${index}: pairing is null/undefined`)
    }
    
    if (!pairing.couple1 || typeof pairing.couple1.id !== 'string') {
      throw new Error(`Invalid pairing at index ${index}: missing or invalid couple1.id`)
    }
    
    return {
      tournament_id: tournamentId,
      type: 'ELIMINATION',
      round: pairing.round || "4TOS", // Default to quarterfinals for 7-couple tournament
      couple1_id: pairing.couple1.id,
      couple2_id: pairing.couple2?.id || null,
      status: pairing.couple2 ? 'PENDING' : 'FINISHED', // BYE matches are auto-finished
      winner_id: pairing.couple2 ? null : pairing.couple1.id, // BYE winner is couple1
      court: null,
      order_in_round: pairing.order || index + 1
    }
  })
}

/**
 * Process matches structure (from createBracketWithPlaceholders)
 * Expected structure: { couple1_id, couple2_id, round, match_number }
 */
function processMatchesStructure(tournamentId: string, matches: any[]): any[] {
  return matches.map((match: any, index: number) => {
    // Validate match structure
    if (!match) {
      throw new Error(`Invalid match at index ${index}: match is null/undefined`)
    }
    
    // Handle both direct IDs and placeholder structures
    const couple1_id = match.couple1_id || match.couple1?.id || null
    const couple2_id = match.couple2_id || match.couple2?.id || null
    
    // At least one couple must be present (non-placeholder)
    if (!couple1_id && !couple2_id) {
      console.warn(`[SAVE-BRACKET] Skipping match at index ${index}: both couples are placeholders`)
      return null // Will be filtered out
    }
    
    return {
      tournament_id: tournamentId,
      type: 'ELIMINATION',
      round: match.round || "4TOS", // Default to quarterfinals for 7-couple tournament
      couple1_id,
      couple2_id,
      status: (couple1_id && couple2_id) ? 'PENDING' : 'FINISHED',
      winner_id: (couple1_id && !couple2_id) ? couple1_id : 
                  (!couple1_id && couple2_id) ? couple2_id : null,
      court: null,
      order_in_round: match.match_number || match.order || index + 1,
      // Store placeholder info for potential future resolution (correct column names)
      placeholder_couple1_label: match.couple1_placeholder || null,
      placeholder_couple2_label: match.couple2_placeholder || null
    }
  }).filter(match => match !== null) // Remove null entries
}

/**
 * Update tournament bracket status
 */
async function updateTournamentBracketStatus(tournamentId: string, status: string): Promise<void> {
  const supabase = await createClient()
  
  const updateData: any = {
    bracket_status: status,
    last_bracket_update: new Date().toISOString()
  }
  
  if (status === 'BRACKET_GENERATED') {
    updateData.bracket_generated_at = new Date().toISOString()
  }
  
  const { error } = await supabase
    .from('tournaments')
    .update(updateData)
    .eq('id', tournamentId)
  
  if (error) throw error
}

/**
 * Check if new couple can be added to tournament
 * UPDATED: Now uses unified validation system
 */
export async function canAddNewCouple(tournamentId: string): Promise<{
  canAdd: boolean
  reason?: string
}> {
  try {
    // Use the new unified validation service
    const { TournamentValidationService } = await import('../../../../lib/services/tournament-validation.service');
    const result = await TournamentValidationService.validateCoupleRegistration(tournamentId);
    
    return {
      canAdd: result.allowed,
      reason: result.reason
    };
    
  } catch (error: any) {
    console.error('[canAddNewCouple] Error:', error);
    
    // Fallback to legacy validation if import fails
    try {
      const supabase = await createClient()
      
      const { data: tournament } = await supabase
        .from('tournaments')
        .select('bracket_status, registration_locked, status')
        .eq('id', tournamentId)
        .single()
      
      if (!tournament) {
        return { canAdd: false, reason: 'Torneo no encontrado' }
      }
      
      // UPDATED LOGIC: Check new system states first
      if (tournament.status === 'ZONE_PHASE') {
        return { canAdd: true, reason: 'Inscripción tardía permitida en fase de zonas' }
      }
      
      if (tournament.status === 'BRACKET_PHASE' || tournament.status === 'ELIMINATION') {
        return { canAdd: false, reason: 'Registro cerrado - torneo en fase eliminatoria' }
      }
      
      // Legacy validation for older tournaments
      if (tournament.registration_locked) {
        return { canAdd: false, reason: 'Registro cerrado' }
      }
      
      if (tournament.bracket_status === 'BRACKET_GENERATED' || tournament.bracket_status === 'BRACKET_ACTIVE') {
        return { canAdd: false, reason: 'Bracket ya generado' }
      }
      
      return { canAdd: true }
      
    } catch (fallbackError: any) {
      return { canAdd: false, reason: `Error: ${fallbackError.message}` }
    }
  }
}

/**
 * Lock tournament registration
 */
export async function lockTournamentRegistration(tournamentId: string): Promise<{
  success: boolean
  message: string
}> {
  try {
    const supabase = await createClient()
    
    const { error } = await supabase
      .from('tournaments')
      .update({ 
        registration_locked: true
      })
      .eq('id', tournamentId)
    
    if (error) throw error
    
    return { success: true, message: 'Registro cerrado exitosamente' }
    
  } catch (error: any) {
    return { success: false, message: `Error: ${error.message}` }
  }
}

/**
 * Calculate zone standings and determine definitive positions
 */
async function calculateZoneStandings(zoneId: string): Promise<{
  couples: Array<{
    coupleId: string,
    player1Name: string,
    player2Name: string,
    stats: {
      played: number,
      won: number,
      lost: number,
      scored: number,
      conceded: number,
      points: number
    },
    position: number,
    isDefinitive: boolean
  }>,
  zoneCompleted: boolean
}> {
  const supabase = await createClient()
  
  // Get all couples in this zone
  const { data: zoneCouples, error: couplesError } = await supabase
    .from('zone_couples')
    .select(`
      couple_id,
      couples (
        id,
        player1_id,
        player2_id,
        player1_details:player1_id (first_name, last_name),
        player2_details:player2_id (first_name, last_name)
      )
    `)
    .eq('zone_id', zoneId)
  
  if (couplesError || !zoneCouples) {
    throw new Error(`Error fetching zone couples: ${couplesError?.message}`)
  }
  
  // Get all finished matches in this zone
  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('couple1_id, couple2_id, result_couple1, result_couple2, winner_id')
    .eq('zone_id', zoneId)
    .eq('status', 'FINISHED')
  
  if (matchesError) {
    throw new Error(`Error fetching zone matches: ${matchesError.message}`)
  }
  
  // Calculate statistics for each couple
  const coupleStats = zoneCouples.map(zoneCouple => {
    const coupleId = zoneCouple.couple_id
    const coupleData = zoneCouple.couples
    
    // Handle the nested structure correctly - coupleData is an array
    const couple = Array.isArray(coupleData) ? coupleData[0] : coupleData
    const player1Details = couple.player1_details
    const player2Details = couple.player2_details
    
    const player1 = Array.isArray(player1Details) ? player1Details[0] : player1Details
    const player2 = Array.isArray(player2Details) ? player2Details[0] : player2Details
    
    const player1Name = player1 ? `${player1.first_name} ${player1.last_name}` : 'Jugador 1'
    const player2Name = player2 ? `${player2.first_name} ${player2.last_name}` : 'Jugador 2'
    
    // Calculate match statistics
    let played = 0, won = 0, lost = 0, scored = 0, conceded = 0
    
    matches?.forEach(match => {
      if (match.couple1_id === coupleId || match.couple2_id === coupleId) {
        played++
        
        const isCouple1 = match.couple1_id === coupleId
        const coupleScore = isCouple1 ? match.result_couple1 : match.result_couple2
        const opponentScore = isCouple1 ? match.result_couple2 : match.result_couple1
        
        scored += coupleScore || 0
        conceded += opponentScore || 0
        
        if (match.winner_id === coupleId) {
          won++
        } else {
          lost++
        }
      }
    })
    
    const points = scored - conceded
    
    return {
      coupleId,
      player1Name,
      player2Name,
      stats: { played, won, lost, scored, conceded, points },
      position: 0, // Will be calculated below
      isDefinitive: false // Will be calculated below
    }
  })
  
  // Sort by points (descending), then by games won (descending), then by games scored (descending)
  coupleStats.sort((a, b) => {
    if (a.stats.points !== b.stats.points) return b.stats.points - a.stats.points
    if (a.stats.won !== b.stats.won) return b.stats.won - a.stats.won
    return b.stats.scored - a.stats.scored
  })
  
  // Assign positions
  coupleStats.forEach((couple, index) => {
    couple.position = index + 1
  })
  
  // Determine definitive positions
  const totalMatches = coupleStats.reduce((sum, couple) => sum + couple.stats.played, 0)
  const totalCouples = coupleStats.length
  const expectedMatchesPerCouple = totalCouples - 1 // Round-robin format
  
  // A zone is completed when all couples have played all their matches
  const zoneCompleted = coupleStats.every(couple => couple.stats.played === expectedMatchesPerCouple)
  
  // Determine which positions are definitive
  coupleStats.forEach(couple => {
    couple.isDefinitive = isPositionDefinitive(couple, coupleStats, matches || [])
  })
  
  return {
    couples: coupleStats,
    zoneCompleted
  }
}

/**
 * Determine if a couple's position is definitive (cannot be changed)
 */
function isPositionDefinitive(
  couple: any,
  allCouples: any[],
  finishedMatches: any[]
): boolean {
  // If zone is completed, all positions are definitive
  const totalCouples = allCouples.length
  const expectedMatchesPerCouple = totalCouples - 1
  const zoneCompleted = allCouples.every(c => c.stats.played === expectedMatchesPerCouple)
  
  if (zoneCompleted) return true
  
  // If couple has won all their matches, position is definitive
  if (couple.stats.won === couple.stats.played && couple.stats.played > 0) {
    return true
  }
  
  // If couple has lost all their matches, position is definitive
  if (couple.stats.lost === couple.stats.played && couple.stats.played > 0) {
    return true
  }
  
  // Check if mathematically impossible for others to surpass this couple
  const remainingMatches = finishedMatches.filter(match => 
    (match.couple1_id === couple.coupleId || match.couple2_id === couple.coupleId) &&
    match.status !== 'FINISHED'
  )
  
  // If no remaining matches for this couple, position is definitive
  if (remainingMatches.length === 0) {
    return true
  }
  
  // TODO: Add more sophisticated mathematical analysis
  // For now, we'll be conservative and only mark as definitive when zone is completed
  // or when couple has won/lost all matches
  
  return false
}

/**
 * Update zone positions in database using the NEW ranking system
 * This replaces the legacy updateZonePositionsAction with the improved algorithm
 */
export async function updateZonePositions(tournamentId: string, zoneId: string): Promise<void> {
  try {
    console.log(`[updateZonePositions] Starting NEW system update for zone ${zoneId} in tournament ${tournamentId}`)
    
    // Use service role for internal system operations to bypass RLS
    const supabase = await createClientServiceRole()
    
    // 1. Fetch couples in the zone with player details and scores
    const { data: couples, error: couplesError } = await supabase
      .from('zone_couples')
      .select(`
        couple_id,
        couples!zone_couples_couple_id_fkey(
          id,
          player1_id,
          player2_id,
          player1:players!couples_player1_id_fkey(id, first_name, last_name, score),
          player2:players!couples_player2_id_fkey(id, first_name, last_name, score)
        )
      `)
      .eq('zone_id', zoneId)

    if (couplesError) {
      throw new Error(`Error fetching couples: ${couplesError.message}`)
    }

    if (!couples || couples.length === 0) {
      console.log(`[updateZonePositions] No couples found in zone ${zoneId}`)
      return
    }

    // 2. Fetch finished matches for this zone
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select(`
        id,
        couple1_id,
        couple2_id,
        result_couple1,
        result_couple2,
        winner_id,
        status,
        zone_id
      `)
      .eq('zone_id', zoneId)
      .eq('tournament_id', tournamentId)
      .eq('status', 'FINISHED')
      .not('result_couple1', 'is', null)
      .not('result_couple2', 'is', null)

    // 2.1 Also fetch non-finished matches to check if positions can be definitive
    const { data: nonFinishedMatches, error: nonFinishedError } = await supabase
      .from('matches')
      .select('id, couple1_id, couple2_id, status')
      .eq('zone_id', zoneId)
      .eq('tournament_id', tournamentId)
      .in('status', ['PENDING', 'IN_PROGRESS'])

    console.log(`[updateZonePositions] Zone ${zoneId} - Finished matches: ${matches?.length || 0}, Non-finished: ${nonFinishedMatches?.length || 0}`)
    
    if (nonFinishedMatches && nonFinishedMatches.length > 0) {
      console.log(`[updateZonePositions] ⚠️ Zone ${zoneId} has ${nonFinishedMatches.length} non-finished matches:`, 
        nonFinishedMatches.map(m => `${m.id} (${m.status})`))
    }

    if (matchesError) {
      throw new Error(`Error fetching matches: ${matchesError.message}`)
    }

    // 3. Transform data to match our types
    const { ZoneStatsCalculator, ZoneRankingEngine } = await import('@/lib/services/zone-position')
    
    const coupleData = couples.map(zoneCouple => {
      const couple = Array.isArray(zoneCouple.couples) ? zoneCouple.couples[0] : zoneCouple.couples
      return {
        id: couple.id,
        player1_id: couple.player1_id,
        player2_id: couple.player2_id,
        player1: Array.isArray(couple.player1) ? couple.player1[0] : couple.player1,
        player2: Array.isArray(couple.player2) ? couple.player2[0] : couple.player2
      }
    })

    const matchData = (matches || []).map(match => ({
      id: match.id,
      couple1_id: match.couple1_id,
      couple2_id: match.couple2_id,
      result_couple1: match.result_couple1,
      result_couple2: match.result_couple2,
      winner_id: match.winner_id,
      status: match.status as 'FINISHED',
      zone_id: match.zone_id
    }))

    // 4. Calculate positions using the NEW ranking system
    const calculator = new ZoneStatsCalculator()
    const engine = new ZoneRankingEngine()

    const coupleStats = calculator.calculateAllCoupleStats(coupleData, matchData)
    const headToHeadMatrix = calculator.createHeadToHeadMatrix(coupleData, matchData)
    const rankedCouples = engine.rankCouplesByAllCriteria(coupleStats, headToHeadMatrix)

    // 5. Validate ranking
    const isValidRanking = engine.validateRanking(rankedCouples)
    
    if (!isValidRanking) {
      console.error(`[updateZonePositions] Invalid ranking generated for zone ${zoneId}`)
    }

    // 6. Save positions to database
    if (rankedCouples.length === 0) {
      console.log(`[updateZonePositions] No positions to update for zone ${zoneId}`)
      return
    }

    // 🚀 NEW: Use definitive position analyzer instead of hardcoded is_definitive
    console.log(`[updateZonePositions] 📊 Analyzing definitive positions for zone ${zoneId}`)
    const definitiveAnalyzer = new CorrectedDefinitiveAnalyzer()
    
    // First insert positions with is_definitive = false temporarily
    const tempPositionRecords = rankedCouples.map((position: any) => ({
      couple_id: position.coupleId,
      position: position.position,
      is_definitive: false, // 🔒 Start with false, analyzer will set to true when appropriate
      points: position.points || 0,
      wins: position.matchesWon,
      losses: position.matchesLost,
      games_for: position.gamesWon,
      games_against: position.gamesLost,
      games_difference: position.gamesDifference,
      player_score_total: position.totalPlayerScore,
      tie_info: position.positionTieInfo,
      calculated_at: new Date().toISOString(),
      sets_for: position.setsWon || 0,
      sets_against: position.setsLost || 0,
      sets_difference: position.setsDifference || 0,
    }))

    await replaceZonePositionsAtomically(supabase, tournamentId, zoneId, tempPositionRecords)

    const { data: tempPositions, error: tempPositionsError } = await supabase
      .from('zone_positions')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('zone_id', zoneId)

    if (tempPositionsError) {
      throw new Error(`Error reading saved positions: ${tempPositionsError.message}`)
    }

    // 🎯 PHASE-AWARE: Only run definitive analysis in BRACKET_PHASE
    let savedPositions = tempPositions
    
    // Check tournament status to decide whether to analyze definitives
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('status')
      .eq('id', tournamentId)
      .single()
    
    if (tournamentError) {
      console.error(`[updateZonePositions] ⚠️ Could not fetch tournament status:`, tournamentError)
      console.log(`[updateZonePositions] 🔄 Defaulting to ZONE_PHASE behavior (no definitive analysis)`)
    }
    
    const tournamentStatus = tournament?.status || 'ZONE_PHASE'
    
    if (tournamentStatus === 'BRACKET_PHASE') {
      console.log(`[updateZonePositions] 🎯 Tournament in BRACKET_PHASE - running definitive position analysis for zone ${zoneId}`)
      
      try {
        // Use the SAME algorithm as bracket generation - no optimizations, pure backtracking
        const singleZoneAnalyzer = new SingleZoneDefinitiveAnalyzer()
        const zoneAnalysis = await singleZoneAnalyzer.analyzeSingleZonePositions(zoneId)
        
        // Update is_definitive flags in database (ONLY in BRACKET_PHASE)
        await singleZoneAnalyzer.updateDefinitiveFlags(zoneId, zoneAnalysis)
        
        console.log(`[updateZonePositions] ✅ Definitive analysis completed: ${zoneAnalysis.definitivePositions}/${zoneAnalysis.totalCouples} positions are definitive`)
        
        // Fetch the updated positions
        const { data: updatedPositions } = await supabase
          .from('zone_positions')
          .select('*')
          .eq('tournament_id', tournamentId)
          .eq('zone_id', zoneId)
        
        savedPositions = updatedPositions || tempPositions
      } catch (analysisError) {
        console.error(`[updateZonePositions] ⚠️ Definitive analysis failed:`, analysisError)
        console.log(`[updateZonePositions] 🔄 Falling back to conservative approach (all positions non-definitive)`)
        // Positions remain with is_definitive = false, which is the safe choice
      }
    } else {
      console.log(`[updateZonePositions] 📝 Tournament in ${tournamentStatus} - skipping definitive position analysis`)
      console.log(`[updateZonePositions] ✅ Zone rankings calculated, positions remain non-definitive until BRACKET_PHASE`)
      // In ZONE_PHASE, positions are saved with is_definitive = false (already set above)
      savedPositions = tempPositions
    }

    console.log(`[updateZonePositions] ✅ Successfully updated ${savedPositions.length} positions using NEW system for zone ${zoneId}`)
    console.log(`[updateZonePositions] 🎯 Ranking validation: ${isValidRanking ? 'PASSED' : 'FAILED'}`)
    
  } catch (error) {
    console.error(`[updateZonePositions] Error updating zone positions for zone ${zoneId}:`, error)
    throw error
  }
}

/**
 * Check if bracket can be advanced with current definitive couples
 */
async function canAdvanceBracket(tournamentId: string): Promise<{
  canAdvance: boolean,
  definitiveCouples: CoupleFromZone[],
  reason?: string
}> {
  const supabase = await createClient()
  
  try {
    // 🔒 CRITICAL FIX: First check tournament status - only advance if in bracket phase
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('status')
      .eq('id', tournamentId)
      .single()
    
    if (tournamentError || !tournament) {
      throw new Error(`Error fetching tournament: ${tournamentError?.message}`)
    }
    
    // 🚫 GUARD: Do not advance bracket if tournament is still in zone phase
    if (tournament.status !== 'BRACKET_PHASE') {
      return {
        canAdvance: false,
        definitiveCouples: [],
        reason: `Tournament is in ${tournament.status} - bracket can only be advanced in BRACKET_PHASE`
      }
    }

    // Get all definitive couples from zone_positions
    const { data: definitivePositions, error } = await supabase
      .from('zone_positions')
      .select(`
        couple_id,
        position,
        points,
        zones!inner (
          id,
          name,
          tournament_id
        ),
        couples!inner (
          id,
          player1_id,
          player2_id,
          player1_details:player1_id (first_name, last_name),
          player2_details:player2_id (first_name, last_name)
        )
      `)
      .eq('tournament_id', tournamentId)
      .eq('is_definitive', true)
      .order('position', { ascending: true })
    
    if (error) {
      throw new Error(`Error fetching definitive positions: ${error.message}`)
    }
    
    if (!definitivePositions || definitivePositions.length === 0) {
      return {
        canAdvance: false,
        definitiveCouples: [],
        reason: 'No hay parejas con posiciones definitivas'
      }
    }
    
         // Convert to CoupleFromZone format
     const definitiveCouples: CoupleFromZone[] = definitivePositions.map(pos => {
       const coupleData = pos.couples
       const zoneData = pos.zones
       
       // Handle the nested structure correctly
       const couple = Array.isArray(coupleData) ? coupleData[0] : coupleData
       const zone = Array.isArray(zoneData) ? zoneData[0] : zoneData
       const player1Details = couple.player1_details
       const player2Details = couple.player2_details
       
       const player1 = Array.isArray(player1Details) ? player1Details[0] : player1Details
       const player2 = Array.isArray(player2Details) ? player2Details[0] : player2Details
       
       return {
         id: couple.id,
         zoneId: zone.id,
         zoneName: zone.name || 'Zona',
         zonePosition: pos.position,
         points: pos.points,
         player1Name: player1 ? `${player1.first_name} ${player1.last_name}` : 'Jugador 1',
         player2Name: player2 ? `${player2.first_name} ${player2.last_name}` : 'Jugador 2'
       }
     })
    
    // Check if we have enough couples for bracket generation
    // For now, we'll require at least 2 definitive couples
    const canAdvance = definitiveCouples.length >= 2
    
    return {
      canAdvance,
      definitiveCouples,
      reason: canAdvance ? undefined : `Se requieren al menos 2 parejas definitivas. Actuales: ${definitiveCouples.length}`
    }
    
  } catch (error) {
    console.error('Error checking bracket advancement:', error)
    return {
      canAdvance: false,
      definitiveCouples: [],
      reason: `Error al verificar avance: ${error instanceof Error ? error.message : 'Error desconocido'}`
    }
  }
}

/**
 * Generate progressive bracket with placeholders for undefined couples
 */
async function generateProgressiveBracket(tournamentId: string): Promise<{
  success: boolean,
  action: 'generated' | 'updated' | 'no_action',
  definitiveCouples: CoupleFromZone[],
  placeholderCount: number,
  message: string
}> {
  const supabase = await createClient()
  
  try {
    // Check if we can advance the bracket
    const advancementCheck = await canAdvanceBracket(tournamentId)
    
    if (!advancementCheck.canAdvance) {
      return {
        success: false,
        action: 'no_action',
        definitiveCouples: [],
        placeholderCount: 0,
        message: advancementCheck.reason || 'No se puede avanzar el bracket'
      }
    }
    
    const { definitiveCouples } = advancementCheck
    
    // Get tournament info to determine total required couples
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('bracket_status')
      .eq('id', tournamentId)
      .single()
    
    if (tournamentError || !tournament) {
      throw new Error(`Error fetching tournament: ${tournamentError?.message}`)
    }
    
    // Count total registered couples for this tournament
    const { count: totalCouples, error: countError } = await supabase
      .from('tournament_couples')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
    
    if (countError) {
      throw new Error(`Error counting couples: ${countError.message}`)
    }
    
    const totalRequired = totalCouples || 8 // Default to 8 if not set
    const placeholderCount = totalRequired - definitiveCouples.length
    
    // Create bracket with placeholders
    const bracketMatches = createBracketWithPlaceholders(definitiveCouples, totalRequired)
    
    // Save bracket to database
    await saveBracketToDatabase(tournamentId, {
      matches: bracketMatches,
      definitiveCouples,
      placeholderCount,
      generatedAt: new Date().toISOString()
    })
    
    // Update tournament status
    const newStatus = placeholderCount > 0 ? 'BRACKET_GENERATED' : 'BRACKET_ACTIVE'
    await updateTournamentBracketStatus(tournamentId, newStatus)
    
    return {
      success: true,
      action: tournament.bracket_status === 'NOT_STARTED' ? 'generated' : 'updated',
      definitiveCouples,
      placeholderCount,
      message: `Bracket ${placeholderCount > 0 ? 'generado' : 'actualizado'} con ${definitiveCouples.length} parejas definitivas y ${placeholderCount} placeholders`
    }
    
  } catch (error) {
    console.error('Error generating progressive bracket:', error)
    return {
      success: false,
      action: 'no_action',
      definitiveCouples: [],
      placeholderCount: 0,
      message: `Error al generar bracket: ${error instanceof Error ? error.message : 'Error desconocido'}`
    }
  }
}

/**
 * Create bracket matches with placeholders for undefined couples
 */
function createBracketWithPlaceholders(
  definitiveCouples: CoupleFromZone[],
  totalRequired: number
): any[] {
  const matches: any[] = []
  const placeholderCount = totalRequired - definitiveCouples.length
  
  // Create placeholders
  const placeholders: any[] = []
  for (let i = 0; i < placeholderCount; i++) {
    placeholders.push({
      id: `placeholder_${i + 1}`,
      isPlaceholder: true,
      placeholderId: `placeholder_${i + 1}`,
      player1Name: `Pendiente ${i + 1}`,
      player2Name: 'Por definir'
    })
  }
  
  // Combine definitive couples with placeholders
  const allParticipants = [...definitiveCouples, ...placeholders]
  
  // Generate bracket matches (simple elimination format)
  for (let i = 0; i < allParticipants.length; i += 2) {
    if (i + 1 < allParticipants.length) {
      const couple1 = allParticipants[i]
      const couple2 = allParticipants[i + 1]
      
      matches.push({
        couple1_id: couple1.isPlaceholder ? null : couple1.id,
        couple2_id: couple2.isPlaceholder ? null : couple2.id,
        placeholder_couple1_label: couple1.isPlaceholder ? couple1.placeholderId : null,
        placeholder_couple2_label: couple2.isPlaceholder ? couple2.placeholderId : null,
        status: 'PENDING',
        round: "4TOS", // Quarterfinals for bracket matches
        match_number: Math.floor(i / 2) + 1
      })
    }
  }
  
  return matches
}

/**
 * Check and update zone positions after a match result
 */
export async function checkAndUpdateZonePositions(
  tournamentId: string, 
  zoneId: string
): Promise<{
  success: boolean,
  positionsUpdated: boolean,
  bracketAdvanced: boolean,
  placeholdersResolved: number,
  message: string
}> {
  try {
    
    // Update zone positions
    await updateZonePositions(tournamentId, zoneId)
    
    // 🔄 TRANSACTION FIX: Ensure zone position updates are committed before placeholder resolution
    console.log(`🔄 [BACKEND] Zone positions updated, ensuring database consistency before placeholder resolution`)
    
    // 🎯 STATUS-AWARE: Only resolve placeholders in BRACKET_PHASE
    const supabase = await createClientServiceRole()
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('status')
      .eq('id', tournamentId)
      .single()
    
    if (tournamentError) {
      console.error(`[BACKEND] ⚠️ Could not fetch tournament status:`, tournamentError)
      console.log(`[BACKEND] 🔄 Defaulting to ZONE_PHASE behavior (skipping placeholder resolution)`)
    }
    
    const tournamentStatus = tournament?.status || 'ZONE_PHASE'
    let placeholderResult
    
    if (tournamentStatus === 'BRACKET_PHASE') {
      // 🚀 NEW: Use unified TypeScript bracket resolver (replaces RPC + PlaceholderService + IncrementalBracketUpdater)
      console.log(`🔄 [BACKEND] Tournament in BRACKET_PHASE - starting unified bracket resolution for zone ${zoneId}`)
      
      const { getBracketPlaceholderResolver } = await import('@/lib/services/bracket-placeholder-resolver')
      const bracketResolver = getBracketPlaceholderResolver()
      const bracketResult = await bracketResolver.resolveZonePlaceholders(tournamentId, zoneId)
      
      // Convert to compatible format for existing code
      placeholderResult = {
        success: bracketResult.success,
        placeholdersResolved: bracketResult.resolvedSeeds,
        resolutionDetails: [], // Not used in new architecture
        performance: {
          algorithmUsed: 'UNIFIED_TYPESCRIPT',
          executionTime: bracketResult.executionTime,
          operationsPerformed: bracketResult.resolvedSeeds
        }
      }
      
      console.log(`✅ [BACKEND] Unified bracket resolution result:`, {
        success: placeholderResult.success,
        resolved: placeholderResult.placeholdersResolved,
        algorithm: placeholderResult.performance?.algorithmUsed,
        executionTime: placeholderResult.performance?.executionTime ? `${placeholderResult.performance.executionTime}ms` : 'N/A'
      })
    } else {
      console.log(`📝 [BACKEND] Tournament in ${tournamentStatus} - skipping placeholder resolution (no placeholders exist yet)`)
      // Create a mock result for consistent code flow
      placeholderResult = {
        success: true,
        placeholdersResolved: 0,
        resolutionDetails: [],
        performance: { algorithmUsed: 'SKIPPED', executionTime: 0 }
      }
    }
    
    // 🔒 GUARD: Only attempt bracket advancement if placeholders were actually resolved
    // NO tocar bracket si no hay cambios reales
    const shouldAttemptBracketAdvancement = placeholderResult.placeholdersResolved > 0
    
    if (shouldAttemptBracketAdvancement) {
      // Check if bracket can be advanced
      const advancementCheck = await canAdvanceBracket(tournamentId)
      
      if (advancementCheck.canAdvance) {
        console.log(`🎯 [BACKEND] Attempting bracket advancement for tournament: ${tournamentId}`)
        console.log(`📊 [BACKEND] Advancement context: ${advancementCheck.definitiveCouples.length} definitive couples available`)
        
        try {
          // 🔒 ADDITIONAL GUARD: Verify we have enough context for bracket generation
          if (advancementCheck.definitiveCouples.length < 4) {
            console.log(`⚠️ [BACKEND] Insufficient couples for bracket generation (${advancementCheck.definitiveCouples.length}/4 minimum)`)
            throw new Error(`Insufficient couples for bracket generation: ${advancementCheck.definitiveCouples.length} definitive couples`)
          }
          
          // ✅ NEW: Unified resolver already handled everything (seeds + matches + BYEs + advancement)
          if (placeholderResult.placeholdersResolved > 0) {
            console.log(`✅ [BACKEND] Unified bracket resolution completed: ${placeholderResult.placeholdersResolved} placeholders resolved`)
            
            return {
              success: true,
              positionsUpdated: true,
              bracketAdvanced: true,
              placeholdersResolved: placeholderResult.placeholdersResolved,
              message: `Posiciones actualizadas y placeholders resueltos usando arquitectura TypeScript unificada. Seeds resueltos: ${placeholderResult.placeholdersResolved}`
            }
          }
          
          // Fallback: Try to generate or update bracket (full regeneration)
          console.log(`🔄 [BACKEND] Using full bracket generation/regeneration`)
          const bracketResult = await generateProgressiveBracket(tournamentId)
          
          return {
            success: true,
            positionsUpdated: true,
            bracketAdvanced: bracketResult.success,
            placeholdersResolved: placeholderResult.placeholdersResolved,
            message: `${bracketResult.message}. Placeholders resueltos: ${placeholderResult.placeholdersResolved}`
          }
        } catch (bracketError) {
          console.error(`❌ [BACKEND] Bracket generation failed, but zone updates succeeded:`, bracketError)
          // Return success for zone updates even if bracket fails
          return {
            success: true,
            positionsUpdated: true,
            bracketAdvanced: false,
            placeholdersResolved: placeholderResult.placeholdersResolved,
            message: `Posiciones actualizadas. Placeholders resueltos: ${placeholderResult.placeholdersResolved}. Bracket generation falló pero será reintentado.`
          }
        }
      }
    } else {
      console.log(`📋 [BACKEND] Skipping bracket advancement - no placeholders resolved and no advancement needed for tournament: ${tournamentId}`)
    }
    
    return {
      success: true,
      positionsUpdated: true,
      bracketAdvanced: false,
      placeholdersResolved: placeholderResult.placeholdersResolved,
      message: `Posiciones actualizadas. Placeholders resueltos: ${placeholderResult.placeholdersResolved}. Esperando más zonas completadas para avanzar bracket.`
    }
    
  } catch (error) {
    console.error('Error checking and updating zone positions:', error)
    return {
      success: false,
      positionsUpdated: false,
      bracketAdvanced: false,
      placeholdersResolved: 0,
      message: `Error al actualizar posiciones: ${error instanceof Error ? error.message : 'Error desconocido'}`
    }
  }
}



/**
 * Public function to generate progressive bracket manually
 */
export async function generateProgressiveBracketAction(tournamentId: string): Promise<{
  success: boolean,
  action: 'generated' | 'updated' | 'no_action',
  message: string,
  definitiveCouples?: CoupleFromZone[],
  placeholderCount?: number
}> {
  try {
    const result = await generateProgressiveBracket(tournamentId)
    return result
  } catch (error) {
    console.error('Error generating progressive bracket:', error)
    return {
      success: false,
      action: 'no_action',
      message: `Error al generar bracket progresivo: ${error instanceof Error ? error.message : 'Error desconocido'}`
    }
  }
}

/**
 * Public function to check bracket advancement status
 */
export async function checkBracketAdvancementAction(tournamentId: string): Promise<{
  success: boolean,
  canAdvance: boolean,
  definitiveCouples: CoupleFromZone[],
  reason?: string
}> {
  try {
    const result = await canAdvanceBracket(tournamentId)
    return {
      success: true,
      ...result
    }
  } catch (error) {
    console.error('Error checking bracket advancement:', error)
    return {
      success: false,
      canAdvance: false,
      definitiveCouples: [],
      reason: `Error al verificar avance: ${error instanceof Error ? error.message : 'Error desconocido'}`
    }
  }
}

/**
 * NUEVA FUNCIÓN: Generar bracket usando algoritmo zone-aware con serpenteo
 * Esta es la función principal que se debe llamar desde el UI cuando las zonas están finalizadas
 */
/**
 * NUEVA FUNCIÓN: Generar bracket con placeholders usando PlaceholderBracketGenerator
 * Permite generar brackets antes de que terminen todas las zonas, usando placeholders
 * para posiciones no definitivas y parejas reales para posiciones definitivas.
 */
export async function generatePlaceholderBracketAction(tournamentId: string) {
  try {
    const supabase = await createClient()

    console.log(`[generatePlaceholderBracketAction] Starting placeholder bracket generation for tournament ${tournamentId}`)

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()

    if (userErr || !user) {
      return { success: false, message: 'Usuario no autenticado', code: 'UNAUTHORIZED' as const }
    }

    const permissions = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissions.hasPermission) {
      return { success: false, message: 'No tienes permisos para gestionar este torneo', code: 'FORBIDDEN' as const }
    }

    return await generatePlaceholderBracket(tournamentId)
  } catch (error: any) {
    console.error('[generatePlaceholderBracketAction] Unexpected facade error:', error)
    return {
      success: false,
      message: error?.message || 'Failed to generate placeholder bracket',
      code: 'BRACKET_GENERATION_FAILED' as const
    }
  }
}

// ============================================================================
// NUEVAS FUNCIONES PARA SISTEMA SIMPLIFICADO DE TORNEOS
// ============================================================================

/**
 * Actualizar startTournament para usar ZONE_PHASE
 * Valida que todas las inscripciones esten aprobadas antes de iniciar
 */
export async function startTournament(tournamentId: string) {
  const supabase = await createClient()
  
  try {
    // Verificar si hay inscripciones pendientes de aprobacion
    const { data: pendingInscriptions, error: pendingError } = await supabase
      .from('inscriptions')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('is_pending', true)
      .eq('es_prueba', false)
    
    if (pendingError) throw pendingError
    
    if (pendingInscriptions && pendingInscriptions.length > 0) {
      return { 
        success: false, 
        error: `No se puede iniciar el torneo. Hay ${pendingInscriptions.length} inscripcion(es) pendiente(s) de aprobacion.` 
      }
    }
    
    // Cambiar estado a ZONE_PHASE (en lugar de PAIRING/ZONE_REGISTRATION)
    const { data, error } = await supabase
      .from('tournaments')
      .update({ 
        status: 'ZONE_PHASE',
        start_date: new Date().toISOString() 
      })
      .eq('id', tournamentId)
      .select()
    
    if (error) throw error
    
    return { success: true, data }
  } catch (error: any) {
    console.error('Error starting tournament:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Nueva función para transición a bracket
 */
export async function startBracketPhase(tournamentId: string) {
  const supabase = await createClient()
  
  try {
    const { data, error } = await supabase
      .from('tournaments')
      .update({ 
        status: 'BRACKET_PHASE',
        bracket_generated_at: new Date().toISOString() 
      })
      .eq('id', tournamentId)
      .select()
    
    if (error) throw error
    
    return { success: true, data }
  } catch (error: any) {
    console.error('Error starting bracket phase:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Función para validar y mover pareja a zona con restricciones
 */
export async function validateAndMoveCoupleToZone(
  tournamentId: string,
  coupleId: string,
  targetZoneId: string,
  fromZoneId?: string
) {
  try {
    await assertTournamentManagementPermission(tournamentId)
  } catch (permissionError: any) {
    return { success: false, error: permissionError.message }
  }

  const supabase = await createClient()
  
  // 1. Validar restricciones
  const validation = await validateCoupleMovement(tournamentId, coupleId, fromZoneId)
  if (!validation.allowed) {
    return { 
      success: false, 
      error: validation.reason,
      details: validation.details 
    }
  }
  
  try {
    const { data: maxPosition, error: positionError } = await supabase
      .from('zone_positions')
      .select('position')
      .eq('tournament_id', tournamentId)
      .eq('zone_id', targetZoneId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (positionError) throw positionError

    await applyAuthorizedZoneMembershipChanges(tournamentId, [{
      couple_id: coupleId,
      from_zone_id: fromZoneId || null,
      to_zone_id: targetZoneId,
      to_position: (maxPosition?.position || 0) + 1,
    }])

    if (fromZoneId) await updateZonePositions(tournamentId, fromZoneId)
    await updateZonePositions(tournamentId, targetZoneId)

    return { success: true }
    
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Check if user has permission to modify tournament
 * Returns true if user is CLUB owner of the tournament or ADMIN
 */
async function checkTournamentPermission(userId: string, tournamentId: string): Promise<{
  hasPermission: boolean
  reason?: string
  userRole?: string
}> {
  const supabase = await createClient()
  
  try {
    // Get user role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()
    
    if (userError) {
      return {
        hasPermission: false,
        reason: 'Error fetching user role'
      }
    }
    
    const userRole = userData.role
    
    // ADMIN users have full access
    if (userRole === 'ADMIN') {
      return {
        hasPermission: true,
        userRole
      }
    }
    
    // For CLUB users, check if they own the tournament
    if (userRole === 'CLUB') {
      const { data: tournamentData, error: tournamentError } = await supabase
        .from('tournaments')
        .select('club_id')
        .eq('id', tournamentId)
        .single()
      
      if (tournamentError) {
        return {
          hasPermission: false,
          reason: 'Error fetching tournament data',
          userRole
        }
      }
      
      // Check if user owns this club
      const { data: clubData, error: clubError } = await supabase
        .from('clubes')
        .select('id')
        .eq('user_id', userId)
        .eq('id', tournamentData.club_id)
        .single()
      
      if (clubError || !clubData) {
        return {
          hasPermission: false,
          reason: 'User is not the owner of this tournament',
          userRole
        }
      }
      
      return {
        hasPermission: true,
        userRole
      }
    }
    
    // Other roles (COACH, PLAYER) don't have permission to modify tournaments
    return {
      hasPermission: false,
      reason: 'User role does not have permission to modify tournaments',
      userRole
    }
    
  } catch (error) {
    console.error('[checkTournamentPermission] Error:', error)
    return {
      hasPermission: false,
      reason: 'System error checking permissions'
    }
  }
}

/**
 * @deprecated LEGACY SYSTEM - Use updateZonePositions() instead
 * 
 * This function is deprecated and kept only for compatibility.
 * The new updateZonePositions() function uses the improved ranking algorithm.
 * 
 * Secure Server Action to update zone positions
 * Uses proper authentication and permission checks
 */
export async function updateZonePositionsAction(
  tournamentId: string, 
  zoneId: string
): Promise<{
  success: boolean
  positionsUpdated?: number
  message?: string
  error?: string
}> {
  const supabase = await createClient()
  
  try {
    // 1. Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return {
        success: false,
        error: 'Authentication required'
      }
    }
    
    // 2. Check permissions
    const permissionCheck = await checkTournamentPermission(user.id, tournamentId)
    
    if (!permissionCheck.hasPermission) {
      return {
        success: false,
        error: `Access denied: ${permissionCheck.reason}`
      }
    }
    
    console.log(`[updateZonePositionsAction] User ${user.id} (${permissionCheck.userRole}) updating positions for zone ${zoneId}`)
    
    // 3. Calculate new positions using the zone-positions calculation logic
    const { data: couples, error: couplesError } = await supabase
      .from('zone_couples')
      .select(`
        couple_id,
        couples!zone_couples_couple_id_fkey(
          id,
          player1_id,
          player2_id,
          player1:players!couples_player1_id_fkey(id, first_name, last_name, score),
          player2:players!couples_player2_id_fkey(id, first_name, last_name, score)
        )
      `)
      .eq('zone_id', zoneId)

    if (couplesError) {
      return {
        success: false,
        error: `Error fetching couples: ${couplesError.message}`
      }
    }

    if (!couples || couples.length === 0) {
      return {
        success: true,
        positionsUpdated: 0,
        message: 'No couples found in this zone'
      }
    }

    // 4. Fetch finished matches for this zone
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select(`
        id,
        couple1_id,
        couple2_id,
        result_couple1,
        result_couple2,
        winner_id,
        status,
        zone_id
      `)
      .eq('zone_id', zoneId)
      .eq('tournament_id', tournamentId)
      .eq('status', 'FINISHED')
      .not('result_couple1', 'is', null)
      .not('result_couple2', 'is', null)

    // 4.1 LEGACY: Also log non-finished matches for debugging (matches new system)
    const { data: legacyNonFinished, error: legacyNonFinishedError } = await supabase
      .from('matches')
      .select('id, status')
      .eq('zone_id', zoneId)
      .eq('tournament_id', tournamentId)
      .in('status', ['PENDING', 'IN_PROGRESS'])
    
    if (legacyNonFinished && legacyNonFinished.length > 0) {
      console.log(`[LEGACY-updateZonePositionsAction] ⚠️ Zone ${zoneId} has ${legacyNonFinished.length} non-finished matches that will affect position definitiveness`)
    }

    if (matchesError) {
      return {
        success: false,
        error: `Error fetching matches: ${matchesError.message}`
      }
    }

    // 5. Calculate positions using zone position service
    const { ZoneStatsCalculator, ZoneRankingEngine } = await import('@/lib/services/zone-position')
    
    const coupleData = couples.map(zoneCouple => {
      const couple = Array.isArray(zoneCouple.couples) ? zoneCouple.couples[0] : zoneCouple.couples
      return {
        id: couple.id,
        player1_id: couple.player1_id,
        player2_id: couple.player2_id,
        player1: Array.isArray(couple.player1) ? couple.player1[0] : couple.player1,
        player2: Array.isArray(couple.player2) ? couple.player2[0] : couple.player2
      }
    })

    const matchData = (matches || []).map(match => ({
      id: match.id,
      couple1_id: match.couple1_id,
      couple2_id: match.couple2_id,
      result_couple1: match.result_couple1,
      result_couple2: match.result_couple2,
      winner_id: match.winner_id,
      status: match.status as 'FINISHED',
      zone_id: match.zone_id
    }))

    const calculator = new ZoneStatsCalculator()
    const engine = new ZoneRankingEngine()

    const coupleStats = calculator.calculateAllCoupleStats(coupleData, matchData)
    const headToHeadMatrix = calculator.createHeadToHeadMatrix(coupleData, matchData)
    const rankedCouples = engine.rankCouplesByAllCriteria(coupleStats, headToHeadMatrix)

    // 6. Save positions to database
    if (rankedCouples.length === 0) {
      return {
        success: true,
        positionsUpdated: 0,
        message: 'No positions to update'
      }
    }

    // Insert new positions
    const positionRecords = rankedCouples.map((position: any) => ({
      couple_id: position.coupleId,
      position: position.position,
      is_definitive: false,
      points: position.points || 0,
      wins: position.matchesWon,
      losses: position.matchesLost,
      games_for: position.gamesWon,
      games_against: position.gamesLost,
      games_difference: position.gamesDifference,
      player_score_total: position.totalPlayerScore,
      tie_info: position.positionTieInfo,
      calculated_at: new Date().toISOString(),
      sets_for: position.setsWon || 0,
      sets_against: position.setsLost || 0,
      sets_difference: position.setsDifference || 0,
    }))

    let savedCount: number
    try {
      savedCount = await replaceZonePositionsAtomically(supabase, tournamentId, zoneId, positionRecords)
    } catch (saveError: any) {
      return {
        success: false,
        error: saveError.message
      }
    }

    console.log(`[updateZonePositionsAction] Successfully updated ${savedCount} positions for zone ${zoneId}`)
    
    // 7. Note: Cache invalidation will be handled by the client
    
    return {
      success: true,
      positionsUpdated: savedCount,
      message: `Successfully updated ${savedCount} zone positions`
    }
    
  } catch (error: any) {
    console.error('[updateZonePositionsAction] Error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error updating zone positions'
    }
  }
}

// =============================================================================
// SERPENTINE BRACKET GENERATION
// =============================================================================

/**
 * @deprecated FUNCIÓN ELIMINADA - Serpentine Bracket Puro
 * 
 * Esta función implementaba el algoritmo serpentino puro pero NO poblaba
 * las tablas tournament_couple_seeds ni match_hierarchy, por lo que el
 * sistema de avance automático NO funcionaba.
 * 
 * ✅ USAR EN SU LUGAR: Algoritmo Hybrid-Serpentino
 * - Endpoints: generate-seeding + generate-bracket-from-seeding  
 * - Mismas garantías serpentinas + BD completa + avance automático funcional
 * 
 * Ver documentación completa en: ALGORITMO-HYBRID-SERPENTINO.md
 */
export async function generateSerpentineBracketAction(tournamentId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  return {
    success: false,
    error: "FUNCIÓN ELIMINADA: Usar Algoritmo Hybrid-Serpentino en su lugar. Ver ALGORITMO-HYBRID-SERPENTINO.md para documentación completa."
  };
}

/**
 * Fetches finalized zone positions from database for serpentine bracket generation
 */
async function fetchZonePositionsFromDatabase(
  tournamentId: string, 
  supabase: any
): Promise<ZonePosition[]> {
  console.log(`[fetchZonePositionsFromDatabase] Fetching zone positions for tournament ${tournamentId}`);

  const { data, error } = await supabase
    .from("zone_positions")
    .select(`
      *,
      zones:zone_id (
        name
      ),
      couples:couple_id (
        player1:player1_id (
          first_name,
          last_name
        ),
        player2:player2_id (
          first_name,
          last_name
        )
      )
    `)
    .eq("tournament_id", tournamentId)
    .eq("is_definitive", true)
    .order("zone_id")
    .order("position");

  if (error) {
    console.error('[fetchZonePositionsFromDatabase] Error:', error);
    throw new Error(`Failed to fetch zone positions: ${error.message}`);
  }

  // Transform data to ZonePosition format
  const zonePositions: ZonePosition[] = data.map((row: any) => ({
    id: row.id,
    tournament_id: row.tournament_id,
    zone_id: row.zone_id,
    couple_id: row.couple_id,
    position: row.position,
    is_definitive: row.is_definitive || false,
    points: row.points,
    wins: row.wins,
    losses: row.losses,
    games_for: row.games_for,
    games_against: row.games_against,
    games_difference: row.games_difference,
    player_score_total: row.player_score_total,
    tie_info: row.tie_info,
    calculated_at: row.calculated_at,
    zone_name: row.zones?.name || 'Unknown Zone',
    zone_letter: extractZoneLetter(row.zones?.name || ''),
    couple_name: row.couples ? 
      `${row.couples.player1?.first_name || 'P1'} ${row.couples.player1?.last_name || ''} / ${row.couples.player2?.first_name || 'P2'} ${row.couples.player2?.last_name || ''}`.trim() :
      'Unknown Couple',
    player1_name: row.couples?.player1 ? `${row.couples.player1.first_name} ${row.couples.player1.last_name}`.trim() : undefined,
    player2_name: row.couples?.player2 ? `${row.couples.player2.first_name} ${row.couples.player2.last_name}`.trim() : undefined,
  }));

  console.log(`[fetchZonePositionsFromDatabase] ✅ Fetched ${zonePositions.length} zone positions`);
  return zonePositions;
}

/**
 * Helper function to extract zone letter from zone name
 */
function extractZoneLetter(zoneName: string): string {
  const match = zoneName.match(/[A-Z]/);
  return match ? match[0] : zoneName;
}
