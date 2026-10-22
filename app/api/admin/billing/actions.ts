"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { supabaseAdmin, verifyAdmin } from "@/lib/supabase-admin"
import { addBillingMonths, isBillingMonth } from "@/lib/billing/financials"
import {
  buildChargePayload,
  getBillingContext,
  getFreshTournamentBillingSnapshot,
  getOrCreateBillingSettings,
  getTenantBillingDashboard,
} from "@/lib/billing/service"

const amountSchema = z.number().int().min(0).max(2_000_000_000)

const installmentSchema = z.object({
  installmentNumber: z.number().int().min(1).max(24),
  amountArs: amountSchema.positive(),
})

const createCollectionSchema = z.object({
  tournamentIds: z.array(z.string().uuid()).min(1).max(100),
  maintenanceAmountPerInstallmentArs: amountSchema,
  firstMonth: z.string().refine(isBillingMonth, "Mes de facturación inválido"),
  installments: z.array(installmentSchema).min(1).max(24),
})

const issueInstallmentSchema = z.object({ installmentId: z.string().uuid() })

const cancelCollectionSchema = z.object({ collectionId: z.string().uuid() })

const registerPaymentSchema = z.object({
  installmentId: z.string().uuid(),
  amountArs: amountSchema.positive(),
  reference: z.string().trim().max(160).optional(),
  note: z.string().trim().max(500).optional(),
})

const settingsSchema = z.object({
  fvAmountUpTo16: amountSchema,
  fvAmountOver16: amountSchema,
  tpeAmountPerPlayer: amountSchema,
})

const statusSchema = z.enum(["PENDING", "PAID", "DISMISSED"])

const ensureTournamentsOutsideCollections = async (tournamentIds: string[]) => {
  const { data, error } = await supabaseAdmin
    .from("billing_collection_tournaments")
    .select("tournament_id")
    .in("tournament_id", tournamentIds)
    .limit(1)

  if (error) throw error
  if (data && data.length > 0) {
    throw new Error("El torneo pertenece a un cobro en cuotas; gestioná el pago desde su cuota")
  }
}

export const updateBillingSettings = async (input: z.infer<typeof settingsSchema>) => {
  try {
    const adminUserId = await verifyAdmin()
    const parsed = settingsSchema.parse(input)
    const context = await getBillingContext()
    const current = await getOrCreateBillingSettings(context)

    const { error } = await supabaseAdmin
      .from("tenant_billing_settings")
      .update({
        fv_amount_up_to_16:
          context.billingModel === "FV_LEAGUE"
            ? parsed.fvAmountUpTo16
            : current.fvAmountUpTo16,
        fv_amount_over_16:
          context.billingModel === "FV_LEAGUE" ? parsed.fvAmountOver16 : current.fvAmountOver16,
        tpe_amount_per_player:
          context.billingModel === "TPE_PLAYER"
            ? parsed.tpeAmountPerPlayer
            : current.tpeAmountPerPlayer,
        updated_by: adminUserId,
      })
      .eq("organization_id", context.organizationId)
      .eq("billing_model", context.billingModel)

    if (error) throw error

    revalidatePath("/admin/cobros")
    return { success: true as const }
  } catch (error) {
    console.error("[billing] Error updating settings:", error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "No se pudo actualizar la configuración",
    }
  }
}

export const setTournamentBillingStatus = async (
  tournamentId: string,
  requestedStatus: "PENDING" | "PAID" | "DISMISSED",
) => {
  try {
    const adminUserId = await verifyAdmin()
    const status = statusSchema.parse(requestedStatus)
    const context = await getBillingContext()
    await ensureTournamentsOutsideCollections([tournamentId])
    const { tournament, snapshot } = await getFreshTournamentBillingSnapshot(tournamentId, context)

    const { error } = await supabaseAdmin.from("tournament_billing_charges").upsert(
      buildChargePayload({
        tournament,
        snapshot,
        organizationId: context.organizationId,
        status,
        adminUserId,
      }),
      { onConflict: "tournament_id" },
    )

    if (error) throw error

    revalidatePath("/admin/cobros")
    return { success: true as const }
  } catch (error) {
    console.error("[billing] Error changing charge status:", error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "No se pudo actualizar el cobro",
    }
  }
}

const bulkStatusSchema = z.object({
  tournamentIds: z.array(z.string().min(1)).min(1).max(500),
  requestedStatus: statusSchema,
})

