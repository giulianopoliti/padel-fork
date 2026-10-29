import { POST } from '../[id]/start-tournament/route'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { ensureAmericanSingleZone } from '@/lib/services/tournaments/american-single-zone'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import { getRegistrationReadiness } from '@/lib/services/registration/registration-readiness'

jest.mock('@/utils/supabase/server',()=>({createClient:jest.fn()}))
jest.mock('@/utils/tournament-permissions',()=>({checkTournamentPermissions:jest.fn()}))
jest.mock('@/lib/services/tournaments/american-single-zone',()=>({ensureAmericanSingleZone:jest.fn()}))
jest.mock('@/lib/services/tournament-format-resolver',()=>({TournamentFormatResolver:{getResolvedFormat:jest.fn()}}))
jest.mock('@/lib/services/registration/registration-readiness',()=>({getRegistrationReadiness:jest.fn()}))

describe('solo interests never block start; couple requirements remain authoritative',()=>{
  const is=jest.fn()
  const update=jest.fn()
  let couples:number
  let updateError:unknown
  beforeEach(()=>{
    jest.resetAllMocks();couples=3;updateError=null
    jest.mocked(createClient).mockResolvedValue({
      auth:{getUser:async()=>({data:{user:{id:'manager'}},error:null})},
      from:(table:string)=>{
        let writing=false
        const query={select:()=>query,eq:()=>query,not:()=>query,is,
          single:async()=>({data:{id:'tournament',type:'LONG',status:'NOT_STARTED'},error:null}),
          update:(patch:unknown)=>{writing=true;update(patch);return query},
          then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(resolve(writing?{error:updateError}:{count:couples,error:null}))}
        return query
      },
    } as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({hasPermission:true})
    jest.mocked(ensureAmericanSingleZone).mockResolvedValue({success:true,applies:true})
    jest.mocked(getRegistrationReadiness).mockImplementation(async()=>({eligibleCount:couples,excluded:[],acknowledged:true}) as never)
  })
  it.each([['LONG','SINGLE_ZONE'],['AMERICAN','SINGLE_ZONE'],['AMERICAN','MULTI_ZONE']])('starts %s %s without querying individual count',async(baseType,zoneMode)=>{
    jest.mocked(TournamentFormatResolver.getResolvedFormat).mockReturnValue({baseType,zoneMode} as never)
    const response=await POST(new Request('http://local'),{params:Promise.resolve({id:'tournament'})})
    expect(response.status).toBe(200)
    expect(is).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(expect.objectContaining({status:'ZONE_PHASE'}))
    expect(ensureAmericanSingleZone).toHaveBeenCalledTimes(baseType==='AMERICAN'&&zoneMode==='SINGLE_ZONE'?1:0)
  })
  it('still refuses start when no couples have a place',async()=>{
    couples=0
    const response=await POST(new Request('http://local'),{params:Promise.resolve({id:'tournament'})})
    expect(response.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })
  it('requires review before excluding couples without a place',async()=>{
    jest.mocked(getRegistrationReadiness).mockResolvedValue({eligibleCount:3,excluded:[{id:'waiting'}],acknowledged:false} as never)
    const response=await POST(new Request('http://local'),{params:Promise.resolve({id:'tournament'})})
    expect(response.status).toBe(409)
    expect(update).not.toHaveBeenCalled()
  })
  it('does not hide a database refusal after checking eligible couples',async()=>{
    jest.mocked(TournamentFormatResolver.getResolvedFormat).mockReturnValue({baseType:'LONG',zoneMode:'SINGLE_ZONE'} as never)
    updateError={message:'Cambió la capacidad del torneo'}
    jest.spyOn(console,'error').mockImplementation(()=>{})
    const response=await POST(new Request('http://local'),{params:Promise.resolve({id:'tournament'})})
    expect(response.status).toBe(500)
    expect((await response.json()).success).toBe(false)
  })
})
