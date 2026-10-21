import { NextRequest } from 'next/server'
import { GET, POST, PATCH } from '@/app/api/tournaments/[id]/american-free-bracket/route'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { generateFreeBracket } from '../americano-libre-generation'
import { readFreeEditorData } from '../americano-libre-editor-read'
import { saveFreeBracket, FreeBracketPersistenceError } from '../americano-libre-persistence'
import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import { getPersistedBracketArtifacts } from '../bracket-generation-validation'
import { getActiveDisqualifiedCoupleIds } from '../tournament-disqualifications'
import { buildFreeBracket } from '../americano-libre-generator'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))
jest.mock('../americano-libre-generation', () => ({ generateFreeBracket: jest.fn() }))
jest.mock('../americano-libre-editor-read', () => ({ readFreeEditorData: jest.fn() }))
jest.mock('../americano-libre-persistence', () => ({ ...jest.requireActual('../americano-libre-persistence'), saveFreeBracket: jest.fn() }))
jest.mock('../bracket-generation-validation', () => ({ getPersistedBracketArtifacts: jest.fn() }))
jest.mock('../tournament-disqualifications', () => ({ getActiveDisqualifiedCoupleIds: jest.fn() }))
const id = '12345678-1234-4234-8234-123456789abc'
const context = { params: Promise.resolve({ id }) }
const request = (body: unknown) => new NextRequest(`http://localhost/api/tournaments/${id}/american-free-bracket`, {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
})

