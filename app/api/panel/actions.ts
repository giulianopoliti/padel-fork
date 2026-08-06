'use server'

import { createClient } from '@/utils/supabase/server'
import { getTenantBranding } from '@/config/tenant'
import { getTenantUpcomingTournamentSummaries } from '@/lib/services/tenant-home.service'
import { getTournamentCategoryDisplay } from '@/lib/services/tournament-category-config'
import { buildTournamentCapacitySummary } from '@/lib/services/tournament-capacity.service'
import {
  isTournamentGenderFilter,
  type TournamentGenderFilter,
} from '@/lib/tournaments/gender-filtering'

export type PlayerNextMatch = {
  match_id: string
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

const resolveTournamentCategoryDisplayMap = async (
  tournamentIds: string[],
): Promise<Record<string, string>> => {
  if (tournamentIds.length === 0) {
    return {}
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, category_name, category_config')
    .in('id', tournamentIds)

  if (error) {
    console.error('Error fetching tournament category display map:', error)
    return {}
  }

  return (data || []).reduce<Record<string, string>>((accumulator, tournament: any) => {
    const display = getTournamentCategoryDisplay(tournament)
    if (display) {
      accumulator[tournament.id] = display
    }

    return accumulator
  }, {})
}

export async function getPlayerNextMatch(playerId: string): Promise<PlayerNextMatchResult> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.functions.invoke('get-player-next-match', {
      body: { playerId },
    })

    if (error) {
      console.error('Edge function error:', error)
      return { nextMatches: [], error: 'Error al obtener proximos partidos' }
    }

    const result = data as PlayerNextMatchResult
    return {
      ...result,
      // The next match must always expose its assigned venue to the player.
      // The edge function already prioritizes the match club for multi-venue tournaments.
      nextMatches: getVisibleNextMatches(result.nextMatches),
    }
  } catch (error) {
    console.error('Error calling edge function:', error)
    return {
      nextMatches: [],
      error: 'Error inesperado al obtener proximos partidos',
    }
  }
}

export async function getPlayerInscribedTournaments(playerId: string): Promise<InscribedTournamentsResult> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.functions.invoke('get-player-inscribed-tournaments', {
      body: { playerId },
    })

    if (error) {
      console.error('Edge function error:', error)
      return {
        inscribedTournaments: [],
        error: 'Error al obtener torneos inscriptos',
      }
    }

    const result = data as InscribedTournamentsResult
    const inscribedTournaments = result.inscribedTournaments || []

    if (inscribedTournaments.length === 0) {
      return result
    }

    const tournamentIds = inscribedTournaments.map((inscription) => inscription.tournament.id)
    const [categoryDisplayMap, visibilityResult] = await Promise.all([
      resolveTournamentCategoryDisplayMap(tournamentIds),
      supabase
        .from('tournaments')
        .select('id, hide_venue')
        .in('id', tournamentIds),
    ])

    if (visibilityResult.error) {
      console.error('Error fetching inscribed tournament venue visibility:', visibilityResult.error)
    }

    const hideVenueByTournament = new Map(
      (visibilityResult.data || []).map((row: any) => [row.id, Boolean(row.hide_venue)]),
    )

    return {
      ...result,
      inscribedTournaments: inscribedTournaments.map((inscription) => ({
        ...inscription,
        tournament: {
          ...inscription.tournament,
          category_name:
            categoryDisplayMap[inscription.tournament.id] || inscription.tournament.category_name || '',
          hide_venue: Boolean(hideVenueByTournament.get(inscription.tournament.id)),
          club: hideVenueByTournament.get(inscription.tournament.id)
            ? {
                name: '',
                address: null,
              }
            : inscription.tournament.club,
        },
      })),
    }
  } catch (error) {
    console.error('Error calling edge function:', error)
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

export async function getPlayerDashboardData(userId: string) {
  try {
    const supabase = await createClient()

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

    const nextMatchResult = await getPlayerNextMatch(playerData.id)

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
