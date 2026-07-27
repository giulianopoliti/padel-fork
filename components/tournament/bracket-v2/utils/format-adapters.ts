/**
 * FORMAT ADAPTERS - ADAPTADORES DE FORMATO DE DATOS
 * 
 * Funciones especializadas para convertir datos de APIs legacy
 * al formato BracketMatchV2 del nuevo sistema.
 * 
 * RESPONSABILIDADES:
 * - Transformar respuestas de APIs existentes
 * - Normalizar datos de diferentes fuentes
 * - Validar y limpiar datos inconsistentes
 * - Aplicar defaults seguros
 * 
 * @author Claude Code Assistant
 * @version 2.0.0
 * @created 2025-01-17
 */

import type {
  BracketMatchV2,
  SeedInfo,
  ZoneData,
  CoupleData,
  PlayerData,
  ParticipantSlot,
  MatchStatus,
  Round,
  BracketAlgorithm
} from '../types/bracket-types'
import { BracketState } from '../types/bracket-types'

// ============================================================================
// TIPOS DE ENTRADA (APIs LEGACY)
// ============================================================================

interface CurrentApiSeedReference {
  id?: string
  couple_id?: string | null
  seed?: number
  bracket_position?: number | null
  placeholder_label?: string | null
  placeholder_zone_id?: string | null
  placeholder_position?: number | null
  is_placeholder?: boolean
  created_as_placeholder?: boolean
  placeholder_zone?: {
    id: string
    name: string
  } | Array<{
    id: string
    name: string
  }> | null
}

/**
 * Match del formato legacy (hook useTournamentMatches)
 */
export interface LegacyMatch {
  id: string
  tournament_id: string
  round: string
  status: string
  court?: string
  created_at: string
  zone_name?: string
  couple_1: {
    id: string
    player_1: string
    player_2: string
  }
  couple_2: {
    id: string
    player_1: string
    player_2: string
  }
}

/**
 * Tipo para la estructura actual de la API de matches
 */
export interface CurrentApiMatch {
  id: string
  tournament_id: string
  round: string
  status: string
  court?: string
  created_at: string
  couple1?: {
    id: string
    player1?: {
      first_name: string
      last_name: string
    }
    player2?: {
      first_name: string
      last_name: string
    }
  } | null
  couple2?: {
    id: string
    player1?: {
      first_name: string
      last_name: string
    }
    player2?: {
      first_name: string
      last_name: string
    }
  } | null
  order_in_round?: number
  // Campos de resultado - agregados para mostrar resultados en las cards
  result_couple1?: string | number | null
  result_couple2?: string | number | null
  winner_id?: string | null
  couple1_id?: string | null
  couple2_id?: string | null
  tournament_couple_seed1_id?: string | null
  tournament_couple_seed2_id?: string | null
  seed1?: CurrentApiSeedReference | null
  seed2?: CurrentApiSeedReference | null
  // NUEVO: Campos para placeholders del backend bracket-hierarchy
  couple1_placeholder_label?: string | null
  couple1_is_placeholder?: boolean
  couple1_placeholder_zone_id?: string | null
  couple1_placeholder_position?: number | null
  couple1_placeholder_zone_name?: string | null
  couple2_placeholder_label?: string | null
  couple2_is_placeholder?: boolean
  couple2_placeholder_zone_id?: string | null
  couple2_placeholder_position?: number | null
  couple2_placeholder_zone_name?: string | null
  // LEGACY: Campos para placeholders (mantener compatibilidad)
  placeholder_couple1_label?: string | null
  placeholder_couple2_label?: string | null
  is_placeholder_match?: boolean
  // NUEVO: Datos de scheduling desde fecha_matches
  scheduling?: {
    scheduled_date?: string | null
    scheduled_start_time?: string | null
    scheduled_end_time?: string | null
    scheduled_time?: string | null
    court?: string | null
    notes?: string | null
  }
}

/**
 * Seed del endpoint /api/tournaments/[id]/seeds
 */
