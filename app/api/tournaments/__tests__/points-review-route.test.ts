jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

import { GET, POST } from '../[id]/points/route'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { makeContext } from '@/lib/services/points/testing/fixtures'
import { buildPointsReview } from '@/lib/services/points/services/points-review.engine'

describe('Points preview and atomic confirmation API', () => {
  let source: ReturnType<typeof makeContext>
  const rpc = jest.fn()
  const getUser = jest.fn()
  const context = { params: Promise.resolve({ id: 'tournament' }) }
  const request = (body: unknown = { fingerprint: 'a'.repeat(32), categoryChanges: [], acceptCurrentScoreBasis: true }) => new Request('http://localhost/api/tournaments/tournament/points', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  beforeEach(() => {
    jest.clearAllMocks()
    source = makeContext()
    getUser.mockResolvedValue({ data: { user: { id: 'owner' } } })
    jest.mocked(createClient).mockResolvedValue({ auth: { getUser } } as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true })
    jest.mocked(createClientServiceRole).mockResolvedValue({ rpc } as never)
    rpc.mockImplementation(async (name: string, args: { p_calculation?: { review: unknown } }) => {
      if (name === 'get_tournament_points_context') return { data: source, error: null }
      if (name === 'commit_tournament_points') return { data: { review: { ...(args.p_calculation?.review as object), state: 'APPLIED' }, alreadyApplied: false }, error: null }
      throw new Error(`Unexpected RPC ${name}`)
    })
  })
  it('GET only loads a read context, exposes the fallback, and does not insert snapshots', async () => {
    const response = await GET(new Request('http://localhost/points'), context)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect((await response.json()).scoreBasis).toBe('CURRENT')
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['get_tournament_points_context'])
  })
  it('requires authentication and tournament permission before privileged reads', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET(new Request('http://localhost/points'), context)).status).toBe(401)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: false, reason: 'Sin permisos' })
    expect((await POST(request(), context)).status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('does not accept browser-calculated scores or a request without a reviewed fingerprint', async () => {
    expect((await POST(request({ fingerprint: 'a'.repeat(32), categoryChanges: [], acceptCurrentScoreBasis: true, points: 999 }), context)).status).toBe(400)
    expect((await POST(request({}), context)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('requires explicit acknowledgement for missing historical snapshots', async () => {
    const response = await POST(request({ fingerprint: 'a'.repeat(32), categoryChanges: [], acceptCurrentScoreBasis: false }), context)
    expect(response.status).toBe(400)
    expect(rpc.mock.calls.some(call => call[0] === 'commit_tournament_points')).toBe(false)
  })
  it('rejects changed data before applying any points', async () => {
    source.fingerprint = 'b'.repeat(32)
    expect((await POST(request(), context)).status).toBe(409)
    expect(rpc.mock.calls.some(call => call[0] === 'commit_tournament_points')).toBe(false)
  })
  it('sends server-calculated values and the authenticated actor in one transaction', async () => {
    const response = await POST(request(), context)
    expect(response.status).toBe(200)
    const call = rpc.mock.calls.find(row => row[0] === 'commit_tournament_points')![1]
    expect(call.p_actor_id).toBe('owner')
    expect(call.p_calculation.review.playerScores[0]).toMatchObject({ pointsAfter: 932, categoryAfter: '7ma' })
    expect((await response.json()).review.state).toBe('APPLIED')
  })
  it('returns the original saved result after a timeout/retry, without repeating the commit', async () => {
    source.settlement = { ...buildPointsReview(source).review, state: 'APPLIED' }
    const response = await POST(request(), context)
    expect((await response.json()).alreadyApplied).toBe(true)
    expect(rpc.mock.calls.some(call => call[0] === 'commit_tournament_points')).toBe(false)
  })
  it('surfaces a conflict from the locked transaction', async () => {
    rpc.mockImplementation(async (name: string) => name === 'get_tournament_points_context' ? { data: source } : { error: { code: '40001', message: 'changed' } })
    expect((await POST(request(), context)).status).toBe(409)
  })
  it('fails closed with a visible message when the migration has not been enabled', async () => {
    rpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'Missing function' } })
    const response = await GET(new Request('http://localhost/points'), context)
    expect(response.status).toBe(503)
    expect((await response.json()).error).toContain('todavía no está habilitada')
  })
})
