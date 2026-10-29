import { processRegistrationEvents, sendRegistrationEmail } from '../registration-delivery'
import { createClientServiceRole } from '@/utils/supabase/server'
import { sendSafely } from '@/lib/services/email/notification-utils'
import { sendTournamentMessage } from '../index'

jest.mock('@/utils/supabase/server',()=>({createClientServiceRole:jest.fn()}))
jest.mock('@/lib/services/email/notification-utils',()=>({sendSafely:jest.fn()}))
jest.mock('@/lib/services/messages/index',()=>({sendTournamentMessage:jest.fn()}))
const rpc=jest.fn(),maybeSingle=jest.fn()
const event={id:'event',tournament_id:'t',inscription_id:'i',kind:'PROOF_WITHOUT_SLOT',attempts:2,notification_allowed:true}
beforeEach(()=>{
  jest.resetAllMocks()
  const query={select:()=>query,eq:()=>query,maybeSingle}
  jest.mocked(createClientServiceRole).mockResolvedValue({rpc,from:()=>query} as never)
  rpc.mockImplementation(async(name:string)=>name==='claim_registration_events'?{data:[event],error:null}:{error:null})
  maybeSingle.mockResolvedValue({data:{status:'NOT_STARTED',messages_enabled:true},error:null})
  jest.mocked(sendTournamentMessage).mockResolvedValue([{success:true}])
})
it('routes payment conflicts to organizers with a stable delivery identity',async()=>{
  expect(await processRegistrationEvents()).toEqual({processed:1,failed:0})
  expect(sendTournamentMessage).toHaveBeenCalledWith(expect.objectContaining({type:'REGISTRATION_ATTENTION_ADMIN',kind:'PROOF_WITHOUT_SLOT',delivery:{eventId:'event',attempt:2}}))
  expect(rpc).toHaveBeenLastCalledWith('finish_registration_event',{p_id:'event',p_attempt:2,p_error:null})
})
it.each(['preference-off-at-creation','preference-off-now','closed-tournament'])('suppresses obsolete or disabled notifications: %s',async(reason)=>{
  if(reason==='preference-off-at-creation')rpc.mockImplementation(async(name:string)=>name==='claim_registration_events'?{data:[{...event,notification_allowed:false}],error:null}:{error:null})
  if(reason==='preference-off-now')maybeSingle.mockResolvedValue({data:{status:'NOT_STARTED',messages_enabled:false},error:null})
  if(reason==='closed-tournament')maybeSingle.mockResolvedValue({data:{status:'FINISHED',messages_enabled:true},error:null})
  await processRegistrationEvents(); expect(sendTournamentMessage).not.toHaveBeenCalled()
})
it('keeps failed deliveries retryable rather than reporting success',async()=>{
  jest.mocked(sendTournamentMessage).mockResolvedValue([{success:false}])
  expect(await processRegistrationEvents()).toEqual({processed:0,failed:1})
  expect(rpc).toHaveBeenLastCalledWith('finish_registration_event',expect.objectContaining({p_error:expect.any(String)}))
})
it('sends the frozen message when retrying, using the event idempotency key',async()=>{
  const input={to:['a@example.invalid'],subject:'changed',html:'changed',text:'changed',idempotencyKey:'legacy'}
  const frozen={...input,subject:'original',idempotencyKey:'registration-event-event'}
  rpc.mockResolvedValue({data:frozen,error:null})
  await sendRegistrationEmail(input,'test',{type:'INSCRIPTION_APPROVED_PLAYER',supabase:{} as never,inscriptionId:'i',delivery:{eventId:'event',attempt:2}})
  expect(rpc).toHaveBeenCalledWith('prepare_registration_event',expect.objectContaining({p_message:{...input,idempotencyKey:'registration-event-event'}}))
  expect(sendSafely).toHaveBeenCalledWith(frozen,'test')
})
