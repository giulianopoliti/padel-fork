import { getScheduleWorkspaceScope } from '../scope'
import { createClient } from '@/utils/supabase/server'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const query = (result: unknown) => {
  const builder: Record<string, jest.Mock> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'range', 'single']) builder[method] = jest.fn(() => builder)
  builder.then = jest.fn((resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve))
  return builder
}
const tournament = (organizationId: string | null = null) => ({
  id: id(3), club_id: id(2), organization_id: organizationId,
  name: '4ta', type: 'LONG', status: 'NOT_STARTED', category_name: '4ta', format_config: {},
})

describe('authenticated schedule workspace scope', () => {
  const from = jest.fn()
  const auth = { getUser: jest.fn() }
  beforeEach(() => {
    jest.clearAllMocks()
    auth.getUser.mockResolvedValue({ data: { user: { id: id(1) } }, error: null })
    jest.mocked(createClient).mockResolvedValue({ from, auth } as unknown as Awaited<ReturnType<typeof createClient>>)
  })
  it('rejects unauthenticated callers and player roles before querying resources', async () => {
    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    await expect(getScheduleWorkspaceScope()).rejects.toThrow('autenticado')
    expect(from).not.toHaveBeenCalled()
    from.mockReturnValueOnce(query({ data: { role: 'PLAYER' }, error: null }))
    await expect(getScheduleWorkspaceScope()).rejects.toThrow('permisos')
    expect(from).toHaveBeenCalledTimes(1)
  })
  it('includes ADMIN without requiring ownership or organization membership', async () => {
    from.mockReturnValueOnce(query({ data: { role: 'ADMIN' }, error: null }))
      .mockReturnValueOnce(query({ data: [tournament()], error: null }))
      .mockReturnValueOnce(query({ data: [{ id: id(2), name: 'Caballito' }], error: null }))
    const result = await getScheduleWorkspaceScope()
    expect(result.role).toBe('ADMIN')
    expect(result.tournaments[0].eligible).toBe(true)
    expect(from.mock.calls.map(call => call[0])).toEqual(['users', 'tournaments', 'clubes'])
  })
  it('keeps all owned clubs and excludes an unauthorized tournament even if returned by a broad policy', async () => {
    const tournaments = query({ data: [tournament(), { ...tournament(), id: id(99), club_id: id(100) }], error: null })
    from.mockReturnValueOnce(query({ data: { role: 'CLUB' }, error: null }))
      .mockReturnValueOnce(query({ data: [{ id: id(2), name: 'A' }, { id: id(8), name: 'B' }], error: null }))
      .mockReturnValueOnce(tournaments)
    const result = await getScheduleWorkspaceScope()
    expect(tournaments.in).toHaveBeenCalledWith('club_id', [id(2), id(8)])
    expect(result.clubs).toHaveLength(2)
    expect(result.tournaments.map(row => row.id)).toEqual([id(3)])
  })
  it('filters organizers by active membership in the tournament organization', async () => {
    const memberships = query({ data: [{ organizacion_id: id(9) }], error: null })
    const tournaments = query({ data: [tournament(id(9)), { ...tournament(), id: id(20) }], error: null })
    from.mockReturnValueOnce(query({ data: { role: 'ORGANIZADOR' }, error: null }))
      .mockReturnValueOnce(memberships).mockReturnValueOnce(tournaments)
      .mockReturnValueOnce(query({ data: [{ id: id(2), name: 'A' }], error: null }))
    const result = await getScheduleWorkspaceScope()
    expect(memberships.eq).toHaveBeenCalledWith('is_active', true)
    expect(tournaments.in).toHaveBeenCalledWith('organization_id', [id(9)])
    expect(result.tournaments).toHaveLength(1)
  })
  it('stops before querying tournaments after a user loses membership', async () => {
    from.mockReturnValueOnce(query({ data: { role: 'ORGANIZADOR' }, error: null }))
      .mockReturnValueOnce(query({ data: [], error: null }))
    expect((await getScheduleWorkspaceScope()).tournaments).toEqual([])
    expect(from).toHaveBeenCalledTimes(2)
  })
  it('fails closed when a scope query errors', async () => {
    from.mockReturnValueOnce(query({ data: { role: 'CLUB' }, error: null }))
      .mockReturnValueOnce(query({ data: null, error: { message: 'db failure' } }))
    await expect(getScheduleWorkspaceScope()).rejects.toThrow('clubes')
    expect(from).toHaveBeenCalledTimes(2)
  })
})
