import { commitScheduleBatch, previewScheduleBatch, requireScheduleSharing } from '../rpc'
import { getScheduleWorkspaceScope } from '../scope'
import { createClient } from '@/utils/supabase/server'
import { SCHEDULE_SHARING_SCHEMA_VERSION } from '@/config/schedule-sharing'

jest.mock('../scope', () => ({ getScheduleWorkspaceScope: jest.fn() }))
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const draft = {
  operation_key: id(1), source_fecha_id: null,
  metadata: { name: 'Fecha', description: null, start_date: '2099-11-06', end_date: '2099-11-08' }, slots: [],
  destinations: [{ tournament_id: id(2), fecha: { kind: 'create' }, round_type: 'ZONE', bracket_key: 'MAIN',
    estimated_match_duration_minutes: 90, max_matches_per_couple: null, court_choice: 'preserve' }],
}
const preview = { revision: 'a'.repeat(64), preview: { operation_key: id(1), can_commit: true,
  physical_slots_to_create: 0, physical_slots_to_reuse: 0, destinations: [{
    tournament_id: id(2), tournament_name: 'Torneo', fecha_id: null, fecha_number: 1,
    transition_to_zone_phase: true, preserves_local_metadata: false, new_slots: [], reused_slots: [], conflicts: [],
  }] } }

describe('schedule RPC server boundary', () => {
  const rpc = jest.fn()
  const originalEnvironment = { ...process.env }
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_TENANT_KEY = 'padel-fv'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:8011'
    process.env.NEXT_PUBLIC_SCHEDULE_SHARING_ENABLED = 'true'
    process.env.SCHEDULE_SHARING_ENABLED = 'true'
    rpc.mockResolvedValue({ data: SCHEDULE_SHARING_SCHEMA_VERSION, error: null })
    jest.mocked(createClient).mockResolvedValue({ rpc } as unknown as Awaited<ReturnType<typeof createClient>>)
    jest.mocked(getScheduleWorkspaceScope).mockResolvedValue({
      user_id: id(3), role: 'ADMIN', clubs: [], owned_club_ids: [], active_organization_ids: [],
      tournaments: [{ id: id(2), name: 'Torneo', club_id: null, organization_id: null, type: 'LONG', status: 'NOT_STARTED', category_name: null, format_config: {}, eligible: true }],
    })
  })
  afterAll(() => { process.env = originalEnvironment })
  it('requires both deployment switches and never implicitly activates production', async () => {
    delete process.env.NEXT_PUBLIC_SCHEDULE_SHARING_ENABLED
    await expect(requireScheduleSharing()).rejects.toThrow('habilitada')
    process.env.NEXT_PUBLIC_SCHEDULE_SHARING_ENABLED = 'true'
    process.env.SCHEDULE_SHARING_ENABLED = 'false'
    await expect(requireScheduleSharing()).rejects.toThrow('habilitada')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('rejects a historical or mismatched backend even if switches are on', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://vulusxqgknaejdxnhiex.supabase.co'
    await expect(requireScheduleSharing()).rejects.toThrow('habilitada')
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://lzowflvgnspjdbvdxliy.supabase.co'
    await expect(requireScheduleSharing()).rejects.toThrow('habilitada')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('checks schema readiness before exposing the new operations', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
    await expect(previewScheduleBatch(draft)).rejects.toThrow('esquema')
    expect(getScheduleWorkspaceScope).not.toHaveBeenCalled()
  })
  it('authorizes every destination on the server before invoking the batch RPC', async () => {
    await expect(previewScheduleBatch({ ...draft, destinations: [{ ...draft.destinations[0], tournament_id: id(999) }] })).rejects.toThrow('permisos')
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['schedule_sharing_schema_version'])
  })
  it('returns the database preview with its checked revision, not a browser-supplied plan', async () => {
    rpc.mockResolvedValueOnce({ data: SCHEDULE_SHARING_SCHEMA_VERSION, error: null }).mockResolvedValueOnce({ data: preview, error: null })
    expect(await previewScheduleBatch(draft)).toEqual(preview)
    expect(rpc).toHaveBeenLastCalledWith('preview_schedule_batch', { payload: draft })
  })
  it('confirms once through a single transactional RPC and preserves the operation key', async () => {
    const result = { group_id: id(8), operation_key: id(1), destinations: [{ tournament_id: id(2), fecha_id: id(9), new_slots: 0, reused_slots: 0 }] }
    rpc.mockResolvedValueOnce({ data: SCHEDULE_SHARING_SCHEMA_VERSION, error: null }).mockResolvedValueOnce({ data: result, error: null })
    expect(await commitScheduleBatch(draft, preview.revision)).toEqual(result)
    expect(rpc).toHaveBeenLastCalledWith('commit_schedule_batch', { payload: draft, expected_revision: preview.revision })
    expect(rpc).toHaveBeenCalledTimes(2)
  })
  it('translates stale revisions into a new-review requirement instead of retrying a mutation automatically', async () => {
    rpc.mockResolvedValueOnce({ data: SCHEDULE_SHARING_SCHEMA_VERSION, error: null }).mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'internal details' } })
    await expect(commitScheduleBatch(draft, preview.revision)).rejects.toThrow('desactualizada')
    expect(rpc).toHaveBeenCalledTimes(2)
  })
  it('does not leak unexpected database details and rejects malformed result contracts', async () => {
    rpc.mockResolvedValueOnce({ data: SCHEDULE_SHARING_SCHEMA_VERSION, error: null }).mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'private connection details' } })
    await expect(commitScheduleBatch(draft, preview.revision)).rejects.toThrow('completo o no se realiza')
    rpc.mockResolvedValueOnce({ data: SCHEDULE_SHARING_SCHEMA_VERSION, error: null }).mockResolvedValueOnce({ data: {}, error: null })
    await expect(previewScheduleBatch(draft)).rejects.toThrow()
  })
})
