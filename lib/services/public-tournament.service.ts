import "server-only"

import { createClient } from "@/utils/supabase/server"
import { getTenantOrganization } from "@/lib/services/tenant-organization.service"

export interface ResolvedPublicTournament {
  id: string
  seo_slug: string | null
}

const basePublicTournamentQuery = async () => {
  const [supabase, organization] = await Promise.all([createClient(), getTenantOrganization()])
  if (!organization) return null

  return {
    organizationId: organization.id,
    supabase,
  }
}

/** Resolves only a non-draft tournament belonging to the current tenant. */
export const getPublicTournamentBySlug = async (slug: string): Promise<ResolvedPublicTournament | null> => {
  const context = await basePublicTournamentQuery()
  if (!context) return null

  const { data, error } = await context.supabase
    .from("tournaments")
    .select("id, seo_slug")
    .eq("organization_id", context.organizationId)
    .eq("seo_slug", slug)
    .neq("is_draft", true)
    .maybeSingle()

  if (error) {
    console.error("[public-tournament] Could not resolve SEO slug:", error)
    return null
  }

  return data as ResolvedPublicTournament | null
}

/** Used only to emit a canonical URL for an existing UUID route. */
export const getPublicTournamentById = async (id: string): Promise<ResolvedPublicTournament | null> => {
  const context = await basePublicTournamentQuery()
  if (!context) return null

  const { data, error } = await context.supabase
    .from("tournaments")
    .select("id, seo_slug")
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .neq("is_draft", true)
    .maybeSingle()

  if (error) {
    console.error("[public-tournament] Could not resolve tournament canonical:", error)
    return null
  }

  return data as ResolvedPublicTournament | null
}
