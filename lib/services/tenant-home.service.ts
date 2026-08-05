import "server-only"

import { supabaseAdmin } from "@/lib/supabase-admin"
import { createClient } from "@/utils/supabase/server"
import { getTenantOrganization } from "@/lib/services/tenant-organization.service"
import { getTournamentCategoryDisplay } from "@/lib/services/tournament-category-config"
import {
  buildTournamentCapacitySummary,
  getTournamentCoupleCounts,
} from "@/lib/services/tournament-capacity.service"
import type { PublicTournamentSummary } from "@/types/public-tournament"
import {
  getTournamentGenderPriority,
  isTournamentGenderFilter,
  prioritizeTournamentsByGender,
  type TournamentGenderFilter,
} from "@/lib/tournaments/gender-filtering"
import { getTenantBranding } from "@/config/tenant"

export interface TenantClub {
  id: string
  name: string
  address: string | null
  courts: number | null
  cover_image_url: string | null
}

export interface TenantRankingPlayer {
  id: string
  first_name: string | null
  last_name: string | null
  score: number | null
  category_name: string | null
  club_name: string | null
  profile_image_url: string | null
}

export interface TenantWeeklyMatchPlayer {
  id: string | null
  firstName: string
  lastName: string
  imageUrl: string | null
}

export interface TenantWeeklyMatchCouple {
  id: string | null
  players: TenantWeeklyMatchPlayer[]
  placeholderLabel: string | null
}

export interface TenantWeeklyMatch {
  id: string
  tournamentId: string
  tournamentName: string
  category: string | null
  stage: string
  status: string
  scheduledDate: string
  scheduledStartTime: string | null
  scheduledEndTime: string | null
  courtAssignment: string | null
  clubId: string
  clubName: string
  clubAddress: string | null
  couple1: TenantWeeklyMatchCouple
  couple2: TenantWeeklyMatchCouple
}

export interface TenantWeeklyMatchesClubGroup {
  clubId: string
  clubName: string
  clubAddress: string | null
  matches: TenantWeeklyMatch[]
}

export interface TenantHomeData {
  organization: {
    id: string
    slug: string | null
    name: string
    description: string | null
    logo_url: string | null
  } | null
  tournaments: PublicTournamentSummary[]
  clubs: TenantClub[]
  ranking: TenantRankingPlayer[]
}

interface TenantUpcomingTournamentSummaryOptions {
  genderFilter?: TournamentGenderFilter | null
  priorityGender?: string | null
  statusMode?: "upcoming" | "active"
}

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires"

const unwrapRelation = <T>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10)

const getArgentinaTodayAsUtcDate = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ARGENTINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const year = Number(values.year)
  const month = Number(values.month)
  const day = Number(values.day)

  return new Date(Date.UTC(year, month - 1, day, 12))
}

const getCurrentArgentinaWeekRange = () => {
  const today = getArgentinaTodayAsUtcDate()
  const daysFromMonday = (today.getUTCDay() + 6) % 7
  const start = new Date(today)
  start.setUTCDate(today.getUTCDate() - daysFromMonday)

  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)

  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
  }
}

const getRoundDisplayName = (round: string | null | undefined) => {
  const roundNames: Record<string, string> = {
    ZONE: "Zona",
    "32VOS": "32vos de Final",
    "16VOS": "16vos de Final",
    "8VOS": "Octavos de Final",
    "4TOS": "Cuartos de Final",
    SEMIFINAL: "Semifinal",
    FINAL: "Final",
  }

  return roundNames[round || ""] || round || "Instancia a confirmar"
}

const toWeeklyMatchPlayer = (player: any): TenantWeeklyMatchPlayer | null => {
  if (!player) return null

  return {
    id: player.id || null,
    firstName: player.first_name || "",
    lastName: player.last_name || "",
    imageUrl: player.profile_image_url || null,
  }
}

const toWeeklyMatchCouple = (
  couple: any,
  placeholderLabel: string | null | undefined,
): TenantWeeklyMatchCouple => {
  const normalizedCouple = unwrapRelation<any>(couple)
  const players = [
    toWeeklyMatchPlayer(unwrapRelation<any>(normalizedCouple?.player1)),
    toWeeklyMatchPlayer(unwrapRelation<any>(normalizedCouple?.player2)),
  ].filter((player): player is TenantWeeklyMatchPlayer => Boolean(player))

  return {
    id: normalizedCouple?.id || null,
    players,
    placeholderLabel: placeholderLabel || null,
  }
}

