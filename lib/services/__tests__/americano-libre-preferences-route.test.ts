import { NextRequest } from 'next/server'
import { PATCH } from '@/app/api/tournaments/[id]/american-free-bracket/preferences/route'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { getTournamentFormatPreset } from '@/config/tournament-format-presets'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))
const id = '12345678-1234-4234-8234-123456789abc'
const context = { params: Promise.resolve({ id }) }
const request = (body: unknown) => new NextRequest(`http://localhost/api/tournaments/${id}/american-free-bracket/preferences`, { method: 'PATCH', body: JSON.stringify(body) })

describe('tournament zone reference preference', () => {
  let actor: { id: string } | null
  let tournament: unknown
  let updateError: unknown
  let saved: boolean
  let queries: Array<{ method: string; args: unknown[] }>
  const from = jest.fn(() => {
    let updating = false
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'single', 'update']) builder[method] = (...args: unknown[]) => {
      queries.push({ method, args })
      if (method === 'update') { updating = true; saved = (args[0] as { show_bracket_zone_references: boolean }).show_bracket_zone_references }
      return builder
    }
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(updating
      ? { data: { show_bracket_zone_references: saved }, error: updateError } : { data: tournament }))
    return builder
  })
  beforeEach(() => {
    jest.clearAllMocks(); queries = []; actor = { id: 'manager' }; updateError = null; saved = true
    tournament = { type: 'AMERICAN', format_config: getTournamentFormatPreset('AMERICAN_MULTI_ZONE_FREE') }
    jest.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: actor } }) } } as never)
    jest.mocked(createClientServiceRole).mockResolvedValue({ from } as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true })
  })
  it.each([true, false])('saves %s with a tournament filter and no sports fields', async showZoneReferences => {
    const response = await PATCH(request({ showZoneReferences }), context)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, showZoneReferences })
    expect(queries.filter(query => query.method === 'update')).toEqual([{ method: 'update', args: [{ show_bracket_zone_references: showZoneReferences }] }])
    expect(queries.filter(query => query.method === 'eq')).toEqual([{ method: 'eq', args: ['id', id] }, { method: 'eq', args: ['id', id] }])
    expect(checkTournamentPermissions).toHaveBeenCalledWith('manager', id)
  })
  it.each([true, false])('denies unauthorized writes before acquiring service access (anonymous %s)', async anonymous => {
    if (anonymous) actor = null
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: false })
    expect((await PATCH(request({ showZoneReferences: false }), context)).status).toBe(anonymous ? 401 : 403)
    expect(createClientServiceRole).not.toHaveBeenCalled()
  })
  it.each([{ showZoneReferences: 'false' }, { showZoneReferences: false, actorId: 'spoofed' }, {}])('rejects invalid preferences %j', async body => {
    expect((await PATCH(request(body), context)).status).toBe(400)
    expect(createClientServiceRole).not.toHaveBeenCalled()
  })
  it('does not update another tournament format', async () => {
    tournament = { type: 'LONG' }
    expect((await PATCH(request({ showZoneReferences: false }), context)).status).toBe(400)
    expect(queries.some(query => query.method === 'update')).toBe(false)
  })
  it('reports a failed save so the interface can keep the previous visibility', async () => {
    updateError = { message: 'database unavailable' }
    expect((await PATCH(request({ showZoneReferences: false }), context)).status).toBe(500)
  })
})
