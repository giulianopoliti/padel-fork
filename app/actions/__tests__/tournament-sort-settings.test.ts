jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))

import { saveTournamentSortSettings } from '../tournament-sort-settings'
import { createClient } from '@/utils/supabase/server'

const input = { surface: 'panel', rules: [{ field: 'category', direction: 'asc' }] }
const prepare = (role: string | null, loggedIn = true, error: unknown = null) => {
  const upsert = jest.fn(async (_payload: Record<string, unknown>, _options: { onConflict: string }) => ({ error }))
  const filters: Record<string, unknown> = {}
  const membershipQuery = {
    select: () => membershipQuery,
    eq: (field: string, value: unknown) => { filters[field] = value; return membershipQuery },
    maybeSingle: async () => ({ data: role ? { member_role: role } : null, error: null }),
  }
  jest.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: loggedIn ? { id: 'viewer' } : null }, error: null }) },
    from: (table: string) => table === 'organization_members' ? membershipQuery : { upsert },
  } as unknown as Awaited<ReturnType<typeof createClient>>)
  return { upsert, filters }
}

beforeEach(() => jest.clearAllMocks())

it.each(['owner', 'admin'])('allows %s and stores one configuration per screen', async (role) => {
  const { upsert, filters } = prepare(role)
  expect(await saveTournamentSortSettings(input)).toEqual({ success: true })
  expect(filters).toEqual({ user_id: 'viewer', is_active: true })
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ surface: 'panel', updated_by: 'viewer', rules: input.rules }), { onConflict: 'surface' })
  expect(upsert.mock.calls[0][0]).not.toHaveProperty('organization_id')
})
it.each(['member', null])('denies non-admin role %s without writing', async (role) => {
  const { upsert } = prepare(role)
  expect(await saveTournamentSortSettings(input)).toMatchObject({ success: false })
  expect(upsert).not.toHaveBeenCalled()
})
it('rejects unauthenticated requests and malformed input without writing', async () => {
  const { upsert } = prepare('owner', false)
  expect(await saveTournamentSortSettings(input)).toMatchObject({ success: false })
  expect(await saveTournamentSortSettings({ ...input, organization_id: 'injected' })).toMatchObject({ success: false })
  expect(upsert).not.toHaveBeenCalled()
})
it('reports storage errors without reporting success', async () => {
  const { upsert } = prepare('admin', true, new Error('Unavailable'))
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  expect(await saveTournamentSortSettings(input)).toMatchObject({ success: false })
  expect(upsert).toHaveBeenCalledTimes(1)
  log.mockRestore()
})