export async function getTenantUpcomingTournamentSummaries(
  limit: number = 12,
  options: TenantUpcomingTournamentSummaryOptions = {},
): Promise<PublicTournamentSummary[]> {
  const supabase = await createClient()
  const organization = await getTenantOrganization()
  const explicitGenderFilter = isTournamentGenderFilter(options.genderFilter) ? options.genderFilter : null
  const statusMode = options.statusMode || "upcoming"
  const dbStatuses =
    statusMode === "active"
      ? ["NOT_STARTED", "IN_PROGRESS", "ZONE_PHASE", "BRACKET_PHASE"]
      : ["NOT_STARTED"]
  const shouldPrioritizeByGender =
    !explicitGenderFilter && Boolean(getTournamentGenderPriority(options.priorityGender))

  if (!organization) {
    return []
  }

  let query = supabase
    .from("tournaments")
    .select(`
      id,
      name,
      status,
      category_name,
      category_config,
      gender,
      type,
      start_date,
      end_date,
      price,
      award,
      max_participants,
      hide_venue,
      enable_public_inscriptions,
      show_few_slots_alert,
      enable_transfer_proof,
      transfer_alias,
      transfer_amount,
      clubes(id, name, address)
    `)
    .eq("organization_id", organization.id)
    .in("status", dbStatuses)
    .neq("is_draft", true)
    .order("start_date", { ascending: true })

  if (explicitGenderFilter) {
    query = query.eq("gender", explicitGenderFilter)
  }

  if (!shouldPrioritizeByGender) {
    query = query.limit(limit)
  }

  const { data, error } = await query

  if (error) {
    console.error("Error fetching tenant upcoming tournament summaries:", error)
    return []
  }

  const orderedTournaments = shouldPrioritizeByGender
    ? prioritizeTournamentsByGender(data || [], options.priorityGender).slice(0, limit)
    : data || []

  const countsByTournament = await getTournamentCoupleCounts(
    supabase,
    orderedTournaments.map((tournament: any) => tournament.id),
  )

  return orderedTournaments.map((tournament: any) => {
    const club = Array.isArray(tournament.clubes) ? tournament.clubes[0] || null : tournament.clubes || null
    const categoryDisplay = getTournamentCategoryDisplay(tournament)
    const hideVenue = Boolean(tournament.hide_venue)
    const currentParticipants = countsByTournament[tournament.id] || 0
    const capacity = buildTournamentCapacitySummary(tournament.max_participants, currentParticipants)

    return {
      id: tournament.id,
      name: tournament.name,
      status: tournament.status,
      category: categoryDisplay,
      categoryName: categoryDisplay,
      gender: tournament.gender,
      type: tournament.type || "LONG",
      startDate: tournament.start_date,
      endDate: tournament.end_date,
      price: tournament.price,
      award: tournament.award,
      hideVenue,
      enablePublicInscriptions: Boolean(tournament.enable_public_inscriptions),
      currentParticipants: capacity.currentParticipants,
      maxParticipants: capacity.maxParticipants,
      remainingSlots: capacity.remainingSlots,
      isFull: capacity.isFull,
      hasFewSlots: capacity.hasFewSlots,
      showFewSlotsAlert: tournament.show_few_slots_alert !== false,
      enableTransferProof: Boolean(tournament.enable_transfer_proof),
      transferAlias: tournament.transfer_alias,
      transferAmount: tournament.transfer_amount,
      club: club && !hideVenue
        ? {
            id: club.id || null,
            name: club.name || null,
            address: club.address || null,
          }
        : null,
    }
  })
}

