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
      registration_locked,
      bracket_status,
      show_few_slots_alert,
      enable_transfer_proof,
      transfer_alias,
      transfer_amount,
      clubes(id, name, address)
    `)
    .eq("organization_id", organization.id)
    .in("status", dbStatuses)
    .neq("is_draft", true)
    .order(statusMode === "active" ? "created_at" : "start_date", { ascending: statusMode !== "active" })

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
          }
        : null,
    }
  })
}

export async function getTenantHomeData(): Promise<TenantHomeData> {
  const supabase = await createClient()
  const branding = getTenantBranding()
  const organization = await getTenantOrganization()

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
