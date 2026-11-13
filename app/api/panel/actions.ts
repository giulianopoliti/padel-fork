'use server'

import { createClient } from '@/utils/supabase/server'
import { presentPayment, type PaymentInscription, type PaymentRow } from '@/lib/tournaments/payment-types'
import { getTenantBranding } from '@/config/tenant'
import { getTenantUpcomingTournamentSummaries } from '@/lib/services/tenant-home.service'
import { getTournamentCategoryDisplay } from '@/lib/services/tournament-category-config'
import { buildTournamentCapacitySummary } from '@/lib/services/tournament-capacity.service'
import { buildGoogleMapsSearchUrl } from '@/lib/maps/google-maps'
import { applyLongMatchLineup, getLongMatchLineupChanges, getMyLongSubstituteMatches } from '@/lib/services/long-match-lineups'
import { getMyLongFechaSubstitutions, getMyLongSubstitutePanelFechas } from '@/lib/services/long-fecha-substitutions'
import { loadPlayerPanelAvailability } from '@/lib/services/player-panel-availability'
import { getArgentinaToday } from '@/lib/services/schedule-sharing/validation'
import {
  resolvePlayerPanelAgenda,
  isOpenPlayerFecha,
  type PlayerPanelAgendaState,
  type PlayerPanelFechaCandidate,
} from '@/lib/services/player-panel-agenda.shared'
import {
  isTournamentGenderFilter,
  type TournamentGenderFilter,
} from '@/lib/tournaments/gender-filtering'

export type PlayerNextMatch = {
  match_id: string
  couple_id: string
  tournament_id: string
  tournament_name: string
  club_name?: string
  club_address?: string
  club_maps_url?: string
  opponent_names: string[]
  partner_name: string
  round?: 'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL'
  scheduled_info: {
    date?: string
    time?: string
    court?: string
  }
  status: 'PENDING' | 'IN_PROGRESS'
  is_substitute?: boolean
  fecha_name?: string
  fecha_id?: string
  availability_href?: string
}

export type PlayerTournamentAgenda = {
  state: PlayerPanelAgendaState
  scheduled_matches: PlayerNextMatch[]
  availability: {
    fecha_id: string
    couple_id: string
    fecha_name: string
    start_date: string | null
    end_date: string | null
    total_slots: number
    responded_slots: number
    free_date_selected: boolean
    href: string
  } | null
}

export type PlayerNextMatchResult = {
  nextMatches: PlayerNextMatch[]
  error?: string
}

export type TournamentData = {
  id: string
  name: string
  start_date: string
  status: string
  category_name: string
  max_participants: number
  clubes: {
    name: string
    address: string
  }[]
}

export type InscribedTournament = {
  payment?: PaymentInscription
  inscription_id: string
  couple_id: string
  tournament: {
    id: string
    seoSlug?: string | null
    name: string
    type?: "LONG" | "AMERICAN" | string | null
    start_date: string
    end_date: string
    status: string
    category_name: string
    gender: string
    hide_venue?: boolean
    club: {
      name: string
      address: string | null
    }
  }
  partner: {
    id: string
    first_name: string
    last_name: string
    profile_image_url: string | null
  }
  current_player: {
    id: string
    first_name: string
    last_name: string
    profile_image_url: string | null
  }
  agenda: PlayerTournamentAgenda
}

export type InscribedTournamentsResult = {
  inscribedTournaments: InscribedTournament[]
  error?: string
}

export type UpcomingTournament = {
  payment?: PaymentInscription
  id: string
  seoSlug?: string | null
  name: string
  type?: "LONG" | "AMERICAN" | string | null
  start_date: string
  end_date: string
  status: string
  category_name: string
  gender: string
  max_participants: number | null
  current_inscriptions: number
  remaining_slots: number | null
  description: string
  price: number | string | null
  is_inscribed: boolean
  is_full: boolean
  has_few_slots: boolean
  show_few_slots_alert: boolean
  enable_public_inscriptions: boolean
  show_public_inscriptions: boolean
  registration_locked?: boolean | null
  bracket_status?: string | null
  enable_transfer_proof?: boolean
  transfer_alias?: string | null
  transfer_amount?: number | null
  hide_venue?: boolean
  club: {
    name: string
    address: string | null
  }
}

export type UpcomingTournamentsResult = {
  upcomingTournaments: UpcomingTournament[]
  error?: string
}

