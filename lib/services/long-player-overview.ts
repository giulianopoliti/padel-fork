import 'server-only'

import { createClient } from '@/utils/supabase/server'
import { getInscriptionState } from '@/lib/tournaments/inscription-state'
import {
  LongPlayerAvailabilitySummary,
  LongPlayerOverview,
  LongPlayerOverviewMatch,
  selectPriorityAvailability,
} from './long-player-overview.shared'

const getRelation = <T>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

const getPlayerName = (player: { first_name?: string | null; last_name?: string | null } | null) => {
  if (!player) return ''
  return `${player.first_name || ''} ${player.last_name || ''}`.trim()
}

const getCoupleName = (couple: any) => {
  if (!couple) return 'Rival a definir'
  const player1 = getRelation(couple.player1)
  const player2 = getRelation(couple.player2)
  return [getPlayerName(player1), getPlayerName(player2)].filter(Boolean).join(' / ') || 'Rival a definir'
}

const mapMatch = (match: any, coupleId: string): LongPlayerOverviewMatch => {
  const playerIsCouple1 = match.couple1_id === coupleId
  const opponent = getRelation(playerIsCouple1 ? match.couple2 : match.couple1)
  const schedule = getRelation(match.fecha_matches)

  return {
    id: match.id,
    status: match.status || 'PENDING',
    round: match.round || 'ZONE',
    opponentName: getCoupleName(opponent),
    scheduledDate: schedule?.scheduled_date || null,
    scheduledStartTime: schedule?.scheduled_start_time || null,
    court: schedule?.court_assignment || null,
    winnerId: match.winner_id || null,
    resultCouple1: match.result_couple1 || null,
    resultCouple2: match.result_couple2 || null,
    playerCoupleId: coupleId,
    couple1Id: match.couple1_id || null,
    couple2Id: match.couple2_id || null,
    createdAt: match.created_at || '',
  }
}

const getScheduleTimestamp = (match: LongPlayerOverviewMatch) => {
  if (!match.scheduledDate) return Number.MAX_SAFE_INTEGER
  return Date.parse(`${match.scheduledDate}T${match.scheduledStartTime || '23:59:59'}`)
}

