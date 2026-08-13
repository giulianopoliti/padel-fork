'use server'

import { createHash } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { recommendMatches } from '@/lib/services/match-recommendation/engine'
import {
  MatchDurationMinutes,
  MatchRecommendationInput,
  MatchRecommendationResult,
  RecommendedMatch,
  pairKey,
} from '@/lib/services/match-recommendation/types'
import { timeToMinutes } from '@/lib/services/match-recommendation/time'

export interface RecommendationPreview extends MatchRecommendationResult {
  fingerprint: string
  expectedDraftIds: string[]
  durationMinutes: MatchDurationMinutes
  coupleNames: Record<string, string>
}

export interface PendingNoteInterpretation {
  id: string
  coupleId: string
  coupleName: string
  timeSlotId: string
  slotLabel: string
  note: string
  proposedStartTime: string | null
  proposedEndTime: string | null
  summary: string | null
  confidence: number | null
  source: string | null
}

interface ActionResult<T> {
  success: boolean
  data?: T
  error?: string
}

const unwrap = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] || null) : (value || null)

const requirePermission = async (tournamentId: string) => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Usuario no autenticado')
  const permission = await checkTournamentPermissions(user.id, tournamentId)
  if (!permission.hasPermission) throw new Error(permission.reason || 'Sin permisos para administrar este torneo')
  return { supabase, user }
}