export interface LegacySeed {
  id: string
  tournament_id: string
  couple_id: string | null
  seed: number
  bracket_position: number
  zone_id?: string | null
  zone_name?: string | null
  zone_position?: number | null
  is_placeholder?: boolean
  placeholder_zone_id?: string | null
  placeholder_position?: number | null
  placeholder_label?: string | null
  created_as_placeholder?: boolean
  couples: {
    id: string
    player1: { first_name: string, last_name: string }
    player2: { first_name: string, last_name: string }
  }
}

/**
 * Pareja de la tabla couples (formato Supabase)
 */
export interface SupabaseCouple {
  id: string
  player1_id: string
  player2_id: string
  player1_details?: {
    id: string
    first_name: string
    last_name: string
    score?: number
  }
  player2_details?: {
    id: string
    first_name: string
    last_name: string
    score?: number
  }
}

/**
 * Zone position de la tabla zone_positions
 */
export interface ZonePosition {
  id: string
  tournament_id: string
  couple_id: string
  zone_id: string
  position: number
  is_definitive: boolean
  created_at: string
}

// ============================================================================
// ADAPTADORES DE TRANSFORMACIÓN
// ============================================================================

/**
 * Convierte nombre completo a PlayerData
 */
export function parsePlayerFromFullName(fullName: string): PlayerData {
  const nameParts = fullName.trim().split(' ')
  const firstName = nameParts[0] || ''
  const lastName = nameParts.slice(1).join(' ') || ''
  
  return {
    id: '', // No disponible en formato legacy
    first_name: firstName,
    last_name: lastName
  }
}

/**
 * Convierte seed legacy a SeedInfo
 */
export function transformLegacySeedToSeedInfo(legacySeed: LegacySeed): SeedInfo {
  return {
    id: legacySeed.id,
    seed: legacySeed.seed,
    bracket_position: legacySeed.bracket_position,
    zone_id: legacySeed.zone_id || legacySeed.placeholder_zone_id || null,
    zone_name: legacySeed.zone_name || (legacySeed.zone_id ? `Zona ${legacySeed.zone_id}` : null),
    zone_position: legacySeed.zone_position || legacySeed.placeholder_position || null,
    couple_id: legacySeed.couple_id || '',
    is_placeholder: legacySeed.is_placeholder,
    placeholder_zone_id: legacySeed.placeholder_zone_id,
    placeholder_position: legacySeed.placeholder_position,
    placeholder_label: legacySeed.placeholder_label,
    created_as_placeholder: legacySeed.created_as_placeholder
  }
}

function getCurrentApiSeedZoneName(seed?: CurrentApiSeedReference | null): string | null {
  const zone = Array.isArray(seed?.placeholder_zone)
    ? seed?.placeholder_zone[0]
    : seed?.placeholder_zone

  return zone?.name || null
}

function transformCurrentApiSeedReferenceToSeedInfo(
  seed: CurrentApiSeedReference | null | undefined
): SeedInfo | undefined {
  if (!seed?.id) return undefined

  return {
    id: seed.id,
    seed: seed.seed || 0,
    bracket_position: seed.bracket_position || 0,
    zone_id: seed.placeholder_zone_id || null,
    zone_name: getCurrentApiSeedZoneName(seed),
    zone_position: seed.placeholder_position || null,
    couple_id: seed.couple_id || '',
    is_placeholder: seed.is_placeholder,
    placeholder_zone_id: seed.placeholder_zone_id,
    placeholder_position: seed.placeholder_position,
    placeholder_label: seed.placeholder_label,
    created_as_placeholder: seed.created_as_placeholder
  }
}

/**
 * Convierte couple de Supabase a CoupleData
 */
