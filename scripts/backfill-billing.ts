import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import {
  BILLING_DEFAULTS,
  FV_BACKFILL_CUTOFF_ISO,
  TPE_BACKFILL_END_EXCLUSIVE_ISO,
  calculateBillingSnapshot,
  getBillingModelForTenant,
} from "@/lib/billing/rules"
import type {
  BillingInscription,
  BillingSettings,
  BillingTournamentRow,
} from "@/lib/billing/types"

const getArgument = (name: string) => {
  const prefix = `--${name}=`
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
}

const tenant = getArgument("tenant")
if (tenant !== "padel-fv" && tenant !== "padel-elite") {
  throw new Error("Uso: npm run billing:backfill -- --tenant=padel-fv|padel-elite [--env=archivo] [--apply]")
}

const shouldApply = process.argv.includes("--apply")
const envPath = path.resolve(getArgument("env") || `.env.${tenant}.local`)
if (!fs.existsSync(envPath)) throw new Error(`No existe el archivo de entorno: ${envPath}`)

dotenv.config({ path: envPath, override: true })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const billingModel = getBillingModelForTenant(tenant)
const organizationIdFromEnv = process.env.TENANT_ORGANIZATION_ID?.trim()
const organizationSlug =
  process.env.TENANT_ORGANIZATION_SLUG?.trim() ||
  process.env.NEXT_PUBLIC_TENANT_ORGANIZATION_SLUG?.trim() ||
  tenant

const resolveOrganizationId = async () => {
  if (organizationIdFromEnv) return organizationIdFromEnv

  const { data, error } = await supabase
    .from("organizaciones")
    .select("id")
    .eq("slug", organizationSlug)
    .eq("is_active", true)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(`No se encontró la organización activa con slug ${organizationSlug}`)
  return data.id as string
}

const getSettings = async (organizationId: string): Promise<BillingSettings> => {
  const { data, error } = await supabase
    .from("tenant_billing_settings")
    .select(
      "organization_id, billing_model, currency, fv_amount_up_to_16, fv_amount_over_16, tpe_amount_per_player, updated_at",
    )
    .eq("organization_id", organizationId)
    .maybeSingle()

  if (error) throw error
  if (data) {
    if (data.billing_model !== billingModel) throw new Error("El modelo guardado no coincide con el tenant")
    return {
      organizationId: data.organization_id,
      billingModel: data.billing_model,
      currency: data.currency,
      fvAmountUpTo16: data.fv_amount_up_to_16,
      fvAmountOver16: data.fv_amount_over_16,
      tpeAmountPerPlayer: data.tpe_amount_per_player,
      updatedAt: data.updated_at,
    }
  }

  if (shouldApply) {
    const { error: insertError } = await supabase.from("tenant_billing_settings").upsert(
      {
        organization_id: organizationId,
        billing_model: billingModel,
        currency: "ARS",
        fv_amount_up_to_16: BILLING_DEFAULTS.fvAmountUpTo16,
        fv_amount_over_16: BILLING_DEFAULTS.fvAmountOver16,
        tpe_amount_per_player: BILLING_DEFAULTS.tpeAmountPerPlayer,
      },
      { onConflict: "organization_id", ignoreDuplicates: true },
    )
    if (insertError) throw insertError
  }

  return {
    organizationId,
    billingModel,
    currency: "ARS",
    fvAmountUpTo16: BILLING_DEFAULTS.fvAmountUpTo16,
    fvAmountOver16: BILLING_DEFAULTS.fvAmountOver16,
    tpeAmountPerPlayer: BILLING_DEFAULTS.tpeAmountPerPlayer,
    updatedAt: new Date().toISOString(),
  }
}

