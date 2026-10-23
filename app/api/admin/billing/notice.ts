"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { supabaseAdmin, verifyAdmin } from "@/lib/supabase-admin"
import { requireBillingPortalAccess } from "@/lib/billing/portal-service"

export const setBillingNoticeEnabled = async (enabled: boolean) => {
  try {
    await verifyAdmin()
    const access = await requireBillingPortalAccess()
    const { error } = await supabaseAdmin.from("tenant_billing_notices")
      .upsert({ organization_id: access.organizationId, enabled: z.boolean().parse(enabled) }, { onConflict: "organization_id" })
    if (error) throw error
    revalidatePath("/admin/cobros")
    revalidatePath("/cobros")
    return { success: true as const }
  } catch (error) {
    console.error("[billing] Notice toggle failed", error)
    return { success: false as const, error: "No se pudo cambiar el aviso. Reintentá." }
  }
}