export function transformSupabaseCoupleToData(couple: SupabaseCouple, seed?: SeedInfo): CoupleData {
  return {
    id: couple.id,
    player1_id: couple.player1_id,
    player2_id: couple.player2_id,
    player1_details: couple.player1_details ? {
      id: couple.player1_details.id,
      first_name: couple.player1_details.first_name,
      last_name: couple.player1_details.last_name,
      score: couple.player1_details.score
    } : undefined,
    player2_details: couple.player2_details ? {
      id: couple.player2_details.id,
      first_name: couple.player2_details.first_name,
      last_name: couple.player2_details.last_name,
      score: couple.player2_details.score
    } : undefined,
    seed: seed
  }
}

/**
 * Convierte couple de la API actual a CoupleData
 */
export function transformCurrentApiCoupleToData(
  coupleData: CurrentApiMatch['couple1'],
  seed?: SeedInfo
): CoupleData {
  // Validación defensiva
  if (!coupleData || typeof coupleData !== 'object') {
    throw new Error('transformCurrentApiCoupleToData: coupleData is null or undefined')
  }
  
  // Transformar player objects a PlayerData
  const player1: PlayerData = {
    id: '', // No disponible en la respuesta actual
    first_name: coupleData.player1?.first_name || '',
    last_name: coupleData.player1?.last_name || ''
  }
  
  const player2: PlayerData = {
    id: '', // No disponible en la respuesta actual  
    first_name: coupleData.player2?.first_name || '',
    last_name: coupleData.player2?.last_name || ''
  }
  
  // Generar nombre de la pareja a partir de los jugadores
  const coupleName = `${player1.first_name} ${player1.last_name} / ${player2.first_name} ${player2.last_name}`.trim()

  return {
    id: coupleData.id || '',
    player1_id: '', // No disponible en la respuesta actual
    player2_id: '', // No disponible en la respuesta actual
    player1_details: player1,
    player2_details: player2,
    seed: seed,
    name: coupleName || `Pareja ${coupleData.id?.slice(-4) || 'TBD'}` // Fallback si no hay nombres
  }
}

/**
 * Convierte legacy couple a CoupleData
 */
export function transformLegacyCoupleToData(
  coupleData: LegacyMatch['couple_1'],
  seed?: SeedInfo
): CoupleData {
  // Validación defensiva
  if (!coupleData || typeof coupleData !== 'object') {
    throw new Error('transformLegacyCoupleToData: coupleData is null or undefined')
  }
  
  const player1 = parsePlayerFromFullName(coupleData.player_1 || '')
  const player2 = parsePlayerFromFullName(coupleData.player_2 || '')
  
  // Generar nombre de la pareja a partir de los jugadores (legacy format)
  const coupleName = `${player1.first_name} ${player1.last_name} / ${player2.first_name} ${player2.last_name}`.trim()

  return {
    id: coupleData.id || '',
    player1_id: '', // No disponible en legacy
    player2_id: '', // No disponible en legacy
    player1_details: player1,
    player2_details: player2,
    seed: seed,
    name: coupleName || `Pareja ${coupleData.id?.slice(-4) || 'TBD'}` // Fallback si no hay nombres
  }
}

/**
 * Convierte round string a tipo Round
 */
export function transformRoundString(roundStr: string): Round {
  const normalizedRound = roundStr.toUpperCase().trim()
  
  const roundMapping: Record<string, Round> = {
    'FINAL': 'FINAL',
    'SEMIFINAL': 'SEMIFINAL',
    'SEMI': 'SEMIFINAL',
    'CUARTOS': '4TOS',
    '4TOS': '4TOS',
    'CUARTOS DE FINAL': '4TOS',
    'OCTAVOS': '8VOS',
    '8VOS': '8VOS',
    'OCTAVOS DE FINAL': '8VOS',
    '16VOS': '16VOS',
    '16VOS DE FINAL': '16VOS',
    '32VOS': '32VOS',
    '32VOS DE FINAL': '32VOS'
  }
  
  return roundMapping[normalizedRound] || '8VOS'
}

/**
 * Convierte status string a MatchStatus
 */
