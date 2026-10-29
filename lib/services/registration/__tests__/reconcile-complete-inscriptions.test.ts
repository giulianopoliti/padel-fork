import { reconcileCompleteInscriptions } from '../reconcile-complete-inscriptions'
import { createClientServiceRole } from '@/utils/supabase/server'
import { ensureLongTournamentGeneralZone } from '@/lib/services/tournaments/long-general-zone'
import { ensureAmericanSingleZone } from '@/lib/services/tournaments/american-single-zone'
import { ensureCanonicalZoneMembership } from '@/lib/services/tournament-zone-membership'

jest.mock('@/utils/supabase/server', () => ({ createClientServiceRole: jest.fn() }))
jest.mock('@/lib/services/tournaments/long-general-zone', () => ({ ensureLongTournamentGeneralZone: jest.fn() }))
jest.mock('@/lib/services/tournaments/american-single-zone', () => ({ ensureAmericanSingleZone: jest.fn() }))
jest.mock('@/lib/services/tournament-zone-membership', () => ({ ensureCanonicalZoneMembership: jest.fn() }))

let pending:boolean, proof:boolean, requiresProof:boolean, type:string, status:string, slot:boolean
describe('sporting participation follows assigned places', () => {
  beforeEach(() => {
    jest.resetAllMocks();pending=false;proof=false;requiresProof=true;type='LONG';status='NOT_STARTED';slot=true
    jest.mocked(createClientServiceRole).mockResolvedValue({from:(table:string)=>{
      const query={select:()=>query,eq:()=>query,is:()=>query,not:()=>query,
        single:async()=>({data:{type,status,enable_transfer_proof:requiresProof},error:null}),
        then:(resolve:(result:unknown)=>unknown)=>Promise.resolve(resolve(table==='tournaments'
          ? {data:{type,status},error:null}
          : {data:pending?[]:[{couple_id:'couple',is_pending:pending,occupies_slot:slot,payment_method:'TRANSFER',payment_proof_path:proof?'saved/file':null}],error:null}))}
      return query
    }} as never)
    jest.mocked(ensureLongTournamentGeneralZone).mockResolvedValue({success:true,zoneId:'zone'} as never)
    jest.mocked(ensureAmericanSingleZone).mockResolvedValue({success:true,applies:true,zoneId:'zone'})
    jest.mocked(ensureCanonicalZoneMembership).mockResolvedValue({success:true} as never)
  })
  it.each([true,false])('assigns a reserved couple whether its receipt is present or pending: %s',async attached=>{
    proof=attached
    expect(await reconcileCompleteInscriptions('tournament')).toBe('READY')
    expect(ensureCanonicalZoneMembership).toHaveBeenCalledWith(expect.objectContaining({tournamentId:'tournament',zoneId:'zone',coupleId:'couple'}))
  })
  it('leaves a couple without capacity unassigned without vetoing the tournament',async()=>{
    slot=false
    expect(await reconcileCompleteInscriptions('tournament')).toBe('READY')
    expect(ensureLongTournamentGeneralZone).not.toHaveBeenCalled()
  })
  it('never removes sporting eligibility when a receipt requirement changes',async()=>{
    pending=false;requiresProof=false
    expect(await reconcileCompleteInscriptions('tournament')).toBe('READY')
    expect(ensureCanonicalZoneMembership).toHaveBeenCalledTimes(1)
    requiresProof=true
    expect(await reconcileCompleteInscriptions('tournament')).toBe('READY')
    expect(ensureCanonicalZoneMembership).toHaveBeenCalledTimes(2)
  })
  it('still excludes an unreserved couple when proof is disabled',async()=>{
    requiresProof=false;slot=false
    expect(await reconcileCompleteInscriptions('tournament')).toBe('READY')
    expect(ensureCanonicalZoneMembership).not.toHaveBeenCalled()
  })
  it('retries a failed assignment against the saved inscription',async()=>{
    pending=false;proof=true
    jest.mocked(ensureCanonicalZoneMembership).mockResolvedValueOnce({success:false,error:'temporarily unavailable'} as never)
    await expect(reconcileCompleteInscriptions('tournament')).rejects.toThrow('ZoneAssignmentFailed')
    await expect(reconcileCompleteInscriptions('tournament')).resolves.toBe('READY')
    expect(ensureCanonicalZoneMembership).toHaveBeenCalledTimes(2)
  })
  it('also retries when canonical membership exists but its zone_couples mirror failed',async()=>{
    pending=false;proof=true
    jest.mocked(ensureCanonicalZoneMembership).mockResolvedValueOnce({success:true,mirrorWarning:'mirror unavailable'} as never)
    await expect(reconcileCompleteInscriptions('tournament')).rejects.toThrow('ZoneMirrorPending')
    await expect(reconcileCompleteInscriptions('tournament')).resolves.toBe('READY')
  })
  it.each([true,false])('uses the American format resolver without forcing multizone membership: single=%s',async single=>{
    type='AMERICAN';pending=false;proof=true
    jest.mocked(ensureAmericanSingleZone).mockResolvedValue({success:true,applies:single})
    await reconcileCompleteInscriptions('tournament')
    expect(ensureAmericanSingleZone).toHaveBeenCalledWith('tournament')
    expect(ensureLongTournamentGeneralZone).not.toHaveBeenCalled()
    expect(ensureCanonicalZoneMembership).not.toHaveBeenCalled()
  })
  it('never creates new memberships after entering the bracket phase',async()=>{
    pending=false;proof=true;status='BRACKET_PHASE'
    expect(await reconcileCompleteInscriptions('tournament')).toBe('CLOSED')
    expect(ensureLongTournamentGeneralZone).not.toHaveBeenCalled()
  })
})
