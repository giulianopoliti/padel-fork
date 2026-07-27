import { createClientServiceRole } from '@/utils/supabase/server'
import { TournamentConfigService } from '@/lib/services/tournament-config.service'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import { getZoneStageAndMatchesPerCouple } from '@/lib/services/zone-fixture-planner.service'
import { getZonesFormatIdFromTournament } from '@/lib/services/zones-format-utils'
import { ZoneRulesSyncService } from '@/lib/services/zone-rules-sync.service'
import type { BracketKey } from '@/types/tournament-format-v2'
import {
  filterOutDisqualifiedCouples,
  getActiveDisqualifiedCoupleIds,
  matchInvolvesDisqualifiedCouple,
} from '@/lib/services/tournament-disqualifications'
import { shouldEnforceLongBracketMatchRequirement } from '@/lib/services/tournament-operational-settings'

export interface BracketArtifactState {
  seedCount: number
  eliminationMatchCount: number
  hierarchyCount: number
  resolutionCount: number
  exists: boolean
}

export interface PlaceholderBracketValidationSuccess {
  success: true
  message: string
  code: 'READY'
  tournament: {
    id: string
    status: string
    bracket_status: string | null
    bracket_generated_at: string | null
    type?: string | null
    format_type?: string | null
    format_config?: unknown
    enable_draft_matches?: boolean | null
  }
  totalCouples: number
  totalZones: number
  artifacts: BracketArtifactState
  requiredMatchesPerCoupleValues?: number[]
  longBracketMatchRequirementEnabled?: boolean
}

export interface PlaceholderBracketValidationFailure {
  success: false
  message: string
  code:
    | 'TOURNAMENT_NOT_FOUND'
    | 'INVALID_TOURNAMENT_STATE'
    | 'BRACKET_ALREADY_EXISTS'
    | 'ZONE_MATCHES_INCOMPLETE'
    | 'ZONE_VALIDATION_ERROR'
  totalCouples: number
  totalZones: number
  artifacts: BracketArtifactState
  requiredMatchesPerCoupleValues?: number[]
  longBracketMatchRequirementEnabled?: boolean
  tournament?: {
    id: string
    status: string
    bracket_status: string | null
    bracket_generated_at: string | null
    type?: string | null
    format_type?: string | null
    format_config?: unknown
    enable_draft_matches?: boolean | null
  }
  incompleteZones?: Array<{
    zoneId: string
    zoneName: string
    coupleCount: number
    roundsPerCouple: number
    matchCount: number
    expectedMatches: number
    missingMatches: number
    incompleteCouples?: Array<{
      coupleId: string
      matchCount: number
      missingMatches: number
    }>
  }>
}

export type PlaceholderBracketValidationResult =
  | PlaceholderBracketValidationSuccess
  | PlaceholderBracketValidationFailure

const EMPTY_ARTIFACT_STATE: BracketArtifactState = {
  seedCount: 0,
  eliminationMatchCount: 0,
  hierarchyCount: 0,
  resolutionCount: 0,
  exists: false
}

export function calculateExpectedZoneMatches(
  coupleCount: number,
  roundsPerCouple: number
): number {
  if (coupleCount <= 0 || roundsPerCouple <= 0) {
    return 0
  }

  return Math.ceil((coupleCount * roundsPerCouple) / 2)
}

export function calculateCoupleMatchCounts(
  coupleIds: string[],
  matches: Array<{ couple1_id?: string | null; couple2_id?: string | null }>
): Record<string, number> {
  const counts = Object.fromEntries(coupleIds.map((coupleId) => [coupleId, 0]))

  matches.forEach((match) => {
    if (match.couple1_id && match.couple1_id in counts) {
      counts[match.couple1_id] += 1
    }

    if (match.couple2_id && match.couple2_id in counts) {
      counts[match.couple2_id] += 1
    }
  })

  return counts
}

export function findCouplesBelowRequiredMatches(
  coupleMatchCounts: Record<string, number>,
  requiredMatchesPerCouple: number
): Array<{ coupleId: string; matchCount: number; missingMatches: number }> {
  if (requiredMatchesPerCouple <= 0) {
    return []
  }

  return Object.entries(coupleMatchCounts)
    .filter(([, matchCount]) => matchCount < requiredMatchesPerCouple)
    .map(([coupleId, matchCount]) => ({
      coupleId,
      matchCount,
      missingMatches: requiredMatchesPerCouple - matchCount
    }))
}