export function transformMatchStatus(statusStr: string): MatchStatus {
  const normalizedStatus = statusStr.toUpperCase().trim()
  
  const statusMapping: Record<string, MatchStatus> = {
    'DRAFT': 'DRAFT',
    'BORRADOR': 'DRAFT',
    'PENDING': 'PENDING',
    'PROGRAMADO': 'PENDING',
    'EN_ESPERA': 'PENDING',
    'IN_PROGRESS': 'IN_PROGRESS',
    'EN_CURSO': 'IN_PROGRESS',
    'JUGANDO': 'IN_PROGRESS',
    'FINISHED': 'FINISHED',
    'FINALIZADO': 'FINISHED',
    'COMPLETADO': 'FINISHED',
    'CANCELED': 'CANCELED',
    'CANCELLED': 'CANCELED',
    'CANCELADO': 'CANCELED',
    'BYE': 'BYE',
    'WAITING_OPONENT': 'WAITING_OPPONENT',
    'WAITING_OPPONENT': 'WAITING_OPPONENT',
    'ESPERANDO_OPONENTE': 'WAITING_OPPONENT'
  }
  
  return statusMapping[normalizedStatus] || 'PENDING'
}

/**
 * Extrae order_in_round de diferentes fuentes
 */
export function extractOrderInRound(
  matchId: string,
  createdAt?: string,
  fallbackOrder?: number
): number {
  // Intentar extraer del ID (formato común: match_1, bracket_2, etc)
  const idMatch = matchId.match(/[_-]?(\d+)$/)
  if (idMatch) {
    return parseInt(idMatch[1], 10)
  }
  
  // Intentar extraer de UUID (últimos dígitos)
  const uuidMatch = matchId.match(/(\d+)(?!.*\d)/)
  if (uuidMatch) {
    return parseInt(uuidMatch[1], 10) % 100 // Limitar a 2 dígitos
  }
  
  // Usar timestamp como fallback
  if (createdAt) {
    const timestamp = new Date(createdAt).getTime()
    return (timestamp % 1000) + 1 // Número entre 1-1000
  }
  
  return fallbackOrder || 1
}

/**
 * Crea ParticipantSlot desde datos de pareja
 */
export function createParticipantSlot(
  couple: CoupleData,
  seed?: SeedInfo
): ParticipantSlot {
  return {
    type: 'couple',
    couple: couple,
    seed: seed
  }
}

/**
 * Crea ParticipantSlot placeholder
 */
export function createPlaceholderSlot(
  displayText: string,
  zoneId?: string,
  position?: number,
  zoneName?: string | null,
  seed?: SeedInfo
): ParticipantSlot {
  return {
    type: 'placeholder',
    placeholder: {
      display: displayText,
      zoneId: zoneId || null,
      zoneName: zoneName || null,
      position: position || null,
      rule: {
        type: zoneId ? 'zone-position' : 'match-winner',
        zoneId: zoneId,
        position: position || 1
      },
      isDefinitive: false
    },
    seed
  }
}

/**
 * Crea ParticipantSlot BYE
 */
export function createBYESlot(): ParticipantSlot {
  return {
    type: 'bye'
  }
}

/**
 * Crea ParticipantSlot vacío para matches sin parejas asignadas
 */
export function createEmptySlot(): ParticipantSlot {
  return {
    type: 'empty'
  }
}

// ============================================================================
// TRANSFORMADOR PRINCIPAL DE MATCH
// ============================================================================

/**
 * Transforma match de la API actual a formato BracketMatchV2
 */
