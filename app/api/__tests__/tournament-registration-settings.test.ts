jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/services/tenant-organization.service', () => ({ getTenantOrganization: jest.fn(async () => ({ id: 'organization' })) }))
jest.mock('@/lib/services/tournament-capacity.service', () => ({
  getTournamentCoupleCounts: jest.fn(async () => ({})),
  buildTournamentCapacitySummary: jest.fn(() => ({ currentParticipants: 0, isFull: false })),
}))

import { createClient } from '@/utils/supabase/server'
import { getTournamentById, getTournamentsOptimized, getUpcomingTournamentsForHome } from '../tournaments'

describe('registration settings across tournament entry points', () => {
  const tournament = { id: 'tournament', name: 'Test', type: 'LONG', status: 'NOT_STARTED', enable_transfer_proof: true, transfer_alias: 'club.alias', transfer_amount: 1500 }
  let select: jest.Mock
  beforeEach(() => {
    const query: Record<string, unknown> = {}
    select = jest.fn((columns: string) => {
      const data = Object.fromEntries(Object.entries(tournament).filter(([key]) => columns.includes('*') || columns.includes(key)))
      query.then = (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [data], count: 1 }).then(resolve)
      query.single = jest.fn(async () => ({ data }))
      return query
    })
    query.select = select
    for (const method of ['eq', 'in', 'neq', 'order', 'range', 'limit']) query[method] = () => query
    ;(createClient as jest.Mock).mockResolvedValue({ from: () => query, auth: { getUser: async () => ({ data: { user: null } }) } })
  })

  it.each(['AMERICAN', 'LONG'])('preserves required proof configuration in /torneos for %s', async (type) => {
    const result = await getTournamentsOptimized({ status: 'active', filters: { type: type as 'AMERICAN' | 'LONG' } })
    expect(result.tournaments[0]).toMatchObject({ enableTransferProof: true, transferAlias: 'club.alias', transferAmount: 1500 })
  })

  it('preserves proof configuration in the home list', async () => {
    expect((await getUpcomingTournamentsForHome())[0]).toMatchObject({ enableTransferProof: true, transferAlias: 'club.alias', transferAmount: 1500 })
  })

  it('preserves proof configuration in the legacy tournament detail', async () => {
    expect(await getTournamentById('tournament')).toMatchObject({ enableTransferProof: true, transferAlias: 'club.alias', transferAmount: 1500 })
  })
})
