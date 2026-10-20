import { NextRequest } from 'next/server'
import { POST } from '@/app/api/tournaments/[id]/american-free-bracket/sports/route'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { mutateFreeSports } from '../americano-libre-sports'
import { FreeBracketPersistenceError } from '../americano-libre-persistence'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))
jest.mock('../americano-libre-sports', () => ({ mutateFreeSports: jest.fn() }))
const id = '00000000-0000-4000-8000-000000000001'
const context = { params: Promise.resolve({ id }) }
const valid = { expectedRevision: 3, operations: [{ kind: 'PROCESS_BYE', matchId: id }] }
const request = (body: unknown) => new NextRequest(`http://localhost/api/tournaments/${id}/american-free-bracket/sports`, { method: 'POST', body: JSON.stringify(body) })
describe('LIBRE sports HTTP authorization and revision', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'verified-actor' } } }) } } as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true } as never)
    jest.mocked(createClientServiceRole).mockResolvedValue({ trusted: true } as never)
    jest.mocked(mutateFreeSports).mockResolvedValue({ revision: 4 } as never)
  })
  it('rejects anonymous callers before accessing privileged persistence', async () => {
    jest.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } } as never)
    expect((await POST(request(valid), context)).status).toBe(401)
    expect(createClientServiceRole).not.toHaveBeenCalled()
  })
  it('rejects unauthorized managers', async () => {
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: false } as never)
    expect((await POST(request(valid), context)).status).toBe(403)
    expect(mutateFreeSports).not.toHaveBeenCalled()
  })
  it('rejects missing revision and untrusted actor fields before RPC', async () => {
    expect((await POST(request({ operations: valid.operations }), context)).status).toBe(400)
    expect((await POST(request({ ...valid, actorId: 'spoof' }), context)).status).toBe(400)
    expect(mutateFreeSports).not.toHaveBeenCalled()
  })
  it('forwards only the authenticated actor and typed operations', async () => {
    expect((await POST(request(valid), context)).status).toBe(200)
    expect(mutateFreeSports).toHaveBeenCalledWith({ trusted: true }, id, 'verified-actor', valid)
  })
  it('surfaces revision conflicts without retrying or reporting success', async () => {
    jest.mocked(mutateFreeSports).mockRejectedValue(new FreeBracketPersistenceError('Recargá', '40001'))
    const response = await POST(request(valid), context)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ success: false, message: 'Recargá' })
    expect(mutateFreeSports).toHaveBeenCalledTimes(1)
  })
})