export function transformCurrentApiMatchToBracketV2(
  currentMatch: CurrentApiMatch,
  seeds: SeedInfo[],
  algorithm: BracketAlgorithm = 'serpentine'
): BracketMatchV2 {
  // Debug logging en desarrollo
  if (process.env.NODE_ENV === 'development') {
    console.log('[transformCurrentApiMatchToBracketV2] Processing match:', {
      id: currentMatch.id,
      hasCouple1: !!currentMatch.couple1,
      hasCouple2: !!currentMatch.couple2,
      couple1: currentMatch.couple1,
      couple2: currentMatch.couple2
    })
  }
  
  // Validaciones defensivas para evitar errores de undefined
  const hasCouple1 = currentMatch.couple1 && typeof currentMatch.couple1 === 'object'
  const hasCouple2 = currentMatch.couple2 && typeof currentMatch.couple2 === 'object'
  
  // Buscar seeds para las parejas (solo si existen)
  const couple1Seed = hasCouple1 && currentMatch.couple1?.id 
    ? seeds.find(s => s.couple_id === currentMatch.couple1?.id)
    : undefined
  const couple2Seed = hasCouple2 && currentMatch.couple2?.id
    ? seeds.find(s => s.couple_id === currentMatch.couple2?.id) 
    : undefined
  const slot1SeedReference = transformCurrentApiSeedReferenceToSeedInfo(currentMatch.seed1)
  const slot2SeedReference = transformCurrentApiSeedReferenceToSeedInfo(currentMatch.seed2)
  
  // Transformar parejas (manejar casos null/undefined)
  const couple1Data = hasCouple1 
    ? transformCurrentApiCoupleToData(currentMatch.couple1, couple1Seed)
    : null
  const couple2Data = hasCouple2
    ? transformCurrentApiCoupleToData(currentMatch.couple2, couple2Seed)
    : null
  
  // Detectar si hay BYEs (para el formato actual esto será raro)
  const isBYE1 = false // No esperamos BYEs en el formato actual
  const isBYE2 = false
  
    // NUEVO: Crear slots con soporte para placeholders
  // Buscar placeholders en ambos formatos (legacy y nuevo)
  const slot1PlaceholderLabel = currentMatch.placeholder_couple1_label || currentMatch.couple1_placeholder_label
  const slot2PlaceholderLabel = currentMatch.placeholder_couple2_label || currentMatch.couple2_placeholder_label
  const slot1PlaceholderZoneId = currentMatch.seed1?.placeholder_zone_id || currentMatch.couple1_placeholder_zone_id || undefined
  const slot2PlaceholderZoneId = currentMatch.seed2?.placeholder_zone_id || currentMatch.couple2_placeholder_zone_id || undefined
  const slot1PlaceholderPosition = currentMatch.seed1?.placeholder_position || currentMatch.couple1_placeholder_position || undefined
  const slot2PlaceholderPosition = currentMatch.seed2?.placeholder_position || currentMatch.couple2_placeholder_position || undefined
  const slot1PlaceholderZoneName = getCurrentApiSeedZoneName(currentMatch.seed1) || currentMatch.couple1_placeholder_zone_name || null
  const slot2PlaceholderZoneName = getCurrentApiSeedZoneName(currentMatch.seed2) || currentMatch.couple2_placeholder_zone_name || null
  
  const slot1 = couple1Data 
    ? createParticipantSlot(couple1Data, couple1Seed)
    : slot1PlaceholderLabel 
      ? createPlaceholderSlot(
          slot1PlaceholderLabel,
          slot1PlaceholderZoneId || undefined,
          slot1PlaceholderPosition || undefined,
          slot1PlaceholderZoneName,
          slot1SeedReference
        )
      : createEmptySlot()
      
  const slot2 = couple2Data
    ? createParticipantSlot(couple2Data, couple2Seed)  
    : slot2PlaceholderLabel
      ? createPlaceholderSlot(
          slot2PlaceholderLabel,
          slot2PlaceholderZoneId || undefined,
          slot2PlaceholderPosition || undefined,
          slot2PlaceholderZoneName,
          slot2SeedReference
        )
      : createEmptySlot()
  
  // The real couple ids are the operational truth for whether a match can be played.
  const hasResolvedCouple1 = Boolean(currentMatch.couple1_id || currentMatch.couple1?.id)
  const hasResolvedCouple2 = Boolean(currentMatch.couple2_id || currentMatch.couple2?.id)
  const hasBothResolvedCouples = hasResolvedCouple1 && hasResolvedCouple2
  const normalizedStatus = transformMatchStatus(currentMatch.status)
  const statusCanBeDerivedFromParticipants =
    normalizedStatus === 'PENDING' || normalizedStatus === 'WAITING_OPPONENT'

  const matchStatus: MatchStatus = statusCanBeDerivedFromParticipants
    ? hasBothResolvedCouples
      ? 'PENDING'
      : 'WAITING_OPPONENT'
    : normalizedStatus
  
  // Procesar scheduling data - priorizar currentMatch.scheduling si existe
  // Si viene scheduling desde fecha_matches, usarlo. Sino, usar court legacy.
  const schedulingData = currentMatch.scheduling || {
    court: currentMatch.court
  }
  const normalizedSchedulingData = schedulingData
    ? {
        court: schedulingData.court || undefined,
        scheduled_time: schedulingData.scheduled_time || undefined
      }
    : undefined

  // DEBUG: Log scheduling data processing
  if (currentMatch.scheduling || currentMatch.court) {
    console.log(`🔄 [transformCurrentApiMatchToBracketV2] Match ${currentMatch.id} scheduling:`, {
      matchId: currentMatch.id,
      round: currentMatch.round,
      hasScheduling: !!currentMatch.scheduling,
      scheduling: currentMatch.scheduling,
      legacyCourt: currentMatch.court,
      finalSchedulingData: normalizedSchedulingData
    })
  }

  return {
    id: currentMatch.id,
    round: transformRoundString(currentMatch.round),
    order_in_round: currentMatch.order_in_round || extractOrderInRound(currentMatch.id, currentMatch.created_at),
    status: matchStatus,
    participants: {
      slot1,
      slot2
    },
    // Agregados para mostrar resultados en las cards
    result_couple1: currentMatch.result_couple1,
    result_couple2: currentMatch.result_couple2,
    winner_id: currentMatch.winner_id,
    couple1_id: currentMatch.couple1_id,
    couple2_id: currentMatch.couple2_id,
    tournament_couple_seed1_id: currentMatch.tournament_couple_seed1_id,
    tournament_couple_seed2_id: currentMatch.tournament_couple_seed2_id,
    scheduling: normalizedSchedulingData,
    metadata: {
      is_auto_generated: true,
      created_at: currentMatch.created_at,
      algorithm_info: {
        algorithm: algorithm,
        seed_pair: couple1Seed && couple2Seed ? [couple1Seed.seed, couple2Seed.seed] : undefined
      }
    }
  }
}

