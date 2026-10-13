import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

interface OrganizerTournamentLinkSource {
  id: string
  is_draft?: boolean | null
}

// Enrich only the tournaments already returned by the authorized organizer/club
// listing. Keep ID links if this optional lookup fails.
export const enrichOrganizerTournamentLinks = async <T extends OrganizerTournamentLinkSource>(
  supabase: SupabaseClient,
  tournaments: T[],
): Promise<Array<T & OrganizerTournamentLinkSource & { seo_slug: string | null }>> => {
  if (tournaments.length === 0) return []

  const { data, error } = await supabase
    .from('tournaments')
    .select('id, seo_slug, is_draft')
    .in('id', tournaments.map(({ id }) => id))

  if (error) console.error('[organizer-tournament-links] Could not load public links:', error)

  const links = new Map((error ? [] : data || []).map((row: {
    id: string
    seo_slug: string | null
    is_draft: boolean | null
  }) => [row.id, row]))

  return tournaments.map((tournament) => {
    const link = links.get(tournament.id)
    return {
      ...tournament,
      seo_slug: link?.seo_slug ?? null,
      is_draft: link?.is_draft ?? tournament.is_draft,
    }
  })
}
