import "server-only"

import { supabaseAdmin } from "@/lib/supabase-admin"
import { attachCollectionFinancials } from "@/lib/billing/financials"
import { getPendingBillingWeeks } from "@/lib/billing/payment-details"
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
  BillingCollection,
  BillingCollectionStatus,
  BillingDashboardData,
  BillingInstallment,
  BillingInstallmentStatus,
  BillingInscription,
  BillingItem,
  BillingModel,
  BillingSettings,
  BillingSnapshot,
  BillingTournamentRow,
} from "@/lib/billing/types"

const TOURNAMENT_SELECT =
  "id, name, type, status, created_at, start_date, organization_id, organizador_id, es_prueba, clubes(name)"

const INSCRIPTION_SELECT = `
  tournament_id,
  player_id,
  couple_id,
  es_prueba,
  occupies_slot,
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

const fetchBillingPages = async <T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> => {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data || []) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

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

interface BillingCollectionRow {
  id: string
  organizer_id: string | null
  organizer_label: string
  tournament_subtotal_ars: number
  maintenance_amount_per_installment_ars: number
  total_amount_ars: number
  amount_paid_ars: number
  balance_ars: number
  status: BillingCollectionStatus
  created_at: string
}

interface BillingCollectionTournamentRow {
  collection_id: string
  tournament_id: string
  amount_ars: number
  tournament_name: string
  club_name: string
  billable_units: number
  tournament_status: string
}

interface BillingInstallmentRow {
  id: string
  collection_id: string
  installment_number: number
  amount_ars: number
  status: BillingInstallmentStatus
  issued_at: string | null
  paid_at: string | null
  billing_month?: string | null
  maintenance_amount_ars?: number
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
  createIfMissing = true,
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

  if (!createIfMissing) {
    return {
      organizationId: context.organizationId, billingModel: context.billingModel, currency: "ARS",
      ...BILLING_DEFAULTS, updatedAt: "",
    }
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

const fetchTenantCollections = async (organizationId: string): Promise<{ collections: BillingCollection[]; monthlyMaintenanceAvailable: boolean }> => {
  const rows = await fetchBillingPages<BillingCollectionRow>((from, to) => supabaseAdmin
    .from("billing_collections")
    .select("id, organizer_id, organizer_label, tournament_subtotal_ars, maintenance_amount_per_installment_ars, total_amount_ars, amount_paid_ars, balance_ars, status, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to))
  // Probe only the new columns; older deployments can still show accurate partial balances.
  const { error: schemaError } = await supabaseAdmin.from("billing_collection_installments")
    .select("billing_month, maintenance_amount_ars").limit(0)
  const monthlyMaintenanceAvailable = !schemaError
  if (schemaError && !(schemaError.code === "42703" || schemaError.code === "PGRST204")) throw schemaError
  if (rows.length === 0) return { collections: [], monthlyMaintenanceAvailable }
  const collectionIds = rows.map((collection) => collection.id)
  const tournaments: BillingCollectionTournamentRow[] = []
  const installments: BillingInstallmentRow[] = []
  for (let index = 0; index < collectionIds.length; index += 100) {
    const chunk = collectionIds.slice(index, index + 100)
    const [tournamentRows, installmentRows] = await Promise.all([
      fetchBillingPages<BillingCollectionTournamentRow>((from, to) => supabaseAdmin
        .from("billing_collection_tournaments")
        .select("collection_id, tournament_id, amount_ars, tournament_name, club_name, billable_units, tournament_status")
        .in("collection_id", chunk).order("id", { ascending: true }).range(from, to)),
      fetchBillingPages<BillingInstallmentRow>((from, to) => supabaseAdmin
        .from("billing_collection_installments")
        .select(monthlyMaintenanceAvailable
          ? "id, collection_id, installment_number, amount_ars, status, issued_at, paid_at, billing_month, maintenance_amount_ars"
          : "id, collection_id, installment_number, amount_ars, status, issued_at, paid_at")
        .in("collection_id", chunk).order("id", { ascending: true }).range(from, to)),
    ])
    tournaments.push(...tournamentRows)
    installments.push(...installmentRows)
  }

  const collectionIdSet = new Set(collectionIds)
  const tournamentsByCollection = new Map<string, BillingCollectionTournamentRow[]>()
  const installmentsByCollection = new Map<string, BillingInstallmentRow[]>()

  for (const tournament of tournaments) {
    if (!collectionIdSet.has(tournament.collection_id)) continue
    const current = tournamentsByCollection.get(tournament.collection_id) || []
    current.push(tournament)
    tournamentsByCollection.set(tournament.collection_id, current)
  }

  for (const installment of installments) {
    if (!collectionIdSet.has(installment.collection_id)) continue
    const current = installmentsByCollection.get(installment.collection_id) || []
    current.push(installment)
    installmentsByCollection.set(installment.collection_id, current)
  }

  return { monthlyMaintenanceAvailable, collections: rows.map((collection) => ({
    id: collection.id,
    organizerId: collection.organizer_id,
    organizerLabel: collection.organizer_label,
    tournamentSubtotalArs: collection.tournament_subtotal_ars,
    maintenanceAmountPerInstallmentArs: collection.maintenance_amount_per_installment_ars,
    totalAmountArs: collection.total_amount_ars,
    amountPaidArs: collection.amount_paid_ars,
    balanceArs: collection.balance_ars,
    status: collection.status,
    createdAt: collection.created_at,
    tournaments: (tournamentsByCollection.get(collection.id) || []).map((tournament) => ({
      tournamentId: tournament.tournament_id,
      tournamentName: tournament.tournament_name,
      clubName: tournament.club_name,
      billableUnits: tournament.billable_units,
      tournamentStatus: tournament.tournament_status,
      amountArs: tournament.amount_ars,
    })),
    installments: (installmentsByCollection.get(collection.id) || []).sort((a, b) => a.installment_number - b.installment_number).map((installment): BillingInstallment => ({
      id: installment.id,
      installmentNumber: installment.installment_number,
      amountArs: installment.amount_ars,
      status: installment.status,
      issuedAt: installment.issued_at,
      paidAt: installment.paid_at,
      billingMonth: installment.billing_month || null,
      maintenanceAmountArs: installment.maintenance_amount_ars ?? collection.maintenance_amount_per_installment_ars,
    })),
  })) }
}

const fetchOrganizerLabels = async (organizerIds: string[]) => {
  if (organizerIds.length === 0) return new Map<string, string>()
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, email")
    .in("id", organizerIds)

  if (error) throw error
  return new Map((data || []).map((user) => [user.id, user.email || "Organizador sin email"]))
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
  options?: { readOnly?: boolean },
): Promise<BillingDashboardData> => {
  const context = await getBillingContext()
  const settings = await getOrCreateBillingSettings(context, !options?.readOnly)
  const week = context.billingModel === "TPE_PLAYER" ? getWeekRange(requestedWeekStart) : null

  const [charges, tournaments, collectionData] = await Promise.all([
    fetchTenantCharges(context.organizationId),
    fetchTenantTournaments(context),
    context.billingModel === "FV_LEAGUE" ? fetchTenantCollections(context.organizationId)
      : Promise.resolve({ collections: [] as BillingCollection[], monthlyMaintenanceAvailable: false }),
  ])
  const { collections, monthlyMaintenanceAvailable } = collectionData
  const collectionTournamentIds = new Set(collections.flatMap((c) => c.tournaments.map((t) => t.tournamentId)))
  const organizerLabels = await fetchOrganizerLabels(
    Array.from(new Set(tournaments.map((tournament) => tournament.organizador_id).filter(Boolean))) as string[],
  )
  const chargeByTournament = new Map(charges.map((charge) => [charge.tournament_id, charge]))

  const visibleTournaments = tournaments.filter((tournament) => {
    const charge = chargeByTournament.get(tournament.id)
    const isEligible = isTournamentEligibleForBilling(tournament, context.billingModel)
    if (!isEligible && !charge && !collectionTournamentIds.has(tournament.id)) return false

    if (!week) return true
    if (charge?.period_start === week.start) return true
    return isEligible && isStartDateInWeek(tournament.start_date, week.start, week.end)
  })

  // El resumen de deuda abarca todas las semanas, aunque se esté consultando otra.
  const calculationTournaments = context.billingModel === "TPE_PLAYER"
    ? tournaments.filter((tournament) => isTournamentEligibleForBilling(tournament, context.billingModel) || chargeByTournament.has(tournament.id))
    : visibleTournaments
  const inscriptions = await fetchInscriptions(calculationTournaments.map((tournament) => tournament.id))
  const inscriptionsByTournament = new Map<string, BillingInscription[]>()

  for (const inscription of inscriptions) {
    const current = inscriptionsByTournament.get(inscription.tournament_id) || []
    current.push(inscription)
    inscriptionsByTournament.set(inscription.tournament_id, current)
  }

  const calculatedItems: BillingItem[] = calculationTournaments.map((tournament) => {
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
      organizerId: tournament.organizador_id,
      organizerLabel: tournament.organizador_id
        ? organizerLabels.get(tournament.organizador_id) || "Organizador sin email"
        : null,
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
      financialStatus: charge?.status || "PENDING",
      amountPaidArs: charge?.status === "PAID" ? snapshot.amountArs : 0,
      balanceArs: !charge || charge.status === "PENDING" ? snapshot.amountArs : 0,
      collectionId: null,
      paidInstallments: 0,
      totalInstallments: 0,
    }
  })

  const pendingWeeks = context.billingModel === "TPE_PLAYER"
    ? getPendingBillingWeeks(calculatedItems, getWeekRange().start)
    : []
  const visibleTournamentIds = new Set(visibleTournaments.map((tournament) => tournament.id))
  const items = calculatedItems.filter((item) => visibleTournamentIds.has(item.tournamentId))
  const visibleIds = new Set(items.map((item) => item.tournamentId))
  for (const collection of collections) {
    for (const tournament of collection.tournaments) {
      if (visibleIds.has(tournament.tournamentId)) continue
      const charge = chargeByTournament.get(tournament.tournamentId)
      items.push({
        tournamentId: tournament.tournamentId, tournamentName: tournament.tournamentName,
        clubName: tournament.clubName, tournamentStatus: tournament.tournamentStatus,
        organizerId: collection.organizerId, organizerLabel: collection.organizerLabel,
        createdAt: collection.createdAt, startDate: null, status: charge?.status || "PENDING",
        resolvedAt: charge?.resolved_at || null, updatedAt: charge?.updated_at || null,
        isEligible: false, billingModel: context.billingModel, billableUnits: tournament.billableUnits,
        pricingRule: tournament.billableUnits <= 16 ? "FV_UP_TO_16" : "FV_OVER_16",
        unitAmountArs: tournament.amountArs, amountArs: tournament.amountArs,
        periodStart: null, periodEnd: null, financialStatus: "PENDING", amountPaidArs: 0,
        balanceArs: tournament.amountArs, collectionId: null, paidInstallments: 0, totalInstallments: 0,
      })
      visibleIds.add(tournament.tournamentId)
    }
  }

  return {
    tenantKey: context.tenantKey,
    tenantName: context.tenantName,
    organizationId: context.organizationId,
    billingModel: context.billingModel,
    settings,
    items: attachCollectionFinancials(items, collections),
    collections,
    monthlyMaintenanceAvailable,
    weekStart: week?.start || null,
    weekEnd: week?.end || null,
    pendingWeeks,
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