export const getLongPlayerOverview = async (
  tournamentId: string,
  userId: string
): Promise<LongPlayerOverview> => {
  const supabase = await createClient()
  const emptyOverview: LongPlayerOverview = {
    registrationStatus: 'NOT_REGISTERED',
    coupleId: null,
    coupleName: null,
    eliminatedAt: null,
    eliminatedInRound: null,
    nextMatch: null,
    finishedMatches: [],
    standing: null,
    availability: null,
  }

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!player) return emptyOverview

  const { data: inscriptions } = await supabase
    .from('inscriptions')
    .select(`
      id, player_id, couple_id, is_pending, is_eliminated, eliminated_at, eliminated_in_round,
      occupies_slot, payment_method, payment_proof_path, proof_waived_at, tournaments(enable_transfer_proof),
      couples:couple_id(
        id, player1_id, player2_id,
        player1:players!couples_player1_id_fkey(first_name, last_name),
        player2:players!couples_player2_id_fkey(first_name, last_name)
      )
    `)
    .eq('tournament_id', tournamentId)
    .eq('es_prueba', false)

  const inscription = (inscriptions || []).find((row: any) => {
    if (row.player_id === player.id && !row.couple_id) return true
    const couple = getRelation(row.couples) as any
    return couple?.player1_id === player.id || couple?.player2_id === player.id
  }) as any

  if (!inscription) return emptyOverview
  const paymentTournament = getRelation(inscription.tournaments) as { enable_transfer_proof?: boolean } | null
  const state = getInscriptionState(inscription, paymentTournament?.enable_transfer_proof)
  if (inscription.couple_id && !state.confirmed) {
    const pendingCouple = getRelation(inscription.couples) as any
    return {
      ...emptyOverview,
      registrationStatus: 'PENDING',
      coupleId: inscription.couple_id || null,
      coupleName: inscription.couple_id ? getCoupleName(pendingCouple) : null,
    }
  }
  if (!inscription.couple_id) {
    return { ...emptyOverview, registrationStatus: 'INDIVIDUAL' }
  }

  const coupleId = inscription.couple_id as string
  const couple = getRelation(inscription.couples) as any
  const registrationStatus = inscription.is_eliminated ? 'ELIMINATED' : 'ACTIVE'

  const [matchesResult, standingResult, fechasResult, bracketResult] = await Promise.all([
    supabase
      .from('matches')
      .select(`
        id, status, round, couple1_id, couple2_id, winner_id, result_couple1, result_couple2, created_at,
        couple1:couples!couple1_id(
          player1:players!couples_player1_id_fkey(first_name, last_name),
          player2:players!couples_player2_id_fkey(first_name, last_name)
        ),
        couple2:couples!couple2_id(
          player1:players!couples_player1_id_fkey(first_name, last_name),
          player2:players!couples_player2_id_fkey(first_name, last_name)
        ),
        fecha_matches(scheduled_date, scheduled_start_time, court_assignment)
      `)
      .eq('tournament_id', tournamentId)
      .neq('status', 'DRAFT')
      .or(`couple1_id.eq.${coupleId},couple2_id.eq.${coupleId}`),
    supabase
      .from('zone_positions')
      .select('position, wins, losses, sets_difference, games_difference')
      .eq('tournament_id', tournamentId)
      .eq('couple_id', coupleId)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('tournament_fechas')
      .select('id, name, fecha_number, round_type, bracket_key, status')
      .eq('tournament_id', tournamentId)
      .neq('status', 'CANCELED')
      .order('fecha_number', { ascending: false }),
    supabase
      .from('tournament_couple_seeds')
      .select('bracket_key')
      .eq('tournament_id', tournamentId)
      .eq('couple_id', coupleId)
      .in('bracket_key', ['GOLD', 'SILVER'])
      .limit(1)
      .maybeSingle(),
  ])

  const matches = (matchesResult.data || []).map(match => mapMatch(match, coupleId))
  const nextMatch = matches
    .filter(match => match.status === 'PENDING' || match.status === 'IN_PROGRESS' || match.status === 'SCHEDULED')
    .sort((a, b) => getScheduleTimestamp(a) - getScheduleTimestamp(b))[0] || null
  const finishedMatches = matches
    .filter(match => match.status === 'FINISHED')
    .sort((a, b) => {
      const scheduleDifference = getScheduleTimestamp(b) - getScheduleTimestamp(a)
      if (Number.isFinite(scheduleDifference) && scheduleDifference !== 0) return scheduleDifference
      return Date.parse(b.createdAt) - Date.parse(a.createdAt)
    })

  let availability: LongPlayerAvailabilitySummary | null = null
  if (registrationStatus === 'ACTIVE') {
    const bracketKey = bracketResult.data?.bracket_key || null
    const eligibleFechas = (fechasResult.data || []).filter(fecha =>
      fecha.round_type === 'ZONE' ||
      !['GOLD', 'SILVER'].includes(fecha.bracket_key || '') ||
      fecha.bracket_key === bracketKey
    )
    const fechaIds = eligibleFechas.map(fecha => fecha.id)

    if (fechaIds.length > 0) {
      const { data: slots } = await supabase
        .from('tournament_time_slots')
        .select('id, fecha_id')
        .in('fecha_id', fechaIds)
        .eq('is_available', true)
        .eq('slot_type', 'TIME_RANGE')

      const slotIds = (slots || []).map(slot => slot.id)
      const { data: responses } = slotIds.length > 0
        ? await supabase
            .from('couple_time_availability')
            .select('time_slot_id')
            .eq('couple_id', coupleId)
            .in('time_slot_id', slotIds)
        : { data: [] }
      const respondedIds = new Set((responses || []).map(response => response.time_slot_id))

      const summaries = eligibleFechas.map(fecha => {
        const fechaSlots = (slots || []).filter(slot => slot.fecha_id === fecha.id)
        return {
          fechaId: fecha.id,
          fechaName: fecha.name || `Fecha ${fecha.fecha_number}`,
          fechaNumber: fecha.fecha_number || 0,
          totalSlots: fechaSlots.length,
          respondedSlots: fechaSlots.filter(slot => respondedIds.has(slot.id)).length,
          canEdit: true,
          restrictionReason: null,
        }
      })
      availability = selectPriorityAvailability(summaries)
    }
  }

  const standing = standingResult.data
    ? {
        position: standingResult.data.position,
        wins: standingResult.data.wins,
        losses: standingResult.data.losses,
        setsDifference: standingResult.data.sets_difference,
        gamesDifference: standingResult.data.games_difference,
      }
    : null

  return {
    registrationStatus,
    coupleId,
    coupleName: getCoupleName(couple),
    eliminatedAt: inscription.eliminated_at || null,
    eliminatedInRound: inscription.eliminated_in_round || null,
    nextMatch,
    finishedMatches,
    standing,
    availability,
  }
}