export function findBlockingIncompleteCouplesWithActiveOpponentCapacity(
  coupleIds: string[],
  coupleMatchCounts: Record<string, number>,
  matches: Array<{ couple1_id?: string | null; couple2_id?: string | null }>,
  requiredMatchesPerCouple: number
): Array<{ coupleId: string; matchCount: number; missingMatches: number }> {
  const incompleteCouples = findCouplesBelowRequiredMatches(coupleMatchCounts, requiredMatchesPerCouple)
  if (incompleteCouples.length === 0) {
    return []
  }

  const activeCoupleIds = new Set(coupleIds)
  const existingMatchKeys = new Set(
    matches
      .filter((match) => (
        match.couple1_id &&
        match.couple2_id &&
        activeCoupleIds.has(match.couple1_id) &&
        activeCoupleIds.has(match.couple2_id)
      ))
      .map((match) => [match.couple1_id, match.couple2_id].sort().join(':'))
  )

  return incompleteCouples.filter((couple) => (
    coupleIds.some((opponentId) => {
      if (opponentId === couple.coupleId) return false
      if ((coupleMatchCounts[opponentId] || 0) >= requiredMatchesPerCouple) return false

      const matchKey = [couple.coupleId, opponentId].sort().join(':')
      return !existingMatchKeys.has(matchKey)
    })
  ))
}

export function resolveEffectiveRoundsPerCoupleForValidation(
  tournament: {
    type?: string | null
    format_type?: string | null
    format_config?: unknown
  },
  zone: {
    rounds_per_couple?: number | null
  },
  couplesInZone: number
): number {
  const formatConfig = (tournament as any)?.format_config
  if (
    tournament.type === 'LONG' &&
    formatConfig?.version === 2 &&
    (formatConfig?.presetId === 'LONG_SINGLE_ZONE_BRACKET' || formatConfig?.presetId === 'LONG_SINGLE_ZONE_GOLD_SILVER') &&
    typeof formatConfig?.targetMatchesPerCouple === 'number' &&
    Number.isFinite(formatConfig.targetMatchesPerCouple) &&
    formatConfig.targetMatchesPerCouple > 0
  ) {
    return formatConfig.targetMatchesPerCouple
  }

  if ((tournament as any)?.format_config?.version === 2) {
    const resolved = TournamentFormatResolver.getResolvedFormat(tournament, { totalCouples: couplesInZone })
    return getZoneStageAndMatchesPerCouple(couplesInZone, resolved).matchesPerCouple
  }

  const formatId = getZonesFormatIdFromTournament(tournament, { totalCouples: couplesInZone })
  const canonicalRoundsPerCouple = TournamentConfigService.getMatchesPerCouple(formatId, couplesInZone)
  const persistedRoundsPerCouple = zone.rounds_per_couple

  // Guardrail: en caso de desalineación legacy/stale, priorizar la regla canónica
  // para no bloquear la generación de llave con requisitos inválidos.
  if (
    typeof persistedRoundsPerCouple !== 'number' ||
    persistedRoundsPerCouple <= 0 ||
    persistedRoundsPerCouple !== canonicalRoundsPerCouple
  ) {
    return canonicalRoundsPerCouple
  }

  return persistedRoundsPerCouple
}

