import { createHash } from 'crypto'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import { ZoneMatchRulesService } from '@/lib/services/zone-match-rules.service'
import {
  ACTIVE_DISQUALIFICATION_STATUS,
  getActiveDisqualifications,
} from '@/lib/services/tournament-disqualifications'
import { assessZoneMatchCandidate, recommendZoneMatches } from './engine'
import {
  ZoneMatchRecommendationInput,
  ZoneMatchRecommendationResult,
  ZoneRecommendationCandidateAssessment,
  ZoneRecommendationCommittedMatch,
  ZoneRecommendationPair,
} from './types'

/**
 * Adaptador entre Supabase/las reglas del torneo y el motor puro.
 *
 * Es la única capa que sabe qué significa AMERICAN + SINGLE_ZONE, cuáles
 * estados cuentan como comprometidos y cómo se obtiene el objetivo de partidos.
 */

type SupabaseClientLike = any

interface TournamentRow {
  id: string
  type: string | null
  format_type: string | null
  format_config: unknown
}

interface ZoneRow {
  id: string
  name: string | null
  rounds_per_couple: number | null
  created_at: string | null
}

interface MatchRow {
  id: string
  couple1_id: string | null
  couple2_id: string | null
  status: string | null
}

export interface AmericanSingleZoneRecommendationPayload extends ZoneMatchRecommendationResult {
  applicable: true
  tournamentId: string
  zoneId: string
  zoneName: string
  targetMatchesPerCouple: number
  coupleNames: Record<string, string>
  projectedReducedCoupleId: string | null
  revision: string
}

export interface AmericanSingleZoneCandidateAssessment {
  applicable: boolean
  safe: boolean
  reason:
    | ZoneRecommendationCandidateAssessment['reason']
    | 'NOT_AMERICAN_SINGLE_ZONE'
    | 'ZONE_MISMATCH'
  revision?: string
  result?: AmericanSingleZoneRecommendationPayload
}

interface RecommendationVariant {
  input: ZoneMatchRecommendationInput
  reducedCoupleId: string | null
}

interface RecommendationSnapshot {
  tournament: TournamentRow
  zone: ZoneRow
  targetMatchesPerCouple: number
  coupleNames: Record<string, string>
  variants: RecommendationVariant[]
  revision: string
}

const unwrap = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] || null) : (value || null)

const coupleDisplayName = (couple: any) => {
  const player1 = unwrap<any>(couple?.player1)
  const player2 = unwrap<any>(couple?.player2)
  const first = `${player1?.first_name || ''} ${player1?.last_name || ''}`.trim()
  const second = `${player2?.first_name || ''} ${player2?.last_name || ''}`.trim()
  return [first, second].filter(Boolean).join(' / ') || 'Pareja sin nombre'
}

const buildRequirementVariants = (
  coupleIds: string[],
  targetMatchesPerCouple: number,
  committedMatches: ZoneRecommendationCommittedMatch[],
  busyCoupleIds: string[],
): RecommendationVariant[] => {
  const activeCoupleIds = new Set(coupleIds)
  const committedCredits = committedMatches.reduce((total, match) =>
    total + Number(activeCoupleIds.has(match.couple1Id)) + Number(activeCoupleIds.has(match.couple2Id)),
  0)
  const createInput = (reducedCoupleId: string | null): ZoneMatchRecommendationInput => ({
    couples: coupleIds.map(id => ({
      id,
      requiredMatches: Math.max(0, targetMatchesPerCouple - (id === reducedCoupleId ? 1 : 0)),
    })),
    committedMatches,
    busyCoupleIds,
  })

  // Cada partido consume dos "créditos" (uno por pareja). Si el total restante
  // es impar —por ejemplo luego de una descalificación— alguien necesariamente
  // debe terminar con un partido menos. Probamos cada posible pareja reducida y
  // dejamos que el motor elija la variante que sí puede completarse.
  const remainingCreditsAtFullTarget = coupleIds.length * targetMatchesPerCouple - committedCredits
  if (remainingCreditsAtFullTarget % 2 === 0) {
    return [{ input: createInput(null), reducedCoupleId: null }]
  }

  return coupleIds.map(coupleId => ({
    input: createInput(coupleId),
    reducedCoupleId: coupleId,
  }))
}

const resultPriority: Record<ZoneMatchRecommendationResult['status'], number> = {
  COMPLETE: 0,
  READY: 1,
  WAITING_FOR_AVAILABLE_COUPLES: 2,
  SEARCH_LIMIT_REACHED: 3,
  IMPOSSIBLE: 4,
}

