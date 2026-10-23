import type { BillingTournamentRow } from "../types"

jest.mock("server-only", () => ({}), { virtual: true })
let mockTenantKey = "padel-fv"
jest.mock("@/config/tenant", () => ({ getTenantBranding: () => ({ key: mockTenantKey, shortName: "FV" }) }))
jest.mock("@/lib/services/tenant-organization.service", () => ({ getTenantOrganization: async () => ({ id: "org-fv" }) }))

type Row = Record<string, unknown>
let mockTables: Record<string, Row[]>
let mockLegacySchema = false
const mockQueries: { table: string; range: number[] }[] = []
jest.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: (table: string) => {
    const filters: ((row: Row) => boolean)[] = []
    let from = 0, to = 999, selection = "", single = false
    const query = {
      select: (value: string) => { selection = value; return query },
      eq: (key: string, value: unknown) => { filters.push((r) => r[key] === value); return query },
      in: (key: string, values: unknown[]) => { filters.push((r) => values.includes(r[key])); return query },
      order: () => query,
      range: (start: number, end: number) => { from = start; to = end; mockQueries.push({ table, range: [start,end] }); return query },
      limit: (count: number) => { to = count - 1; return query },
      maybeSingle: () => { single = true; return query },
      then: (resolve: (value: unknown) => unknown) => {
        if (mockLegacySchema && selection.includes("billing_month")) return Promise.resolve({data:null,error:{code:"42703",message:"column does not exist"}}).then(resolve)
        const rows = (mockTables[table] || []).filter((row) => filters.every((f) => f(row))).slice(from,to+1)
        return Promise.resolve({ data: single ? rows[0] || null : rows, error:null }).then(resolve)
      },
    }
    return query
  } },
}))

import { getTenantBillingDashboard } from "../service"

const seed = (count: number): void => {
  const total = count * 50_000
  mockTables = {
    tenant_billing_settings: [{ organization_id:"org-fv", billing_model:"FV_LEAGUE", currency:"ARS",
      fv_amount_up_to_16:99_000, fv_amount_over_16:120_000, tpe_amount_per_player:1_000, updated_at:"2026-10-01T00:00:00Z" }],
    billing_collections: [{id:"c-1", organization_id:"org-fv", organizer_id:null, organizer_label:"FV",
      tournament_subtotal_ars:total, maintenance_amount_per_installment_ars:100, total_amount_ars:total+200,
      amount_paid_ars:total/2+100, balance_ars:total/2+100, status:"PARTIALLY_PAID", created_at:"2026-10-01T00:00:00Z"}],
    billing_collection_tournaments: Array.from({length:count},(_,i)=>({ id:`ct-${i}`,collection_id:"c-1",tournament_id:`t-${i}`,
      amount_ars:50_000,tournament_name:`Liga ${i}`,club_name:"Club histórico",billable_units:12,tournament_status:"ZONE_PHASE" })),
    billing_collection_installments:[1,2].map((number)=>({id:`i-${number}`,collection_id:"c-1",installment_number:number,
      amount_ars:total/2+100,maintenance_amount_ars:100,billing_month:`2026-${number+9}-01`,status:number===1?"PAID":"PENDING",
      issued_at:null,paid_at:number===1?"2026-10-01T00:00:00Z":null })),
    tournaments:[], tournament_billing_charges:[], inscriptions:[], users:[],
  }
}

beforeEach(() => { mockTenantKey="padel-fv"; mockLegacySchema=false; mockQueries.length=0; seed(2) })

