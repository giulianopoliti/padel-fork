import { RegistrationService } from '../registration.service'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { reconcileCompleteInscriptions } from '../reconcile-complete-inscriptions'
import { revalidatePath } from 'next/cache'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))
jest.mock('../reconcile-complete-inscriptions', () => ({ reconcileCompleteInscriptions: jest.fn() }))
jest.mock('@/config/tenant', () => ({ getTenantBranding: () => ({ key: 'padel-fv' }) }))
jest.mock('@/lib/services/messages', () => ({ sendTournamentMessage: jest.fn() }))
jest.mock('@/lib/services/inscription-proofs', () => ({ scheduleInscriptionProofCleanup: jest.fn() }))
jest.mock('@/lib/services/tournament-capacity.service', () => ({ syncTournamentCapacityRegistrationLock: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const inscription = { id: 'inscription', couple_id: 'couple', tournament_id: 'tournament', is_pending: false,
  created_at: '2026-10-16', payment_method: null, payment_proof_path: null }
const pair = { tournamentId: 'tournament', player1Id: 'a', player2Id: 'b', isOrganizerRegistration: true }
const rpc = jest.fn()
let actor: string | null
let recipient: string
let requiresProof: boolean
describe('atomic pairing service boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    actor='manager'; recipient='recipient';requiresProof=true
    jest.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: actor ? { id: actor } : null }, error: null }) },
      from: (table: string) => {
        const query = { select: () => query, eq: () => query,
          single: async () => ({ data: table==='users' ? { role: 'CLUB' } : { id: 'tournament', type: 'LONG', enable_transfer_proof: requiresProof }, error: null }),
          maybeSingle: async () => ({ data: { tournament_id:'tournament',sender_player_id:'a',recipient_player_id:'b',recipient_user_id:recipient },error:null }) }
        return query
      },
    } as never)
    rpc.mockResolvedValue({ data: { inscription: { ...inscription }, created: true }, error: null })
    jest.mocked(createClientServiceRole).mockResolvedValue({ rpc } as never)
    jest.mocked(reconcileCompleteInscriptions).mockResolvedValue('READY')
    jest.mocked(revalidatePath).mockImplementation(() => {})
  })
  it('authenticates before creating any privileged client', async () => {
    actor=null
    expect((await new RegistrationService().convertIndividualToCouple(pair)).success).toBe(false)
    expect(createClientServiceRole).not.toHaveBeenCalled()
  })
  it('takes actor and tenant from server context and returns the canonical IDs', async () => {
    const result=await new RegistrationService().convertIndividualToCouple(pair)
    expect(rpc).toHaveBeenCalledWith('confirm_tournament_pair',expect.objectContaining({ p_actor_id:'manager',p_tenant:'padel-fv',p_organizer:true }))
    expect(result).toMatchObject({success:true,inscriptionId:'inscription',coupleId:'couple'})
  })
  it('does not treat a committed inscription as failed when assignment or cache refresh fails', async () => {
    jest.mocked(reconcileCompleteInscriptions).mockRejectedValue(new Error('zone unavailable'))
    jest.mocked(revalidatePath).mockImplementation(() => {throw new Error('cache unavailable')})
    const result=await new RegistrationService().convertIndividualToCouple(pair)
    expect(result.success).toBe(true)
    expect(result.message).toContain('Pendiente de asignación')
    expect(result.inscriptionId).toBe('inscription')
  })
  it('keeps an incomplete transfer saved for the resumable payment dialog', async () => {
    rpc.mockResolvedValue({ data: { inscription: { ...inscription,payment_method:'TRANSFER' }, created:true },error:null })
    expect(await new RegistrationService().convertIndividualToCouple(pair)).toMatchObject({ success:true,inscriptionId:'inscription',message:expect.stringContaining('confirmada con cupo reservado') })
  })
  it('does not reopen payment for a historical transfer after proof is disabled', async () => {
    requiresProof=false
    rpc.mockResolvedValue({ data: { inscription: { ...inscription,payment_method:'TRANSFER' }, created:false },error:null })
    expect(await new RegistrationService().convertIndividualToCouple(pair)).toMatchObject({ success:true,alreadyRegistered:true,paymentRequired:false,message:'Esta pareja ya está inscripta en este torneo.' })
  })
  it('rejects acceptance by somebody other than the recipient before invoking the privileged RPC', async () => {
    const result=await new RegistrationService().acceptTournamentRequest('request',{termsAccepted:true})
    expect(result.success).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('passes acceptance and payment choice through the same transaction', async () => {
    actor='recipient'
    await new RegistrationService().acceptTournamentRequest('request',{termsAccepted:true,paymentMethod:'CASH'})
    expect(rpc).toHaveBeenCalledWith('confirm_tournament_pair',expect.objectContaining({p_request_id:'request',p_actor_id:'recipient',p_organizer:false,p_payment_method:'CASH',p_terms_accepted:true}))
  })
  it('returns the transactional capacity error without running assignment', async () => {
    rpc.mockResolvedValue({data:null,error:{message:'Cupos llenos'}})
    expect(await new RegistrationService().convertIndividualToCouple(pair)).toEqual({success:false,error:'Cupos llenos'})
    expect(reconcileCompleteInscriptions).not.toHaveBeenCalled()
  })
  it('reports a no-deposit inscription without a place as pending, not confirmed',async()=>{
    requiresProof=false
    rpc.mockResolvedValue({data:{inscription:{...inscription,occupies_slot:false},created:true},error:null})
    const result=await new RegistrationService().convertIndividualToCouple(pair)
    expect(result).toMatchObject({success:true,paymentRequired:false,message:expect.stringContaining('sin cupo reservado')})
    expect(result.message).toContain('El organizador debe asignarte lugar')
  })
})