const isTodayOrFutureMatch = (match: PlayerNextMatch, today: string) => {
  const scheduledDate = match.scheduled_info.date

  if (!scheduledDate) {
    return true
  }

  return scheduledDate >= today
}

const compareMatchesBySchedule = (firstMatch: PlayerNextMatch, secondMatch: PlayerNextMatch) => {
  const firstDate = firstMatch.scheduled_info.date || '9999-12-31'
  const secondDate = secondMatch.scheduled_info.date || '9999-12-31'

  if (firstDate !== secondDate) {
    return firstDate.localeCompare(secondDate)
  }

  const firstTime = firstMatch.scheduled_info.time || '23:59:59'
  const secondTime = secondMatch.scheduled_info.time || '23:59:59'

  return firstTime.localeCompare(secondTime)
}

const getVisibleNextMatches = (matches: PlayerNextMatch[], today = getArgentinaToday()) =>
  matches.filter(match => isTodayOrFutureMatch(match, today)).sort(compareMatchesBySchedule)

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface PlayerRelation {
  id: string
  first_name: string | null
  last_name: string | null
  profile_image_url: string | null
}

interface CoupleRelation {
  id: string
  player1_id: string
  player2_id: string
  player1: PlayerRelation | PlayerRelation[] | null
  player2: PlayerRelation | PlayerRelation[] | null
}

interface ClubRelation {
  name: string | null
  address: string | null
  formatted_address?: string | null
  google_place_id?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
  maps_url?: string | null
}

interface MatchScheduleRelation {
  fecha_id: string | null
  scheduled_date: string | null
  scheduled_start_time: string | null
  court_assignment: string | null
  tournament_fechas: { name: string | null } | { name: string | null }[] | null
}

const getRelation = <T>(relation: T | T[] | null | undefined): T | null => {
  if (Array.isArray(relation)) return relation[0] || null
  return relation || null
}

const getPlayerDisplayName = (player: PlayerRelation | null) => {
  if (!player) return ''
  return `${player.first_name || ''} ${player.last_name || ''}`.trim()
}

const getCouplePlayers = (couple: CoupleRelation | null) => ({
  player1: getRelation(couple?.player1),
  player2: getRelation(couple?.player2),
})

const verifyAuthenticatedPlayer = async (
  supabase: SupabaseServerClient,
  playerId: string,
) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('user_id', user.id)
    .maybeSingle()

  return Boolean(player)
}

const loadPlayerCouples = async (
  supabase: SupabaseServerClient,
  playerId: string,
): Promise<CoupleRelation[]> => {
  const { data, error } = await supabase
    .from('couples')
    .select(`
      id, player1_id, player2_id,
      player1:players!couples_player1_id_fkey(id, first_name, last_name, profile_image_url),
      player2:players!couples_player2_id_fkey(id, first_name, last_name, profile_image_url)
    `)
    .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)

  if (error) throw error
  return (data || []) as unknown as CoupleRelation[]
}

