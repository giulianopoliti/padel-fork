import { createClient } from "@/utils/supabase/server"
import { applyLongMatchLineup, getLongMatchLineupChanges } from '@/lib/services/long-match-lineups'
import {
  applyOrganizerMatchesFilters,
  getDefaultOrganizerMatchesFilters,
  isOrganizerMatchesRangeInvalid,
  type OrganizerMatchCouple,
  type OrganizerClubOption,
  type OrganizerMatchRow,
  type OrganizerMatchesFilters,
} from "@/lib/organizer-matches-shared"

export interface OrganizerMatchesPageResult {
  matches: OrganizerMatchRow[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

type NameRelation = {
  first_name?: string | null
  last_name?: string | null
}

type PlayerPairRelation = {
  player1?: NameRelation | NameRelation[] | null
  player2?: NameRelation | NameRelation[] | null
}

const unwrapRelation = <T>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

const formatPlayerName = (player: NameRelation | null): string => {
  if (!player) return "Jugador pendiente"

  const fullName = [player.first_name, player.last_name].filter(Boolean).join(" ").trim()
  return fullName || "Jugador pendiente"
}

const formatCoupleDisplay = (couple: PlayerPairRelation | null): string => {
  if (!couple) return "Pareja pendiente"

  const player1 = unwrapRelation(couple.player1)
  const player2 = unwrapRelation(couple.player2)

  return `${formatPlayerName(player1)} / ${formatPlayerName(player2)}`
}

const toOrganizerMatchCouple = (couple: PlayerPairRelation | null): OrganizerMatchCouple | null => {
  if (!couple) return null

  const player1 = unwrapRelation(couple.player1)
  const player2 = unwrapRelation(couple.player2)

  return {
    player1: {
      first_name: player1?.first_name ?? "",
      last_name: player1?.last_name ?? "",
    },
    player2: {
      first_name: player2?.first_name ?? "",
      last_name: player2?.last_name ?? "",
    },
  }
}

const compareOrganizerMatches = (a: OrganizerMatchRow, b: OrganizerMatchRow): number => {
  const dateComparison = a.scheduledDate.localeCompare(b.scheduledDate)
  if (dateComparison !== 0) return dateComparison

  const timeA = a.scheduledStartTime ?? "99:99"
  const timeB = b.scheduledStartTime ?? "99:99"
  const timeComparison = timeA.localeCompare(timeB)
  if (timeComparison !== 0) return timeComparison

  const clubComparison = a.effectiveClubName.localeCompare(b.effectiveClubName)
  if (clubComparison !== 0) return clubComparison

  return a.tournamentName.localeCompare(b.tournamentName)
}

export async function getOrganizationClubs(organizationId: string): Promise<OrganizerClubOption[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("organization_clubs")
    .select(`
      club_id,
      clubes!inner(
        id,
        name
      )
    `)
    .eq("organizacion_id", organizationId)

  if (error) {
    throw new Error(`Error al cargar clubes de la organización: ${error.message}`)
  }

  const uniqueClubs = new Map<string, OrganizerClubOption>()

  for (const item of data || []) {
    const club = unwrapRelation<{ id: string; name: string }>(item.clubes)
    if (!club) continue
    uniqueClubs.set(club.id, { id: club.id, name: club.name })
  }

  return Array.from(uniqueClubs.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export async function getOrganizationScheduledMatches(
  organizationId: string,
  filters: OrganizerMatchesFilters = getDefaultOrganizerMatchesFilters(),
): Promise<OrganizerMatchRow[]> {
  const result = await getOrganizationScheduledMatchesPage(organizationId, filters, {
    page: 1,
    pageSize: 5000,
  })

  return result.matches
}

export async function getOrganizationScheduledMatchesPage(
  organizationId: string,
  filters: OrganizerMatchesFilters = getDefaultOrganizerMatchesFilters(),
  pagination?: {
    page?: number
    pageSize?: number
  },
): Promise<OrganizerMatchesPageResult> {
  const supabase = await createClient()
  const page = Math.max(1, pagination?.page ?? 1)
  const pageSize = Math.min(5000, Math.max(10, pagination?.pageSize ?? 25))
  const today = new Date().toLocaleDateString("en-CA")

  if (isOrganizerMatchesRangeInvalid(filters)) {
    return {
      matches: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
    }
  }

  const { data: tournamentsData, error: tournamentsError } = await supabase
    .from("tournaments")
    .select(`
      id,
      name,
      type,
      status,
      club_id,
      clubes:club_id(
        id,
        name
      )
    `)
    .eq("organization_id", organizationId)

  if (tournamentsError) {
    throw new Error(`Error al cargar torneos de la organización: ${tournamentsError.message}`)
  }

  const tournaments = tournamentsData || []
  if (tournaments.length === 0) {
    return {
      matches: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
    }
  }

  const tournamentMap = new Map<
    string,
    {
      id: string
      name: string
      type: string | null
      status: string | null
      clubId: string | null
      clubName: string | null
    }
  >()

  for (const tournament of tournaments) {
    const tournamentClub = unwrapRelation<{ id: string; name: string }>(tournament.clubes)

    tournamentMap.set(tournament.id, {
      id: tournament.id,
      name: tournament.name,
      type: tournament.type,
      status: tournament.status,
      clubId: tournament.club_id,
      clubName: tournamentClub?.name ?? null,
    })
  }

  let matchesQuery = supabase
    .from("matches")
    .select(`
      id,
      tournament_id,
      club_id,
      status,
      round,
      bracket_key,
      couple1_id,
      couple2_id,
      winner_id,
      result_couple1,
      result_couple2,
      fecha_matches!inner(
        scheduled_date,
        scheduled_start_time,
        scheduled_end_time,
        court_assignment
      ),
      couple1:couples!couple1_id(
        player1:players!couples_player1_id_fkey(
          first_name,
          last_name
        ),
        player2:players!couples_player2_id_fkey(
          first_name,
          last_name
        )
      ),
      couple2:couples!couple2_id(
        player1:players!couples_player1_id_fkey(
          first_name,
          last_name
        ),
        player2:players!couples_player2_id_fkey(
          first_name,
          last_name
        )
      )
    `)
    .in("tournament_id", tournaments.map((tournament) => tournament.id))

  const effectiveFromDate = !filters.includePast && filters.fromDate < today ? today : filters.fromDate

  matchesQuery = matchesQuery
    .gte("fecha_matches.scheduled_date", effectiveFromDate)
    .lte("fecha_matches.scheduled_date", filters.toDate)

  if (filters.status) {
    matchesQuery = matchesQuery.eq("status", filters.status)
  }

  if (filters.clubId) {
    const tournamentIdsWithClub = tournaments
      .filter((tournament) => tournament.club_id === filters.clubId)
      .map((tournament) => tournament.id)

    if (tournamentIdsWithClub.length > 0) {
      matchesQuery = matchesQuery.or(
        `club_id.eq.${filters.clubId},and(club_id.is.null,tournament_id.in.(${tournamentIdsWithClub.join(",")}))`,
      )
    } else {
      matchesQuery = matchesQuery.eq("club_id", filters.clubId)
    }
  }

  const { data: matchesData, error: matchesError } = await matchesQuery
    .order("scheduled_date", { foreignTable: "fecha_matches", ascending: true })
    .order("scheduled_start_time", { foreignTable: "fecha_matches", ascending: true, nullsFirst: false })

  if (matchesError) {
    throw new Error(`Error al cargar partidos programados: ${matchesError.message}`)
  }

  const matchClubIds = Array.from(
    new Set(
      (matchesData || [])
        .map((match) => match.club_id)
        .filter((clubId): clubId is string => Boolean(clubId)),
    ),
  )

  const matchClubMap = new Map<string, string>()

  if (matchClubIds.length > 0) {
    const { data: clubsData, error: clubsError } = await supabase
      .from("clubes")
      .select("id, name")
      .in("id", matchClubIds)

    if (clubsError) {
      throw new Error(`Error al cargar clubes de partidos: ${clubsError.message}`)
    }

    for (const club of clubsData || []) {
      matchClubMap.set(club.id, club.name)
    }
  }

  const lineups = await getLongMatchLineupChanges(supabase, (matchesData ?? [])
    .filter(match => tournamentMap.get(match.tournament_id)?.type === 'LONG').map(match => match.id))
  const rows: OrganizerMatchRow[] = []

  for (const match of matchesData || []) {
    const tournament = tournamentMap.get(match.tournament_id)
    if (!tournament) continue

    const schedule = unwrapRelation<{
      scheduled_date: string | null
      scheduled_start_time: string | null
      scheduled_end_time: string | null
      court_assignment: string | null
    }>(match.fecha_matches)

    if (!schedule?.scheduled_date) continue

    const effectiveClubId = match.club_id ?? tournament.clubId ?? null
    const effectiveClubName =
      (match.club_id ? matchClubMap.get(match.club_id) : null) ??
      tournament.clubName ??
      "Sin club asignado"
    const changes = lineups.get(match.id)
    const couple1 = applyLongMatchLineup(unwrapRelation<PlayerPairRelation>(match.couple1), match.couple1_id, changes)
    const couple2 = applyLongMatchLineup(unwrapRelation<PlayerPairRelation>(match.couple2), match.couple2_id, changes)

    rows.push({
      matchId: match.id,
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      tournamentType: tournament.type,
      tournamentStatus: tournament.status,
      scheduledDate: schedule.scheduled_date,
      scheduledStartTime: schedule.scheduled_start_time,
      scheduledEndTime: schedule.scheduled_end_time,
      courtAssignment: schedule.court_assignment,
      round: match.round,
      bracketKey: match.bracket_key,
      status: match.status,
      couple1Id: match.couple1_id,
      couple2Id: match.couple2_id,
      winnerId: match.winner_id,
      resultCouple1: match.result_couple1,
      resultCouple2: match.result_couple2,
      matchClubId: match.club_id,
      tournamentClubId: tournament.clubId,
      effectiveClubId,
      effectiveClubName,
      couple1Display: formatCoupleDisplay(couple1),
      couple2Display: formatCoupleDisplay(couple2),
      couple1: toOrganizerMatchCouple(couple1),
      couple2: toOrganizerMatchCouple(couple2),
    })
  }

  const filteredRows = applyOrganizerMatchesFilters(rows, filters).sort(compareOrganizerMatches)
  const totalCount = filteredRows.length
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0
  const from = (page - 1) * pageSize
  const paginatedMatches = filteredRows.slice(from, from + pageSize)

  return {
    matches: paginatedMatches,
    totalCount,
    page,
    pageSize,
    totalPages,
  }
}

export { applyOrganizerMatchesFilters } from "@/lib/organizer-matches-shared"
export {
  getRoundLabel,
  getStatusLabel,
  parseOrganizerMatchesFilters,
} from "@/lib/organizer-matches-shared"
export type {
  OrganizerClubOption,
  OrganizerMatchRow,
  OrganizerMatchesFilters,
} from "@/lib/organizer-matches-shared"