/**
 * Convierte match legacy completo a BracketMatchV2
 */
export function transformLegacyMatchToBracketV2(
  legacyMatch: LegacyMatch,
  seeds: SeedInfo[],
  algorithm: BracketAlgorithm = 'serpentine'
): BracketMatchV2 {
  // Debug logging en desarrollo
  if (process.env.NODE_ENV === 'development') {
    console.log('[transformLegacyMatchToBracketV2] Processing match:', {
      id: legacyMatch.id,
      hasCouple1: !!legacyMatch.couple_1,
      hasCouple2: !!legacyMatch.couple_2,
      couple1Type: typeof legacyMatch.couple_1,
      couple2Type: typeof legacyMatch.couple_2
    })
  }
  
  // Validaciones defensivas para evitar errores de undefined
  const hasCouple1 = legacyMatch.couple_1 && typeof legacyMatch.couple_1 === 'object'
  const hasCouple2 = legacyMatch.couple_2 && typeof legacyMatch.couple_2 === 'object'
  
  // Buscar seeds para las parejas (solo si existen)
  const couple1Seed = hasCouple1 && legacyMatch.couple_1.id 
    ? seeds.find(s => s.couple_id === legacyMatch.couple_1.id)
    : undefined
  const couple2Seed = hasCouple2 && legacyMatch.couple_2.id
    ? seeds.find(s => s.couple_id === legacyMatch.couple_2.id) 
    : undefined
  
  // Transformar parejas (manejar casos null/undefined)
  const couple1Data = hasCouple1 
    ? transformLegacyCoupleToData(legacyMatch.couple_1, couple1Seed)
    : null
  const couple2Data = hasCouple2
    ? transformLegacyCoupleToData(legacyMatch.couple_2, couple2Seed)
    : null
  
  // Detectar si hay BYEs
  const isBYE1 = hasCouple1 ? detectBYE(legacyMatch.couple_1) : false
  const isBYE2 = hasCouple2 ? detectBYE(legacyMatch.couple_2) : false
  
  return {
    id: legacyMatch.id,
    round: transformRoundString(legacyMatch.round),
    order_in_round: extractOrderInRound(legacyMatch.id, legacyMatch.created_at),
    status: transformMatchStatus(legacyMatch.status),
    participants: {
      slot1: isBYE1 ? createBYESlot() : 
             couple1Data ? createParticipantSlot(couple1Data, couple1Seed) :
             createEmptySlot(),
      slot2: isBYE2 ? createBYESlot() : 
             couple2Data ? createParticipantSlot(couple2Data, couple2Seed) :
             createEmptySlot()
    },
    scheduling: {
      court: legacyMatch.court
    },
    metadata: {
      is_auto_generated: true,
      created_at: legacyMatch.created_at,
      algorithm_info: {
        algorithm: algorithm,
        seed_pair: couple1Seed && couple2Seed ? [couple1Seed.seed, couple2Seed.seed] : undefined
      }
    }
  }
}

