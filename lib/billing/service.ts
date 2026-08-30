import "server-only"

import { supabaseAdmin } from "@/lib/supabase-admin"
import { getTenantBranding } from "@/config/tenant"
import { getTenantOrganization } from "@/lib/services/tenant-organization.service"
import {
  BILLING_DEFAULTS,
  calculateBillingSnapshot,
  getBillingModelForTenant,
  getWeekRange,
  isStartDateInWeek,
  isTournamentEligibleForBilling,
} from "@/lib/billing/rules"
import type {
  BillingChargeRow,
  BillingDashboardData,
  BillingInscription,
  BillingItem,
  BillingModel,
  BillingSettings,
  BillingSnapshot,
  BillingTournamentRow,
} from "@/lib/billing/types"

const TOURNAMENT_SELECT =
  "id, name, type, status, created_at, start_date, organization_id, es_prueba, clubes(name)"

const INSCRIPTION_SELECT = `
  tournament_id,
  player_id,
  couple_id,
  es_prueba,
  couple:couples!inscriptions_couple_id_fkey(
    id,
    player1_id,
    player2_id,
    es_prueba,
    player1:players!couples_player1_id_fkey(id, es_prueba),
    player2:players!couples_player2_id_fkey(id, es_prueba)
  ),
  player:players!inscriptions_player_id_fkey(id, es_prueba)
`

const PAGE_SIZE = 1_000

interface BillingContext {
  tenantKey: "padel-fv" | "padel-elite"
  tenantName: string
  organizationId: string
  billingModel: BillingModel
}

interface BillingSettingsRow {
  organization_id: string
  billing_model: BillingModel
  currency: "ARS"
  fv_amount_up_to_16: number
  fv_amount_over_16: number
  tpe_amount_per_player: number
  updated_at: string
}

const toBillingSettings = (row: BillingSettingsRow): BillingSettings => ({
  organizationId: row.organization_id,
  billingModel: row.billing_model,
  currency: row.currency,
  fvAmountUpTo16: row.fv_amount_up_to_16,
  fvAmountOver16: row.fv_amount_over_16,
  tpeAmountPerPlayer: row.tpe_amount_per_player,
  updatedAt: row.updated_at,
})

const getClubName = (tournament: BillingTournamentRow) => {
  const club = Array.isArray(tournament.clubes) ? tournament.clubes[0] : tournament.clubes
  return club?.name?.trim() || "Sin club"
}

export const getBillingContext = async (): Promise<BillingContext> => {
  const branding = getTenantBranding()
  const organization = await getTenantOrganization()

  if (!organization) {
    throw new Error("No se pudo resolver la organización del tenant actual")
  }

  return {
    tenantKey: branding.key,
    tenantName: branding.shortName,
    organizationId: organization.id,
    billingModel: getBillingModelForTenant(branding.key),
  }
}

export const getOrCreateBillingSettings = async (
  context: BillingContext,
): Promise<BillingSettings> => {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("tenant_billing_settings")
    .select(
      "organization_id, billing_model, currency, fv_amount_up_to_16, fv_amount_over_16, tpe_amount_per_player, updated_at",
    )
    .eq("organization_id", context.organizationId)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing) {
    if (existing.billing_model !== context.billingModel) {
      throw new Error("La configuración de cobros no coincide con el tenant actual")
    }
    return toBillingSettings(existing as BillingSettingsRow)
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from("tenant_billing_settings")
    .insert({
      organization_id: context.organizationId,
      billing_model: context.billingModel,
      currency: "ARS",
      fv_amount_up_to_16: BILLING_DEFAULTS.fvAmountUpTo16,
      fv_amount_over_16: BILLING_DEFAULTS.fvAmountOver16,
      tpe_amount_per_player: BILLING_DEFAULTS.tpeAmountPerPlayer,
    })
    .select(
      "organization_id, billing_model, currency, fv_amount_up_to_16, fv_amount_over_16, tpe_amount_per_player, updated_at",
    )
    .single()

  if (createError) {
    if (createError.code === "23505") return getOrCreateBillingSettings(context)
    throw createError
  }

  return toBillingSettings(created as BillingSettingsRow)
}

const fetchInscriptions = async (tournamentIds: string[]) => {
  const inscriptions: BillingInscription[] = []
  const chunkSize = 100

  for (let index = 0; index < tournamentIds.length; index += chunkSize) {
    const chunk = tournamentIds.slice(index, index + chunkSize)
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabaseAdmin
        .from("inscriptions")
        .select(INSCRIPTION_SELECT)
        .in("tournament_id", chunk)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)

      if (error) throw error
      inscriptions.push(...((data || []) as unknown as BillingInscription[]))
      if (!data || data.length < PAGE_SIZE) break
    }
  }

  return inscriptions
}

const fetchTenantCharges = async (organizationId: string) => {
  const charges: BillingChargeRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("tournament_billing_charges")
      .select(
        "tournament_id, organization_id, billing_model, status, billable_units, pricing_rule, unit_amount_ars, amount_ars, period_start, period_end, resolved_at, updated_by, updated_at",
      )
      .eq("organization_id", organizationId)
      .order("tournament_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    charges.push(...((data || []) as BillingChargeRow[]))
    if (!data || data.length < PAGE_SIZE) break
  }
  return charges
}

const fetchTenantTournaments = async (context: BillingContext) => {
  const tournaments: BillingTournamentRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select(TOURNAMENT_SELECT)
      .eq("organization_id", context.organizationId)
      .eq("type", context.billingModel === "FV_LEAGUE" ? "LONG" : "AMERICAN")
      .eq("es_prueba", false)
      .order("start_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    tournaments.push(...((data || []) as BillingTournamentRow[]))
    if (!data || data.length < PAGE_SIZE) break
  }
  return tournaments
}