export async function getPersistedBracketArtifacts(
  tournamentId: string,
  options: { bracketKeys?: BracketKey[] } = {}
): Promise<BracketArtifactState> {
  const supabase = await createClientServiceRole()
  const bracketKeys = options.bracketKeys

  let seedsQuery = supabase
    .from('tournament_couple_seeds')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)

  let matchesQuery = supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('type', 'ELIMINATION')

  let hierarchyQuery = supabase
    .from('match_hierarchy')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)

  let resolutionsQuery = supabase
    .from('placeholder_resolutions')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)

  if (bracketKeys && bracketKeys.length > 0) {
    seedsQuery = seedsQuery.in('bracket_key', bracketKeys)
    matchesQuery = matchesQuery.in('bracket_key', bracketKeys)
    hierarchyQuery = hierarchyQuery.in('bracket_key', bracketKeys)
    resolutionsQuery = resolutionsQuery.in('bracket_key', bracketKeys)
  }

  const [
    { count: seedCount, error: seedsError },
    { count: eliminationMatchCount, error: matchesError },
    { count: hierarchyCount, error: hierarchyError },
    { count: resolutionCount, error: resolutionsError }
  ] = await Promise.all([
    seedsQuery,
    matchesQuery,
    hierarchyQuery,
    resolutionsQuery,
  ])

  if (seedsError) {
    throw new Error(`Error checking bracket seeds: ${seedsError.message}`)
  }

  if (matchesError) {
    throw new Error(`Error checking bracket matches: ${matchesError.message}`)
  }

  if (hierarchyError) {
    throw new Error(`Error checking match hierarchy: ${hierarchyError.message}`)
  }

  if (resolutionsError) {
    throw new Error(`Error checking placeholder resolutions: ${resolutionsError.message}`)
  }

  return {
    seedCount: seedCount || 0,
    eliminationMatchCount: eliminationMatchCount || 0,
    hierarchyCount: hierarchyCount || 0,
    resolutionCount: resolutionCount || 0,
    exists:
      (seedCount || 0) > 0 ||
      (eliminationMatchCount || 0) > 0 ||
      (hierarchyCount || 0) > 0 ||
      (resolutionCount || 0) > 0
  }
}

