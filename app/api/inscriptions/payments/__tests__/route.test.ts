import { NextRequest } from 'next/server'
import { GET } from '../route'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: jest.fn() } }))
const tid = '11111111-1111-4111-8111-111111111111'
const filters: string[] = []
let queryError: unknown
const request = () => new NextRequest(`http://localhost/api/inscriptions/payments?ids=${tid}`)
beforeEach(() => {
  jest.resetAllMocks(); filters.length = 0; queryError = null
  jest.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } } as never)
  jest.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
    const data = table === 'players' ? { id: 'player2' } : table === 'couples' ? [{ id: 'couple' }] : [{
      id: 'i', tournament_id: tid, payment_method: 'TRANSFER', payment_proof_path: 'private-path',
      payment_proof_status: 'PENDING_REVIEW', payment_revision: 1, is_pending: true,
    }]
    const query: any = {
      select: () => query, eq: () => query, in: () => query,
      or: (filter: string) => { filters.push(filter); return query },
      maybeSingle: () => Promise.resolve({ data, error: queryError }),
      then: (resolve: (result: unknown) => void) => Promise.resolve({ data, error: queryError }).then(resolve),
    }
    return query
  })
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
