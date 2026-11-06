import { getScheduleGroupDetail, listScheduleWorkspace, scheduleWorkspaceFilterSchema } from '../reader'
import { requireScheduleSharing } from '../rpc'
import { getScheduleWorkspaceScope } from '../scope'
import { createClient } from '@/utils/supabase/server'

jest.mock('../rpc', () => {
  const actual = jest.requireActual('../rpc')
  return { ...actual, requireScheduleSharing: jest.fn() }
})
jest.mock('../scope', () => ({ getScheduleWorkspaceScope: jest.fn() }))
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const metadata = { name: 'Fecha', description: null, start_date: null, end_date: null }
const content = { date: '2099-11-06', start_time: '08:00:00', end_time: '15:00:00', court_name: null, max_matches: 4, description: null, is_available: true }
const query = (result: unknown) => {
  const builder: Record<string, jest.Mock> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'range', 'filter', 'is', 'or', 'maybeSingle']) builder[method] = jest.fn(() => builder)
  builder.then = jest.fn((resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve))
  return builder
}

describe('schedule workspace readers', () => {
  const from = jest.fn()
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(requireScheduleSharing).mockResolvedValue()
    jest.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof createClient>>)
    jest.mocked(getScheduleWorkspaceScope).mockResolvedValue({ user_id: id(1), role: 'ADMIN', owned_club_ids: [], active_organization_ids: [], clubs: [],
      tournaments: [{ id: id(2), name: 'Torneo', club_id: null, organization_id: null, type: 'LONG', status: 'ZONE_PHASE', category_name: null, format_config: {}, eligible: true }],
    })
  })
  it('paginates at the database and keeps an explicit way to find undated rows', async () => {
    const rows = query({ data: [{ ...metadata, id: id(3), kind: 'INDIVIDUAL', created_at: '2026-11-05', tournament_ids: [id(2)], club_ids: [],
      round_types: ['ZONE'], bracket_keys: ['MAIN'], tournament_count: 1, slot_count: 0, distribution_state: 'INDIVIDUAL' }], count: 21, error: null })
    from.mockReturnValueOnce(rows)
    const result = await listScheduleWorkspace({ period: 'undated', page: '2', tournament: id(2) })
    expect(result.entries[0].start_date).toBeNull()
    expect(result.total).toBe(21)
    expect(result.filters.page).toBe(2)
    expect(rows.range).toHaveBeenCalledWith(20, 39)
    expect(rows.is).toHaveBeenCalledWith('start_date', null)
    expect(rows.is).toHaveBeenCalledWith('end_date', null)
  })
  it('rejects malformed civil-date filters before querying any view', async () => {
    expect(scheduleWorkspaceFilterSchema.safeParse({ from: '2026-02-31' }).success).toBe(false)
    expect(scheduleWorkspaceFilterSchema.safeParse({ from: '2026-11-05', to: '2026-11-01' }).success).toBe(false)
    await expect(listScheduleWorkspace({ from: '2026-11-05),private.eq.true' })).rejects.toThrow()
    expect(from).not.toHaveBeenCalled()
  })
  it('requires club, tournament, round and cup to match one destination before paginating', async () => {
    const rows = query({ data: [], count: 0, error: null })
    from.mockReturnValueOnce(rows)
    await listScheduleWorkspace({ club: id(4), tournament: id(2), round: '8VOS', bracket: 'GOLD' })
    expect(rows.filter).toHaveBeenCalledWith('destinations', 'cs',
      JSON.stringify([{ club_id: id(4), tournament_id: id(2), round_type: '8VOS', bracket_key: 'GOLD' }]))
  })
  it('does not return names or counts if the backend scope and checked actor scope disagree', async () => {
    from.mockReturnValueOnce(query({ data: [{ ...metadata, id: id(3), kind: 'GROUP', created_at: '2026-11-05', tournament_ids: [id(999)], club_ids: [],
      round_types: ['ZONE'], bracket_keys: ['MAIN'], tournament_count: 1, slot_count: 0, distribution_state: 'COMPLETE' }], count: 1, error: null }))
    await expect(listScheduleWorkspace({})).rejects.toThrow('permisos')
  })
  it('returns null for a group hidden by RLS without querying its members', async () => {
    from.mockReturnValueOnce(query({ data: null, error: null }))
    expect(await getScheduleGroupDetail(id(10))).toBeNull()
    expect(from).toHaveBeenCalledTimes(1)
  })
  it('counts only authorized copies and keeps FREE_DATE outside comparisons', async () => {
    const member = { id: id(11), group_id: id(10), tournament_id: id(2), fecha_id: id(12), status: 'active', applied_metadata: metadata, applied_version: 1, updated_at: '2026-11-06T12:00:00+00:00' }
    const fechaQuery = query({ data: [{ ...metadata, id: id(12), tournament_id: id(2), fecha_number: 1, round_type: 'ZONE', bracket_key: 'MAIN' }], error: null })
    const queries = new Map([
      ['schedule_share_groups', query({ data: { ...metadata, id: id(10), version: 1, created_at: '2026-11-05', updated_at: '2026-11-05' }, error: null })],
      ['schedule_share_members', query({ data: [member, { ...member, id: id(99), tournament_id: id(999), fecha_id: id(999) }], error: null })],
      ['schedule_share_items', query({ data: [{ id: id(13), group_id: id(10), item_key: 'morning', content, deleted: false, version: 1 }], error: null })],
      ['tournament_fechas', fechaQuery],
      ['tournament_time_slots', query({ data: [
        { ...content, id: id(14), fecha_id: id(12), slot_type: 'TIME_RANGE', is_system: false },
        { ...content, id: id(15), fecha_id: id(12), max_matches: 0, slot_type: 'FREE_DATE', is_system: true },
      ], error: null })],
      ['schedule_share_item_targets', query({ data: [{ id: id(16), member_id: id(11), item_id: id(13), slot_id: id(14), status: 'active',
        applied_content: content, applied_item_content: content, applied_version: 1 }], error: null })],
    ])
    from.mockImplementation((table: string) => queries.get(table))
    const result = await getScheduleGroupDetail(id(10))
    expect(result?.appliedCount).toBe(1)
    expect(result?.copies).toHaveLength(1)
    expect(result?.copies[0].differences.state).toBe('COMPLETE')
    expect(fechaQuery.in).toHaveBeenCalledWith('id', [id(12)])
  })
})
