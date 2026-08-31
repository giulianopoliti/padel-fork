import type { MetadataRoute } from "next"
import { getTenantBranding } from "@/config/tenant"
import { getTenantOrganization } from "@/lib/services/tenant-organization.service"
import { createClient } from "@/utils/supabase/server"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [supabase, organization] = await Promise.all([createClient(), getTenantOrganization()])
  if (!organization) return []

  const { data, error } = await supabase
    .from("tournaments")
    .select("seo_slug, start_date, end_date, updated_at")
    .eq("organization_id", organization.id)
    .not("seo_slug", "is", null)
    .neq("is_draft", true)
    .order("start_date", { ascending: false })

  if (error) {
    console.error("[sitemap] Could not load public tournaments:", error)
    return []
  }

  const siteUrl = new URL(getTenantBranding().siteDomain)
  return (data || []).flatMap((tournament: any) => {
    if (!tournament.seo_slug) return []

    return [{
      url: new URL(`/torneos/${tournament.seo_slug}`, siteUrl).toString(),
      lastModified: tournament.updated_at || tournament.end_date || tournament.start_date || undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }]
  })
}