export const setTournamentsBillingStatus = async (
  input: z.infer<typeof bulkStatusSchema>,
) => {
  try {
    const adminUserId = await verifyAdmin()
    const parsed = bulkStatusSchema.parse(input)
    const context = await getBillingContext()
    const tournamentIds = Array.from(new Set(parsed.tournamentIds))
    await ensureTournamentsOutsideCollections(tournamentIds)

    const payloads = await Promise.all(
      tournamentIds.map(async (tournamentId) => {
        const { tournament, snapshot } = await getFreshTournamentBillingSnapshot(
          tournamentId,
          context,
        )
        return buildChargePayload({
          tournament,
          snapshot,
          organizationId: context.organizationId,
          status: parsed.requestedStatus,
          adminUserId,
        })
      }),
    )

    const { error } = await supabaseAdmin
      .from("tournament_billing_charges")
      .upsert(payloads, { onConflict: "tournament_id" })

    if (error) throw error

    revalidatePath("/admin/cobros")
    return { success: true as const, updated: payloads.length }
  } catch (error) {
    console.error("[billing] Error bulk-changing charge status:", error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "No se pudieron actualizar los cobros",
    }
  }
}

export const markTpeWeekPaid = async (weekStart: string) => {
  try {
    const adminUserId = await verifyAdmin()
    const context = await getBillingContext()
    if (context.billingModel !== "TPE_PLAYER") throw new Error("Esta acción sólo está disponible en TPE")

    const dashboard = await getTenantBillingDashboard(weekStart)
    const pendingItems = dashboard.items.filter((item) => item.status === "PENDING")

    if (pendingItems.length === 0) return { success: true as const, updated: 0 }

    const payloads = await Promise.all(
      pendingItems.map(async (item) => {
        const { tournament, snapshot } = await getFreshTournamentBillingSnapshot(
          item.tournamentId,
          context,
        )
        return buildChargePayload({
          tournament,
          snapshot,
          organizationId: context.organizationId,
          status: "PAID",
          adminUserId,
        })
      }),
    )

    const { error } = await supabaseAdmin
      .from("tournament_billing_charges")
      .upsert(payloads, { onConflict: "tournament_id" })

    if (error) throw error

    revalidatePath("/admin/cobros")
    return { success: true as const, updated: payloads.length }
  } catch (error) {
    console.error("[billing] Error settling TPE week:", error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "No se pudo marcar la semana como cobrada",
    }
  }
}

export const createBillingCollection = async (input: z.infer<typeof createCollectionSchema>) => {
  try {
    const adminUserId = await verifyAdmin()
    const parsed = createCollectionSchema.parse(input)
    const context = await getBillingContext()
    if (context.billingModel !== "FV_LEAGUE") throw new Error("Las cuotas están disponibles sólo para Padel FV")

    const tournamentIds = Array.from(new Set(parsed.tournamentIds))
    const dashboard = await getTenantBillingDashboard()
    if (!dashboard.monthlyMaintenanceAvailable) {
      throw new Error("La creación de cuotas mensuales estará disponible cuando se publique la actualización de la base de datos")
    }
    addBillingMonths(parsed.firstMonth, parsed.installments.length - 1)
    const selectedItems = dashboard.items.filter((item) => tournamentIds.includes(item.tournamentId))
    if (selectedItems.length !== tournamentIds.length) throw new Error("Uno o más torneos no están disponibles")
    if (selectedItems.some((item) => item.status !== "PENDING")) {
      throw new Error("Sólo se pueden incluir torneos pendientes")
    }
    if (dashboard.collections.some((collection) => collection.tournaments.some((tournament) => tournamentIds.includes(tournament.tournamentId)))) {
      throw new Error("Uno o más torneos ya pertenecen a un cobro")
    }

    const installments = [...parsed.installments].sort((a, b) => a.installmentNumber - b.installmentNumber)
    if (installments.some((installment, index) => installment.installmentNumber !== index + 1)) {
      throw new Error("Las cuotas deben numerarse consecutivamente desde 1")
    }

    const tournamentSubtotalArs = selectedItems.reduce((total, item) => total + item.amountArs, 0)
    const totalAmountArs =
      tournamentSubtotalArs
      + parsed.maintenanceAmountPerInstallmentArs * installments.length
    if (!Number.isSafeInteger(totalAmountArs) || totalAmountArs > 2_000_000_000) {
      throw new Error("El total del cobro supera el importe máximo permitido")
    }
    if (installments.reduce((total, installment) => total + installment.amountArs, 0) !== totalAmountArs) {
      throw new Error("La suma de las cuotas debe coincidir con torneos y mantenimiento")
    }

    const { data, error } = await supabaseAdmin.rpc("create_billing_collection_monthly", {
      p_organization_id: context.organizationId,
      p_organizer_id: null,
      p_organizer_label: context.tenantName,
      p_total_amount_ars: totalAmountArs,
      p_maintenance_amount_per_installment_ars: parsed.maintenanceAmountPerInstallmentArs,
      p_tournaments: selectedItems.map((item) => ({
        tournament_id: item.tournamentId,
        amount_ars: item.amountArs,
        tournament_name: item.tournamentName,
        club_name: item.clubName,
        billable_units: item.billableUnits,
        tournament_status: item.tournamentStatus,
      })),
      p_installments: installments.map((installment) => ({
        installment_number: installment.installmentNumber,
        amount_ars: installment.amountArs,
      })),
      p_created_by: adminUserId,
      p_first_month: parsed.firstMonth,
    })
    if (error) throw new Error(error.code === "23505"
      ? "Un torneo ya pertenece a otro cobro o el mantenimiento de uno de estos meses ya está facturado para esta cuenta."
      : error.message)

    revalidatePath("/admin/cobros")
    return { success: true as const, collectionId: data as string }
  } catch (error) {
    console.error("[billing] Error creating collection:", error)
    return { success: false as const, error: error instanceof Error ? error.message : "No se pudo crear el cobro" }
  }
}

