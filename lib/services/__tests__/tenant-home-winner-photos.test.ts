jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/config/tenant', () => ({ getTenantBranding: () => ({ key: 'padel-fv' }) }))
jest.mock('@/lib/services/tenant-organization.service', () => ({ getTenantOrganization: async () => ({ id: 'organization', name: 'FV' }) }))
jest.mock('@/lib/services/tournament-category-config', () => ({ getTournamentCategoryDisplay: () => '7ma' }))
jest.mock('@/lib/services/tournament-capacity.service', () => ({ getTournamentCoupleCounts: async () => new Map() }))

import { createClient } from '@/utils/supabase/server'
import { getTenantHomeData } from '../tenant-home.service'

interface QueryMock {
  select: jest.Mock
  eq: jest.Mock
  in: jest.Mock
  neq: jest.Mock
  not: jest.Mock
  gte: jest.Mock
  lte: jest.Mock
  order: jest.Mock
  limit: jest.Mock
  or: jest.Mock
  then: (resolve: (result: unknown) => unknown) => Promise<unknown>
}

const goldPhoto = { tournament_id: 'tournament', bracket_key: 'GOLD', match_id: 'gold-final', winner_id: 'gold', image_url: 'https://fv/gold.jpg' }
const silverPhoto = { tournament_id: 'tournament', bracket_key: 'SILVER', match_id: 'silver-final', winner_id: 'silver', image_url: 'https://fv/silver.jpg' }

describe('FV home photos for Gold and Silver', () => {
  const setup = (photos: Array<typeof goldPhoto>) => {
    ;(createClient as jest.Mock).mockResolvedValue({ from: (table: string) => {
      let selection = ''
      const data = () => {
        if (table === 'tournaments') return selection.includes('winner_image_url') ? [{ id: 'tournament', name: 'Torneo', end_date: new Date().toISOString(), winner_id: 'gold', winner_image_url: 'https://fv/legacy-gold.jpg' }] : []
        if (table === 'matches') return [{ id: 'gold-final', tournament_id: 'tournament', bracket_key: 'GOLD', winner_id: 'gold' }, { id: 'silver-final', tournament_id: 'tournament', bracket_key: 'SILVER', winner_id: 'silver' }]
        if (table === 'tournament_winner_photos') return photos
        if (table === 'couples') return ['gold', 'silver'].map((id) => ({ id, player1: { first_name: id, last_name: 'Uno' }, player2: { first_name: id, last_name: 'Dos' } }))
        return []
      }
      const query: QueryMock = {
        select: jest.fn((value: string) => { selection = value; return query }),
        eq: jest.fn(() => query), in: jest.fn(() => query), neq: jest.fn(() => query), not: jest.fn(() => query),
        gte: jest.fn(() => query), lte: jest.fn(() => query), order: jest.fn(() => query), limit: jest.fn(() => query), or: jest.fn(() => query),
        then: (resolve) => Promise.resolve(resolve({ data: data(), error: null })),
      }
      return query
    } })
  }
  it('renders two distinct entries with their own photos and champion names', async () => {
    setup([goldPhoto, silverPhoto])
    const { recentWinners } = await getTenantHomeData()
    expect(recentWinners).toHaveLength(2)
    expect(recentWinners[0]).toMatchObject({ bracketKey: 'GOLD', winnerImageUrl: goldPhoto.image_url, player1: { name: 'gold Uno' } })
    expect(recentWinners[1]).toMatchObject({ bracketKey: 'SILVER', winnerImageUrl: silverPhoto.image_url, player1: { name: 'silver Uno' } })
  })
  it('does not use a legacy Gold photo or a stale Silver photo for the Silver champions', async () => {
    setup([{ ...silverPhoto, winner_id: 'old-champions' }])
    const { recentWinners } = await getTenantHomeData()
    expect(recentWinners[0].winnerImageUrl).toBe('https://fv/legacy-gold.jpg')
    expect(recentWinners[1].winnerImageUrl).toBeNull()
  })
})