const getSnapshotFromStoredCharge = (charge: BillingChargeRow): BillingSnapshot => ({
  billingModel: charge.billing_model,
  billableUnits: charge.billable_units,
  pricingRule: charge.pricing_rule,
  unitAmountArs: charge.unit_amount_ars,
  amountArs: charge.amount_ars,
  periodStart: charge.period_start,
  periodEnd: charge.period_end,
})

export const getTenantBillingDashboard = async (
  requestedWeekStart?: string | null,
): Promise<BillingDashboardData> => {
  const context = await getBillingContext()
  const settings = await getOrCreateBillingSettings(context)
  const week = context.billingModel === "TPE_PLAYER" ? getWeekRange(requestedWeekStart) : null

  const [charges, tournaments] = await Promise.all([
    fetchTenantCharges(context.organizationId),
    fetchTenantTournaments(context),
  ])
  const chargeByTournament = new Map(charges.map((charge) => [charge.tournament_id, charge]))

  const visibleTournaments = tournaments.filter((tournament) => {
    const charge = chargeByTournament.get(tournament.id)
    const isEligible = isTournamentEligibleForBilling(tournament, context.billingModel)
    if (!isEligible && !charge) return false

    if (!week) return true
    if (charge?.period_start === week.start) return true
    return isEligible && isStartDateInWeek(tournament.start_date, week.start, week.end)
  })

  const inscriptions = await fetchInscriptions(visibleTournaments.map((tournament) => tournament.id))
  const inscriptionsByTournament = new Map<string, BillingInscription[]>()

  for (const inscription of inscriptions) {
    const current = inscriptionsByTournament.get(inscription.tournament_id) || []
    current.push(inscription)
    inscriptionsByTournament.set(inscription.tournament_id, current)
  }

  const items: BillingItem[] = visibleTournaments.map((tournament) => {
    const charge = chargeByTournament.get(tournament.id)
    const useStoredSnapshot = charge && charge.status !== "PENDING"
    const snapshot = useStoredSnapshot
      ? getSnapshotFromStoredCharge(charge)
      : calculateBillingSnapshot(
          context.billingModel,
          settings,
          inscriptionsByTournament.get(tournament.id) || [],
          tournament.start_date,
        )

    return {
      tournamentId: tournament.id,
      tournamentName: tournament.name || "Torneo sin nombre",
      clubName: getClubName(tournament),
      tournamentStatus: tournament.status,
      createdAt: tournament.created_at,
      startDate: tournament.start_date,
      status: charge?.status || "PENDING",
      resolvedAt: charge?.resolved_at || null,
      updatedAt: charge?.updated_at || null,
      isEligible: isTournamentEligibleForBilling(tournament, context.billingModel),
      ...snapshot,
    }
  })

  return {
    tenantKey: context.tenantKey,
    tenantName: context.tenantName,
    organizationId: context.organizationId,
    billingModel: context.billingModel,
    settings,
    items,
    weekStart: week?.start || null,
    weekEnd: week?.end || null,
  }
}

export const getFreshTournamentBillingSnapshot = async (
  tournamentId: string,
  context: BillingContext,
) => {
  const [{ data: tournament, error: tournamentError }, { data: charge, error: chargeError }, settings] =
    await Promise.all([
      supabaseAdmin
        .from("tournaments")
        .select(TOURNAMENT_SELECT)
        .eq("id", tournamentId)
        .eq("organization_id", context.organizationId)
        .maybeSingle(),
      supabaseAdmin
        .from("tournament_billing_charges")
        .select("tournament_id")
        .eq("tournament_id", tournamentId)
        .eq("organization_id", context.organizationId)
        .maybeSingle(),
      getOrCreateBillingSettings(context),
    ])

  if (tournamentError) throw tournamentError
  if (chargeError) throw chargeError
  if (!tournament) throw new Error("Torneo no encontrado para este tenant")

  const typedTournament = tournament as BillingTournamentRow
  const isEligible = isTournamentEligibleForBilling(typedTournament, context.billingModel)
  if (!isEligible && !charge) throw new Error("El torneo no cumple las reglas de cobro")
  if (context.billingModel === "TPE_PLAYER" && !typedTournament.start_date) {
    throw new Error("El torneo necesita una fecha de inicio para asignarlo a una semana")
  }

  const inscriptions = await fetchInscriptions([tournamentId])
  return {
    tournament: typedTournament,
    snapshot: calculateBillingSnapshot(
      context.billingModel,
      settings,
      inscriptions,
      typedTournament.start_date,
    ),
  }
}

export const buildChargePayload = ({
  tournament,
  snapshot,
  organizationId,
  status,
  adminUserId,
}: {
  tournament: BillingTournamentRow
  snapshot: BillingSnapshot
  organizationId: string
  status: "PENDING" | "PAID" | "DISMISSED"
  adminUserId: string
}) => ({
  tournament_id: tournament.id,
  organization_id: organizationId,
  billing_model: snapshot.billingModel,
  status,
  billable_units: snapshot.billableUnits,
  pricing_rule: snapshot.pricingRule,
  unit_amount_ars: snapshot.unitAmountArs,
  amount_ars: snapshot.amountArs,
  period_start: snapshot.periodStart,
  period_end: snapshot.periodEnd,
  resolved_at: status === "PENDING" ? null : new Date().toISOString(),
  updated_by: adminUserId,
})
