import "server-only"

import { getTenantBranding } from "@/config/tenant"
import { getTenantOrganization } from "@/lib/services/tenant-organization.service"
import { createClientServiceRole } from "@/utils/supabase/server"

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

export interface PublicLongMatch {
  id: string
  type: string | null
  round: string | null
  bracketKey: string | null
  zoneId: string | null
  couple1Id: string | null
  couple2Id: string | null
  winnerId: string | null
  resultCouple1: string | null
  resultCouple2: string | null
  status: string | null
  court: string | null
  scheduledAt: string | null
  orderInRound: number | null
  sets: PublicLongSet[]
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

/**
 * Returns only the data intentionally shown in the public LONG-results pages.
 * The service-role client remains on the server and the tournament is scoped to
 * the active FV organization before any participant data is selected.
 */
export const getPublicLongResults = async (
  tournamentId: string,
): Promise<PublicLongResultsData | null> => {
  if (getTenantBranding().key !== "padel-fv") return null

  const organization = await getTenantOrganization()
  if (!organization) return null

  const supabase = await createClientServiceRole()
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name, type, status, organization_id, is_draft")
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
    supabase
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
        scheduled_at,
        order_in_round
      `)
      .eq("tournament_id", tournamentId)
      .eq("es_prueba", false)
      .neq("status", "DRAFT")
      .order("order_in_round", { ascending: true }),
  ])

  const queryError = [zonesResult.error, standingsResult.error, couplesResult.error, matchesResult.error]
    .find(Boolean)
  if (queryError) {
    console.error("[public-long-results] Results lookup failed:", queryError)
    return null
  }

  const matchRows = matchesResult.data || []
  const matchIds = matchRows.map((match: any) => match.id).filter(Boolean)
  const { data: setRows, error: setsError } = matchIds.length > 0
    ? await supabase
      .from("set_matches")
      .select("id, match_id, set_number, couple1_games, couple2_games")
      .in("match_id", matchIds)
      .order("set_number", { ascending: true })
    : { data: [], error: null }

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

  return {
    tournament: {
      id: tournament.id,
      name: tournament.name || "Torneo",
      status: tournament.status ?? null,
    },
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
      winnerId: match.winner_id ?? null,
      resultCouple1: match.result_couple1 ?? null,
      resultCouple2: match.result_couple2 ?? null,
      status: match.status ?? null,
      court: match.court ?? null,
      scheduledAt: match.scheduled_at ?? null,
      orderInRound: match.order_in_round ?? null,
      sets: (setsByMatchId.get(match.id) || []).sort((left, right) => left.setNumber - right.setNumber),
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
