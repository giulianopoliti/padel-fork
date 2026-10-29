import { NextRequest } from 'next/server'
import { GET } from '../route'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: jest.fn() } }))
const tid = '11111111-1111-4111-8111-111111111111'
const filters: string[] = []
let queryError: unknown
let countError: unknown
let occupied: number
let paymentRows: Record<string, unknown>[]
const request = () => new NextRequest(`http://localhost/api/inscriptions/payments?ids=${tid}`)
beforeEach(() => {
  jest.resetAllMocks(); filters.length = 0; queryError = null; countError = null; occupied = 0
  paymentRows = [{
    id: 'i', tournament_id: tid, couple_id: 'couple', occupies_slot: true, payment_method: 'TRANSFER', payment_proof_path: 'private-path',
    payment_proof_status: 'PENDING_REVIEW', payment_revision: 1, is_pending: true,
  }]
  jest.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } } as never)
  jest.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
    const data = table === 'players' ? { id: 'player2' } : table === 'couples' ? [{ id: 'couple' }] : paymentRows
    let countOnly = false
    const query: any = {
      select: (_columns: string, options?: { head?: boolean }) => { countOnly = options?.head === true; return query }, eq: () => query, in: () => query, not: () => query,
      or: (filter: string) => { filters.push(filter); return query },
      maybeSingle: () => Promise.resolve({ data, error: queryError }),
      then: (resolve: (result: unknown) => void) => Promise.resolve(countOnly ? { count: occupied, error: countError } : { data, error: queryError }).then(resolve),
    }
    return query
  })
})

it.each([[15, 'available'], [16, 'full'], [2000, 'full']])('reports current availability for an unconfirmed inscription without exposing counts (%s)', async (count, expected) => {
  occupied = Number(count)
  paymentRows[0] = { ...paymentRows[0], occupies_slot: false, tournaments: { max_participants: 16, enable_transfer_proof: true, status: 'NOT_STARTED', registration_locked: true, registration_locked_by_capacity: true } }
  const response = await GET(request())
  const result = await response.json()
  expect(result.inscriptions[tid].slotAvailability).toBe(expected)
  expect(JSON.stringify(result)).not.toMatch(/max_participants|remainingSlots|occupied|private-path/)
})

it('does not report a full tournament when capacity is unlimited', async () => {
  occupied = 2000
  paymentRows[0] = { ...paymentRows[0], occupies_slot: false, tournaments: { max_participants: null, status: 'NOT_STARTED' } }
  expect((await (await GET(request())).json()).inscriptions[tid].slotAvailability).toBe('available')
})

it('distinguishes organizer-closed admissions from capacity closure', async () => {
  paymentRows[0] = { ...paymentRows[0], occupies_slot: false, tournaments: { max_participants: 16, status: 'NOT_STARTED', registration_locked: true, registration_locked_by_capacity: false } }
  expect((await (await GET(request())).json()).inscriptions[tid].slotAvailability).toBe('closed')
})

it('does not claim available places when the capacity query fails', async () => {
  countError = { message: 'unavailable' }
  paymentRows[0] = { ...paymentRows[0], occupies_slot: false, tournaments: { max_participants: 16, status: 'NOT_STARTED' } }
  expect((await GET(request())).status).toBe(500)
})

it('loads only the authenticated player across both couple positions, in one inscriptions query', async () => {
  const response = await GET(request())
  expect(await response.json()).toMatchObject({ inscriptions: { [tid]: { id: 'i', hasProof: true, isPending: true } } })
  expect(filters).toContain('player1_id.eq.player2,player2_id.eq.player2')
  expect(filters).toContain('and(couple_id.is.null,player_id.eq.player2),couple_id.in.(couple)')
  expect(jest.mocked(supabaseAdmin.from).mock.calls.filter(([table]) => table === 'inscriptions')).toHaveLength(1)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
})

it('does not expose paths or bank snapshots', async () => {
  const result = await (await GET(request())).text()
  expect(result).not.toContain('private-path')
  expect(result).not.toMatch(/alias|amount|payment_proof_path/)
})

it('returns errors without pretending there is no inscription', async () => {
  queryError = { code: 'offline' }
  const response = await GET(request())
  expect(response.status).toBe(500)
  expect(await response.json()).toMatchObject({ success: false })
})

it('requires an authenticated session', async () => {
  jest.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } } as never)
  expect((await GET(request())).status).toBe(401)
  expect(supabaseAdmin.from).not.toHaveBeenCalled()
})

it('validates the visible tournament IDs', async () => {
  expect((await GET(new NextRequest('http://localhost/api/inscriptions/payments?ids=invalid'))).status).toBe(400)
})
