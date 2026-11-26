jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

import { GET, POST } from '../[id]/points/reopen/route'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { revalidatePath } from 'next/cache'

describe('Tournament reopening API', () => {
  const rpc = jest.fn()
  const getUser = jest.fn()
  const context = { params: Promise.resolve({ id: 'tournament' }) }
  const fingerprint = 'a'.repeat(32)
  const request = (body: unknown = { fingerprint }) => new Request('http://localhost/api/tournaments/tournament/points/reopen', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

  beforeEach(() => {
    jest.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'owner' } } })
    jest.mocked(createClient).mockResolvedValue({ auth: { getUser } } as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true })
    jest.mocked(createClientServiceRole).mockResolvedValue({ rpc } as never)
    rpc.mockResolvedValue({ data: { fingerprint, playerChanges: [], canReopen: true } })
  })

  it('loads a read-only preview for the authorized actor without caching it', async () => {
    const response = await GET(new Request('http://localhost/reopen'), context)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('preview_tournament_reopen', { p_tournament_id: 'tournament', p_actor_id: 'owner' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('requires authentication and permission before any privileged call', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET(new Request('http://localhost/reopen'), context)).status).toBe(401)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: false, reason: 'Sin permisos' })
    expect((await POST(request(), context)).status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([{}, { fingerprint: 'bad' }, { fingerprint, pointsAfter: 0 }, { fingerprint, actorId: 'stranger' }])(
    'rejects missing previews and browser supplied scores/actors: %j', async body => {
      expect((await POST(request(body), context)).status).toBe(400)
      expect(rpc).not.toHaveBeenCalled()
    },
  )

  it('confirms through one transactional RPC and refreshes the affected views', async () => {
    rpc.mockResolvedValue({ data: { preview: { statusAfter: 'BRACKET_PHASE' }, alreadyReopened: false } })
    const response = await POST(request(), context)
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('reopen_tournament_points', {
      p_tournament_id: 'tournament', p_actor_id: 'owner', p_fingerprint: fingerprint,
    })
    expect((await response.json()).success).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith('/ranking')
    expect(revalidatePath).toHaveBeenCalledWith('/tournaments/tournament/settings/operacion')
  })

  it('returns the idempotent receipt unchanged', async () => {
    rpc.mockResolvedValue({ data: { preview: { statusAfter: 'ZONE_PHASE' }, alreadyReopened: true } })
    expect((await (await POST(request(), context)).json()).alreadyReopened).toBe(true)
  })

  it.each([['40001', 409], ['23505', 409], ['40P01', 409], ['42501', 403], ['22023', 400], ['PGRST202', 503]])(
    'surfaces database rejection %s as %s without refreshing views', async (code, status) => {
      rpc.mockResolvedValue({ error: { code, message: 'Movimiento posterior' } })
      expect((await POST(request(), context)).status).toBe(status)
      expect(revalidatePath).not.toHaveBeenCalled()
    },
  )
})
