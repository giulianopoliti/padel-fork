import type { AvailabilityItem, CoupleWithData, TimeSlot } from '../actions'
import { timeToMinutes } from '@/lib/services/match-recommendation/time'

export interface ZoneMatchSummary {
  id: string
  couple1_id: string | null
  couple2_id: string | null
  status: string | null
  round: string | null
  bracket_is_active?: boolean
}

export interface MatchCounts {
  played: number
  draft: number
  pending: number
}

export type OpponentStatus = 'played' | 'draft' | 'pending'
export interface CoupleMatchSummary {
  counts: MatchCounts
  opponents: Record<string, OpponentStatus>
}

export const isSchedulingMatch = (match: ZoneMatchSummary): boolean =>
  match.round === 'ZONE' && match.bracket_is_active !== false &&
  ['FINISHED', 'COMPLETED', 'DRAFT', 'PENDING', 'IN_PROGRESS'].includes(match.status || '')

export const summarizeZoneMatches = (matches: ZoneMatchSummary[]): Map<string, CoupleMatchSummary> => {
  const result = new Map<string, CoupleMatchSummary>()
  const seen = new Set<string>()
  for (const match of matches) {
    if (!isSchedulingMatch(match) || seen.has(match.id)) continue
    seen.add(match.id)
    const state = match.status === 'DRAFT' ? 'draft' : ['PENDING', 'IN_PROGRESS'].includes(match.status || '') ? 'pending' : 'played'
    for (const [coupleId, opponentId] of [[match.couple1_id, match.couple2_id], [match.couple2_id, match.couple1_id]]) {
      if (!coupleId) continue
      const summary: CoupleMatchSummary = result.get(coupleId) || { counts: { played: 0, draft: 0, pending: 0 }, opponents: {} }
      summary.counts[state] += 1
      if (opponentId && summary.opponents[opponentId] !== 'played') {
        // A published or ongoing match takes precedence over a draft of the same pairing.
        if (state !== 'draft' || summary.opponents[opponentId] !== 'pending') {
          summary.opponents[opponentId] = state
        }
      }
      result.set(coupleId, summary)
    }
  }
  return result
}

export interface RivalInsight {
  tone: 'green' | 'red' | 'amber' | 'blue' | 'neutral'
  reason: string
  commonSlotIds: string[]
}

export const getRivalInsight = (
  selected: CoupleWithData,
  candidate: CoupleWithData,
  timeSlots: TimeSlot[],
  availabilityByCell: Map<string, AvailabilityItem>,
  durationMinutes: number,
): RivalInsight => {
  const warning = (reason: string): RivalInsight => ({ tone: 'neutral', reason, commonSlotIds: [] })
  // Missing history must never be presented as a confirmed new opponent.
  if (!selected.opponent_statuses || !candidate.opponent_statuses) return warning('Historial no disponible')
  const opponentStatus = selected.opponent_statuses[candidate.id]
  if (opponentStatus === 'played') return { tone: 'red', reason: 'Ya se enfrentaron en este torneo', commonSlotIds: [] }
  if (opponentStatus === 'draft') return { tone: 'amber', reason: 'Cruce ya creado en borrador', commonSlotIds: [] }
  if (opponentStatus === 'pending') return { tone: 'blue', reason: 'Cruce ya creado y todavía sin finalizar', commonSlotIds: [] }
  if (candidate.match_status === 'DRAFT') return { tone: 'amber', reason: 'Esta pareja tiene un partido en borrador en esta fecha', commonSlotIds: [] }
  if (candidate.match_status === 'PENDING') return { tone: 'blue', reason: 'Esta pareja tiene un partido creado sin finalizar en esta fecha', commonSlotIds: [] }
  if (candidate.has_played_in_this_date) return warning('Esta pareja ya tiene un partido en esta fecha')
  if (selected.has_played_in_this_date) {
    return warning('La pareja seleccionada ya tiene un partido en esta fecha')
  }
  if (selected.free_date_blocked || candidate.free_date_blocked) return warning('Una de las parejas pidió fecha libre')
  if (timeSlots.length === 0) return { tone: 'green', reason: 'Rival habilitado · horario a coordinar', commonSlotIds: [] }

  const commonSlotIds: string[] = []
  let selectedHasAvailability = false
  let candidateHasAvailability = false
  let hasUnconfirmedNotes = false
  for (const slot of timeSlots) {
    const first = availabilityByCell.get(`${selected.id}:${slot.id}`)
    const second = availabilityByCell.get(`${candidate.id}:${slot.id}`)
    selectedHasAvailability ||= Boolean(first?.is_available)
    candidateHasAvailability ||= Boolean(second?.is_available)
    if (!first?.is_available || !second?.is_available) continue
    if ([first, second].some(item => ['PENDING_REVIEW', 'FAILED'].includes(item.note_interpretation_status || ''))) {
      hasUnconfirmedNotes = true
      continue
    }
    const start = Math.max(timeToMinutes(slot.start_time), timeToMinutes(first.preferred_start_time || slot.start_time), timeToMinutes(second.preferred_start_time || slot.start_time))
    const end = Math.min(timeToMinutes(slot.end_time), timeToMinutes(first.preferred_end_time || slot.end_time), timeToMinutes(second.preferred_end_time || slot.end_time))
    if (end - start >= durationMinutes) commonSlotIds.push(slot.id)
  }
  if (commonSlotIds.length > 0) return { tone: 'green', reason: 'Rival compatible · tienen horario en común', commonSlotIds }
  if (!selectedHasAvailability || !candidateHasAvailability) return warning('Faltan horarios por cargar o confirmar')
  if (hasUnconfirmedNotes) return warning('Hay notas de horarios pendientes de revisión')
  return warning('Sin horario común suficiente para el partido')
}