export async function validatePlaceholderBracketGeneration(
  tournamentId: string
): Promise<PlaceholderBracketValidationResult> {
  const supabase = await createClientServiceRole()

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, status, bracket_status, bracket_generated_at, type, format_type, format_config, enable_draft_matches')
    .eq('id', tournamentId)
    .single()

  if (tournamentError || !tournament) {
    return {
      success: false,
      code: 'TOURNAMENT_NOT_FOUND',
      message: 'Torneo no encontrado',
      totalCouples: 0,
      totalZones: 0,
      artifacts: EMPTY_ARTIFACT_STATE
    }
  }

  const artifacts = await getPersistedBracketArtifacts(tournamentId)

  if (tournament.status !== 'ZONE_PHASE') {
    return {
      success: false,
      code: 'INVALID_TOURNAMENT_STATE',
      message: `El torneo debe estar en fase de zonas. Estado actual: ${tournament.status}`,
      totalCouples: 0,
      totalZones: 0,
      artifacts,
      tournament
    }
  }

  if (
    artifacts.exists ||
    tournament.bracket_status === 'BRACKET_GENERATED' ||
    tournament.bracket_status === 'BRACKET_ACTIVE'
  ) {
    return {
      success: false,
      code: 'BRACKET_ALREADY_EXISTS',
      message: 'Ya existe una llave persistida o un estado de bracket inconsistente para este torneo',
      totalCouples: 0,
      totalZones: 0,
      artifacts,
      tournament
    }
  }

  const { data: zones, error: zonesError } = await supabase
    .from('zones')
    .select('id, name, rounds_per_couple')
    .eq('tournament_id', tournamentId)

  if (zonesError) {
    return {
      success: false,
      code: 'ZONE_VALIDATION_ERROR',
      message: `Error al obtener zonas: ${zonesError.message}`,
      totalCouples: 0,
      totalZones: 0,
      artifacts,
      tournament
    }
  }

  const incompleteZones: PlaceholderBracketValidationFailure['incompleteZones'] = []
  let totalCouples = 0
  const requiredMatchesPerCoupleValues = new Set<number>()
  const disqualifiedCoupleIds = await getActiveDisqualifiedCoupleIds(tournamentId, supabase)
  const enforceLongBracketMatchRequirement = tournament.type === 'LONG'
    ? await shouldEnforceLongBracketMatchRequirement(supabase, tournamentId)
    : true

  for (const zone of zones || []) {
    const { data: zonePositions, error: coupleError } = await supabase
      .from('zone_positions')
      .select('couple_id')
      .eq('zone_id', zone.id)

    if (coupleError) {
      return {
        success: false,
        code: 'ZONE_VALIDATION_ERROR',
        message: `Error al contar parejas en zona ${zone.name}: ${coupleError.message}`,
        totalCouples,
        totalZones: zones?.length || 0,
        artifacts,
        tournament
      }
    }

    const { data: zoneMatches, error: matchError } = await supabase
      .from('matches')
      .select('id, couple1_id, couple2_id')
      .eq('zone_id', zone.id)

    if (matchError) {
      return {
        success: false,
        code: 'ZONE_VALIDATION_ERROR',
        message: `Error al contar partidos en zona ${zone.name}: ${matchError.message}`,
        totalCouples,
        totalZones: zones?.length || 0,
        artifacts,
        tournament
      }
    }

    const activeZonePositions = filterOutDisqualifiedCouples(zonePositions || [], disqualifiedCoupleIds)
    const coupleIds = activeZonePositions
      .map((position) => position.couple_id)
      .filter((coupleId): coupleId is string => Boolean(coupleId))
    const couplesInZone = coupleIds.length
    const syncResult = await ZoneRulesSyncService.syncZoneRulesForZone(supabase, zone.id)
    if (!syncResult.success) {
      return {
        success: false,
        code: 'ZONE_VALIDATION_ERROR',
        message: `Error al sincronizar reglas de zona ${zone.name}: ${syncResult.error || 'error desconocido'}`,
        totalCouples,
        totalZones: zones?.length || 0,
        artifacts,
        tournament
      }
    }
    const syncedZone = {
      ...zone,
      rounds_per_couple: syncResult.roundsPerCouple,
    }
    const matchesInZone = (zoneMatches || []).filter((match) => (
      !matchInvolvesDisqualifiedCouple(match, disqualifiedCoupleIds)
    )).length
    const roundsPerCouple = resolveEffectiveRoundsPerCoupleForValidation(
      tournament,
      syncedZone,
      couplesInZone
    )
    const expectedMatches = calculateExpectedZoneMatches(couplesInZone, roundsPerCouple)
    const coupleMatchCounts = calculateCoupleMatchCounts(coupleIds, zoneMatches || [])
    const hasActiveDisqualifications = disqualifiedCoupleIds.size > 0
    const incompleteCouples = enforceLongBracketMatchRequirement
      ? hasActiveDisqualifications
        ? findBlockingIncompleteCouplesWithActiveOpponentCapacity(
            coupleIds,
            coupleMatchCounts,
            zoneMatches || [],
            roundsPerCouple
          )
        : findCouplesBelowRequiredMatches(coupleMatchCounts, roundsPerCouple)
      : []
    if (enforceLongBracketMatchRequirement && roundsPerCouple > 0) {
      requiredMatchesPerCoupleValues.add(roundsPerCouple)
    }
    totalCouples += couplesInZone

    if (
      enforceLongBracketMatchRequirement &&
      ((!hasActiveDisqualifications && matchesInZone < expectedMatches) || incompleteCouples.length > 0)
    ) {
      incompleteZones.push({
        zoneId: zone.id,
        zoneName: zone.name,
        coupleCount: couplesInZone,
        roundsPerCouple,
        matchCount: matchesInZone,
        expectedMatches,
        missingMatches: Math.max(expectedMatches - matchesInZone, 0),
        incompleteCouples
      })
    }
  }

  if (incompleteZones.length > 0) {
    const firstIncompleteZone = incompleteZones[0]
    return {
      success: false,
      code: 'ZONE_MATCHES_INCOMPLETE',
      message: firstIncompleteZone.incompleteCouples?.length
        ? `Zona ${firstIncompleteZone.zoneName}: hay ${firstIncompleteZone.incompleteCouples.length} parejas con menos de ${firstIncompleteZone.roundsPerCouple} partidos creados.`
        : `Zona ${firstIncompleteZone.zoneName}: faltan ${firstIncompleteZone.missingMatches} partidos por crear. ` +
          `Creados: ${firstIncompleteZone.matchCount}, Esperados: ${firstIncompleteZone.expectedMatches} ` +
          `(partidos por pareja: ${firstIncompleteZone.roundsPerCouple})`,
      totalCouples,
      totalZones: zones?.length || 0,
      artifacts,
      tournament,
      requiredMatchesPerCoupleValues: Array.from(requiredMatchesPerCoupleValues).sort((a, b) => a - b),
      longBracketMatchRequirementEnabled: enforceLongBracketMatchRequirement,
      incompleteZones
    }
  }

  return {
    success: true,
    code: 'READY',
    message: 'Todas las validaciones previas para generar la llave pasaron correctamente',
    tournament,
    totalCouples,
    totalZones: zones?.length || 0,
    requiredMatchesPerCoupleValues: Array.from(requiredMatchesPerCoupleValues).sort((a, b) => a - b),
    longBracketMatchRequirementEnabled: enforceLongBracketMatchRequirement,
    artifacts
  }
}
