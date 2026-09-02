import type { MetadataRoute } from "next"
import { getTenantCanonicalSiteUrl } from "@/config/tenant"
import { getTenantOrganization } from "@/lib/services/tenant-organization.service"
import { createClient } from "@/utils/supabase/server"

const publicStatusPaths = ["/torneos/proximos", "/torneos/en-curso", "/torneos/finalizados"] as const

const buildStaticEntries = (siteUrl: URL): MetadataRoute.Sitemap => [
  {
    url: new URL("/", siteUrl).toString(),
    changeFrequency: "weekly",
    priority: 1,
  },
  {
    url: new URL("/torneos", siteUrl).toString(),
    changeFrequency: "daily",
    priority: 0.9,
  },
  ...publicStatusPaths.map((path) => ({
    url: new URL(path, siteUrl).toString(),
    changeFrequency: "daily" as const,
    priority: 0.8,
  })),
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = new URL(getTenantCanonicalSiteUrl())
  const staticEntries = buildStaticEntries(siteUrl)
  const [supabase, organization] = await Promise.all([createClient(), getTenantOrganization()])

  if (!organization) {
    console.error("[sitemap] Could not resolve the current tenant organization; publishing static entries only.")
    return staticEntries
  }

  const { data, error } = await supabase
    .from("tournaments")
    .select("seo_slug, start_date, end_date")
    .eq("organization_id", organization.id)
    .not("seo_slug", "is", null)
    .neq("is_draft", true)
    .order("start_date", { ascending: false })

  if (error) {
    console.error("[sitemap] Could not load public tournaments:", error)
    return staticEntries
  }

  const tournamentEntries = (data || []).flatMap((tournament: {
    seo_slug: string | null
    start_date: string | null
    end_date: string | null
  }) => {
    if (!tournament.seo_slug) return []

    return [{
      url: new URL(`/torneos/${encodeURIComponent(tournament.seo_slug)}`, siteUrl).toString(),
      lastModified: tournament.end_date || tournament.start_date || undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }]
  })

  return [...staticEntries, ...tournamentEntries]
}
