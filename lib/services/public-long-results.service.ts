import "server-only"

import { getTenantBranding } from "@/config/tenant"
import { getTenantOrganization } from "@/lib/services/tenant-organization.service"
import { createClientServiceRole } from "@/utils/supabase/server"
import { getLongMatchLineupChanges } from './long-match-lineups'

export interface PublicLongPlayer {
  id: string
  firstName: string | null
  lastName: string | null
  profileImageUrl: string | null
}

export interface PublicLongCouple {
  id: string
  player1: PublicLongPlayer | null
  player2: PublicLongPlayer | null
}

export interface PublicLongSet {
  id: string
  setNumber: number
  couple1Games: number
  couple2Games: number
}

interface PublicLongFecha {
  id: string
  number: number
}

export type PublicLongFechaSelector = { id: string } | { number: number }

interface PublicLongMatchSchedule {
  fecha: PublicLongFecha | null
  date: string | null
  startTime: string | null
  endTime: string | null
  court: string | null
}

export interface PublicLongMatch {
  id: string
  type: string | null
  round: string | null
  bracketKey: string | null
  zoneId: string | null
  couple1Id: string | null
  couple2Id: string | null
  lineup1?: PublicLongCouple
  lineup2?: PublicLongCouple
  winnerId: string | null
  resultCouple1: string | null
  resultCouple2: string | null
  status: string | null
  court: string | null
  orderInRound: number | null
  sets: PublicLongSet[]
  schedule?: PublicLongMatchSchedule | null
}

export interface PublicLongStanding {
  coupleId: string
  position: number | null
  wins: number
  losses: number
  setsDifference: number
  gamesDifference: number
}

export interface PublicLongZone {
  id: string
  name: string
  standings: PublicLongStanding[]
}