export async function getTenantWeeklyMatchesByClub(): Promise<TenantWeeklyMatchesClubGroup[]> {
  const organization = await getTenantOrganization()

  if (!organization) {
    return []
  }

  const { startDate, endDate } = getCurrentArgentinaWeekRange()

  const { data, error } = await supabaseAdmin
    .from("fecha_matches")
    .select(`
      match_id,
      scheduled_date,
      scheduled_start_time,
      scheduled_end_time,
      court_assignment,
      matches!inner (
        id,
        status,
        round,
        club_id,
        tournament_id,
        placeholder_couple1_label,
        placeholder_couple2_label,
        tournaments!inner (
          id,
          name,
          category_name,
          category_config,
          organization_id,
          club_id,
          is_draft,
          clubes (
            id,
            name,
            address
          )
        ),
        club:clubes (
          id,
          name,
          address
        ),
        couple1:couples!matches_couple1_id_fkey (
          id,
          player1:players!couples_player1_id_fkey (
            id,
            first_name,
            last_name,
            profile_image_url
          ),
          player2:players!couples_player2_id_fkey (
            id,
            first_name,
            last_name,
            profile_image_url
          )
        ),
        couple2:couples!matches_couple2_id_fkey (
          id,
          player1:players!couples_player1_id_fkey (
            id,
            first_name,
            last_name,
            profile_image_url
          ),
          player2:players!couples_player2_id_fkey (
            id,
            first_name,
            last_name,
            profile_image_url
          )
        )
      )
    `)
    .gte("scheduled_date", startDate)
    .lte("scheduled_date", endDate)
    .neq("matches.status", "DRAFT")
    .order("scheduled_date", { ascending: true })
    .order("scheduled_start_time", { ascending: true, nullsFirst: false })
    .limit(200)

  if (error) {
    console.error("Error fetching tenant weekly matches:", error)
    return []
  }

  const matches = (data || []).flatMap((item: any): TenantWeeklyMatch[] => {
    const match = unwrapRelation<any>(item.matches)
    const tournament = unwrapRelation<any>(match?.tournaments)

    if (!match || !tournament || tournament.organization_id !== organization.id || tournament.is_draft === true) {
      return []
    }

    const matchClub = unwrapRelation<any>(match.club)
    const tournamentClub = unwrapRelation<any>(tournament.clubes)
    const club = matchClub || tournamentClub

    if (!club?.id || !item.scheduled_date) {
      return []
    }

    return [
      {
        id: match.id,
        tournamentId: tournament.id,
        tournamentName: tournament.name || "Torneo",
        category: getTournamentCategoryDisplay(tournament),
        stage: getRoundDisplayName(match.round),
        status: match.status || "PENDING",
        scheduledDate: item.scheduled_date,
        scheduledStartTime: item.scheduled_start_time || null,
        scheduledEndTime: item.scheduled_end_time || null,
        courtAssignment: item.court_assignment || null,
        clubId: club.id,
        clubName: club.name || "Club a confirmar",
        clubAddress: club.address || null,
        couple1: toWeeklyMatchCouple(match.couple1, match.placeholder_couple1_label),
        couple2: toWeeklyMatchCouple(match.couple2, match.placeholder_couple2_label),
      },
    ]
  })

  const groups = new Map<string, TenantWeeklyMatchesClubGroup>()

  for (const match of matches) {
    const existingGroup = groups.get(match.clubId)

    if (existingGroup) {
      existingGroup.matches.push(match)
      continue
    }

    groups.set(match.clubId, {
      clubId: match.clubId,
      clubName: match.clubName,
      clubAddress: match.clubAddress,
      matches: [match],
    })
  }

  return Array.from(groups.values()).sort((first, second) => first.clubName.localeCompare(second.clubName))
}

export async function getTenantHomeData(): Promise<TenantHomeData> {
  const supabase = await createClient()
  const organization = await getTenantOrganization()
  const branding = getTenantBranding()

  if (!organization) {
    return {
      organization: null,
      tournaments: [],
      clubs: [],
      ranking: [],
    }
  }

  const [tournaments, clubsResult] = await Promise.all([
    getTenantUpcomingTournamentSummaries(12, {
      statusMode: branding.key === "padel-fv" ? "active" : "upcoming",
    }),
    supabase
      .from("organization_clubs")
      .select("clubes(id, name, address, courts, cover_image_url)")
      .eq("organizacion_id", organization.id)
      .limit(6),
  ])

  const clubs = (clubsResult.data || [])
    .map((item: any) => item.clubes)
    .filter(Boolean)
    .map((club: any) => ({
      id: club.id,
      name: club.name,
      address: club.address,
      courts: club.courts,
      cover_image_url: club.cover_image_url,
    }))

  return {
    organization: {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      description: organization.description,
      logo_url: organization.logo_url,
    },
    tournaments,
    clubs,
    ranking: [],
  }
}
