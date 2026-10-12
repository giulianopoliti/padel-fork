import { NextRequest } from 'next/server'
import { GET, POST } from '../route'
import { POST as legacyPOST } from '../../couple-with-proof/route'
import { createClient } from '@/utils/supabase/server'
import { getUserDetails } from '@/utils/db/getUserDetails'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { registerCoupleForTournament } from '@/app/api/tournaments/actions'
import { uploadInscriptionProof, deleteInscriptionProof, scheduleInscriptionProofCleanup } from '@/lib/services/inscription-proofs'
import { reconcileCompleteInscriptions } from '@/lib/services/registration/reconcile-complete-inscriptions'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { sendTournamentMessage } from '@/lib/services/messages'

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/services/messages', () => ({ sendTournamentMessage: jest.fn(async () => [{ success: true }]) }))
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/utils/db/getUserDetails', () => ({ getUserDetails: jest.fn() }))
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: jest.fn(), rpc: jest.fn() } }))
jest.mock('@/app/api/tournaments/actions', () => ({ registerCoupleForTournament: jest.fn() }))
jest.mock('@/lib/services/inscription-proofs', () => ({ uploadInscriptionProof: jest.fn(), deleteInscriptionProof: jest.fn(), scheduleInscriptionProofCleanup: jest.fn() }))
jest.mock('@/lib/services/registration/reconcile-complete-inscriptions', () => ({ reconcileCompleteInscriptions: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))

const tournamentId = '11111111-1111-4111-8111-111111111111'
const context = { params: Promise.resolve({ id: tournamentId }) }
const endpoint = `https://tpepadel.com/api/tournaments/${tournamentId}/inscriptions/payment`
const initial = { payment_revision: 0, id: 'inscription', couple_id: 'couple', player_id: 'player', payment_method: 'TRANSFER', payment_proof_path: null, payment_proof_status: 'NOT_REQUIRED', is_pending: false, payment_alias_snapshot: 'snapshot', payment_amount_snapshot: 100 }
let inscription: Record<string, any> | null
let owned: Array<{ id: string; player1_id: string; player2_id: string }>
let settings: Record<string, unknown>
let rejectUpdate: boolean
let commitWithError: boolean
let failRead: boolean
const update = jest.fn()
const run = (operation: string, extras: Record<string, string> = {}, proof?: File) => {
  const body = new FormData()
  body.set('operation', operation)
  Object.entries(extras).forEach(([key, value]) => body.set(key, value))
  if (proof) body.set('proof', proof)
  return POST(new NextRequest(endpoint, { method: 'POST', body }), context)
}
const proof = () => new File(['test receipt'], 'receipt.png', { type: 'image/png' })

describe('resumable inscription payments', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(sendTournamentMessage).mockResolvedValue([{ success: true }])
    jest.spyOn(console, 'info').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    inscription = { ...initial }
    owned = [{ id: 'couple', player1_id: 'player', player2_id: 'companion' }]
    settings = { enable_transfer_proof: true, allow_cash_payment: false, transfer_alias: 'current', transfer_amount: 120, type: 'AMERICAN' }
    rejectUpdate = false; commitWithError = false; failRead = false
    jest.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user' } }, error: null }) },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: settings, error: null }) }) }) }),
    } as never)
    jest.mocked(getUserDetails).mockResolvedValue({ role: 'PLAYER', player_id: 'player' } as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: false })
    jest.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      let patch: Record<string, unknown> | undefined
      const eqs: Record<string, unknown> = {}
      let requiresNoProof = false
      const execute = async () => {
        if (table === 'couples') return { data: owned, error: null }
        if (failRead && !patch) return { data: null, error: { code: 'ConnectionFailure' } }
        if (patch) {
          update(patch)
          if (rejectUpdate || !inscription || (requiresNoProof && inscription.payment_proof_path)) return { data: null, error: null }
          inscription = { ...inscription, ...patch }
          return commitWithError ? { data: null, error: { code: 'TransportError' } } : { data: inscription, error: null }
        }
        const data = eqs.id && eqs.id !== inscription?.id ? null : inscription
        return { data, error: null }
      }
      const query: any = {
        select: () => query, eq: (key: string, value: unknown) => { eqs[key] = value; return query },
        in: () => query, or: () => query, not: () => query,
        is: () => { requiresNoProof = true; return query },
        update: (value: Record<string, unknown>) => { patch = value; return query },
        maybeSingle: execute, then: (resolve: (result: unknown) => void) => execute().then(result => resolve({ ...result, data: Array.isArray(result.data) ? result.data : result.data ? [result.data] : [] })),
      }
      return query
    })
    jest.mocked(supabaseAdmin.rpc).mockImplementation((async (_name: string, params: any) => {
      if (rejectUpdate || !inscription) return { data: null, error: null } as never
      if (_name === 'approve_inscription_proof') {
        if (params.p_path !== inscription.payment_proof_path) return { data: null, error: { code: '40001' } } as never
        if (inscription.payment_revision === params.p_revision + 1 && inscription.payment_proof_status === 'APPROVED') return { data: [inscription], error: null } as never
        if (params.p_revision !== inscription.payment_revision) return { data: null, error: { code: '40001' } } as never
        inscription = { ...inscription, payment_proof_status: 'APPROVED', payment_reviewed_at: '2026-10-12T19:00:00Z', payment_reviewed_by: params.p_reviewer, payment_revision: inscription.payment_revision + 1 }
        return (commitWithError ? { data: null, error: { code: 'TransportError' } } : { data: [inscription], error: null }) as never
      }
      if (params.p_revision !== inscription.payment_revision) return { data: null, error: { code: '40001' } } as never
      if (!params.p_manager && inscription.payment_proof_status === 'APPROVED') return { data: null, error: { code: '42501' } } as never
      const op = params.p_operation
      const patch = op === 'attach' || op === 'replace'
        ? { payment_proof_path: params.p_path, payment_proof_status: 'PENDING_REVIEW' }
        : op === 'remove' ? { payment_proof_path: null, payment_proof_status: 'NOT_REQUIRED' }
        : { payment_method: op === 'cash' ? 'CASH' : 'TRANSFER', payment_proof_path: null }
      update(patch)
      inscription = { ...inscription, ...patch, payment_revision: inscription.payment_revision + 1 }
      return (commitWithError ? { data: null, error: { code: 'TransportError' } } : { data: [inscription], error: null }) as never
    }) as never)
    jest.mocked(registerCoupleForTournament).mockImplementation(async () => {
      inscription = { ...initial }
      return { success: true, inscription: { id: 'inscription', coupleId: 'couple' } }
    })
    jest.mocked(uploadInscriptionProof).mockResolvedValue({ success: true, filePath: 'stored-proof' })
    jest.mocked(deleteInscriptionProof).mockResolvedValue({ success: true })
  })
  afterEach(() => jest.restoreAllMocks())

  const prepareApproval = () => {
    jest.mocked(getUserDetails).mockResolvedValue({ role: 'ADMIN' } as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true })
    inscription!.payment_proof_path = 'original'
    inscription!.payment_proof_status = 'PENDING_REVIEW'
  }
  it.each([true, false])('approves a proof without changing inscription approval (%s)', async pending => {
    prepareApproval()
    inscription!.is_pending = pending
    const response = await run('approve-proof', { inscriptionId: 'inscription', revision: '0', reviewer: 'forged' })
    expect(response.status).toBe(200)
    expect(inscription).toMatchObject({ is_pending: pending, payment_proof_path: 'original', payment_proof_status: 'APPROVED', payment_reviewed_by: 'user', payment_revision: 1 })
    expect(reconcileCompleteInscriptions).not.toHaveBeenCalled()
    expect(scheduleInscriptionProofCleanup).not.toHaveBeenCalled()
    expect(uploadInscriptionProof).not.toHaveBeenCalled()
    expect(sendTournamentMessage).not.toHaveBeenCalled()
  })
  it('rejects player approval even when the player owns the proof', async () => {
    inscription!.payment_proof_path = 'original'; inscription!.payment_proof_status = 'PENDING_REVIEW'
    expect((await run('approve-proof', { inscriptionId: 'inscription', revision: '0' })).status).toBe(403)
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled()
  })
  it('rejects an organizer without permission for this tournament', async () => {
    prepareApproval()
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: false })
    expect((await run('approve-proof', { inscriptionId: 'inscription', revision: '0' })).status).toBe(403)
  })
  it.each(['', '-1', '1.5', 'NaN', '9007199254740992'])('rejects invalid approval revision %s', async revision => {
    prepareApproval()
    expect((await run('approve-proof', { inscriptionId: 'inscription', revision })).status).toBe(400)
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled()
  })
  it('requires an explicit inscription and revision', async () => {
    prepareApproval()
    expect((await run('approve-proof', { inscriptionId: 'inscription' })).status).toBe(400)
    expect((await run('approve-proof', { revision: '0' })).status).toBe(400)
  })
  it('rejects proof approval without a saved file', async () => {
    prepareApproval(); inscription!.payment_proof_path = null
    expect((await run('approve-proof', { inscriptionId: 'inscription', revision: '0' })).status).toBe(400)
  })
  it('confirms a committed approval after losing the RPC response', async () => {
    prepareApproval(); commitWithError = true
    expect((await run('approve-proof', { inscriptionId: 'inscription', revision: '0' })).status).toBe(200)
    expect(inscription!.payment_revision).toBe(1)
  })
  it('does not approve a concurrent replacement', async () => {
    prepareApproval()
    jest.mocked(supabaseAdmin.rpc).mockImplementationOnce(async () => {
      inscription!.payment_revision = 1; inscription!.payment_proof_path = 'replacement'
      return { data: null, error: { code: '40001' } } as never
    })
    expect((await run('approve-proof', { inscriptionId: 'inscription', revision: '0' })).status).toBe(409)
    expect(inscription!.payment_proof_status).toBe('PENDING_REVIEW')
  })
  it('accepts a duplicate approval without overwriting the reviewer', async () => {
    prepareApproval()
    expect((await run('approve-proof', { inscriptionId: 'inscription', revision: '0' })).status).toBe(200)
    inscription!.payment_reviewed_by = 'first-organizer'
    expect((await run('approve-proof', { inscriptionId: 'inscription', revision: '0' })).status).toBe(200)
    expect(inscription).toMatchObject({ payment_revision: 1, payment_reviewed_by: 'first-organizer' })
  })

  it('shares the organizer payment list without exposing storage paths to players', async () => {
    const request = new NextRequest(`${endpoint}?list=1`)
    expect((await GET(request, context)).status).toBe(403)
    jest.mocked(getUserDetails).mockResolvedValue({ role: 'ADMIN' } as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true })
    const response = await GET(request, context)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ incompleteCount: 1, inscriptions: [{ id: 'inscription', hasProof: false }] })
    expect(JSON.stringify(body)).not.toContain('payment_proof_path')
  })

  it('reserves without requiring a file', async () => {
    inscription = null
    const response = await run('reserve', { player2Id: 'companion', method: 'TRANSFER', termsAccepted: 'true' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ inscription: { id: 'inscription', hasProof: false, method: 'TRANSFER' } })
    expect(uploadInscriptionProof).not.toHaveBeenCalled()
    expect(registerCoupleForTournament).toHaveBeenCalledTimes(1)
  })

  it('returns the same inscription on a repeated submission without inserting again', async () => {
    expect((await run('reserve', { player2Id: 'companion', method: 'TRANSFER' })).status).toBe(200)
    expect(registerCoupleForTournament).not.toHaveBeenCalled()
  })

  it('does not silently accept a different companion', async () => {
    expect((await run('reserve', { player2Id: 'other', method: 'TRANSFER' })).status).toBe(409)
  })

  it('recovers an inscription saved before the registration response failed', async () => {
    inscription = null
    jest.mocked(registerCoupleForTournament).mockImplementation(async () => {
      inscription = { ...initial }
      return { success: false, error: 'post-save failure' }
    })
    expect((await run('reserve', { player2Id: 'companion', method: 'TRANSFER' })).status).toBe(200)
  })

  it('retains the inscription when uploading fails', async () => {
    jest.mocked(uploadInscriptionProof).mockResolvedValue({ success: false, error: 'unavailable' })
    expect((await run('attach', { inscriptionId: 'inscription' }, proof())).status).toBe(500)
    expect(inscription).toEqual(initial)
    expect(update).not.toHaveBeenCalled()
  })

  it('links a proof without inserting another inscription or changing approval', async () => {
    expect((await run('attach', { inscriptionId: 'inscription' }, proof())).status).toBe(200)
    expect(inscription).toEqual(expect.objectContaining({ payment_proof_path: 'stored-proof' }))
    expect(inscription?.is_pending).toBe(false)
    expect(inscription?.payment_alias_snapshot).toBe('snapshot')
    expect(registerCoupleForTournament).not.toHaveBeenCalled()
  })

  it('recovers a committed proof update when its response was lost', async () => {
    commitWithError = true
    expect((await run('attach', { inscriptionId: 'inscription' }, proof())).status).toBe(200)
    expect(deleteInscriptionProof).not.toHaveBeenCalled()
  })

  it('rejects a zero-row update and leaves the durable upload ticket for cleanup', async () => {
    rejectUpdate = true
    expect((await run('attach', { inscriptionId: 'inscription' }, proof())).status).toBe(409)
    expect(inscription).toEqual(initial)
    expect(deleteInscriptionProof).not.toHaveBeenCalled()
  })

  it('never removes a possibly linked file if confirming the write also fails', async () => {
    jest.mocked(uploadInscriptionProof).mockImplementation(async () => { rejectUpdate = true; failRead = true; return { success: true, filePath: 'stored-proof' } })
    expect((await run('attach', { inscriptionId: 'inscription' }, proof())).status).toBe(500)
    expect(deleteInscriptionProof).not.toHaveBeenCalled()
  })

  it('does not upload twice after a lost confirmation', async () => {
    inscription!.payment_proof_path = 'already-stored'
    expect((await run('attach', { inscriptionId: 'inscription' }, proof())).status).toBe(200)
    expect(uploadInscriptionProof).not.toHaveBeenCalled()
  })

  it('rejects invalid files without changing the reservation', async () => {
    expect((await run('attach', { inscriptionId: 'inscription' }, new File(['bad'], 'bad.txt', { type: 'text/plain' }))).status).toBe(400)
    expect(inscription).toEqual(initial)
  })

  it('allows cash only when enabled and never marks money as received', async () => {
    expect((await run('cash', { inscriptionId: 'inscription', revision: '0' })).status).toBe(400)
    settings.allow_cash_payment = true
    expect((await run('cash', { inscriptionId: 'inscription', revision: '0' })).status).toBe(200)
    expect(update).toHaveBeenCalledWith({ payment_method: 'CASH', payment_proof_path: null })
    expect(inscription?.is_pending).toBe(false)
  })

  it('requires ownership even when an inscription ID is known', async () => {
    owned = []
    expect((await run('attach', { inscriptionId: 'inscription' }, proof())).status).toBe(403)
    expect((await GET(new NextRequest(endpoint + '?inscriptionId=inscription'), context)).status).toBe(403)
    expect(uploadInscriptionProof).not.toHaveBeenCalled()
  })

  it('requires login before reading or mutating', async () => {
    jest.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } } as never)
    expect((await run('attach', {}, proof())).status).toBe(401)
  })

  it('permits the tournament manager to complete a registration', async () => {
    owned = []
    jest.mocked(getUserDetails).mockResolvedValue({ role: 'ORGANIZADOR' } as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true })
    expect((await run('attach', { inscriptionId: 'inscription' }, proof())).status).toBe(200)
  })

  it('keeps success and proof after a deferred zone assignment fails', async () => {
    jest.mocked(reconcileCompleteInscriptions).mockRejectedValue(new Error('zone unavailable'))
    expect((await run('attach', { inscriptionId: 'inscription' }, proof())).status).toBe(200)
    expect(deleteInscriptionProof).not.toHaveBeenCalled()
  })

  it('supports an already-open browser using the previous combined endpoint', async () => {
    inscription = null
    const body = new FormData()
    body.set('player2Id', 'companion'); body.set('termsAccepted', 'true'); body.set('proof', proof())
    expect((await legacyPOST(new NextRequest(endpoint, { method: 'POST', body }), context)).status).toBe(200)
    expect(registerCoupleForTournament).toHaveBeenCalledTimes(1)
    expect(inscription).toEqual(expect.objectContaining({ payment_proof_path: 'stored-proof' }))
  })
  it('changes cash back to an incomplete transfer without losing approval', async () => {
    inscription!.payment_method = 'CASH'
    expect((await run('transfer', { inscriptionId: 'inscription', revision: '0' })).status).toBe(200)
    expect(inscription).toMatchObject({ payment_method: 'TRANSFER', is_pending: false, payment_proof_path: null })
  })
  it('rejects a disabled transfer without changing the existing cash choice', async () => {
    inscription!.payment_method = 'CASH'; settings.enable_transfer_proof = false
    expect((await run('transfer', { inscriptionId: 'inscription', revision: '0' })).status).toBe(400)
    expect(inscription!.payment_method).toBe('CASH')
  })
  it('lets a player replace a pending proof and resets its review', async () => {
    inscription!.payment_proof_path = 'original'
    expect((await run('replace', { inscriptionId: 'inscription', revision: '0' }, proof())).status).toBe(200)
    expect(inscription).toMatchObject({ payment_proof_path: 'stored-proof', payment_proof_status: 'PENDING_REVIEW', is_pending: false })
  })
  it('keeps the original when replacement upload fails', async () => {
    inscription!.payment_proof_path = 'original'
    jest.mocked(uploadInscriptionProof).mockResolvedValue({ success: false, error: 'offline' })
    expect((await run('replace', { inscriptionId: 'inscription', revision: '0' }, proof())).status).toBe(500)
    expect(inscription!.payment_proof_path).toBe('original')
  })
  it('removes a proof without cancelling the inscription', async () => {
    inscription!.payment_proof_path = 'original'
    expect((await run('remove', { inscriptionId: 'inscription', revision: '0' })).status).toBe(200)
    expect(inscription).toMatchObject({ id: 'inscription', payment_method: 'TRANSFER', payment_proof_path: null, is_pending: false })
  })
  it.each(['cash','transfer','replace','remove'])('blocks player edits to an approved proof: %s', async op => {
    inscription!.payment_proof_path = 'approved'; inscription!.payment_proof_status = 'APPROVED'
    expect((await run(op, { inscriptionId: 'inscription', revision: '0' }, proof())).status).toBe(403)
    expect(uploadInscriptionProof).not.toHaveBeenCalled()
  })
  it('rejects approval concurrent with uploading and retains the approved proof', async () => {
    inscription!.payment_proof_path = 'original'
    jest.mocked(uploadInscriptionProof).mockImplementation(async () => {
      inscription!.payment_revision = 1; inscription!.payment_proof_status = 'APPROVED'
      return { success: true, filePath: 'stored-proof' }
    })
    expect((await run('replace', { inscriptionId: 'inscription', revision: '0' }, proof())).status).toBe(409)
    expect(inscription!.payment_proof_path).toBe('original')
    expect(deleteInscriptionProof).not.toHaveBeenCalled()
  })
  it('does not relink a proof to an inscription cancelled during upload', async () => {
    jest.mocked(uploadInscriptionProof).mockImplementation(async () => { inscription = null; return { success: true, filePath: 'stored-proof' } })
    expect((await run('attach', { inscriptionId: 'inscription', revision: '0' }, proof())).status).toBe(409)
    expect(inscription).toBeNull()
  })
  it('rejects stale revisions before uploading another file', async () => {
    inscription!.payment_revision = 1
    expect((await run('replace', { inscriptionId: 'inscription', revision: '0' }, proof())).status).toBe(409)
    expect(uploadInscriptionProof).not.toHaveBeenCalled()
  })

})
