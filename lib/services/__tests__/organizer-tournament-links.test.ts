jest.mock('server-only', () => ({}))

import type { SupabaseClient } from '@supabase/supabase-js'
import { enrichOrganizerTournamentLinks } from '../organizer-tournament-links'
import { getPublicTournamentHref } from '@/lib/tournaments/public-tournament-url'

const createDatabase = (data: unknown[], error: unknown = null) => {
  const filter = jest.fn().mockResolvedValue({ data, error })
  const select = jest.fn().mockReturnValue({ in: filter })
  const from = jest.fn().mockReturnValue({ select })
  return { supabase: { from } as unknown as SupabaseClient, from, select, filter }
}

describe('organizer tournament public links', () => {
  it('loads links for the authorized list while preserving metrics and draft fallback', async () => {
    const database = createDatabase([
      { id: 'published', seo_slug: 'torneo-publico', is_draft: false },
      { id: 'draft', seo_slug: 'torneo-borrador', is_draft: true },
    ])
    const result = await enrichOrganizerTournamentLinks(database.supabase, [
      { id: 'published', matchesFinished: 3 },
      { id: 'draft', matchesFinished: 0 },
      { id: 'missing', matchesFinished: 1 },
    ])

    expect(database.from).toHaveBeenCalledWith('tournaments')
    expect(database.select).toHaveBeenCalledWith('id, seo_slug, is_draft')
    expect(database.filter).toHaveBeenCalledWith('id', ['published', 'draft', 'missing'])
    expect(result.map((tournament) => getPublicTournamentHref({
      id: tournament.id, seoSlug: tournament.seo_slug, isDraft: tournament.is_draft,
    }))).toEqual(['/torneos/torneo-publico', '/tournaments/draft', '/tournaments/missing'])
    expect(result.map(({ matchesFinished }) => matchesFinished)).toEqual([3, 0, 1])
  })

  it('keeps the list usable through ID links when the lookup fails', async () => {
    const database = createDatabase([], { message: 'unavailable' })
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await enrichOrganizerTournamentLinks(database.supabase, [{ id: 'tournament', is_draft: false }])
      expect(result).toEqual([{ id: 'tournament', is_draft: false, seo_slug: null }])
      expect(log).toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })

  it('skips the lookup for an empty list', async () => {
    const database = createDatabase([])
    expect(await enrichOrganizerTournamentLinks(database.supabase, [])).toEqual([])
    expect(database.from).not.toHaveBeenCalled()
  })
})
