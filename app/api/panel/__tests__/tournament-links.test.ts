jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/config/tenant', () => ({ getTenantBranding: () => ({ key: 'padel-fv' }) }))
jest.mock('@/lib/services/tenant-home.service', () => ({ getTenantUpcomingTournamentSummaries: jest.fn() }))
jest.mock('@/lib/services/tournament-category-config', () => ({ getTournamentCategoryDisplay: () => '9na' }))
jest.mock('@/lib/services/tournament-capacity.service', () => ({
  buildTournamentCapacitySummary: () => ({ maxParticipants: 16, remainingSlots: 16, isFull: false, hasFewSlots: false }),
}))

import { createClient } from '@/utils/supabase/server'
import { getTenantUpcomingTournamentSummaries } from '@/lib/services/tenant-home.service'
import { getPlayerInscribedTournaments, getPlayerUpcomingTournaments } from '../actions'

describe('player panel tournament URL data', () => {
  const player = { id: 'player', first_name: 'Test', last_name: 'Player', profile_image_url: null }
  const couple = { id: 'couple', player1_id: 'player', player2_id: 'partner', player1: player, player2: { ...player, id: 'partner' } }
  const tournament = {
    id: 'tournament', seo_slug: 'largo', name: 'Largo', type: 'AMERICAN',
    status: 'NOT_STARTED', start_date: '2026-10-19', end_date: '2026-10-20',
    category_name: '9na', category_config: null, gender: 'MALE',
    hide_venue: false, clubes: null,
  }
  const inscription = { id: 'inscription', tournament_id: 'tournament', couple_id: 'couple', tournaments: tournament }

  beforeEach(() => {
    jest.clearAllMocks()
    const from = jest.fn((table: string) => {
      const data = table === 'players' ? player : table === 'couples' ? [couple] : [inscription]
      const query = {
        select: jest.fn(), eq: jest.fn(), in: jest.fn(), or: jest.fn(),
        maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
      }
      for (const method of [query.select, query.eq, query.in, query.or]) method.mockReturnValue(query)
      return query
    })
    jest.mocked(createClient).mockResolvedValue({
      from, auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user' } } }) },
    } as unknown as Awaited<ReturnType<typeof createClient>>)
  })

  it('preserves the public slug when mapping upcoming tournament summaries', async () => {
    jest.mocked(getTenantUpcomingTournamentSummaries).mockImplementation(async (_, options) => (
      options?.tournamentType === 'AMERICAN'
        ? [{ id: tournament.id, seoSlug: tournament.seo_slug, name: tournament.name, status: tournament.status, club: null }]
        : []
    ))
    const result = await getPlayerUpcomingTournaments('player')
    expect(result.error).toBeUndefined()
    expect(result.upcomingTournaments).toEqual([expect.objectContaining({ id: 'tournament', seoSlug: 'largo' })])
  })

  it('selects and preserves the public slug for an inscribed tournament', async () => {
    const result = await getPlayerInscribedTournaments('player')
    expect(result.error).toBeUndefined()
    expect(result.inscribedTournaments).toEqual([
      expect.objectContaining({ tournament: expect.objectContaining({ id: 'tournament', seoSlug: 'largo' }) }),
    ])
    const supabase = await createClient()
    const inscriptionQuery = jest.mocked(supabase.from).mock.results.find((_, index) => (
      jest.mocked(supabase.from).mock.calls[index][0] === 'inscriptions'
    ))?.value
    expect(inscriptionQuery.select).toHaveBeenCalledWith(expect.stringContaining('seo_slug'))
  })
})