const loadRecommendation = async (
  tournamentId: string,
  fechaId: string,
): Promise<RecommendationPreview> => {
  const { supabase } = await requirePermission(tournamentId)
  const [fechaResult, tournamentResult, couplesResult, slotsResult, availabilityResult, matchesResult, fechaMatchesResult] = await Promise.all([
    supabase.from('tournament_fechas')
      .select('id, tournament_id, round_type, estimated_match_duration_minutes')
      .eq('id', fechaId).eq('tournament_id', tournamentId).single(),
    supabase.from('tournaments')
      .select('id, type, enable_draft_matches')
      .eq('id', tournamentId).single(),
    supabase.from('couples').select(`
      id,
      player1:players!couples_player1_id_fkey(first_name, last_name),
      player2:players!couples_player2_id_fkey(first_name, last_name),
      inscriptions!inner(tournament_id)
    `).eq('inscriptions.tournament_id', tournamentId),
    supabase.from('tournament_time_slots')
      .select('id, date, start_time, end_time, court_name, max_matches, slot_type')
      .eq('fecha_id', fechaId).eq('is_available', true),
    supabase.from('couple_time_availability').select(`
      couple_id, time_slot_id, is_available, preferred_start_time, preferred_end_time,
      note_interpretation_status,
      tournament_time_slots!inner(fecha_id, slot_type)
    `).eq('tournament_time_slots.fecha_id', fechaId),
    supabase.from('matches')
      .select('id, couple1_id, couple2_id, status, round')
      .eq('tournament_id', tournamentId).eq('round', 'ZONE'),
    supabase.from('fecha_matches').select(`
      match_id, scheduled_date, scheduled_start_time, scheduled_end_time, court_assignment,
      matches!inner(id, couple1_id, couple2_id, status, round)
    `).eq('fecha_id', fechaId).eq('matches.round', 'ZONE'),
  ])

  const firstError = [fechaResult, tournamentResult, couplesResult, slotsResult, availabilityResult, matchesResult, fechaMatchesResult]
    .find(result => result.error)?.error
  if (firstError) throw firstError
  if (!fechaResult.data || fechaResult.data.round_type !== 'ZONE') throw new Error('El recomendador solo funciona en fechas de zona')
  if (!tournamentResult.data || tournamentResult.data.type !== 'LONG') throw new Error('El recomendador requiere un torneo largo')
  if (!tournamentResult.data.enable_draft_matches) throw new Error('Activa el modo borrador antes de usar el recomendador')

  const allAvailability = availabilityResult.data || []
  const freeDateCouples = new Set(
    allAvailability.filter((item: any) =>
      item.is_available && unwrap<any>(item.tournament_time_slots)?.slot_type === 'FREE_DATE',
    ).map((item: any) => item.couple_id),
  )
  const fechaRows = fechaMatchesResult.data || []
  const draftIds = fechaRows
    .filter((row: any) => unwrap<any>(row.matches)?.status === 'DRAFT')
    .map((row: any) => row.match_id)
    .sort()
  const draftIdSet = new Set(draftIds)
  const completedCounts = new Map<string, number>()

  for (const match of matchesResult.data || []) {
    if (!['FINISHED', 'COMPLETED'].includes(match.status || '')) continue
    for (const coupleId of [match.couple1_id, match.couple2_id]) {
      if (coupleId) completedCounts.set(coupleId, (completedCounts.get(coupleId) || 0) + 1)
    }
  }

  const coupleNames: Record<string, string> = {}
  const couples = (couplesResult.data || []).map((couple: any) => {
    const player1 = unwrap<any>(couple.player1)
    const player2 = unwrap<any>(couple.player2)
    const name = `${player1?.first_name || ''} ${player1?.last_name || ''} / ${player2?.first_name || ''} ${player2?.last_name || ''}`.trim()
    coupleNames[couple.id] = name
    return {
      id: couple.id,
      name,
      completedZoneMatches: completedCounts.get(couple.id) || 0,
      blockedForFecha: freeDateCouples.has(couple.id),
    }
  })

  const timeSlots = (slotsResult.data || [])
    .filter((slot: any) => slot.slot_type === 'TIME_RANGE')
    .map((slot: any) => ({
      id: slot.id,
      date: slot.date,
      startTime: slot.start_time,
      endTime: slot.end_time,
      courtName: slot.court_name,
      maxConcurrentMatches: slot.max_matches || 1,
    }))

  const input: MatchRecommendationInput = {
    couples,
    timeSlots,
    availability: allAvailability
      .filter((item: any) => unwrap<any>(item.tournament_time_slots)?.slot_type === 'TIME_RANGE')
      .map((item: any) => ({
        coupleId: item.couple_id,
        timeSlotId: item.time_slot_id,
        isAvailable: item.is_available,
        effectiveStartTime: item.preferred_start_time,
        effectiveEndTime: item.preferred_end_time,
        interpretationStatus: item.note_interpretation_status || 'NONE',
      })),
    fixedMatches: fechaRows.flatMap((row: any) => {
      const match = unwrap<any>(row.matches)
      if (!match || match.status === 'DRAFT' || match.status === 'CANCELED') return []
      if (!row.scheduled_date || !row.scheduled_start_time || !row.scheduled_end_time) return []
      return [{
        id: match.id,
        couple1Id: match.couple1_id,
        couple2Id: match.couple2_id,
        date: row.scheduled_date,
        startTime: row.scheduled_start_time,
        endTime: row.scheduled_end_time,
        courtName: row.court_assignment,
      }]
    }),
    forbiddenPairKeys: (matchesResult.data || [])
      .filter(match => match.status !== 'CANCELED' && !draftIdSet.has(match.id))
      .filter(match => match.couple1_id && match.couple2_id)
      .map(match => pairKey(match.couple1_id!, match.couple2_id!)),
    durationMinutes: (fechaResult.data.estimated_match_duration_minutes || 90) as MatchDurationMinutes,
  }

  const result = recommendMatches(input)
  const fingerprintSource = {
    input,
    result,
    draftIds,
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(fingerprintSource)).digest('hex')

  return {
    ...result,
    fingerprint,
    expectedDraftIds: draftIds,
    durationMinutes: input.durationMinutes,
    coupleNames,
  }
}

