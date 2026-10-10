jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: jest.fn() } }))
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/services/player-search-service', () => ({ searchPlayersGlobally: jest.fn() }))

import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/utils/supabase/server'
import { searchPlayersGlobally } from '@/lib/services/player-search-service'
import { searchOrganizationIdentityTargets, transferPlayerIdentity } from '../actions'

const sourceId = '11111111-1111-4111-8111-111111111111'
const targetId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const source = { id: sourceId, first_name: 'Ana', last_name: 'Perez', dni: null, phone: null, user_id: userId }
const target = { ...source, id: targetId, user_id: null }
const input = {
  operationId: '44444444-4444-4444-8444-444444444444',
  sourcePlayerId: sourceId, targetPlayerId: targetId, expectedUserId: userId,
  confirmation: 'TRANSFERIR', reason: 'Resolver jugador duplicado',
}

describe('identity transfer global targets', () => {
  const queries: Array<{ table: string; update: jest.Mock; insert: jest.Mock }> = []
  let externalSourceHistory = false
  let role = 'ORGANIZADOR'
  let linkedTarget = false

  beforeEach(() => {
    jest.clearAllMocks()
    queries.length = 0
    externalSourceHistory = false
    linkedTarget = false
    role = 'ORGANIZADOR'
    ;(createClient as jest.Mock).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'organizer' } }, error: null }) },
    })
    ;(searchPlayersGlobally as jest.Mock).mockResolvedValue({ players: [target], total: 1 })
    ;(supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => {
      let mutation: 'insert' | 'update' | null = null
      const filters: Record<string, unknown> = {}
      const result = () => {
        if (table === 'users') return { data: { role: filters.id === userId ? 'PLAYER' : role }, error: null }
        if (table === 'organization_members') return { data: { organizacion_id: 'organization', member_role: 'owner' }, error: null }
        if (table === 'player_identity_transfers') return { data: mutation === 'insert' ? { id: 'audit' } : null, error: null }
        if (table === 'players') return { data: mutation === 'update' ? { id: filters.id } : [source, { ...target, user_id: linkedTarget ? 'other-account' : null }], error: null }
        if (table === 'inscriptions') return { data: externalSourceHistory && filters.player_id === sourceId ? [{ tournament_id: 'external' }] : [], error: null }
        if (table === 'tournaments') return { data: [{ id: 'external', name: 'Otro torneo', organization_id: 'other-organization' }], error: null }
        return { data: [], error: null }
      }
      const query = {
        table,
        select: jest.fn().mockReturnThis(),
        eq: jest.fn((field: string, value: unknown) => { filters[field] = value; return query }),
        in: jest.fn().mockReturnThis(), is: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(),
        update: jest.fn(() => { mutation = 'update'; return query }),
        insert: jest.fn(() => { mutation = 'insert'; return query }),
        single: jest.fn(async () => result()), maybeSingle: jest.fn(async () => result()),
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
      }
      queries.push(query)
      return query
    })
  })

  it('finds a target without any tournament registration in the global directory', async () => {
    const result = await searchOrganizationIdentityTargets('Ana Perez')
    expect(result.success).toBe(true)
    expect(result.players).toEqual([expect.objectContaining({ id: targetId, tournaments: [] })])
    expect(searchPlayersGlobally).toHaveBeenCalledWith({ searchTerm: 'Ana Perez', page: 1, pageSize: 50 })
  })

  it('transfers to an unregistered target and records an audit', async () => {
    expect(await transferPlayerIdentity(input)).toEqual({ success: true })
    expect(queries.some(query => query.table === 'player_identity_transfers' && query.insert.mock.calls.length === 1)).toBe(true)
    expect(queries.filter(query => query.table === 'players' && query.update.mock.calls.length)).toHaveLength(2)
  })

  it('still blocks source accounts with external history', async () => {
    externalSourceHistory = true
    expect(await transferPlayerIdentity(input)).toMatchObject({ success: false, error: expect.stringContaining('historial fuera') })
    expect(queries.every(query => query.update.mock.calls.length === 0 && query.insert.mock.calls.length === 0)).toBe(true)
  })

  it('still rejects targets with an existing account', async () => {
    linkedTarget = true
    expect(await transferPlayerIdentity(input)).toMatchObject({ success: false, error: expect.stringContaining('ya tiene una cuenta') })
    expect(queries.every(query => query.update.mock.calls.length === 0)).toBe(true)
  })

  it('requires organizer authorization before searching the directory', async () => {
    role = 'PLAYER'
    expect(await searchOrganizationIdentityTargets('Ana Perez')).toMatchObject({ success: false })
    expect(searchPlayersGlobally).not.toHaveBeenCalled()
  })
})
