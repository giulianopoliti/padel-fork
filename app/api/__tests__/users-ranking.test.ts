jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/utils/supabase/client', () => ({ supabase: { from: jest.fn() } }))
jest.mock('@/app/api/tournaments/actions', () => ({
  getMultiplePlayersWeeklyPoints: jest.fn().mockResolvedValue({ success: true, weeklyPoints: {} }),
}))

import { createClient } from '@/utils/supabase/server'
import { supabase as browserClient } from '@/utils/supabase/client'
import { getRankedPlayers } from '../users'

it('uses the request server client for ranking queries and profile URLs', async () => {
  const player = { id: 'player', first_name: 'Ana', last_name: 'Perez', score: 50 }
  const createQuery = (result: unknown) => {
    const query = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      order: jest.fn(() => query),
      range: jest.fn(() => query),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    }
    return query
  }
  const client = {
    from: jest.fn()
      .mockReturnValueOnce(createQuery({ data: [player], error: null }))
      .mockReturnValueOnce(createQuery({ count: 1, error: null })),
    storage: {
      from: jest.fn().mockReturnValue({
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/avatar.jpg' } }),
      }),
    },
  }
  ;(createClient as jest.Mock).mockResolvedValue(client)

  const result = await getRankedPlayers()

  expect(createClient).toHaveBeenCalledTimes(1)
  expect(browserClient.from).not.toHaveBeenCalled()
  expect(client.from).toHaveBeenCalledTimes(2)
  expect(result.totalCount).toBe(1)
  expect(result.players[0]).toMatchObject({ id: 'player', firstName: 'Ana', score: 50 })
  expect(client.storage.from).toHaveBeenCalledWith('avatars')
})