const loadPlayerMatches = async (
  supabase: SupabaseServerClient,
  playerId: string,
  couples: CoupleRelation[],
  tournamentIds?: string[],
  substituteMatches = new Map<string, string>(),
): Promise<PlayerNextMatch[]> => {
  const coupleIds = couples.map(couple => couple.id)
  if ((!coupleIds.length && !substituteMatches.size) || tournamentIds?.length === 0) return []
  const participants = [
    coupleIds.length && `couple1_id.in.(${coupleIds.join(',')}),couple2_id.in.(${coupleIds.join(',')})`,
    substituteMatches.size && `id.in.(${Array.from(substituteMatches.keys()).join(',')})`,
  ].filter(Boolean).join(',')

  let query = supabase
    .from('matches')
    .select(`
      id, tournament_id, status, round, couple1_id, couple2_id, created_at,
      match_club:clubes!club_id(name, address, formatted_address, google_place_id, latitude, longitude, maps_url),
      tournaments!inner(
        id, name, type, status, is_draft,
        tournament_club:clubes!club_id(name, address, formatted_address, google_place_id, latitude, longitude, maps_url)
      ),
      fecha_matches(fecha_id, scheduled_date, scheduled_start_time, court_assignment, tournament_fechas(name)),
      couple1:couples!couple1_id(
        id, player1_id, player2_id,
        player1:players!couples_player1_id_fkey(id, first_name, last_name, profile_image_url),
        player2:players!couples_player2_id_fkey(id, first_name, last_name, profile_image_url)
      ),
      couple2:couples!couple2_id(
        id, player1_id, player2_id,
        player1:players!couples_player1_id_fkey(id, first_name, last_name, profile_image_url),
        player2:players!couples_player2_id_fkey(id, first_name, last_name, profile_image_url)
      )
    `)
    .or(participants)
    .in('status', ['PENDING', 'IN_PROGRESS'])
    .or('bracket_is_active.is.null,bracket_is_active.eq.true')
    .neq('tournaments.status', 'CANCELED')
    .eq('tournaments.is_draft', false)

  if (tournamentIds) {
    query = query.in('tournament_id', tournamentIds)
  }

  const { data, error } = await query.order('created_at', { ascending: true })
  if (error) throw error

  const matches = data ?? []
  const changes = await getLongMatchLineupChanges(supabase, matches
    .filter(match => (getRelation(match.tournaments) as { type?: string } | null)?.type === 'LONG')
    .map(match => match.id))
  const coupleIdsSet = new Set(coupleIds)

  return matches.map((rawMatch): PlayerNextMatch | null => {
    const match = rawMatch as unknown as {
      id: string
      tournament_id: string
      status: 'PENDING' | 'IN_PROGRESS'
      round: PlayerNextMatch['round'] | null
      couple1_id: string | null
      couple2_id: string | null
      match_club: ClubRelation | ClubRelation[] | null
      tournaments: {
        id: string
        name: string | null
        tournament_club: ClubRelation | ClubRelation[] | null
      } | Array<{
        id: string
        name: string | null
        tournament_club: ClubRelation | ClubRelation[] | null
      }> | null
      fecha_matches: MatchScheduleRelation | MatchScheduleRelation[] | null
      couple1: CoupleRelation | CoupleRelation[] | null
      couple2: CoupleRelation | CoupleRelation[] | null
    }

    const substituteCoupleId = substituteMatches.get(match.id)
    const playerCoupleId = substituteCoupleId ?? (coupleIdsSet.has(match.couple1_id || '')
      ? match.couple1_id
      : coupleIdsSet.has(match.couple2_id || '')
        ? match.couple2_id
        : null)

    if (!playerCoupleId) return null

    const couple1 = applyLongMatchLineup(getRelation(match.couple1), match.couple1_id, changes.get(match.id))
    const couple2 = applyLongMatchLineup(getRelation(match.couple2), match.couple2_id, changes.get(match.id))
    const playerCouple = playerCoupleId === match.couple1_id ? couple1 : couple2
    if (playerCouple && playerCouple.player1_id !== playerId && playerCouple.player2_id !== playerId) return null
    const opponentCouple = playerCoupleId === match.couple1_id ? couple2 : couple1
    const playerCouplePlayers = getCouplePlayers(playerCouple)
    const opponentPlayers = getCouplePlayers(opponentCouple)
    const partner = playerCouplePlayers.player1?.id === playerId
      ? playerCouplePlayers.player2
      : playerCouplePlayers.player1
    const opponentNames = [
      getPlayerDisplayName(opponentPlayers.player1),
      getPlayerDisplayName(opponentPlayers.player2),
    ].filter(Boolean)
    const tournament = getRelation(match.tournaments)
    const schedule = getRelation(match.fecha_matches)
    const matchClub = getRelation(match.match_club)
    const tournamentClub = getRelation(tournament?.tournament_club)
    const club = matchClub || tournamentClub

    return {
      match_id: match.id,
      couple_id: playerCoupleId,
      tournament_id: match.tournament_id,
      tournament_name: tournament?.name || 'Sin nombre',
      club_name: club?.name || undefined,
      club_address: club?.formatted_address || club?.address || undefined,
      club_maps_url: club?.maps_url || buildGoogleMapsSearchUrl({
        name: club?.name,
        address: club?.address,
        formattedAddress: club?.formatted_address,
        googlePlaceId: club?.google_place_id,
        latitude: club?.latitude,
        longitude: club?.longitude,
      }) || undefined,
      opponent_names: opponentNames.length > 0 ? opponentNames : ['Rival a definir'],
      partner_name: getPlayerDisplayName(partner) || 'Compañero a definir',
      round: match.round || undefined,
      scheduled_info: {
        date: schedule?.scheduled_date || undefined,
        time: schedule?.scheduled_start_time || undefined,
        court: schedule?.court_assignment || undefined,
      },
      status: match.status,
      ...(substituteCoupleId && { is_substitute: true, fecha_id: schedule?.fecha_id || undefined,
        fecha_name: getRelation(schedule?.tournament_fechas)?.name || undefined }),
    }
  }).filter((match): match is PlayerNextMatch => Boolean(match))
}

