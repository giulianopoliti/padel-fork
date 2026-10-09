import type { SupabaseClient } from '@supabase/supabase-js'
import { getAmericanPlayerTournamentData } from '../american-player-matches'

const createQueryClient = (responses: unknown[]): SupabaseClient => ({
  from: jest.fn(() => {
    const result = responses.shift()
    const query: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    }
    for (const method of ['select', 'eq', 'not', 'neq', 'or', 'order', 'returns']) {
      query[method] = () => query
    }
    return query
  }),
}) as unknown as SupabaseClient

describe('American player registration lookup', () => {
  it.each([false, true])('recognizes the second player with an array relation: %s', async (asArray) => {
    const couple = { player1_id: 'partner', player2_id: 'player' }
    const client = createQueryClient([
      { count: 1 },
      { data: [{ couple_id: 'couple', couples: asArray ? [couple] : couple }] },
      { data: [] },
    ])
    expect(await getAmericanPlayerTournamentData('player', 'tournament', client))
      .toMatchObject({ isRegistered: true, playerCoupleId: 'couple', zoneMatches: [] })
  })

  it('does not report an unregistered player when the inscription query fails', async () => {
    const error = { message: 'Network or permission failure' }
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(getAmericanPlayerTournamentData('player', 'tournament', createQueryClient([
        { count: null }, { data: null, error },
      ]))).rejects.toBe(error)
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('reports unregistered only after a successful empty lookup', async () => {
    expect(await getAmericanPlayerTournamentData('player', 'tournament', createQueryClient([
      { count: 0 }, { data: [] },
    ]))).toMatchObject({ isRegistered: false })
  })
})
