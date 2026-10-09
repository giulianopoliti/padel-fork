jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

import { NextRequest } from 'next/server'
import { GET, POST, PATCH } from '../[id]/finalization-status/route'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { getTournamentFormatPreset } from '@/config/tournament-format-presets'

describe('Manual tournament finalization API', () => {
  let tournament: Record<string, unknown>
  let matches: Array<Record<string, unknown>>
  let client: { from: jest.Mock; auth: { getUser: jest.Mock } }
  let update: jest.Mock
  const bonuses = { GOLD: { enabled: true, champion: 80, finalist: 20 }, SILVER: { enabled: true, champion: 40, finalist: 10 } }
  const context = { params: Promise.resolve({ id: 'tournament' }) }
  const request = (body: unknown = { bonuses }) => new NextRequest('http://localhost/api/tournaments/tournament/finalization-status', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  })
  beforeEach(() => {
    jest.clearAllMocks()
    tournament = { status: 'BRACKET_PHASE', type: 'LONG', format_type: null, winner_id: null, format_config: getTournamentFormatPreset('LONG_SINGLE_ZONE_GOLD_SILVER') }
    matches = ['GOLD', 'SILVER'].map(key => ({ id: key, type: 'ELIMINATION', round: 'FINAL', bracket_key: key, status: 'FINISHED', winner_id: `${key}-winner` }))
    update = jest.fn()
    client = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'organizer' } } }) },
      from: jest.fn((table: string) => {
        let updating = false
        const query: Record<string, unknown> = {
          select: jest.fn(() => query), eq: jest.fn(() => query),
          update: jest.fn((value: unknown) => { updating = true; update(value); return query }),
          single: jest.fn(async () => ({ data: tournament, error: null })),
          maybeSingle: jest.fn(async () => ({ data: updating ? { id: 'tournament' } : tournament, error: null })),
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: table === 'matches' ? matches : tournament, error: null })),
        }
        return query
      }),
    }
    jest.mocked(createClient).mockResolvedValue(client as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true })
  })
  it('GET is read-only even after both finals finish', async () => {
    const response = await GET(new NextRequest('http://localhost/status'), context)
    expect((await response.json()).canFinalize).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })
  it('requires authentication and organizer permissions', async () => {
    client.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await POST(request(), context)).status).toBe(401)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: false, reason: 'Sin permisos' })
    expect((await POST(request(), context)).status).toBe(403)
    expect(update).not.toHaveBeenCalled()
  })
  it('blocks completed zones with no brackets', async () => {
    matches = [{ id: 'zone', type: 'ZONE', round: 'ZONE', status: 'FINISHED', bracket_key: 'MAIN', winner_id: 'winner' }]
    expect((await POST(request(), context)).status).toBe(409)
    expect(update).not.toHaveBeenCalled()
  })
  it('blocks pending Silver even when Gold finished', async () => {
    matches[1].status = 'PENDING'
    expect((await POST(request(), context)).status).toBe(409)
    expect(update).not.toHaveBeenCalled()
  })
  it('rejects invalid bonuses before writing anything', async () => {
    expect((await POST(request({ bonuses: { GOLD: { enabled: true, champion: -1, finalist: 20 } } }), context)).status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })
  it('closes manually, keeps Gold as primary winner and persists bonuses for both champions', async () => {
    const response = await POST(request(), context)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.champions).toHaveLength(2)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'FINISHED_POINTS_PENDING', winner_id: 'GOLD-winner',
      format_config: expect.objectContaining({ bonuses }),
    }))
  })
  it('does not regress a tournament with applied points', async () => {
    tournament.status = 'FINISHED_POINTS_CALCULATED'
    expect((await POST(request(), context)).status).toBe(409)
    expect(update).not.toHaveBeenCalled()
  })
  it('allows bonus edits after manual closure without changing status or winners', async () => {
    tournament.status = 'FINISHED_POINTS_PENDING'
    expect((await PATCH(request(), context)).status).toBe(200)
    expect(update).toHaveBeenCalledWith({ format_config: expect.objectContaining({ bonuses }) })
  })
  it('locks bonus configuration after points were applied', async () => {
    tournament.status = 'FINISHED_POINTS_CALCULATED'
    expect((await PATCH(request(), context)).status).toBe(409)
    expect(update).not.toHaveBeenCalled()
  })
})