describe("billing dashboard financial integration", () => {
  it("counts all pending TPE weeks independently of the displayed week using the live rate", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-23T12:00:00Z"))
    try {
      mockTenantKey = "padel-elite"
      mockTables.tenant_billing_settings[0].billing_model = "TPE_PLAYER"
      mockTables.tenant_billing_settings[0].tpe_amount_per_player = 500
      mockTables.tournaments = ["2026-10-13", "2026-10-15", "2026-10-20", "2026-10-27"].map((date, index) => ({
        id: `t-${index}`, name: `Torneo ${index}`, organization_id: "org-fv", type: "AMERICAN",
        status: "NOT_STARTED", es_prueba: false, start_date: `${date}T18:00:00Z`, created_at: `${date}T18:00:00Z`,
      }))
      mockTables.inscriptions = mockTables.tournaments.map((tournament) => ({
        tournament_id: tournament.id, player_id: tournament.id, es_prueba: false,
        player: { id: tournament.id, es_prueba: false },
      }))
      const first = await getTenantBillingDashboard("2026-10-19", { readOnly: true })
      const other = await getTenantBillingDashboard("2026-10-26", { readOnly: true })
      expect(first.items.map((row) => row.tournamentId)).toEqual(["t-2"])
      expect(first.pendingWeeks).toEqual([
        { weekStart: "2026-10-12", weekEnd: "2026-10-18", amountArs: 1000 },
        { weekStart: "2026-10-19", weekEnd: "2026-10-25", amountArs: 500 },
      ])
      expect(other.pendingWeeks).toEqual(first.pendingWeeks)
    } finally { jest.useRealTimers() }
  })
  it("uses exactly the same financial rows for the read-only portal", async () => {
    expect(await getTenantBillingDashboard(null, { readOnly: true })).toEqual(await getTenantBillingDashboard())
  })

  it("does not create billing settings when the read-only portal is opened", async () => {
    mockTables.tenant_billing_settings = []
    // The query mock has no insert method: a write would fail this test.
    const dashboard = await getTenantBillingDashboard(null, { readOnly: true })
    expect(dashboard.settings.fvAmountUpTo16).toBe(50_000)
  })
  it("reads legacy installments before the migration and reconstructs partial balances without guessing months", async () => {
    mockLegacySchema=true
    for (const row of mockTables.billing_collection_installments) {
      delete row.billing_month
      delete row.maintenance_amount_ars
    }
    const dashboard=await getTenantBillingDashboard()
    expect(dashboard.monthlyMaintenanceAvailable).toBe(false)
    expect(dashboard.collections[0].installments.every((i)=>i.billingMonth===null && i.maintenanceAmountArs===100)).toBe(true)
    expect(dashboard.items).toHaveLength(2)
    expect(dashboard.items.every((i)=>i.amountPaidArs===25_000 && i.balanceArs===25_000 && i.financialStatus==="PARTIALLY_PAID")).toBe(true)
  })

  it("retains linked historical tournaments missing from the current tournament catalog", async () => {
    const dashboard=await getTenantBillingDashboard()
    expect(dashboard.monthlyMaintenanceAvailable).toBe(true)
    expect(dashboard.items.every((i)=>!i.isEligible && i.collectionId==="c-1")).toBe(true)
    expect(dashboard.collections[0].installments[0].billingMonth).toBe("2026-10-01")
  })

  it("freezes collection amounts even when the current rate is higher and a tournament is no longer eligible", async () => {
    mockTables.tournaments=[{id:"t-0",name:"Liga actual",clubes:null,type:"LONG",status:"NOT_STARTED",
      created_at:"2026-09-01T00:00:00Z",start_date:null,organization_id:"org-fv",organizador_id:null,es_prueba:false } satisfies BillingTournamentRow]
    const dashboard=await getTenantBillingDashboard()
    const linked=dashboard.items.find((i)=>i.tournamentId==="t-0")!
    expect(linked).toMatchObject({amountArs:50_000,unitAmountArs:50_000,billableUnits:12,amountPaidArs:25_000,balanceArs:25_000})
  })

  it("paginates past Supabase's 1000 row limit so no tournament or balance is silently omitted", async () => {
    seed(1001)
    const dashboard=await getTenantBillingDashboard()
    expect(dashboard.collections[0].tournaments).toHaveLength(1001)
    expect(dashboard.items).toHaveLength(1001)
    expect(dashboard.items.reduce((sum,i)=>sum+i.amountPaidArs,0)).toBe(25_025_000)
    expect(mockQueries).toContainEqual({table:"billing_collection_tournaments",range:[1000,1999]})
  })
})
