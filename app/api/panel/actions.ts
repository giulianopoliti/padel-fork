'use server'

import { createClient } from '@/utils/supabase/server'
import { getTenantBranding } from '@/config/tenant'
import { getTenantUpcomingTournamentSummaries } from '@/lib/services/tenant-home.service'
import { getTournamentCategoryDisplay } from '@/lib/services/tournament-category-config'
import { buildTournamentCapacitySummary } from '@/lib/services/tournament-capacity.service'
import { buildGoogleMapsSearchUrl } from '@/lib/maps/google-maps'
import {
  resolvePlayerPanelAgenda,
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
}

export type PlayerTournamentAgenda = {
  state: PlayerPanelAgendaState
  scheduled_matches: PlayerNextMatch[]
  availability: {
    fecha_id: string
    fecha_name: string
    start_date: string | null
    end_date: string | null
    total_slots: number
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
  inscription_id: string
  couple_id: string
  tournament: {
    id: string
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
  id: string
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

const PANEL_TIME_ZONE = 'America/Argentina/Buenos_Aires'

const getTodayDateKey = () => {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PANEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const year = dateParts.find((part) => part.type === 'year')?.value
  const month = dateParts.find((part) => part.type === 'month')?.value
  const day = dateParts.find((part) => part.type === 'day')?.value

  return `${year}-${month}-${day}`
}

const isTodayOrFutureMatch = (match: PlayerNextMatch) => {
  const scheduledDate = match.scheduled_info.date

  if (!scheduledDate) {
    return true
  }

  return scheduledDate >= getTodayDateKey()
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

const getVisibleNextMatches = (matches: PlayerNextMatch[] = []) =>
  matches.filter(isTodayOrFutureMatch).sort(compareMatchesBySchedule)

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
): Promise<PlayerNextMatch[]> => {
  const coupleIds = couples.map(couple => couple.id)
  if (coupleIds.length === 0 || tournamentIds?.length === 0) return []

  let query = supabase
    .from('matches')
    .select(`
      id, tournament_id, status, round, couple1_id, couple2_id, created_at,
      match_club:clubes!club_id(name, address, formatted_address, google_place_id, latitude, longitude, maps_url),
      tournaments!inner(
        id, name, status, is_draft,
        tournament_club:clubes!club_id(name, address, formatted_address, google_place_id, latitude, longitude, maps_url)
      ),
      fecha_matches(scheduled_date, scheduled_start_time, court_assignment),
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
    .or(`couple1_id.in.(${coupleIds.join(',')}),couple2_id.in.(${coupleIds.join(',')})`)
    .in('status', ['PENDING', 'IN_PROGRESS'])
    .neq('tournaments.status', 'CANCELED')
    .eq('tournaments.is_draft', false)

  if (tournamentIds) {
    query = query.in('tournament_id', tournamentIds)
  }

  const { data, error } = await query.order('created_at', { ascending: true })
  if (error) throw error

  const coupleIdsSet = new Set(coupleIds)

  return (data || []).map((rawMatch): PlayerNextMatch | null => {
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
      fecha_matches: Array<{
        scheduled_date: string | null
        scheduled_start_time: string | null
        court_assignment: string | null
      }> | {
        scheduled_date: string | null
        scheduled_start_time: string | null
        court_assignment: string | null
      } | null
      couple1: CoupleRelation | CoupleRelation[] | null
      couple2: CoupleRelation | CoupleRelation[] | null
    }

    const playerCoupleId = coupleIdsSet.has(match.couple1_id || '')
      ? match.couple1_id
      : coupleIdsSet.has(match.couple2_id || '')
        ? match.couple2_id
        : null

    if (!playerCoupleId) return null

    const playerCouple = getRelation(
      playerCoupleId === match.couple1_id ? match.couple1 : match.couple2,
    )
    const opponentCouple = getRelation(
      playerCoupleId === match.couple1_id ? match.couple2 : match.couple1,
    )
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

    const couples = await loadPlayerCouples(supabase, playerId)
    const matches = await loadPlayerMatches(supabase, playerId, couples)

    return {
      nextMatches: getVisibleNextMatches(matches),
    }
  } catch (error) {
    console.error('Error fetching player matches:', error)
    return {
      nextMatches: [],
      error: 'Error inesperado al obtener proximos partidos',
    }
  }
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
        id, couple_id, tournament_id, is_eliminated,
        tournaments!inner(
          id, name, type, start_date, end_date, status, category_name, category_config,
          gender, hide_venue, is_draft,
          clubes(name, address)
        )
      `)
      .in('couple_id', coupleIds)
      .eq('is_pending', false)
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
      const inscription = rawInscription as unknown as {
        id: string
        couple_id: string
        is_eliminated: boolean
        tournaments: {
          id: string
          name: string | null
          type: string | null
          start_date: string | null
          end_date: string | null
          status: string | null
          category_name: string | null
          category_config: unknown
          gender: string | null
          hide_venue: boolean | null
          clubes: ClubRelation | ClubRelation[] | null
        } | Array<{
          id: string
          name: string | null
          type: string | null
          start_date: string | null
          end_date: string | null
          status: string | null
          category_name: string | null
          category_config: unknown
          gender: string | null
          hide_venue: boolean | null
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
        couple_id: inscription.couple_id,
        tournament: {
          id: tournament.id,
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

    const longInscriptions = inscribedTournaments.filter(inscription => inscription.tournament.type === 'LONG')
    if (longInscriptions.length === 0) return { inscribedTournaments }

    const longTournamentIds = [...new Set(longInscriptions.map(inscription => inscription.tournament.id))]
    const longCoupleIds = [...new Set(longInscriptions.map(inscription => inscription.couple_id))]
    const [matches, fechasResult, seedsResult] = await Promise.all([
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
    const fechaIds = fechas.map(fecha => fecha.id)

    const slotsResult = fechaIds.length > 0
      ? await supabase
          .from('tournament_time_slots')
          .select('id, fecha_id, slot_type')
          .in('fecha_id', fechaIds)
          .eq('is_available', true)
      : { data: [], error: null }

    if (slotsResult.error) throw slotsResult.error

    const slots = (slotsResult.data || []) as Array<{
      id: string
      fecha_id: string
      slot_type: 'TIME_RANGE' | 'FREE_DATE'
    }>
    const slotIds = slots.map(slot => slot.id)
    const availabilityResult = slotIds.length > 0
      ? await supabase
          .from('couple_time_availability')
          .select('couple_id, time_slot_id, is_available')
          .in('couple_id', longCoupleIds)
          .in('time_slot_id', slotIds)
      : { data: [], error: null }

    if (availabilityResult.error) throw availabilityResult.error

    const availabilityRows = (availabilityResult.data || []) as Array<{
      couple_id: string
      time_slot_id: string
      is_available: boolean
    }>
    const seedByTournamentAndCouple = new Map(
      (seedsResult.data || []).map(seed => [
        `${seed.tournament_id}:${seed.couple_id}`,
        seed.bracket_key,
      ]),
    )
    const slotById = new Map(slots.map(slot => [slot.id, slot]))
    const today = getTodayDateKey()

    const enrichedTournaments = inscribedTournaments.map((inscription): InscribedTournament => {
      if (inscription.tournament.type !== 'LONG') return inscription

      const inscriptionMatches = getVisibleNextMatches(matches.filter(match => (
        match.tournament_id === inscription.tournament.id && match.couple_id === inscription.couple_id
      )))
      const assignedBracket = seedByTournamentAndCouple.get(
        `${inscription.tournament.id}:${inscription.couple_id}`,
      )
      const tournamentFechas = fechas.filter(fecha => fecha.tournament_id === inscription.tournament.id)
      const fechaCandidates: PlayerPanelFechaCandidate[] = tournamentFechas.map(fecha => {
        const fechaSlots = slots.filter(slot => slot.fecha_id === fecha.id)
        const playableSlotIds = fechaSlots
          .filter(slot => slot.slot_type === 'TIME_RANGE')
          .map(slot => slot.id)
        const respondedPlayableSlotIds = availabilityRows
          .filter(row => (
            row.couple_id === inscription.couple_id &&
            playableSlotIds.includes(row.time_slot_id)
          ))
          .map(row => row.time_slot_id)
        const freeDateSelected = availabilityRows.some(row => (
          row.couple_id === inscription.couple_id &&
          row.is_available &&
          slotById.get(row.time_slot_id)?.fecha_id === fecha.id &&
          slotById.get(row.time_slot_id)?.slot_type === 'FREE_DATE'
        ))
        const isGoldSilverFecha = fecha.round_type !== 'ZONE' && ['GOLD', 'SILVER'].includes(fecha.bracket_key || '')

        return {
          id: fecha.id,
          name: fecha.name || `Fecha ${fecha.fecha_number || ''}`.trim(),
          fechaNumber: fecha.fecha_number || 0,
          startDate: fecha.start_date,
          endDate: fecha.end_date,
          status: fecha.status || 'NOT_STARTED',
          isApplicable: !isGoldSilverFecha || assignedBracket === fecha.bracket_key,
          playableSlotIds,
          respondedPlayableSlotIds,
          freeDateSelected,
        }
      })
      const resolution = resolvePlayerPanelAgenda({
        isLongTournament: true,
        isEliminated: eliminatedByInscriptionId.get(inscription.inscription_id) || false,
        today,
        matches: inscriptionMatches.map(match => ({
          id: match.match_id,
          scheduledDate: match.scheduled_info.date || null,
          scheduledStartTime: match.scheduled_info.time || null,
        })),
        fechas: fechaCandidates,
      })
      const scheduledMatchIds = new Set(resolution.scheduledMatchIds)
      const availabilityFecha = resolution.availabilityFechaId
        ? fechaCandidates.find(fecha => fecha.id === resolution.availabilityFechaId) || null
        : null

      return {
        ...inscription,
        agenda: {
          state: resolution.state,
          scheduled_matches: inscriptionMatches.filter(match => scheduledMatchIds.has(match.match_id)),
          availability: availabilityFecha
            ? {
                fecha_id: availabilityFecha.id,
                fecha_name: availabilityFecha.name,
                start_date: availabilityFecha.startDate,
                end_date: availabilityFecha.endDate,
                total_slots: availabilityFecha.playableSlotIds.length,
                href: `/tournaments/${inscription.tournament.id}/schedules?fecha_id=${availabilityFecha.id}`,
              }
            : null,
        },
      }
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
    const tournaments = await getTenantUpcomingTournamentSummaries(8, {
      genderFilter: explicitGenderFilter,
      priorityGender: explicitGenderFilter ? null : options.playerGender ?? null,
      statusMode: branding.key === "padel-fv" ? "active" : "upcoming",
    })

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

    let inscribedTournamentIds = new Set<string>()
    if (coupleIds.length > 0) {
      const { data: inscriptions, error: inscriptionsError } = await supabase
        .from('inscriptions')
        .select('tournament_id')
        .in('couple_id', coupleIds)
        .in('tournament_id', tournamentIds)

      if (inscriptionsError) {
        console.error('Error fetching player inscriptions:', inscriptionsError)
      } else {
        inscribedTournamentIds = new Set((inscriptions || []).map((inscription: any) => inscription.tournament_id))
      }
    }

    const upcomingTournaments: UpcomingTournament[] = tournaments.map((tournament) => {
      const currentInscriptions = tournament.currentParticipants || 0
      const maxParticipants =
        typeof tournament.maxParticipants === 'number' ? tournament.maxParticipants : null
      const capacity = buildTournamentCapacitySummary(maxParticipants, currentInscriptions)
      const hideVenue = Boolean(tournament.hideVenue)

      return {
        id: tournament.id,
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
        is_inscribed: inscribedTournamentIds.has(tournament.id),
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
  options: { includeNextMatches?: boolean } = {},
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
        nextMatch: null,
        error: 'Jugador no encontrado',
      }
    }

    const nextMatchResult = options.includeNextMatches === false
      ? { nextMatches: [] as PlayerNextMatch[], error: undefined }
      : await getPlayerNextMatch(playerData.id)

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
