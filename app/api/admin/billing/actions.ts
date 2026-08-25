"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { supabaseAdmin, verifyAdmin } from "@/lib/supabase-admin"
import {
  buildChargePayload,
  getBillingContext,
  getFreshTournamentBillingSnapshot,
  getOrCreateBillingSettings,
  getTenantBillingDashboard,
} from "@/lib/billing/service"

const amountSchema = z.number().int().min(0).max(2_000_000_000)

const settingsSchema = z.object({
  fvAmountUpTo16: amountSchema,
  fvAmountOver16: amountSchema,
  tpeAmountPerPlayer: amountSchema,
})

const statusSchema = z.enum(["PENDING", "PAID", "DISMISSED"])

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
