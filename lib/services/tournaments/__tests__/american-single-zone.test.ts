import { ensureAmericanSingleZone } from '../american-single-zone'
import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import { createClientServiceRole } from '@/utils/supabase/server'
import { ensureCanonicalZoneMembership } from '@/lib/services/tournament-zone-membership'
import { ZoneRulesSyncService } from '@/lib/services/zone-rules-sync.service'

jest.mock('@/utils/supabase/server',()=>({createClientServiceRole:jest.fn()}))
jest.mock('@/lib/services/tournament-zone-membership',()=>({ensureCanonicalZoneMembership:jest.fn()}))
jest.mock('@/lib/services/zone-rules-sync.service',()=>({ZoneRulesSyncService:{syncZoneRulesForZone:jest.fn()}}))

describe('American eligibility with the real format resolver',()=>{
  let single:boolean
  let pending:boolean
  let tables:string[]
  beforeEach(()=>{
    jest.resetAllMocks();single=true;pending=false;tables=[]
    jest.mocked(createClientServiceRole).mockResolvedValue({from:(table:string)=>{
      tables.push(table)
      let writing=false
      const filters:Record<string,unknown>={}
      const execute=async()=>({data:table==='zones'?[{id:'zone',name:'Zona General'}]:pending&&filters.is_pending===false?[]:[{couple_id:'couple'}],error:null})
      const query={select:()=>query,eq:(key:string,value:unknown)=>{filters[key]=value;return query},not:()=>query,
        order:execute,update:()=>{writing=true;return query},
        single:async()=>({data:{id:'tournament',type:'AMERICAN',max_participants:16,
          format_config:getTournamentFormatPreset(single?'AMERICAN_SINGLE_ZONE_ROUND_ROBIN_CHAMPION':'AMERICAN_MULTI_ZONE_2')},error:null}),
        then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(resolve(writing?{error:null}:{data:[],error:null}))}
      return query
    }} as never)
    jest.mocked(ensureCanonicalZoneMembership).mockResolvedValue({success:true} as never)
    jest.mocked(ZoneRulesSyncService.syncZoneRulesForZone).mockResolvedValue({success:true} as never)
  })
  it('leaves multizone couples available for manual building',async()=>{
    single=false
    expect(await ensureAmericanSingleZone('tournament')).toEqual({success:true,applies:false})
    expect(tables).toEqual(['tournaments'])
    expect(ensureCanonicalZoneMembership).not.toHaveBeenCalled()
  })
  it('assigns approved single-zone couples through canonical membership',async()=>{
    expect(await ensureAmericanSingleZone('tournament')).toMatchObject({success:true,applies:true,assignedCouples:1})
    expect(ensureCanonicalZoneMembership).toHaveBeenCalledWith(expect.objectContaining({coupleId:'couple',zoneId:'zone',tournamentId:'tournament'}))
  })
  it('never assigns a couple still awaiting approval',async()=>{
    pending=true
    expect(await ensureAmericanSingleZone('tournament')).toMatchObject({success:true,assignedCouples:0})
    expect(ensureCanonicalZoneMembership).not.toHaveBeenCalled()
  })
  it('returns a recoverable failure if only the mirror failed',async()=>{
    jest.mocked(ensureCanonicalZoneMembership).mockResolvedValueOnce({success:true,mirrorWarning:'mirror unavailable'} as never)
    expect(await ensureAmericanSingleZone('tournament')).toMatchObject({success:false,error:'mirror unavailable'})
    expect(await ensureAmericanSingleZone('tournament')).toMatchObject({success:true,assignedCouples:1})
  })
})
