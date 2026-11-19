jest.mock('@/config/tenant', () => ({ getTenantBranding: jest.fn(() => ({ key: 'padel-elite' })) }))
jest.mock('@/utils/supabase/server', () => ({ createClientServiceRole: jest.fn() }))

import { getTenantBranding } from '@/config/tenant'
import { createClientServiceRole } from '@/utils/supabase/server'
import { getEliteTitleHistory } from '../services/elite-title-history'

describe('Elite title alerts', () => {
  beforeEach(() => jest.clearAllMocks())

  it('counts each credited title in the requested category and keeps its tournament link', async () => {
    const query = {
      select: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(), range: jest.fn().mockResolvedValue({ data: [
        { player_id: 'p1', tournament_id: 't1', tournaments: { name: 'Americano 1' } },
        { player_id: 'p1', tournament_id: 't2', tournaments: [{ name: 'Americano 2' }] },
      ], error: null }),
    }
    jest.mocked(createClientServiceRole).mockResolvedValue({ from: () => query } as never)
    const titles = await getEliteTitleHistory(['p1'], { type: 'AMERICAN', category_name: '6ta' })
    expect(query.eq).toHaveBeenCalledWith('ranking_category', '6ta')
    expect(query.eq).toHaveBeenCalledWith('ranking_champion', true)
    expect(query.eq).toHaveBeenCalledWith('es_prueba', false)
    expect(titles.get('p1')).toEqual([
      { tournamentId: 't1', tournamentName: 'Americano 1', category: '6ta' },
      { tournamentId: 't2', tournamentName: 'Americano 2', category: '6ta' },
    ])
  })

  it('skips the title query in FV', async () => {
    jest.mocked(getTenantBranding).mockReturnValueOnce({ key: 'padel-fv' } as never)
    expect((await getEliteTitleHistory(['p1'], { type: 'AMERICAN', category_name: '6ta' })).size).toBe(0)
    expect(createClientServiceRole).not.toHaveBeenCalled()
  })
})
