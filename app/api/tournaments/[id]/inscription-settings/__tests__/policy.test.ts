import { NextRequest } from 'next/server'
import { PATCH } from '../route'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'

jest.mock('@/utils/supabase/server',()=>({createClient:jest.fn()}))
jest.mock('@/utils/tournament-permissions',()=>({checkTournamentPermissions:jest.fn()}))
jest.mock('@/lib/services/messages/registration-delivery',()=>({scheduleRegistrationNotifications:jest.fn()}))
jest.mock('@/lib/services/registration/reconcile-complete-inscriptions',()=>({reconcileCompleteInscriptions:jest.fn()}))
jest.mock('next/cache',()=>({revalidatePath:jest.fn()}))
const update=jest.fn(),context={params:Promise.resolve({id:'tournament'})}
const initial={enable_transfer_proof:true,reserve_slot_without_proof:true,allow_cash_payment:false,
  transfer_alias:'previous.alias',transfer_amount:100,messages_enabled:false,validate_inscriptions:false}
let current={...initial}
const request=(data:unknown)=>new NextRequest('http://localhost/api/tournaments/tournament/inscription-settings',{
  method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),
})
beforeEach(()=>{
  jest.resetAllMocks()
  current={...initial}
  const query={select:()=>query,eq:()=>query,single:async()=>({data:current,error:null})}
  jest.mocked(createClient).mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:'manager'}},error:null})},
    from:()=>({...query,update})} as never)
  update.mockReturnValue({eq:async()=>({error:null})})
  jest.mocked(checkTournamentPermissions).mockResolvedValue({hasPermission:true})
})
it.each([false,true])('saves the payment policy together and normalizes no-deposit capacity (deposit=%s)',async deposit=>{
  const patch={enable_transfer_proof:deposit,reserve_slot_without_proof:false,allow_cash_payment:true,
    transfer_alias:deposit?'new.alias':null,transfer_amount:deposit?200:null}
  expect((await PATCH(request(patch),context)).status).toBe(200)
  expect(update).toHaveBeenCalledTimes(1)
  expect(update).toHaveBeenCalledWith({...patch,reserve_slot_without_proof:!deposit})
})
it('rejects enabling a deposit without payment details without saving half the policy',async()=>{
  expect((await PATCH(request({enable_transfer_proof:true,reserve_slot_without_proof:false,transfer_alias:'',transfer_amount:100}),context)).status).toBe(400)
  expect(update).not.toHaveBeenCalled()
})
it('preserves settings that are not part of the submitted policy',async()=>{
  expect((await PATCH(request({reserve_slot_without_proof:false}),context)).status).toBe(200)
  expect(update).toHaveBeenCalledWith({reserve_slot_without_proof:false})
})
it('always reserves at signup without either a receipt or manual approval',async()=>{
  const response=await PATCH(request({enable_transfer_proof:false,reserve_slot_without_proof:false}),context)
  expect(response.status).toBe(200)
  expect(update).toHaveBeenCalledWith({enable_transfer_proof:false,reserve_slot_without_proof:true})
  expect((await response.json()).data.reserve_slot_without_proof).toBe(true)
})
it('normalizes reservation when the last remaining requirement is disabled',async()=>{
  current={...initial,enable_transfer_proof:false,reserve_slot_without_proof:false,validate_inscriptions:true}
  expect((await PATCH(request({validate_inscriptions:false}),context)).status).toBe(200)
  expect(update).toHaveBeenCalledWith({validate_inscriptions:false,reserve_slot_without_proof:true})
})
it('retires an old approval flag while preserving unrelated privacy decisions',async()=>{
  current={...initial,enable_transfer_proof:false,reserve_slot_without_proof:false,validate_inscriptions:true}
  expect((await PATCH(request({show_public_inscriptions:false}),context)).status).toBe(200)
  expect(update).toHaveBeenCalledWith({show_public_inscriptions:false,reserve_slot_without_proof:true,validate_inscriptions:false})
})
it('rejects reactivating retired manual approval from an older settings page',async()=>{
  expect((await PATCH(request({validate_inscriptions:true}),context)).status).toBe(400)
  expect(update).not.toHaveBeenCalled()
})
it('denies changes by an actor without tournament management permission',async()=>{
  jest.mocked(checkTournamentPermissions).mockResolvedValue({hasPermission:false})
  expect((await PATCH(request({enable_transfer_proof:false,reserve_slot_without_proof:false}),context)).status).toBe(403)
  expect(update).not.toHaveBeenCalled()
})