/**
 * Detecta si una pareja es un BYE
 */
function detectBYE(couple: LegacyMatch['couple_1']): boolean {
  // Validaciones defensivas
  if (!couple || typeof couple !== 'object') {
    return false
  }
  
  const indicators = [
    couple.id === 'BYE_MARKER',
    couple.id && couple.id.toLowerCase().includes('bye'),
    couple.player_1 && couple.player_1.toLowerCase().includes('bye'),
    couple.player_2 && couple.player_2.toLowerCase().includes('bye'),
    couple.player_1 === 'BYE',
    couple.player_2 === 'BYE'
  ]
  
  return indicators.some(Boolean)
}

// ============================================================================
// TRANSFORMADORES DE COLECCIONES
// ============================================================================

/**
 * Transforma array de seeds legacy a SeedInfo[]
 */
export function transformLegacySeedsToSeedInfo(legacySeeds: LegacySeed[]): SeedInfo[] {
  return legacySeeds.map(transformLegacySeedToSeedInfo)
}

/**
 * Transforma array de matches legacy a BracketMatchV2[]
 */
/**
 * Función batch para convertir todos los matches de la API actual
 */
export function transformCurrentApiMatchesToBracketV2(
  currentMatches: CurrentApiMatch[],
  seeds: SeedInfo[],
  algorithm: BracketAlgorithm = 'serpentine'
): BracketMatchV2[] {
  // FILTRAR: Solo matches de bracket (eliminar matches de ZONA)
  const BRACKET_ROUNDS = ['8VOS', '16VOS', '32VOS', '4TOS', 'SEMIFINAL', 'FINAL']
  const bracketMatches = currentMatches.filter(match => 
    BRACKET_ROUNDS.includes(match.round)
  )
  
  console.log(`🔍 [transformCurrentApiMatchesToBracketV2] Filtrado:`, {
    totalMatches: currentMatches.length,
    bracketMatches: bracketMatches.length,
    roundCounts: currentMatches.reduce((acc, match) => {
      acc[match.round] = (acc[match.round] || 0) + 1
      return acc
    }, {} as Record<string, number>),
    filteredRounds: bracketMatches.reduce((acc, match) => {
      acc[match.round] = (acc[match.round] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  })
  
  return bracketMatches.map(match => 
    transformCurrentApiMatchToBracketV2(match, seeds, algorithm)
  )
}

export function transformLegacyMatchesToBracketV2(
  legacyMatches: LegacyMatch[],
  seeds: SeedInfo[],
  algorithm: BracketAlgorithm = 'serpentine'
): BracketMatchV2[] {
  return legacyMatches.map(match => 
    transformLegacyMatchToBracketV2(match, seeds, algorithm)
  )
}

/**
 * Crea ZoneData mock desde seeds
 */
export function createZoneDataFromSeeds(seeds: SeedInfo[]): ZoneData[] {
  const zoneMap = new Map<string, ZoneData>()
  
  seeds.forEach(seed => {
    if (!seed.zone_id) return

    if (!zoneMap.has(seed.zone_id)) {
      zoneMap.set(seed.zone_id, {
        id: seed.zone_id,
        name: seed.zone_name || `Zona ${seed.zone_id}`,
        couples: [],
        is_completed: true // Asumir completas si tienen seeds
      })
    }
  })
  
  return Array.from(zoneMap.values())
}

// ============================================================================
// DETERMINADORES DE ESTADO
// ============================================================================

/**
 * Determina BracketState basado en datos
 */
export function determineBracketState(
  matches: BracketMatchV2[],
  zonesReady: boolean = true
): BracketState {
  if (matches.length === 0) {
    return BracketState.NOT_GENERATED
  }
  
  // Verificar si hay placeholders
  const hasPlaceholders = matches.some(match => 
    match.participants.slot1.type === 'placeholder' ||
    match.participants.slot2.type === 'placeholder'
  )
  
  if (hasPlaceholders) {
    return BracketState.GENERATED_WITH_PLACEHOLDERS
  }
  
  // Contar matches terminados
  const finishedMatches = matches.filter(match => match.status === 'FINISHED')
  const totalMatches = matches.length
  
  if (finishedMatches.length === 0) {
    return BracketState.FULLY_RESOLVED
  } else if (finishedMatches.length === totalMatches) {
    return BracketState.COMPLETED
  } else {
    return BracketState.PARTIALLY_RESOLVED
  }
}

// ============================================================================
// VALIDADORES
// ============================================================================

/**
 * Valida que un match tenga datos mínimos
 */
export function validateBracketMatch(match: BracketMatchV2): boolean {
  return !!(
    match.id &&
    match.round &&
    match.participants.slot1 &&
    match.participants.slot2 &&
    typeof match.order_in_round === 'number' &&
    match.order_in_round > 0
  )
}

/**
 * Valida array de matches
 */
export function validateBracketMatches(matches: BracketMatchV2[]): {
  valid: boolean
  errors: string[]
  validMatches: BracketMatchV2[]
} {
  const errors: string[] = []
  const validMatches: BracketMatchV2[] = []
  
  matches.forEach((match, index) => {
    if (validateBracketMatch(match)) {
      validMatches.push(match)
    } else {
      errors.push(`Match ${index} (${match.id}) has invalid data`)
    }
  })
  
  return {
    valid: errors.length === 0,
    errors,
    validMatches
  }
}

// ============================================================================
// UTILIDADES DE DEBUG
// ============================================================================

/**
 * Crea información de debug para transformación
 */
export function createTransformationDebugInfo(
  originalMatches: LegacyMatch[],
  transformedMatches: BracketMatchV2[],
  seeds: SeedInfo[]
) {
  return {
    input: {
      matchesCount: originalMatches.length,
      seedsCount: seeds.length,
      rounds: Array.from(new Set(originalMatches.map(m => m.round)))
    },
    output: {
      matchesCount: transformedMatches.length,
      validMatches: transformedMatches.filter(validateBracketMatch).length,
      rounds: Array.from(new Set(transformedMatches.map(m => m.round)))
    },
    transformation: {
      timestamp: new Date().toISOString(),
      seedsApplied: transformedMatches.filter(m => 
        m.participants.slot1.seed || m.participants.slot2.seed
      ).length,
      byeMatches: transformedMatches.filter(m =>
        m.participants.slot1.type === 'bye' || m.participants.slot2.type === 'bye'
      ).length
    }
  }
}
