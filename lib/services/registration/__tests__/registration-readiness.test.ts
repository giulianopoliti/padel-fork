import { getRegistrationReadiness, assertRegistrationExclusionsReviewed } from '../registration-readiness'
import { createClientServiceRole } from '@/utils/supabase/server'

jest.mock('@/utils/supabase/server',()=>({createClientServiceRole:jest.fn()}))
const rpc=jest.fn()
const pair=(id:string,extra:Record<string,unknown>={})=>({id,couple_id:`couple-${id}`,name:`Pair ${id}`,is_pending:false,
  occupies_slot:true,payment_method:'TRANSFER',has_proof:true,...extra})
const snapshot=(pairs:unknown[],acknowledged=false)=>({tournament:{id:'t',max_participants:1,enable_transfer_proof:true},pairs,
  exclusions:{signature:'current-signature',acknowledged}})
beforeEach(()=>{jest.resetAllMocks();jest.mocked(createClientServiceRole).mockResolvedValue({rpc} as never)})
it('separates places, sporting eligibility, missing proof and payment conflicts from one snapshot',async()=>{
  rpc.mockResolvedValue({data:snapshot([pair('confirmed'),pair('no-proof',{occupies_slot:false,has_proof:false}),
    pair('paid-full',{occupies_slot:false}),pair('manual',{is_pending:true}),pair('waived',{has_proof:false,proof_waived_at:'2026-10-27'})]),error:null})
  const result=await getRegistrationReadiness('t')
  expect(result).toMatchObject({occupied:3,isFull:true,eligibleCount:3,pendingWithoutSlot:2,proofWithoutSlot:1})
  expect(result.eligibleCoupleIds).toEqual(['couple-confirmed','couple-manual','couple-waived'])
  expect(result.excluded.map(row=>row.id)).toEqual(['no-proof','paid-full'])
  expect(result.excluded[0].label).toBe('Pendiente de cupo')
  expect(JSON.stringify(result)).not.toMatch(/payment_proof_path|attached/)
  expect(rpc).toHaveBeenCalledTimes(1)
})
it('requires an acknowledgement before generation and fails closed on snapshot failure',async()=>{
  rpc.mockResolvedValue({data:snapshot([pair('pending',{occupies_slot:false})]),error:null})
  await expect(assertRegistrationExclusionsReviewed('t')).rejects.toThrow('Continuar sin estas parejas')
  rpc.mockResolvedValue({data:null,error:{message:'Unavailable'}})
  await expect(assertRegistrationExclusionsReviewed('t')).rejects.toThrow('Unavailable')
})
it('allows an explicitly reviewed current snapshot',async()=>{
  rpc.mockResolvedValue({data:snapshot([pair('pending',{occupies_slot:false})],true),error:null})
  await expect(assertRegistrationExclusionsReviewed('t')).resolves.toBeUndefined()
})