export interface PublicLongResultsData {
  tournament: {
    id: string
    name: string
    status: string | null
  }
  zones: PublicLongZone[]
  couples: Record<string, PublicLongCouple>
  matches: PublicLongMatch[]
  fecha?: PublicLongFecha | null
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const toPlayer = (player: any): PublicLongPlayer | null => {
  if (!player?.id) return null

  return {
    id: player.id,
    firstName: player.first_name ?? null,
    lastName: player.last_name ?? null,
    profileImageUrl: player.profile_image_url ?? null,
  }
}

const toCouple = (couple: any): PublicLongCouple | null => {
  if (!couple?.id) return null

  return {
    id: couple.id,
    player1: toPlayer(couple.players_player1),
    player2: toPlayer(couple.players_player2),
  }
}

interface FechaRow {
  id: string
  fecha_number: number
  tournament_id: string
}

interface MatchScheduleRow {
  fecha_id: string | null
  scheduled_date: string | null
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  court_assignment: string | null
  tournament_fechas: FechaRow | FechaRow[] | null
}

const firstRelation = <T>(relation: T | T[] | null | undefined): T | null =>
  Array.isArray(relation) ? relation[0] ?? null : relation ?? null

const toPublishedSchedule = (
  relation: MatchScheduleRow | MatchScheduleRow[] | null,
  tournamentId: string,
  publicCourt: string | null,
  hideVenue: boolean,
): PublicLongMatchSchedule | null => {
  const schedule = firstRelation(relation)
  const court = hideVenue ? null : schedule?.court_assignment ?? publicCourt
  if (!schedule && !court) return null
  const fecha = firstRelation(schedule?.tournament_fechas)
  if (schedule?.fecha_id && (fecha?.id !== schedule.fecha_id || fecha.tournament_id !== tournamentId)) return null

  return {
    fecha: fecha ? { id: fecha.id, number: fecha.fecha_number } : null,
    date: schedule?.scheduled_date ?? null,
    startTime: schedule?.scheduled_start_time ?? null,
    endTime: schedule?.scheduled_end_time ?? null,
    court,
  }
}

/**
 * Returns public LONG results, optionally with the schedule of completed matches.
 * The service-role client remains on the server and the tournament is scoped to
 * the active FV organization before any participant data is selected.
 */
export const getPublicLongResults = async (
  tournamentId: string,
  {
    activeMatchesOnly = false,
    includeCompletedSchedule = false,
    fecha,
  }: {
    activeMatchesOnly?: boolean
    includeCompletedSchedule?: boolean
    fecha?: PublicLongFechaSelector
  } = {},
): Promise<PublicLongResultsData | null> => {
  if (getTenantBranding().key !== "padel-fv") return null

  const organization = await getTenantOrganization()
  if (!organization) return null

  const supabase = await createClientServiceRole()
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name, type, status, organization_id, is_draft, hide_venue")
    .eq("id", tournamentId)
    .eq("organization_id", organization.id)
    .eq("type", "LONG")
    .neq("is_draft", true)
    .maybeSingle()

  if (tournamentError || !tournament) {
    if (tournamentError) {
      console.error("[public-long-results] Tournament lookup failed:", tournamentError)
    }
    return null
  }

  const publicTournament = {
    id: tournament.id,
    name: tournament.name || "Torneo",
    status: tournament.status ?? null,
  }
  const withSchedule = includeCompletedSchedule || Boolean(fecha)
  let selectedFecha: PublicLongFecha | undefined
  if (fecha) {
    const fechaQuery = supabase
      .from("tournament_fechas")
      .select("id, fecha_number")
      .eq("tournament_id", tournamentId)
    const { data, error } = await ('id' in fecha ? fechaQuery.eq("id", fecha.id) : fechaQuery.eq("fecha_number", fecha.number)).maybeSingle()
    if (error) {
      console.error("[public-long-results] Fecha lookup failed:", error)
      return null
    }
    if (!data) return { tournament: publicTournament, fecha: null, zones: [], couples: {}, matches: [] }
    selectedFecha = { id: data.id, number: data.fecha_number }
  }

  // Scheduling fields are projected only for completed public results.
  const scheduleSelect = withSchedule
    ? `, fecha_matches${selectedFecha ? "!inner" : ""} (
        fecha_id, scheduled_date, scheduled_start_time, scheduled_end_time, court_assignment,
        tournament_fechas (id, fecha_number, tournament_id)
      )`
    : ""
  let matchesQuery = supabase
    .from("matches")
    .select(`
      id,
      type,
      round,
      bracket_key,
      zone_id,
      couple1_id,
      couple2_id,
      winner_id,
      result_couple1,
      result_couple2,
      status,
      court,
      order_in_round${scheduleSelect}
    `)
    .eq("tournament_id", tournamentId)
    .eq("es_prueba", false)
    .neq("status", "DRAFT")
  if (activeMatchesOnly) matchesQuery = matchesQuery.eq("bracket_is_active", true)
  if (withSchedule) matchesQuery = matchesQuery.in("status", ["FINISHED", "COMPLETED"])
  if (selectedFecha) matchesQuery = matchesQuery.eq("fecha_matches.fecha_id", selectedFecha.id)

  const [zonesResult, standingsResult, couplesResult, matchesResult] = await Promise.all([
    supabase
      .from("zones")
      .select("id, name")
      .eq("tournament_id", tournamentId)
      .order("name", { ascending: true }),
    supabase
      .from("zone_positions")
      .select("zone_id, couple_id, position, wins, losses, sets_difference, games_difference")
      .eq("tournament_id", tournamentId)
      .order("position", { ascending: true }),
    supabase
      .from("inscriptions")
      .select(`
        couple_id,
        couples:couple_id (
          id,
          players_player1:player1_id (
            id,
            first_name,
            last_name,
            profile_image_url
          ),
          players_player2:player2_id (
            id,
            first_name,
            last_name,
            profile_image_url
          )
        )
      `)
      .eq("tournament_id", tournamentId)
      .eq("is_pending", false)
      .not("couple_id", "is", null),
    matchesQuery.order("order_in_round", { ascending: true }).order("id"),
  ])

  const queryError = [zonesResult.error, standingsResult.error, couplesResult.error, matchesResult.error]
    .find(Boolean)
  if (queryError) {
    console.error("[public-long-results] Results lookup failed:", queryError)
    return null
  }

  const matchRows = matchesResult.data || []
  const matchIds = matchRows.map((match: any) => match.id).filter(Boolean)
  const [lineups, { data: setRows, error: setsError }] = await Promise.all([
    getLongMatchLineupChanges(supabase, matchIds),
    matchIds.length > 0
    ? supabase
      .from("set_matches")
      .select("id, match_id, set_number, couple1_games, couple2_games")
      .in("match_id", matchIds)
      .order("set_number", { ascending: true })
    : { data: [], error: null },
  ])

  if (setsError) {
    console.error("[public-long-results] Set lookup failed:", setsError)
    return null
  }

  const setsByMatchId = new Map<string, PublicLongSet[]>()
  ;(setRows || []).forEach((set: any) => {
    if (!set.match_id) return

    const currentSets = setsByMatchId.get(set.match_id) || []
    currentSets.push({
      id: set.id,
      setNumber: toNumber(set.set_number),
      couple1Games: toNumber(set.couple1_games),
      couple2Games: toNumber(set.couple2_games),
    })
    setsByMatchId.set(set.match_id, currentSets)
  })

  const couples: Record<string, PublicLongCouple> = {}
  ;(couplesResult.data || []).forEach((inscription: any) => {
    const couple = toCouple(inscription.couples)
    if (couple) couples[couple.id] = couple
  })

  const standingsByZone = new Map<string, PublicLongStanding[]>()
  ;(standingsResult.data || []).forEach((standing: any) => {
    if (!standing.zone_id || !standing.couple_id) return

    const currentStandings = standingsByZone.get(standing.zone_id) || []
    currentStandings.push({
      coupleId: standing.couple_id,
      position: standing.position ?? null,
      wins: toNumber(standing.wins),
      losses: toNumber(standing.losses),
      setsDifference: toNumber(standing.sets_difference),
      gamesDifference: toNumber(standing.games_difference),
    })
    standingsByZone.set(standing.zone_id, currentStandings)
  })

  const zones: PublicLongZone[] = (zonesResult.data || []).map((zone: any) => ({
    id: zone.id,
    name: zone.name || "Zona",
    standings: (standingsByZone.get(zone.id) || []).sort(
      (left, right) => (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER),
    ),
  }))

  const getMatchCouple = (matchId: string, coupleId: string | null) => {
    if (!coupleId || !couples[coupleId]) return undefined
    const change = lineups.get(matchId)?.find(lineup => lineup.couple_id === coupleId)
    if (!change) return undefined
    return { ...couples[coupleId], [change.slot === 1 ? 'player1' : 'player2']: toPlayer(change.player) }
  }

  return {
    tournament: publicTournament,
    ...(selectedFecha ? { fecha: selectedFecha } : {}),
    zones,
    couples,
    matches: matchRows.map((match: any) => ({
      id: match.id,
      type: match.type ?? null,
      round: match.round ?? null,
      bracketKey: match.bracket_key ?? null,
      zoneId: match.zone_id ?? null,
      couple1Id: match.couple1_id ?? null,
      couple2Id: match.couple2_id ?? null,
      lineup1: getMatchCouple(match.id, match.couple1_id),
      lineup2: getMatchCouple(match.id, match.couple2_id),
      winnerId: match.winner_id ?? null,
      resultCouple1: match.result_couple1 ?? null,
      resultCouple2: match.result_couple2 ?? null,
      status: match.status ?? null,
      court: match.court ?? null,
      orderInRound: match.order_in_round ?? null,
      sets: (setsByMatchId.get(match.id) || []).sort((left, right) => left.setNumber - right.setNumber),
      ...(withSchedule ? {
        schedule: toPublishedSchedule(match.fecha_matches, tournamentId, match.court ?? null, Boolean(tournament.hide_venue)),
      } : {}),
    })),
  }
}

export const getPublicLongCoupleResults = async (tournamentId: string, coupleId: string) => {
  const results = await getPublicLongResults(tournamentId)
  if (!results?.couples[coupleId]) return null

  return {
    ...results,
    couple: results.couples[coupleId],
    matches: results.matches.filter(
      (match) => match.couple1Id === coupleId || match.couple2Id === coupleId,
    ),
  }
}
