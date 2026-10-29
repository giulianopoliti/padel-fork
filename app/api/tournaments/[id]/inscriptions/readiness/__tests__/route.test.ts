import { NextRequest } from 'next/server'
import { DELETE } from '../route'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentAccess } from '@/utils/tournament-permissions'
import { scheduleInscriptionProofCleanup } from '@/lib/services/inscription-proofs'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentAccess: jest.fn() }))
jest.mock('@/lib/services/registration/registration-readiness', () => ({ getRegistrationReadiness: jest.fn() }))
jest.mock('@/lib/services/inscription-proofs', () => ({ scheduleInscriptionProofCleanup: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const id = '11111111-1111-4111-8111-111111111111'
const context = { params: Promise.resolve({ id: 'tournament' }) }
const deleted = jest.fn(), eq = jest.fn(), not = jest.fn(), maybeSingle = jest.fn()
const request = (values: unknown) => new NextRequest('http://localhost/api/tournaments/tournament/inscriptions/readiness', {
  method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
})
beforeEach(() => {
  jest.resetAllMocks()
  const query = { delete: deleted, eq, not, select: () => query, maybeSingle }
  deleted.mockReturnValue(query); eq.mockReturnValue(query); not.mockReturnValue(query)
  maybeSingle.mockResolvedValue({ data: { id }, error: null })
  jest.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'manager' } }, error: null }) } } as never)
  jest.mocked(checkTournamentAccess).mockResolvedValue({ permissions: ['manage_inscriptions'] } as never)
  jest.mocked(createClientServiceRole).mockResolvedValue({ from: () => query } as never)
})
it('only discards the selected unconfirmed couple at the reviewed revision, within this tournament', async () => {
  expect((await DELETE(request({ inscriptionId: id, revision: 2 }), context)).status).toBe(200)
  expect(eq.mock.calls).toEqual([['id', id], ['tournament_id', 'tournament'], ['occupies_slot', false], ['payment_revision', 2], ['es_prueba', false]])
  expect(not).toHaveBeenCalledWith('couple_id', 'is', null)
  expect(scheduleInscriptionProofCleanup).toHaveBeenCalledTimes(1)
})
it('does not discard after another tab accepted the couple or uploaded a receipt', async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null })
  expect((await DELETE(request({ inscriptionId: id, revision: 2 }), context)).status).toBe(409)
  expect(scheduleInscriptionProofCleanup).not.toHaveBeenCalled()
})
it('requires inscription management permissions rather than merely being signed in', async () => {
  jest.mocked(checkTournamentAccess).mockResolvedValue({ permissions: ['view_tournament'] } as never)
  expect((await DELETE(request({ inscriptionId: id, revision: 2 }), context)).status).toBe(403)
  expect(createClientServiceRole).not.toHaveBeenCalled()
})
it('rejects an unauthenticated request', async () => {
  jest.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } } as never)
  expect((await DELETE(request({ inscriptionId: id, revision: 2 }), context)).status).toBe(403)
  expect(deleted).not.toHaveBeenCalled()
})
it.each([{ inscriptionId: id }, { inscriptionId: id, revision: -1 }, { inscriptionId: id, revision: '2' }, { inscriptionId: 'bad-id', revision: 2 }])('rejects an invalid discard request: %j', async values => {
  expect((await DELETE(request(values), context)).status).toBe(400)
  expect(deleted).not.toHaveBeenCalled()
})
it('does not report success or schedule cleanup when deletion fails', async () => {
  maybeSingle.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
  expect((await DELETE(request({ inscriptionId: id, revision: 2 }), context)).status).toBe(500)
  expect(scheduleInscriptionProofCleanup).not.toHaveBeenCalled()
})