export const getMatchRecommendationPreview = async (
  tournamentId: string,
  fechaId: string,
): Promise<ActionResult<RecommendationPreview>> => {
  try {
    return { success: true, data: await loadRecommendation(tournamentId, fechaId) }
  } catch (error) {
    console.error('Recommendation preview failed:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export const applyMatchRecommendation = async (
  tournamentId: string,
  fechaId: string,
  expectedFingerprint: string,
): Promise<ActionResult<{ createdMatchIds: string[] }>> => {
  try {
    const preview = await loadRecommendation(tournamentId, fechaId)
    if (preview.fingerprint !== expectedFingerprint) {
      return { success: false, error: 'Los datos cambiaron. Regenera la previsualizacion antes de guardar.' }
    }
    const { supabase } = await requirePermission(tournamentId)
    const { data, error } = await supabase.rpc('apply_zone_match_recommendation', {
      p_tournament_id: tournamentId,
      p_fecha_id: fechaId,
      p_expected_draft_ids: preview.expectedDraftIds,
      p_matches: preview.matches,
    })
    if (error) throw error
    revalidatePath(`/tournaments/${tournamentId}/match-scheduling`)
    return {
      success: true,
      data: { createdMatchIds: (data || []).map((row: any) => row.created_match_id) },
    }
  } catch (error) {
    console.error('Applying recommendation failed:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export const getPendingNoteInterpretations = async (
  tournamentId: string,
  fechaId: string,
): Promise<ActionResult<PendingNoteInterpretation[]>> => {
  try {
    const { supabase } = await requirePermission(tournamentId)
    const { data, error } = await supabase.from('couple_time_availability').select(`
      id, couple_id, time_slot_id, notes, proposed_start_time, proposed_end_time,
      interpretation_summary, interpretation_confidence, note_interpretation_source,
      tournament_time_slots!inner(fecha_id, date, start_time, end_time, court_name),
      couples!inner(
        player1:players!couples_player1_id_fkey(first_name, last_name),
        player2:players!couples_player2_id_fkey(first_name, last_name)
      )
    `).eq('tournament_time_slots.fecha_id', fechaId)
      .eq('note_interpretation_status', 'PENDING_REVIEW')
      .order('updated_at', { ascending: true })
    if (error) throw error

    return {
      success: true,
      data: (data || []).map((item: any) => {
        const slot = unwrap<any>(item.tournament_time_slots)
        const couple = unwrap<any>(item.couples)
        const player1 = unwrap<any>(couple?.player1)
        const player2 = unwrap<any>(couple?.player2)
        return {
          id: item.id,
          coupleId: item.couple_id,
          coupleName: `${player1?.first_name || ''} ${player1?.last_name || ''} / ${player2?.first_name || ''} ${player2?.last_name || ''}`.trim(),
          timeSlotId: item.time_slot_id,
          slotLabel: `${slot?.date || ''} ${slot?.start_time || ''}-${slot?.end_time || ''}${slot?.court_name ? ` · ${slot.court_name}` : ''}`,
          note: item.notes || '',
          proposedStartTime: item.proposed_start_time,
          proposedEndTime: item.proposed_end_time,
          summary: item.interpretation_summary,
          confidence: item.interpretation_confidence === null ? null : Number(item.interpretation_confidence),
          source: item.note_interpretation_source,
        }
      }),
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export const reviewNoteInterpretation = async (input: {
  tournamentId: string
  fechaId: string
  availabilityId: string
  decision: 'APPROVE' | 'IGNORE'
  earliestStartTime?: string | null
  latestEndTime?: string | null
}): Promise<ActionResult<null>> => {
  try {
    const { supabase, user } = await requirePermission(input.tournamentId)
    const { data: availability, error: loadError } = await supabase.from('couple_time_availability').select(`
      id, note_interpretation_status,
      tournament_time_slots!inner(fecha_id, start_time, end_time, tournament_fechas!inner(tournament_id))
    `).eq('id', input.availabilityId).single()
    if (loadError || !availability) throw loadError || new Error('Disponibilidad no encontrada')
    const slot = unwrap<any>(availability.tournament_time_slots)
    if (slot?.fecha_id !== input.fechaId || unwrap<any>(slot?.tournament_fechas)?.tournament_id !== input.tournamentId) {
      throw new Error('La nota no pertenece a esta fecha')
    }
    if (availability.note_interpretation_status !== 'PENDING_REVIEW') {
      throw new Error('La nota ya fue revisada')
    }

    const start = input.decision === 'APPROVE' ? input.earliestStartTime || null : null
    const end = input.decision === 'APPROVE' ? input.latestEndTime || null : null
    if (start && timeToMinutes(start) < timeToMinutes(slot.start_time)) throw new Error('El inicio no puede ser anterior al slot')
    if (end && timeToMinutes(end) > timeToMinutes(slot.end_time)) throw new Error('El fin no puede superar el slot')
    if (start && end && timeToMinutes(start) >= timeToMinutes(end)) throw new Error('La ventana aprobada no es valida')

    const { error } = await supabase.from('couple_time_availability').update({
      note_interpretation_status: input.decision === 'APPROVE' ? 'APPROVED' : 'IGNORED',
      note_interpretation_source: 'MANUAL',
      preferred_start_time: start,
      preferred_end_time: end,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', input.availabilityId)
    if (error) throw error
    revalidatePath(`/tournaments/${input.tournamentId}/match-scheduling`)
    return { success: true, data: null }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