const selectBestVariant = (variants: RecommendationVariant[]) => variants
  .map(variant => ({ variant, result: recommendZoneMatches(variant.input) }))
  .sort((left, right) =>
    resultPriority[left.result.status] - resultPriority[right.result.status] ||
    right.result.recommendedBatch.length - left.result.recommendedBatch.length ||
    right.result.alternatives.length - left.result.alternatives.length ||
    (left.variant.reducedCoupleId || '').localeCompare(right.variant.reducedCoupleId || ''),
  )[0]

const loadSnapshot = async (
  supabase: SupabaseClientLike,
  tournamentId: string,
): Promise<RecommendationSnapshot> => {
  // Snapshot consistente a nivel lógico: traduce filas de DB a committed/busy,
  // calcula variantes y genera una revisión para detectar recomendaciones viejas.
  const { data: tournamentData, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, type, format_type, format_config')
    .eq('id', tournamentId)
    .single()

  if (tournamentError || !tournamentData) {
    throw new Error(tournamentError?.message || 'Torneo no encontrado')
  }

  const tournament = tournamentData as TournamentRow
  const resolvedFormat = TournamentFormatResolver.getResolvedFormat(tournament)
  if (resolvedFormat.baseType !== 'AMERICAN' || resolvedFormat.zoneMode !== 'SINGLE_ZONE') {
    throw new Error('MATCH_RECOMMENDATION_NOT_APPLICABLE')
  }

  const { data: zonesData, error: zonesError } = await supabase
    .from('zones')
    .select('id, name, rounds_per_couple, created_at')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true })

  if (zonesError) throw new Error(zonesError.message)
  if (!zonesData || zonesData.length !== 1) {
    throw new Error('El torneo single-zone debe tener exactamente una zona configurada')
  }

  const zone = zonesData[0] as ZoneRow
  const [positionsResult, matchesResult, disqualifications] = await Promise.all([
    supabase
      .from('zone_positions')
      .select(`
        couple_id,
        couple:couples!zone_positions_couple_id_fkey(
          id,
          player1:players!couples_player1_id_fkey(first_name, last_name),
          player2:players!couples_player2_id_fkey(first_name, last_name)
        )
      `)
      .eq('zone_id', zone.id),
    supabase
      .from('matches')
      .select('id, couple1_id, couple2_id, status')
      .eq('zone_id', zone.id)
      .eq('round', 'ZONE'),
    getActiveDisqualifications(tournamentId, supabase, 'ZONE_PHASE'),
  ])

  if (positionsResult.error) throw new Error(positionsResult.error.message)
  if (matchesResult.error) throw new Error(matchesResult.error.message)

  const disqualifiedCoupleIds = new Set(
    disqualifications
      .filter(item => item.status === ACTIVE_DISQUALIFICATION_STATUS)
      .map(item => item.couple_id),
  )
  const activePositions = (positionsResult.data || [])
    .filter((position: any) => position.couple_id && !disqualifiedCoupleIds.has(position.couple_id))
    .sort((left: any, right: any) => left.couple_id.localeCompare(right.couple_id))
  const coupleIds = activePositions.map((position: any) => position.couple_id as string)
  const activeCoupleIds = new Set(coupleIds)
  const coupleNames = Object.fromEntries(activePositions.map((position: any) => [
    position.couple_id,
    coupleDisplayName(unwrap(position.couple)),
  ]))

  const matches = (matchesResult.data || []) as MatchRow[]
  // Todo partido no cancelado entre parejas activas queda comprometido desde su
  // creación. Un partido terminado contra una pareja descalificada conserva el
  // crédito de la pareja que sigue activa.
  const committedRows = matches.filter(match => {
    if (!match.couple1_id || !match.couple2_id || match.status === 'CANCELED') return false
    const firstIsActive = activeCoupleIds.has(match.couple1_id)
    const secondIsActive = activeCoupleIds.has(match.couple2_id)
    if (firstIsActive && secondIsActive) return true

    const hasOneActiveCouple = firstIsActive !== secondIsActive
    return hasOneActiveCouple && (match.status === 'FINISHED' || match.status === 'COMPLETED')
  })
  const committedMatches = committedRows.map(match => ({
    couple1Id: match.couple1_id!,
    couple2Id: match.couple2_id!,
  }))
  // Sólo IN_PROGRESS impide recomendar a la pareja ahora. FINISHED/COMPLETED ya
  // consumen cupo, pero dejan a la pareja disponible para el próximo cruce.
  const busyCoupleIds = Array.from(new Set(matches
    .filter(match => match.status === 'IN_PROGRESS')
    .flatMap(match => [match.couple1_id, match.couple2_id])
    .filter((coupleId): coupleId is string => Boolean(coupleId && activeCoupleIds.has(coupleId))),
  ))

  const rules = ZoneMatchRulesService.resolveRules({
    tournament,
    zone,
    coupleCount: coupleIds.length,
  })
  if (rules.maxMatchesPerCouple <= 0) {
    throw new Error('La zona no tiene una cantidad válida de partidos por pareja')
  }

  const variants = buildRequirementVariants(
    coupleIds,
    rules.maxMatchesPerCouple,
    committedMatches,
    busyCoupleIds,
  )
  // El cliente devuelve esta revisión al crear el partido. Si el estado cambió
  // mientras tanto, la acción rechaza la recomendación obsoleta y obliga a leer otra.
  const revisionSource = {
    tournamentId,
    zoneId: zone.id,
    targetMatchesPerCouple: rules.maxMatchesPerCouple,
    coupleIds,
    disqualifiedCoupleIds: [...disqualifiedCoupleIds].sort(),
    matches: matches
      .map(match => ({
        id: match.id,
        couple1Id: match.couple1_id,
        couple2Id: match.couple2_id,
        status: match.status,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  }

  return {
    tournament,
    zone,
    targetMatchesPerCouple: rules.maxMatchesPerCouple,
    coupleNames,
    variants,
    revision: createHash('sha256').update(JSON.stringify(revisionSource)).digest('hex'),
  }
}

const toPayload = (
  tournamentId: string,
  snapshot: RecommendationSnapshot,
  selected: ReturnType<typeof selectBestVariant>,
): AmericanSingleZoneRecommendationPayload => ({
  applicable: true,
  tournamentId,
  zoneId: snapshot.zone.id,
  zoneName: snapshot.zone.name || 'Zona General',
  targetMatchesPerCouple: snapshot.targetMatchesPerCouple,
  coupleNames: snapshot.coupleNames,
  projectedReducedCoupleId: selected.variant.reducedCoupleId,
  revision: snapshot.revision,
  ...selected.result,
})

export const getAmericanSingleZoneRecommendation = async (
  supabase: SupabaseClientLike,
  tournamentId: string,
): Promise<AmericanSingleZoneRecommendationPayload> => {
  // Camino de lectura usado por GET /zone-match-recommendation.
  const snapshot = await loadSnapshot(supabase, tournamentId)
  return toPayload(tournamentId, snapshot, selectBestVariant(snapshot.variants))
}

export const assessAmericanSingleZoneCandidate = async (
  supabase: SupabaseClientLike,
  tournamentId: string,
  zoneId: string,
  candidate: ZoneRecommendationPair,
): Promise<AmericanSingleZoneCandidateAssessment> => {
  // Camino de escritura: antes del INSERT valida el cruce contra un snapshot
  // recién leído. En otros formatos retorna applicable=false y no interviene.
  let snapshot: RecommendationSnapshot
  try {
    snapshot = await loadSnapshot(supabase, tournamentId)
  } catch (error) {
    if (error instanceof Error && error.message === 'MATCH_RECOMMENDATION_NOT_APPLICABLE') {
      return { applicable: false, safe: true, reason: 'NOT_AMERICAN_SINGLE_ZONE' }
    }
    throw error
  }

  if (snapshot.zone.id !== zoneId) {
    return { applicable: true, safe: false, reason: 'ZONE_MISMATCH', revision: snapshot.revision }
  }

  const assessments = snapshot.variants.map(variant => ({
    variant,
    assessment: assessZoneMatchCandidate(variant.input, candidate),
  }))
  const safeAssessment = assessments.find(item => item.assessment.safe)
  const selectedAssessment = safeAssessment || assessments.sort((left, right) =>
    resultPriority[left.assessment.result.status] - resultPriority[right.assessment.result.status],
  )[0]
  const result = toPayload(tournamentId, snapshot, {
    variant: selectedAssessment.variant,
    result: selectedAssessment.assessment.result,
  })

  return {
    applicable: true,
    safe: selectedAssessment.assessment.safe,
    reason: selectedAssessment.assessment.reason,
    revision: snapshot.revision,
    result,
  }
}
