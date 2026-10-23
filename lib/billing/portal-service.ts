import "server-only"

import { cache } from "react"
import { getTenantBranding } from "@/config/tenant"
import { getTenantOrganization } from "@/lib/services/tenant-organization.service"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createClient } from "@/utils/supabase/server"

export interface BillingNoticeData { available: boolean; enabled: boolean }

export class BillingAccessError extends Error {
  constructor(public readonly status: number) {
    super(status === 401 ? "Iniciá sesión para ver tus cobros" : "No autorizado")
  }
}

export const requireBillingPortalAccess = cache(async () => {
  if (getTenantBranding().key !== "padel-elite") throw new BillingAccessError(404)
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new BillingAccessError(401)
  const { data: profile, error } = await supabase.from("users").select("role").eq("id", user.id).single()
  if (error || !profile || !["ADMIN", "ORGANIZADOR"].includes(profile.role)) throw new BillingAccessError(403)
  const organization = await getTenantOrganization()
  if (!organization) throw new Error("No se pudo resolver la organización de TPE")
  if (profile.role === "ORGANIZADOR") {
    const { data: membership, error: membershipError } = await supabaseAdmin.from("organization_members")
      .select("user_id").eq("user_id", user.id).eq("organizacion_id", organization.id)
      .eq("is_active", true).in("member_role", ["owner", "admin"]).maybeSingle()
    if (membershipError || !membership) throw new BillingAccessError(403)
  }
  return { organizationId: organization.id, userId: user.id, role: profile.role as "ADMIN" | "ORGANIZADOR" }
})

export const getBillingNotice = async (): Promise<BillingNoticeData> => {
  const access = await requireBillingPortalAccess()
  const { data, error } = await supabaseAdmin.from("tenant_billing_notices")
    .select("enabled").eq("organization_id", access.organizationId).maybeSingle()
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code)) return { available: false, enabled: false }
    throw error
  }
  return { available: true, enabled: data?.enabled === true }
}