describe('LIBRE HTTP boundary', () => {
  let actor: { id: string } | null
  let responses: Record<string, unknown>
  let queries: Array<{ table: string; method: string; args: unknown[] }>
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'or', 'not', 'single', 'maybeSingle']) {
      builder[method] = (...args: unknown[]) => { queries.push({ table, method, args }); return builder }
    }
    builder.then = (resolve: (result: unknown) => unknown) => Promise.resolve(resolve(responses[table] ?? { data: [] }))
    return builder
  }
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(readFreeEditorData).mockResolvedValue({ couples: [], guards: {} })
    actor = { id: 'authenticated-actor' }
    queries = []
    responses = {
      tournaments: { data: { type: 'AMERICAN', format_config: getTournamentFormatPreset('AMERICAN_MULTI_ZONE_FREE'), status: 'ZONE_PHASE' } },
      american_free_brackets: { data: null }, zones: { count: 1 },
      inscriptions: { data: [{ couple_id: 'c1' }, { couple_id: 'c1' }, { couple_id: 'c2' }, { couple_id: 'disqualified' }] },
    }
    jest.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: actor } }) }, from } as never)
    jest.mocked(createClientServiceRole).mockResolvedValue({ from } as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true })
    jest.mocked(getPersistedBracketArtifacts).mockResolvedValue({ exists: false } as never)
    jest.mocked(getActiveDisqualifiedCoupleIds).mockResolvedValue(new Set(['disqualified']))
    jest.mocked(generateFreeBracket).mockResolvedValue({ requested_count: 20 } as never)
  })
  it('saves the full layout once with trusted actor and revision', async () => {
    const layout = buildFreeBracket(20).matches.map(({ id, slot1_origin, slot2_origin }) => ({ id, slot1_origin, slot2_origin, couple1_id: null, couple2_id: null }))
    const input = { expectedRevision: 4, layout }
    jest.mocked(saveFreeBracket).mockResolvedValue({ revision: 5 } as never)
    const response = await PATCH(request(input), context)
    expect(response.status).toBe(200)
    expect(saveFreeBracket).toHaveBeenCalledTimes(1)
    expect(saveFreeBracket).toHaveBeenCalledWith(expect.anything(), id, 'authenticated-actor', input)
    expect(await response.json()).toMatchObject({ snapshot: { revision: 5 } })
  })
  it('returns and logs the database rejection instead of silently retaining a failed save', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const layout = buildFreeBracket(20).matches.map(({ id, slot1_origin, slot2_origin }) => ({ id, slot1_origin, slot2_origin, couple1_id: null, couple2_id: null }))
      jest.mocked(saveFreeBracket).mockRejectedValue(new FreeBracketPersistenceError('Orígenes incompatibles con la distribución original', '22023'))
      const response = await PATCH(request({ expectedRevision: 6, layout }), context)
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ success: false, message: 'Orígenes incompatibles con la distribución original' })
      expect(log).toHaveBeenCalledWith('[AMERICANO LIBRE] Error en american-free-bracket', expect.objectContaining({ status: 400, code: '22023', message: 'Orígenes incompatibles con la distribución original' }))
    } finally { log.mockRestore() }
  })
  it.each([false, true])('denies save without management (anonymous=%s)', async (anonymous) => {
    if (anonymous) actor = null
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: false })
    expect((await PATCH(request({}), context)).status).toBe(anonymous ? 401 : 403)
    expect(saveFreeBracket).not.toHaveBeenCalled()
  })
  it('rejects capacity/actor spoofing and stale save revisions without retries', async () => {
    const layout = buildFreeBracket(20).matches.map(({ id, slot1_origin, slot2_origin }) => ({ id, slot1_origin, slot2_origin, couple1_id: null, couple2_id: null }))
    expect((await PATCH(request({ expectedRevision: 0, layout, actorId: id, effective_capacity: 99 }), context)).status).toBe(400)
    expect(saveFreeBracket).not.toHaveBeenCalled()
    jest.mocked(saveFreeBracket).mockRejectedValue(new FreeBracketPersistenceError('La llave cambió', '40001'))
    expect((await PATCH(request({ expectedRevision: 0, layout }), context)).status).toBe(409)
    expect(saveFreeBracket).toHaveBeenCalledTimes(1)
  })
  it('requires authentication before any mutation', async () => {
    actor = null
    expect((await POST(request({ requestedCount: 20 }), context)).status).toBe(401)
    expect(generateFreeBracket).not.toHaveBeenCalled()
  })
  it('rejects an authenticated user without management permission', async () => {
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: false })
    expect((await POST(request({ requestedCount: 20 }), context)).status).toBe(403)
    expect(generateFreeBracket).not.toHaveBeenCalled()
  })
  it.each([{ requestedCount: 65 }, { requestedCount: 1 }, { requestedCount: 20.5 }, { requestedCount: '20' }, { requestedCount: 20, actorId: 'spoofed' }])('rejects invalid/spoofed payload %j', async (body) => {
    expect((await POST(request(body), context)).status).toBe(400)
    expect(generateFreeBracket).not.toHaveBeenCalled()
  })
  it('derives actor from the session and returns the committed snapshot', async () => {
    const response = await POST(request({ requestedCount: 20 }), context)
    expect(response.status).toBe(200)
    expect(generateFreeBracket).toHaveBeenCalledWith(id, actor!.id, 20)
    expect(await response.json()).toMatchObject({ success: true, snapshot: { requested_count: 20 } })
  })
  it('returns conflict without retrying or partial success', async () => {
    jest.mocked(generateFreeBracket).mockRejectedValue(new FreeBracketPersistenceError('La llave cambió', '40001'))
    const response = await POST(request({ requestedCount: 20 }), context)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ success: false })
    expect(generateFreeBracket).toHaveBeenCalledTimes(1)
  })
  it('proposes distinct enabled couples, excludes lone players/pending inscriptions in query and disqualified couples', async () => {
    const result = await (await GET(new NextRequest('http://localhost'), context)).json()
    expect(result.suggestedCount).toBe(2)
    expect(result.blockedReason).toBeNull()
    expect(queries).toContainEqual({ table: 'inscriptions', method: 'not', args: ['couple_id', 'is', null] })
    expect(queries).toContainEqual({ table: 'inscriptions', method: 'or', args: ['is_pending.eq.false,is_pending.is.null'] })
    expect(queries.some((query) => query.table === 'matches')).toBe(false)
  })
  it('does not expose inscription counts or management to public readers', async () => {
    actor = null
    const result = await (await GET(new NextRequest('http://localhost'), context)).json()
    expect(result).toMatchObject({ canManage: false, snapshot: null })
    expect(result.suggestedCount).toBeUndefined()
    expect(createClientServiceRole).not.toHaveBeenCalled()
  })
  it.each([true, false])('returns the saved visibility to public readers (%s)', async showZoneReferences => {
    actor = null
    responses.tournaments = { data: { type: 'AMERICAN', format_config: getTournamentFormatPreset('AMERICAN_MULTI_ZONE_FREE'), status: 'ZONE_PHASE', show_bracket_zone_references: showZoneReferences } }
    const result = await (await GET(new NextRequest('http://localhost'), context)).json()
    expect(result.showZoneReferences).toBe(showZoneReferences)
    expect(createClientServiceRole).not.toHaveBeenCalled()
  })
  it.each([
    ['missing zones', { count: 0 }, false, 'Primero creá las zonas del torneo'],
    ['existing artifacts', { count: 1 }, true, 'Ya existe una llave o artefactos previos'],
  ])('retains generation preconditions: %s', async (_name, zoneResponse, exists, message) => {
    responses.zones = zoneResponse
    jest.mocked(getPersistedBracketArtifacts).mockResolvedValue({ exists } as never)
    const result = await (await GET(new NextRequest('http://localhost'), context)).json()
    expect(result.blockedReason).toBe(message)
  })
  it('returns the persisted distribution on reload without counting new registrations', async () => {
    responses.tournaments = { data: { type: 'AMERICAN', status: 'BRACKET_PHASE', format_config: { ...getTournamentFormatPreset('AMERICAN_MULTI_ZONE_FREE'), targetMatchesPerCouple: 3 } } }
    const structure = buildFreeBracket(20)
    responses.american_free_brackets = { data: {
      tournament_id: id, bracket_key: 'MAIN', contract_version: 1, revision: 0,
      requested_count: 20, base_size: 32, effective_capacity: 20, assigned_count: 0,
      original_slots: Object.fromEntries(structure.matches.map((match) => [match.id, [match.slot1_origin, match.slot2_origin]])),
      created_at: '2026-10-19T00:00:00Z',
    } }
    responses.matches = { data: structure.matches.map((match) => ({
      ...match, free_slot1_origin: match.slot1_origin, free_slot2_origin: match.slot2_origin,
      couple1_id: null, couple2_id: null, tournament_couple_seed1_id: null, tournament_couple_seed2_id: null,
      bracket_is_active: true, status: 'WAITING_OPPONENT', winner_id: null, free_bye_processed: false,
    })) }
    responses.match_hierarchy = { data: structure.hierarchy }
    const result = await (await GET(new NextRequest('http://localhost'), context)).json()
    expect(result.snapshot).toMatchObject({ requested_count: 20, base_size: 32, effective_capacity: 20, assigned_count: 0 })
    expect(result.snapshot.matches).toHaveLength(31)
    expect(result.snapshot.hierarchy).toHaveLength(30)
    expect(result.editor.zoneMatchTarget).toBe(3)
    jest.mocked(readFreeEditorData).mockImplementation(async () => {
      const previous = responses.american_free_brackets as { data: { revision: number } }
      responses.american_free_brackets = { data: { ...previous.data, revision: previous.data.revision + 1 } }
      return { couples: [], guards: {} }
    })
    expect((await GET(new NextRequest('http://localhost'), context)).status).toBe(409)
    expect(createClientServiceRole).not.toHaveBeenCalled()
  })
})
