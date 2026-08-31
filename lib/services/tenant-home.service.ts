import { createClient } from "@/utils/supabase/server"
import { getTenantBranding } from "@/config/tenant"
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

export interface TenantRankingPlayer {
  id: string
  first_name: string | null
  last_name: string | null
  score: number | null
  category_name: string | null
  club_name: string | null
  profile_image_url: string | null
}

export interface TenantHomeData {
  organization: {
    id: string
    slug: string | null
    name: string
    description: string | null
    logo_url: string | null
  } | null
  upcomingTournaments: PublicTournamentSummary[]
  inProgressTournaments: PublicTournamentSummary[]
  ranking: TenantRankingPlayer[]
}

interface TenantTournamentSummaryOptions {
  genderFilter?: TournamentGenderFilter | null
  priorityGender?: string | null
  statuses: string[]
  tournamentType?: "LONG" | "AMERICAN"
}

interface TenantUpcomingTournamentSummaryOptions {
  genderFilter?: TournamentGenderFilter | null
  priorityGender?: string | null
  statusMode?: "upcoming" | "active"
}

export async function getTenantTournamentSummaries(
  limit: number = 12,
  options: TenantTournamentSummaryOptions,
): Promise<PublicTournamentSummary[]> {
  const supabase = await createClient()
  const organization = await getTenantOrganization()
  const explicitGenderFilter = isTournamentGenderFilter(options.genderFilter) ? options.genderFilter : null
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
      registration_locked,
      bracket_status,
      show_few_slots_alert,
      enable_transfer_proof,
      transfer_alias,
      transfer_amount,
      clubes(id, name, address, formatted_address, google_place_id, latitude, longitude, maps_url)
    `)
    .eq("organization_id", organization.id)
    .in("status", options.statuses)
    .neq("is_draft", true)
    .order("start_date", { ascending: true })

  if (options.tournamentType) {
    query = query.eq("type", options.tournamentType)
  }

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
      registrationLocked: tournament.registration_locked,
      bracketStatus: tournament.bracket_status,
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
            formattedAddress: club.formatted_address || null,
            googlePlaceId: club.google_place_id || null,
            latitude: club.latitude || null,
            longitude: club.longitude || null,
            mapsUrl: club.maps_url || null,
          }
        : null,
    }
  })
}

// Kept for player panels, which intentionally retain their broader active-tournament view.
export async function getTenantUpcomingTournamentSummaries(
  limit: number = 12,
  options: TenantUpcomingTournamentSummaryOptions = {},
): Promise<PublicTournamentSummary[]> {
  const statuses = options.statusMode === "active"
    ? ["NOT_STARTED", "IN_PROGRESS", "ZONE_PHASE", "BRACKET_PHASE"]
    : ["NOT_STARTED"]

  return getTenantTournamentSummaries(limit, {
    genderFilter: options.genderFilter,
    priorityGender: options.priorityGender,
    statuses,
  })
}

async function getTenantHomeRanking(limit: number = 5): Promise<TenantRankingPlayer[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("players")
    .select("id, first_name, last_name, score, category_name, profile_image_url, clubes(name)")
    .eq("gender", "MALE")
    .or("es_prueba.eq.false,es_prueba.is.null")
    .not("score", "is", null)
    .order("score", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("Error fetching tenant home ranking:", error)
    return []
  }

  return (data || []).map((player: any) => ({
    id: player.id,
    first_name: player.first_name,
    last_name: player.last_name,
    score: player.score,
    category_name: player.category_name,
    club_name: player.clubes?.name || null,
    profile_image_url: player.profile_image_url,
  }))
}

export async function getTenantHomeData(): Promise<TenantHomeData> {
  const branding = getTenantBranding()
  const organization = await getTenantOrganization()

  if (!organization) {
    return {
      organization: null,
      upcomingTournaments: [],
      inProgressTournaments: [],
      ranking: [],
    }
  }

  const upcomingOptions: TenantTournamentSummaryOptions = branding.key === "padel-elite"
    ? { statuses: ["NOT_STARTED"], tournamentType: "AMERICAN" }
    : { statuses: ["NOT_STARTED", "ZONE_PHASE"] }

  const inProgressOptions: TenantTournamentSummaryOptions = branding.key === "padel-elite"
    ? { statuses: ["ZONE_PHASE", "IN_PROGRESS", "BRACKET_PHASE"], tournamentType: "AMERICAN" }
    : { statuses: ["IN_PROGRESS", "BRACKET_PHASE"] }

  const [upcomingTournaments, inProgressTournaments, ranking] = await Promise.all([
    getTenantTournamentSummaries(12, upcomingOptions),
    getTenantTournamentSummaries(12, inProgressOptions),
    getTenantHomeRanking(),
  ])

  return {
    organization: {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      description: organization.description,
      logo_url: organization.logo_url,
    },
    upcomingTournaments,
    inProgressTournaments,
    ranking,
  }
}