const fetchTournaments = async (organizationId: string) => {
  const statuses =
    billingModel === "FV_LEAGUE"
      ? ["ZONE_PHASE", "BRACKET_PHASE", "FINISHED_POINTS_PENDING", "FINISHED_POINTS_CALCULATED"]
      : [
          "NOT_STARTED",
          "ZONE_PHASE",
          "BRACKET_PHASE",
          "FINISHED_POINTS_PENDING",
          "FINISHED_POINTS_CALCULATED",
        ]

  let query = supabase
    .from("tournaments")
    .select("id, name, type, status, created_at, start_date, organization_id, es_prueba")
    .eq("organization_id", organizationId)
    .eq("type", billingModel === "FV_LEAGUE" ? "LONG" : "AMERICAN")
    .eq("es_prueba", false)
    .in("status", statuses)

  query =
    billingModel === "FV_LEAGUE"
      ? query.lt("created_at", FV_BACKFILL_CUTOFF_ISO)
      : query.lt("start_date", TPE_BACKFILL_END_EXCLUSIVE_ISO).not("start_date", "is", null)

  const { data, error } = await query.order("start_date", { ascending: true })
  if (error) throw error
  return (data || []) as BillingTournamentRow[]
}

const fetchInscriptions = async (tournamentIds: string[]) => {
  if (tournamentIds.length === 0) return []
  const rows: BillingInscription[] = []

  for (let index = 0; index < tournamentIds.length; index += 100) {
    const tournamentChunk = tournamentIds.slice(index, index + 100)
    for (let from = 0; ; from += 1_000) {
      const { data, error } = await supabase
        .from("inscriptions")
        .select(`
          id,
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
        `)
        .in("tournament_id", tournamentChunk)
        .order("id", { ascending: true })
        .range(from, from + 999)

      if (error) throw error
      rows.push(...((data || []) as unknown as BillingInscription[]))
      if (!data || data.length < 1_000) break
    }
  }

  return rows
}

const run = async () => {
  const organizationId = await resolveOrganizationId()
  const [settings, tournaments] = await Promise.all([
    getSettings(organizationId),
    fetchTournaments(organizationId),
  ])

  const { data: existingCharges, error: chargesError } = await supabase
    .from("tournament_billing_charges")
    .select("tournament_id")
    .eq("organization_id", organizationId)

  if (chargesError) throw chargesError
  const existingIds = new Set((existingCharges || []).map((charge) => charge.tournament_id as string))
  const pendingBackfill = tournaments.filter((tournament) => !existingIds.has(tournament.id))
  const inscriptions = await fetchInscriptions(pendingBackfill.map((tournament) => tournament.id))

  const rows = pendingBackfill.map((tournament) => {
    const tournamentInscriptions = inscriptions.filter(
      (inscription) => inscription.tournament_id === tournament.id,
    )
    const snapshot = calculateBillingSnapshot(
      billingModel,
      settings,
      tournamentInscriptions,
      tournament.start_date,
    )

    return {
      tournament_id: tournament.id,
      organization_id: organizationId,
      billing_model: billingModel,
      status: "PAID",
      billable_units: snapshot.billableUnits,
      pricing_rule: snapshot.pricingRule,
      unit_amount_ars: snapshot.unitAmountArs,
      amount_ars: snapshot.amountArs,
      period_start: snapshot.periodStart,
      period_end: snapshot.periodEnd,
      resolved_at: new Date().toISOString(),
      updated_by: null,
      tournament_name: tournament.name || "Torneo sin nombre",
    }
  })

  const totalAmount = rows.reduce((total, row) => total + row.amount_ars, 0)
  const totalUnits = rows.reduce((total, row) => total + row.billable_units, 0)

  console.table(
    rows.map((row) => ({
      torneo: row.tournament_name,
      unidades: row.billable_units,
      importe_ars: row.amount_ars,
      semana: row.period_start || "-",
    })),
  )
  console.log({
    mode: shouldApply ? "apply" : "dry-run",
    tenant,
    billingModel,
    tournaments: rows.length,
    skippedExisting: tournaments.length - rows.length,
    totalUnits,
    totalAmountArs: totalAmount,
  })

  if (!shouldApply || rows.length === 0) return

  const payload = rows.map(({ tournament_name: _tournamentName, ...row }) => row)
  const { error } = await supabase
    .from("tournament_billing_charges")
    .upsert(payload, { onConflict: "tournament_id", ignoreDuplicates: true })

  if (error) throw error
  console.log("Backfill aplicado correctamente.")
}

run().catch((error) => {
  console.error("Backfill falló:", error instanceof Error ? error.message : error)
  process.exitCode = 1
})
