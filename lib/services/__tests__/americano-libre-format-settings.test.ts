import { updateTournamentFormatConfig } from '@/app/(main)/tournaments/[id]/settings/actions'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { getPersistedBracketArtifacts } from '../bracket-generation-validation'
import { buildTournamentFormatConfig } from '../tournament-format-config-builder'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('../bracket-generation-validation', () => ({ getPersistedBracketArtifacts: jest.fn() }))

describe('switching to Americano libre from settings', () => {
  let tournament: Record<string, unknown>
  let zones: unknown[]
  let positions: unknown[]
  let matches: unknown[]
  let writes: Array<{ table: string; value: unknown }>
  beforeEach(() => {
    jest.clearAllMocks(); writes = []; zones = []; positions = []; matches = []
    tournament = { id: 't', type: 'AMERICAN', status: 'ZONE_PHASE', format_config: buildTournamentFormatConfig({ presetId: 'AMERICAN_MULTI_ZONE_2' }), bracket_status: null, bracket_generated_at: null }
    const client = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from: (table: string) => {
      const builder: Record<string, unknown> = {}
      let updating = false
      for (const method of ['select', 'eq', 'in', 'single', 'update']) builder[method] = (...args: unknown[]) => {
        if (method === 'update') { updating = true; writes.push({ table, value: args[0] }) }
        return builder
      }
      builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(updating ? { error: null } : {
        data: table === 'tournaments' ? tournament : table === 'zones' ? zones : table === 'zone_positions' ? positions : table === 'matches' ? matches : [], count: 8, error: null,
      }))
      return builder
    } }
    jest.mocked(createClient).mockResolvedValue(client as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true })
    jest.mocked(getPersistedBracketArtifacts).mockResolvedValue({ exists: false } as never)
  })
  it.each(['NOT_STARTED', 'ZONE_PHASE'])('allows conversion before brackets in %s without validating manual capacity 64 against 8 registrations', async status => {
    tournament.status = status
    const next = buildTournamentFormatConfig({ presetId: 'AMERICAN_MULTI_ZONE_FREE', matchesPerCouple: 2 })
    expect(await updateTournamentFormatConfig('t', next)).toMatchObject({ success: true })
    expect(writes).toContainEqual({ table: 'tournaments', value: { format_config: next } })
  })
  it('keeps existing zones, matches and standings while switching mode', async () => {
    zones = [{ id: 'z', name: 'Zona A', rounds_per_couple: 2 }]
    positions = ['a', 'b', 'c'].map(couple_id => ({ zone_id: 'z', couple_id }))
    matches = [{ zone_id: 'z', couple1_id: 'a', couple2_id: 'b' }]
    expect(await updateTournamentFormatConfig('t', buildTournamentFormatConfig({ presetId: 'AMERICAN_MULTI_ZONE_FREE' }))).toMatchObject({ success: true })
    expect(writes.map(write => write.table)).toEqual(['tournaments', 'zones'])
  })
  it.each(['BRACKET_PHASE', 'FINISHED'])('blocks conversion in %s on the server', async status => {
    tournament.status = status
    expect(await updateTournamentFormatConfig('t', buildTournamentFormatConfig({ presetId: 'AMERICAN_MULTI_ZONE_FREE' }))).toMatchObject({ success: false, code: 'INVALID_TOURNAMENT_STATUS' })
    expect(writes).toEqual([])
  })
  it('blocks existing bracket artifacts even when status still says zones', async () => {
    jest.mocked(getPersistedBracketArtifacts).mockResolvedValue({ exists: true } as never)
    expect(await updateTournamentFormatConfig('t', buildTournamentFormatConfig({ presetId: 'AMERICAN_MULTI_ZONE_FREE' }))).toMatchObject({ success: false, code: 'BRACKET_ARTIFACTS_EXIST' })
    expect(writes).toEqual([])
  })
  it('blocks a generated-bracket flag even before reading persisted artifacts', async () => {
    tournament.bracket_status = 'BRACKET_GENERATED'
    expect(await updateTournamentFormatConfig('t', buildTournamentFormatConfig({ presetId: 'AMERICAN_MULTI_ZONE_FREE' }))).toMatchObject({ success: false, code: 'BRACKET_ALREADY_EXISTS' })
    expect(writes).toEqual([])
  })
  it('keeps three-match zone compatibility checks when selecting free mode', async () => {
    zones = [{ id: 'z', name: 'Zona A', rounds_per_couple: 2 }]
    positions = ['a', 'b', 'c', 'd', 'e'].map(couple_id => ({ zone_id: 'z', couple_id }))
    expect(await updateTournamentFormatConfig('t', buildTournamentFormatConfig({ presetId: 'AMERICAN_MULTI_ZONE_FREE', matchesPerCouple: 3 }))).toMatchObject({ success: false, code: 'ZONE_CAPACITY_EXCEEDED_FOR_MZ3' })
    expect(writes).toEqual([])
  })
  it('supports single-zone free mode and returning to automatic mode', async () => {
    tournament.format_config = buildTournamentFormatConfig({ presetId: 'AMERICAN_SINGLE_ZONE_GLOBAL_2' })
    const free = buildTournamentFormatConfig({ presetId: 'AMERICAN_SINGLE_ZONE_FREE' })
    expect(await updateTournamentFormatConfig('t', free)).toMatchObject({ success: true })
    tournament.format_config = free
    expect(await updateTournamentFormatConfig('t', buildTournamentFormatConfig({ presetId: 'AMERICAN_SINGLE_ZONE_GLOBAL_2', singleAdvanceCount: 8 }))).toMatchObject({ success: true })
  })
  it('does not change topology when zones already exist', async () => {
    zones = [{ id: 'z', name: 'Zona A', rounds_per_couple: 2 }]
    expect(await updateTournamentFormatConfig('t', buildTournamentFormatConfig({ presetId: 'AMERICAN_SINGLE_ZONE_FREE' }))).toMatchObject({ success: false, code: 'ZONE_TOPOLOGY_CHANGE_WITH_PERSISTED_ZONES' })
    expect(writes).toEqual([])
  })
  it('rejects unauthorized changes', async () => {
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: false })
    expect(await updateTournamentFormatConfig('t', buildTournamentFormatConfig({ presetId: 'AMERICAN_MULTI_ZONE_FREE' }))).toMatchObject({ success: false })
    expect(writes).toEqual([])
  })
})