const installmentMonthSchema = z.object({
  installmentId: z.string().uuid(),
  billingMonth: z.string().refine(isBillingMonth, "Mes de facturación inválido"),
})

export const assignBillingInstallmentMonth = async (input: z.infer<typeof installmentMonthSchema>) => {
  try {
    const adminUserId = await verifyAdmin()
    const parsed = installmentMonthSchema.parse(input)
    const context = await getBillingContext()
    if (context.billingModel !== "FV_LEAGUE") throw new Error("Esta acción sólo está disponible para FV")
    const dashboard = await getTenantBillingDashboard()
    if (!dashboard.monthlyMaintenanceAvailable) throw new Error("La actualización de mantenimiento mensual todavía no está disponible")
    const { error } = await supabaseAdmin.rpc("assign_billing_installment_month", {
      p_installment_id: parsed.installmentId, p_organization_id: context.organizationId,
      p_billing_month: parsed.billingMonth, p_assigned_by: adminUserId,
    })
    if (error) throw new Error(error.code === "23505" ? "El mantenimiento de ese mes ya está facturado para esta cuenta" : error.message)
    revalidatePath("/admin/cobros")
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "No se pudo asignar el mes" }
  }
}

export const cancelBillingCollection = async (input: z.infer<typeof cancelCollectionSchema>) => {
  try {
    await verifyAdmin()
    const { collectionId } = cancelCollectionSchema.parse(input)
    const context = await getBillingContext()
    if (context.billingModel !== "FV_LEAGUE") {
      throw new Error("La cancelación de cobros en cuotas sólo está disponible en Padel FV")
    }

    const { data, error } = await supabaseAdmin.rpc("cancel_billing_collection", {
      p_collection_id: collectionId,
      p_organization_id: context.organizationId,
    })
    if (error) throw new Error(error.message)

    revalidatePath("/admin/cobros")
    return { success: true as const, releasedTournaments: Number(data) }
  } catch (error) {
    console.error("[billing] Error canceling collection:", error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "No se pudo cancelar el cobro",
    }
  }
}

export const issueBillingInstallment = async (input: z.infer<typeof issueInstallmentSchema>) => {
  try {
    const adminUserId = await verifyAdmin()
    const { installmentId } = issueInstallmentSchema.parse(input)
    const context = await getBillingContext()
    const { data: installment, error: lookupError } = await supabaseAdmin
      .from("billing_collection_installments")
      .select("id, collection:billing_collections!inner(organization_id)")
      .eq("id", installmentId)
      .eq("collection.organization_id", context.organizationId)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!installment) throw new Error("Cuota no encontrada")

    const { error } = await supabaseAdmin
      .from("billing_collection_installments")
      .update({ status: "ISSUED", issued_at: new Date().toISOString(), issued_by: adminUserId })
      .eq("id", installmentId)
      .eq("status", "PENDING")
    if (error) throw error

    revalidatePath("/admin/cobros")
    return { success: true as const }
  } catch (error) {
    console.error("[billing] Error issuing installment:", error)
    return { success: false as const, error: error instanceof Error ? error.message : "No se pudo emitir la cuota" }
  }
}

export const registerBillingInstallmentPayment = async (input: z.infer<typeof registerPaymentSchema>) => {
  try {
    const adminUserId = await verifyAdmin()
    const parsed = registerPaymentSchema.parse(input)
    const context = await getBillingContext()
    // Fail closed on an inconsistent schedule, including before the additive migration is deployed.
    if (context.billingModel === "FV_LEAGUE") await getTenantBillingDashboard()
    const { data: installment, error: lookupError } = await supabaseAdmin
      .from("billing_collection_installments")
      .select("id, collection:billing_collections!inner(organization_id)")
      .eq("id", parsed.installmentId)
      .eq("collection.organization_id", context.organizationId)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!installment) throw new Error("Cuota no encontrada")

    const { error } = await supabaseAdmin.rpc("register_billing_installment_payment", {
      p_installment_id: parsed.installmentId,
      p_amount_ars: parsed.amountArs,
      p_payment_reference: parsed.reference || "",
      p_payment_note: parsed.note || "",
      p_registered_by: adminUserId,
    })
    if (error) throw new Error(error.message)

    revalidatePath("/admin/cobros")
    return { success: true as const }
  } catch (error) {
    console.error("[billing] Error registering installment payment:", error)
    return { success: false as const, error: error instanceof Error ? error.message : "No se pudo registrar el pago" }
  }
}
