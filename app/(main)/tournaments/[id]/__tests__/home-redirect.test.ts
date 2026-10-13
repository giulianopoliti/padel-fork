jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
  permanentRedirect: jest.fn((url: string) => { throw new Error(`redirect:${url}`) }),
}))
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))
jest.mock('@/lib/services/public-tournament.service', () => ({ getPublicTournamentById: jest.fn() }))
jest.mock('@/lib/tournaments/public-tournament-details', () => ({ mapTournamentToPublicInfo: jest.fn() }))
jest.mock('@/lib/services/tournament-category-config', () => ({ getTournamentCategoryDisplay: jest.fn() }))
jest.mock('@/lib/services/tournament-capacity.service', () => ({ buildTournamentCapacitySummary: jest.fn(), getTournamentCoupleCount: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentAccess: jest.fn() }))
jest.mock('@/utils/serialization', () => ({ ensureSerializable: jest.fn() }))
jest.mock('../components/AmericanTournamentOverview', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('../components/LongTournamentView', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@/lib/services/long-player-overview', () => ({ getLongPlayerOverview: jest.fn() }))
jest.mock('@/lib/services/tournament-operational-settings', () => ({ normalizeTournamentOperationalSettings: jest.fn() }))
jest.mock('@/config/tenant', () => ({ getTenantBranding: jest.fn() }))

import { permanentRedirect } from 'next/navigation'
import { getPublicTournamentById } from '@/lib/services/public-tournament.service'
import TournamentPage, { TournamentPageById } from '../page'

describe('tournament ID home redirect', () => {
  beforeEach(() => jest.clearAllMocks())

  it('redirects the published ID home to its public slug preserving query parameters', async () => {
    jest.mocked(getPublicTournamentById).mockResolvedValue({ id: 'tournament', seo_slug: 'torneo-publico', isAlias: false })
    await expect(TournamentPage({
      params: Promise.resolve({ id: 'tournament' }),
      searchParams: Promise.resolve({ fecha_id: 'date', tag: ['uno', 'dos'] }),
    })).rejects.toThrow('redirect:/torneos/torneo-publico?fecha_id=date&tag=uno&tag=dos')
    expect(getPublicTournamentById).toHaveBeenCalledWith('tournament')
    expect(permanentRedirect).toHaveBeenCalledTimes(1)
  })

  it.each([null, { id: 'tournament', seo_slug: null, isAlias: false }, { id: 'tournament', seo_slug: ' ', isAlias: false }])(
    'keeps the ID renderer when the public resolver returns %p', async (tournament) => {
      jest.mocked(getPublicTournamentById).mockResolvedValue(tournament)
      const page = await TournamentPage({ params: Promise.resolve({ id: 'tournament' }) })
      expect(permanentRedirect).not.toHaveBeenCalled()
      expect(page.type).toBe(TournamentPageById)
      expect(page.props).toEqual({ tournamentId: 'tournament' })
    },
  )
})