export async function getPlayerNextMatch(playerId: string): Promise<PlayerNextMatchResult> {
  try {
    const supabase = await createClient()
    const canReadPlayer = await verifyAuthenticatedPlayer(supabase, playerId)
    if (!canReadPlayer) {
      return { nextMatches: [], error: 'No autorizado' }
    }

    const [couples, substituteMatches] = await Promise.all([
      loadPlayerCouples(supabase, playerId),
      getMyLongSubstituteMatches(supabase),
    ])
    const matches = await loadPlayerMatches(supabase, playerId, couples, undefined, substituteMatches)
    const visibleMatches = getVisibleNextMatches(matches)
    const candidates = visibleMatches.filter(match => match.is_substitute && match.fecha_id && !match.scheduled_info.time)
    const now = new Date()
    const tournamentIds = [...new Set(candidates.map(match => match.tournament_id))]
    const fechaIds = [...new Set(candidates.flatMap(match => match.fecha_id ? [match.fecha_id] : []))]
    const [getAvailability, fechasResult] = await Promise.all([
      loadPlayerPanelAvailability(supabase, fechaIds, [...new Set(candidates.map(match => match.couple_id))], now),
      fechaIds.length ? supabase.from('tournament_fechas').select('id, status, start_date, end_date').in('id', fechaIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (fechasResult.error) throw fechasResult.error
    const today = getArgentinaToday(now)
    const openFechas = new Set((fechasResult.data ?? []).filter(fecha => isOpenPlayerFecha(fecha, today)).map(fecha => fecha.id))
    await Promise.all(tournamentIds.map(async tournamentId => {
      const assignments = await getMyLongFechaSubstitutions(supabase, tournamentId)
      for (const match of candidates) {
        if (match.tournament_id !== tournamentId || !match.fecha_id || !openFechas.has(match.fecha_id)) continue
        const availability = getAvailability(match.fecha_id, match.couple_id)
        if (availability.playableSlotIds.length && !availability.respondedPlayableSlotIds.length && !availability.freeDateSelected
          && assignments.some(item => item.fecha_id === match.fecha_id && item.couple_id === match.couple_id && item.is_substitute && item.can_vote)) {
          match.availability_href = `/tournaments/${tournamentId}/schedules?${new URLSearchParams({ fecha_id: match.fecha_id, couple_id: match.couple_id })}`
        }
      }
    }))

    return {
      nextMatches: visibleMatches,
    }
  } catch (error) {
    console.error('Error fetching player matches:', error)
    return {
      nextMatches: [],
      error: 'Error inesperado al obtener proximos partidos',
    }
  }
}

type PanelFechaCandidate = PlayerPanelFechaCandidate & { coupleId: string; fechaId: string }

const resolveTournamentAgenda = (
  tournamentId: string, matches: PlayerNextMatch[], fechas: PanelFechaCandidate[], today: string, isEliminated = false,
): PlayerTournamentAgenda => {
  const resolution = resolvePlayerPanelAgenda({
    isLongTournament: true, isEliminated, today, fechas,
    matches: matches.map(match => ({ id: match.match_id, scheduledDate: match.scheduled_info.date || null,
      scheduledStartTime: match.scheduled_info.time || null })),
  })
  const ids = new Set(resolution.scheduledMatchIds)
  const fecha = fechas.find(item => item.id === resolution.availabilityFechaId)
  return {
    state: resolution.state,
    scheduled_matches: matches.filter(match => ids.has(match.match_id)),
    availability: fecha ? {
      fecha_id: fecha.fechaId,
      couple_id: fecha.coupleId,
      fecha_name: fecha.name,
      start_date: fecha.startDate,
      end_date: fecha.endDate,
      total_slots: fecha.playableSlotIds.length,
      responded_slots: fecha.respondedPlayableSlotIds.length,
      free_date_selected: fecha.freeDateSelected,
      href: `/tournaments/${tournamentId}/schedules?${new URLSearchParams({ fecha_id: fecha.fechaId, couple_id: fecha.coupleId })}`,
    } : null,
  }
}

export type PlayerSubstituteTournament = {
  id: string
  name: string
  lineup?: string
  agenda: PlayerTournamentAgenda
}

const loadPlayerSubstituteTournaments = async (supabase: SupabaseServerClient, nextMatches: PlayerNextMatch[]): Promise<PlayerSubstituteTournament[]> => {
  const assignments = await getMyLongSubstitutePanelFechas(supabase)
  const matches = nextMatches.filter(match => match.is_substitute)
  const tournamentNames = new Map(matches.map(match => [match.tournament_id, match.tournament_name]))
  for (const assignment of assignments) tournamentNames.set(assignment.tournament_id, assignment.tournament_name)

  const fechaIds = [...new Set(assignments.map(assignment => assignment.fecha_id))]
  const now = new Date()
  const today = getArgentinaToday(now)
  const fechaResult = fechaIds.length ? await supabase.from('tournament_fechas')
    .select('id, fecha_number, start_date, end_date, status').in('id', fechaIds) : { data: [], error: null }
  if (fechaResult.error) throw fechaResult.error
  const fechas = new Map((fechaResult.data ?? []).filter(fecha => isOpenPlayerFecha(fecha, today)).map(fecha => [fecha.id, fecha]))
  const coupleIds = [...new Set(assignments.filter(item => fechas.has(item.fecha_id)).map(item => item.couple_id))]
  const getAvailability = await loadPlayerPanelAvailability(supabase, [...fechas.keys()], coupleIds, now)

  return Array.from(tournamentNames).flatMap(([id, name]) => {
    const candidates = assignments.filter(assignment => assignment.tournament_id === id).flatMap(assignment => {
      const fecha = fechas.get(assignment.fecha_id)
      if (!fecha) return []
      return [{
        id: `${assignment.fecha_id}:${assignment.couple_id}`,
        fechaId: assignment.fecha_id,
        coupleId: assignment.couple_id,
        name: assignment.fecha_name,
        fechaNumber: fecha.fecha_number ?? 0,
        startDate: fecha.start_date,
        endDate: fecha.end_date,
        status: fecha.status,
        isApplicable: true,
        lineup: `${assignment.player1_name} / ${assignment.player2_name}`,
        ...getAvailability(assignment.fecha_id, assignment.couple_id),
      }]
    })
    const tournamentMatches = matches.filter(match => match.tournament_id === id)
    if (!candidates.length && !tournamentMatches.length) return []
    const agenda = resolveTournamentAgenda(id, tournamentMatches, candidates, today)
    const selected = candidates.find(item => item.fechaId === agenda.availability?.fecha_id
      && item.coupleId === agenda.availability.couple_id)
    return [{ id, name, agenda, lineup: selected?.lineup ?? candidates[0]?.lineup }]
  })
}

export async function getPlayerInscribedTournaments(playerId: string): Promise<InscribedTournamentsResult> {
  try {
    const supabase = await createClient()
    const canReadPlayer = await verifyAuthenticatedPlayer(supabase, playerId)
    if (!canReadPlayer) {
      return { inscribedTournaments: [], error: 'No autorizado' }
    }

    const couples = await loadPlayerCouples(supabase, playerId)
    const coupleIds = couples.map(couple => couple.id)
    if (coupleIds.length === 0) return { inscribedTournaments: [] }

    const { data: rawInscriptions, error: inscriptionsError } = await supabase
      .from('inscriptions')
      .select(`
        id, couple_id, tournament_id, is_eliminated, is_pending, payment_method, payment_proof_path, payment_proof_status, payment_revision, occupies_slot, proof_waived_at,
        tournaments!inner(
          id, seo_slug, name, type, start_date, end_date, status, category_name, category_config,
          gender, hide_venue, is_draft, enable_transfer_proof,
          clubes(name, address)
        )
      `)
      .in('couple_id', coupleIds)
      .eq('is_eliminated', false)
      .eq('es_prueba', false)
      .eq('tournaments.is_draft', false)
      .in('tournaments.status', [
        'NOT_STARTED',
        'ZONE_REGISTRATION',
        'IN_PROGRESS',
        'ZONE_PHASE',
        'BRACKET_PHASE',
      ])

    if (inscriptionsError) throw inscriptionsError

    const coupleById = new Map(couples.map(couple => [couple.id, couple]))
    const eliminatedByInscriptionId = new Map<string, boolean>()

    const inscribedTournaments = (rawInscriptions || []).map((rawInscription): InscribedTournament | null => {
      const inscription = rawInscription as unknown as PaymentRow & {
        id: string
        couple_id: string
        is_eliminated: boolean
        tournaments: {
          id: string
          seo_slug: string | null
          name: string | null
          type: string | null
          start_date: string | null
          end_date: string | null
          status: string | null
          category_name: string | null
          category_config: unknown
          gender: string | null
          hide_venue: boolean | null
          enable_transfer_proof: boolean | null
          clubes: ClubRelation | ClubRelation[] | null
        } | Array<{
          id: string
          seo_slug: string | null
          name: string | null
          type: string | null
          start_date: string | null
          end_date: string | null
          status: string | null
          category_name: string | null
          category_config: unknown
          gender: string | null
          hide_venue: boolean | null
          enable_transfer_proof: boolean | null
          clubes: ClubRelation | ClubRelation[] | null
        }> | null
      }
      const tournament = getRelation(inscription.tournaments)
      const couple = coupleById.get(inscription.couple_id) || null
      if (!tournament || !couple) return null

      const { player1, player2 } = getCouplePlayers(couple)
      const currentPlayer = player1?.id === playerId ? player1 : player2
      const partner = player1?.id === playerId ? player2 : player1
      if (!currentPlayer || !partner) return null

      const hideVenue = Boolean(tournament.hide_venue)
      const club = getRelation(tournament.clubes)
      eliminatedByInscriptionId.set(inscription.id, inscription.is_eliminated)

      return {
        inscription_id: inscription.id,
        payment: presentPayment(inscription, tournament.enable_transfer_proof === true),
        couple_id: inscription.couple_id,
        tournament: {
          id: tournament.id,
          seoSlug: tournament.seo_slug,
          name: tournament.name || 'Torneo',
          type: tournament.type,
          start_date: tournament.start_date || '',
          end_date: tournament.end_date || '',
          status: tournament.status || 'NOT_STARTED',
          category_name: getTournamentCategoryDisplay({
            category_name: tournament.category_name,
            category_config: tournament.category_config,
          }) || '',
          gender: tournament.gender || '',
          hide_venue: hideVenue,
          club: hideVenue
            ? { name: '', address: null }
            : { name: club?.name || '', address: club?.address || null },
        },
        partner: {
          id: partner.id,
          first_name: partner.first_name || '',
          last_name: partner.last_name || '',
          profile_image_url: partner.profile_image_url,
        },
        current_player: {
          id: currentPlayer.id,
          first_name: currentPlayer.first_name || '',
          last_name: currentPlayer.last_name || '',
          profile_image_url: currentPlayer.profile_image_url,
        },
        agenda: {
          state: 'DEFAULT',
          scheduled_matches: [],
          availability: null,
        },
      }
    }).filter((inscription): inscription is InscribedTournament => Boolean(inscription))
      .sort((first, second) => second.tournament.start_date.localeCompare(first.tournament.start_date))

    const longInscriptions = inscribedTournaments.filter(inscription => inscription.tournament.type === 'LONG' && !inscription.payment?.isPending)
    if (longInscriptions.length === 0) return { inscribedTournaments }

    const longTournamentIds = [...new Set(longInscriptions.map(inscription => inscription.tournament.id))]
    const longCoupleIds = [...new Set(longInscriptions.map(inscription => inscription.couple_id))]
    const [matches, fechasResult, seedsResult, fechaAssignments] = await Promise.all([
      loadPlayerMatches(supabase, playerId, couples, longTournamentIds),
      supabase
        .from('tournament_fechas')
        .select('id, tournament_id, name, fecha_number, start_date, end_date, status, round_type, bracket_key')
        .in('tournament_id', longTournamentIds)
        .neq('status', 'CANCELED'),
      supabase
        .from('tournament_couple_seeds')
        .select('tournament_id, couple_id, bracket_key')
        .in('tournament_id', longTournamentIds)
        .in('couple_id', longCoupleIds)
        .in('bracket_key', ['GOLD', 'SILVER']),
      Promise.all(longTournamentIds.map(id => getMyLongFechaSubstitutions(supabase, id))),
    ])

    if (fechasResult.error) throw fechasResult.error
    if (seedsResult.error) throw seedsResult.error

    const fechas = (fechasResult.data || []) as Array<{
      id: string
      tournament_id: string
      name: string | null
      fecha_number: number | null
      start_date: string | null
      end_date: string | null
      status: string | null
      round_type: string | null
      bracket_key: string | null
    }>
    const now = new Date()
    const today = getArgentinaToday(now)
    const fechaIds = fechas.filter(fecha => isOpenPlayerFecha(fecha, today)).map(fecha => fecha.id)
    const getAvailability = await loadPlayerPanelAvailability(supabase, fechaIds, longCoupleIds, now)
    const seedByTournamentAndCouple = new Map(
      (seedsResult.data || []).map(seed => [
        `${seed.tournament_id}:${seed.couple_id}`,
        seed.bracket_key,
      ]),
    )
    const replacedFechas = new Set(fechaAssignments.flat().filter(item => !item.can_vote)
      .map(item => `${item.fecha_id}:${item.couple_id}`))

    const enrichedTournaments = inscribedTournaments.map((inscription): InscribedTournament => {
      if (inscription.tournament.type !== 'LONG') return inscription

      const inscriptionMatches = getVisibleNextMatches(matches.filter(match => (
        match.tournament_id === inscription.tournament.id && match.couple_id === inscription.couple_id
      )))
      const assignedBracket = seedByTournamentAndCouple.get(
        `${inscription.tournament.id}:${inscription.couple_id}`,
      )
      const tournamentFechas = fechas.filter(fecha => fecha.tournament_id === inscription.tournament.id)
      const fechaCandidates: PanelFechaCandidate[] = tournamentFechas.map(fecha => {
        const isGoldSilverFecha = fecha.round_type !== 'ZONE' && ['GOLD', 'SILVER'].includes(fecha.bracket_key || '')

        return {
          id: fecha.id,
          fechaId: fecha.id,
          coupleId: inscription.couple_id,
          name: fecha.name || `Fecha ${fecha.fecha_number || ''}`.trim(),
          fechaNumber: fecha.fecha_number || 0,
          startDate: fecha.start_date,
          endDate: fecha.end_date,
          status: fecha.status || 'NOT_STARTED',
          isApplicable: (!isGoldSilverFecha || assignedBracket === fecha.bracket_key)
            && !replacedFechas.has(`${fecha.id}:${inscription.couple_id}`),
          ...getAvailability(fecha.id, inscription.couple_id),
        }
      })
      return { ...inscription, agenda: resolveTournamentAgenda(
        inscription.tournament.id, inscriptionMatches, fechaCandidates, today,
        eliminatedByInscriptionId.get(inscription.inscription_id) || false,
      ) }
    })

    return { inscribedTournaments: enrichedTournaments }
  } catch (error) {
    console.error('Error fetching player inscriptions:', error)
    return {
      inscribedTournaments: [],
      error: 'Error inesperado al obtener torneos inscriptos',
    }
  }
}

export async function getPlayerUpcomingTournaments(
  playerId: string,
  options: {
    genderFilter?: TournamentGenderFilter | null
    playerGender?: string | null
  } = {},
): Promise<UpcomingTournamentsResult> {
  try {
    const supabase = await createClient()
    const branding = getTenantBranding()
    const explicitGenderFilter = isTournamentGenderFilter(options.genderFilter) ? options.genderFilter : null
    const summaryOptions = {
      genderFilter: explicitGenderFilter,
      priorityGender: explicitGenderFilter ? null : options.playerGender ?? null,
      statusMode: branding.key === "padel-fv" ? "active" as const : "upcoming" as const,
    }
    const tournaments = branding.key === "padel-fv"
      ? (await Promise.all([
          getTenantUpcomingTournamentSummaries(null, { ...summaryOptions, tournamentType: "LONG" }),
          getTenantUpcomingTournamentSummaries(24, { ...summaryOptions, tournamentType: "AMERICAN" }),
        ])).flat()
      : await getTenantUpcomingTournamentSummaries(8, summaryOptions)

    if (tournaments.length === 0) {
      return { upcomingTournaments: [] }
    }

    const { data: playerCouples, error: couplesError } = await supabase
      .from('couples')
      .select('id')
      .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)

    if (couplesError) {
      console.error('Error fetching player couples:', couplesError)
      return {
        upcomingTournaments: [],
        error: 'Error al obtener parejas del jugador',
      }
    }

    const coupleIds = (playerCouples || []).map((couple: any) => couple.id)
    const tournamentIds = tournaments.map((tournament) => tournament.id)

    const canReadPlayer = await verifyAuthenticatedPlayer(supabase, playerId)
    if (!canReadPlayer) return { upcomingTournaments: [], error: 'No autorizado' }
    const { data: inscriptions, error: inscriptionsError } = await supabase
      .from('inscriptions')
      .select('id, tournament_id, couple_id, is_pending, payment_method, payment_proof_path, payment_proof_status, payment_revision, occupies_slot, proof_waived_at')
      .or(`and(couple_id.is.null,player_id.eq.${playerId})${coupleIds.length ? `,couple_id.in.(${coupleIds.join(',')})` : ''}`)
      .in('tournament_id', tournamentIds)
    if (inscriptionsError) throw inscriptionsError
    const proofSettings = new Map(tournaments.map(tournament => [tournament.id, tournament.enableTransferProof === true]))
    const paymentByTournament = new Map<string, PaymentInscription>((inscriptions || []).map((row: PaymentRow & { tournament_id: string }) => [row.tournament_id, presentPayment(row, proofSettings.get(row.tournament_id) === true)]))

    const upcomingTournaments: UpcomingTournament[] = tournaments.map((tournament) => {
      const currentInscriptions = tournament.currentParticipants || 0
      const maxParticipants =
        typeof tournament.maxParticipants === 'number' ? tournament.maxParticipants : null
      const capacity = buildTournamentCapacitySummary(maxParticipants, currentInscriptions)
      const hideVenue = Boolean(tournament.hideVenue)

      return {
        id: tournament.id,
        seoSlug: tournament.seoSlug,
        name: tournament.name,
        type: tournament.type || "LONG",
        start_date: tournament.startDate || '',
        end_date: tournament.endDate || '',
        status: tournament.status,
        category_name: tournament.categoryName || '',
        gender: typeof tournament.gender === 'string' ? tournament.gender : '',
        max_participants: capacity.maxParticipants,
        current_inscriptions: currentInscriptions,
        remaining_slots: capacity.remainingSlots,
        description: '',
        price: tournament.price ?? null,
        is_inscribed: paymentByTournament.has(tournament.id),
        payment: paymentByTournament.get(tournament.id),
        is_full: capacity.isFull,
        has_few_slots: capacity.hasFewSlots,
        show_few_slots_alert: tournament.showFewSlotsAlert !== false,
        enable_public_inscriptions: Boolean(tournament.enablePublicInscriptions),
        show_public_inscriptions: Boolean(tournament.showPublicInscriptions),
        registration_locked: tournament.registrationLocked,
        bracket_status: tournament.bracketStatus,
        enable_transfer_proof: tournament.enableTransferProof || false,
        transfer_alias: tournament.transferAlias || null,
        transfer_amount: tournament.transferAmount || null,
        hide_venue: hideVenue,
        club: !hideVenue && tournament.club ? {
          name: tournament.club?.name || 'Sin club',
          address: tournament.club?.address || null,
        } : {
          name: '',
          address: null,
        },
      }
    })

    return { upcomingTournaments }
  } catch (error) {
    console.error('Error getting tenant upcoming tournaments for player panel:', error)
    return {
      upcomingTournaments: [],
      error: 'Error inesperado al obtener torneos proximos',
    }
  }
}

export async function getPlayerDashboardData(
  userId: string,
  options: { includeNextMatches?: boolean; includeSubstituteTournaments?: boolean } = {},
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || user.id !== userId) {
      return {
        playerData: null,
        playerRanking: null,
        nextMatches: [],
        error: 'No autorizado',
      }
    }

    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .select(
        `
        id,
        first_name,
        last_name,
        score,
        category_name,
        gender,
        profile_image_url,
        clubes (
          name
        )
      `,
      )
      .eq('user_id', userId)
      .single()

    if (playerError) {
      throw playerError
    }

    if (!playerData) {
      return {
        playerData: null,
        playerRanking: null,
        nextMatches: [],
        error: 'Jugador no encontrado',
      }
    }

    const nextMatchResult = options.includeNextMatches === false
      ? { nextMatches: [] as PlayerNextMatch[], error: undefined }
      : await getPlayerNextMatch(playerData.id)

    const substituteTournaments = options.includeSubstituteTournaments
      ? await loadPlayerSubstituteTournaments(supabase, nextMatchResult.nextMatches).catch(error => {
        console.error('Error loading substitute tournaments:', error)
        return []
      }) : []

    let playerRanking = null
    if (playerData.score) {
      const { count } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .gt('score', playerData.score)
        .not('score', 'is', null)

      const { count: totalCount } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .not('score', 'is', null)

      playerRanking = {
        position: (count || 0) + 1,
        total: totalCount || 0,
      }
    }

    return {
      playerData,
      playerRanking,
      nextMatches: nextMatchResult.nextMatches,
      substituteTournaments,
      error: nextMatchResult.error,
    }
  } catch (error) {
    console.error('Error in getPlayerDashboardData:', error)
    return {
      playerData: null,
      playerRanking: null,
      nextMatches: [],
      error: 'Error al cargar datos del jugador',
    }
  }
}
