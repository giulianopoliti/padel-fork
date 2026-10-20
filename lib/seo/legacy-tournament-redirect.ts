import type { SupabaseClient } from '@supabase/supabase-js'
import { getTenantBranding } from '@/config/tenant'
import { getPublicTournamentHref } from '@/lib/tournaments/public-tournament-url'

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const TOURNAMENT_HOME_PATTERN = new RegExp(`^/tournaments/(${UUID_PATTERN})/?$`, 'i')

// Resolve legacy home links before React starts streaming a redirect response.
export const getLegacyTournamentRedirectPath = async (
  supabase: SupabaseClient,
  pathname: string,
): Promise<string | null> => {
  const tournamentId = TOURNAMENT_HOME_PATTERN.exec(pathname)?.[1]
  if (!tournamentId) return null

  const organizationId = process.env.TENANT_ORGANIZATION_ID?.trim()
  const organizationSlug = process.env.TENANT_ORGANIZATION_SLUG?.trim() ||
    process.env.NEXT_PUBLIC_TENANT_ORGANIZATION_SLUG?.trim() ||
    getTenantBranding().tenantOrganizationSlug

  const findTournament = async (field: 'id' | 'slug', value: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from('tournaments')
      .select('seo_slug, organization:organizaciones!inner(id, slug, is_active)')
      .eq('id', tournamentId)
      .neq('is_draft', true)
      .eq('organization.is_active', true)
      .eq(`organization.${field}`, value)
      .maybeSingle()

    if (error || !data?.seo_slug?.trim()) return null
    return getPublicTournamentHref({ id: tournamentId, seoSlug: data.seo_slug })
  }

  if (organizationId && new RegExp(`^${UUID_PATTERN}$`, 'i').test(organizationId)) {
    const href = await findTournament('id', organizationId)
    if (href) return href
  }

  return organizationSlug ? findTournament('slug', organizationSlug) : null
}
