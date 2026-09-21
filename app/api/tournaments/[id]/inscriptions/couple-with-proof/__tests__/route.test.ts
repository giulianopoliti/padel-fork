import { NextRequest } from 'next/server'
import { POST } from '../route'
import { createClient } from '@/utils/supabase/server'
import { getUserDetails } from '@/utils/db/getUserDetails'
import { registerCoupleForTournament, removeCoupleFromTournament } from '@/app/api/tournaments/actions'
import { uploadInscriptionProof } from '@/lib/services/inscription-proofs'
import { MAX_INSCRIPTION_PROOF_BYTES } from '@/lib/tournaments/inscription-proof'

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/utils/db/getUserDetails', () => ({ getUserDetails: jest.fn() }))
jest.mock('@/app/api/tournaments/actions', () => ({ registerCoupleForTournament: jest.fn(), removeCoupleFromTournament: jest.fn() }))
jest.mock('@/lib/services/inscription-proofs', () => ({ uploadInscriptionProof: jest.fn(), deleteInscriptionProof: jest.fn() }))

describe('registration with proof route', () => {
  const update = jest.fn()
  const getUser = jest.fn()
  const from = jest.fn()
  const request = (size = 100, type = 'image/jpeg') => {
    const form = new FormData()
    form.set('player1Id', 'player1')
    form.set('player2Id', 'player2')
    form.set('termsAccepted', 'true')
    form.set('proof', new File([new Uint8Array(size)], 'receipt.jpg', { type }))
    return new NextRequest('http://localhost/api/tournaments/tournament/inscriptions/couple-with-proof', { method: 'POST', body: form })
  }
  const run = (req = request()) => POST(req, { params: Promise.resolve({ id: 'tournament' }) })

  beforeEach(() => {
    jest.resetAllMocks()
    jest.spyOn(console, 'info').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    getUser.mockResolvedValue({ data: { user: { id: 'user' } }, error: null })
    jest.mocked(createClient).mockResolvedValue({ auth: { getUser }, from } as never)
    jest.mocked(getUserDetails).mockResolvedValue({ role: 'PLAYER', player_id: 'player1' } as never)
    from.mockImplementation((table: string) => table === 'tournaments'
      ? { select: () => ({ eq: () => ({ single: async () => ({ data: { enable_transfer_proof: true, transfer_alias: 'alias', transfer_amount: 35000 } }) }) }) }
      : { update })
    update.mockReturnValue({ eq: async () => ({ error: null }) })
    jest.mocked(registerCoupleForTournament).mockResolvedValue({ success: true, inscription: { id: 'inscription', coupleId: 'couple' } } as never)
    jest.mocked(uploadInscriptionProof).mockResolvedValue({ success: true, filePath: 'proof-path' })
  })
  afterEach(() => jest.restoreAllMocks())

  it.each([[MAX_INSCRIPTION_PROOF_BYTES + 1, 'image/jpeg', 413], [0, 'image/jpeg', 400], [100, 'text/plain', 400]])(
    'rejects invalid proof (%s bytes, %s) before any registration or upload', async (size, type, status) => {
      const response = await run(request(size as number, type as string))
      expect(response.status).toBe(status)
      expect(await response.json()).toMatchObject({ success: false, stage: 'upload' })
      expect(registerCoupleForTournament).not.toHaveBeenCalled()
      expect(uploadInscriptionProof).not.toHaveBeenCalled()
    },
  )

  it('requires authentication before processing the file', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect((await run()).status).toBe(401)
    expect(registerCoupleForTournament).not.toHaveBeenCalled()
  })

  it('only confirms once registration, storage and metadata updates succeed', async () => {
    const response = await run()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, data: { inscriptionId: 'inscription' } })
    expect(registerCoupleForTournament).toHaveBeenCalledTimes(1)
    expect(uploadInscriptionProof).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ payment_proof_status: 'PENDING_REVIEW' }))
  })

  it('does not upload again when the registration service rejects a duplicate', async () => {
    jest.mocked(registerCoupleForTournament).mockResolvedValue({ success: false, error: 'La pareja ya está inscrita' } as never)
    const response = await run()
    expect(response.status).toBe(400)
    expect(uploadInscriptionProof).not.toHaveBeenCalled()
    expect(removeCoupleFromTournament).not.toHaveBeenCalled()
  })

  it('reports a storage error in the upload stage and rolls back registration', async () => {
    jest.mocked(uploadInscriptionProof).mockResolvedValue({ success: false, error: 'Storage failure' })
    const response = await run()
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ success: false, stage: 'upload' })
    expect(removeCoupleFromTournament).toHaveBeenCalledWith('tournament', 'couple')
  })
})
