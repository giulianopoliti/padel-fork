jest.mock("server-only", () => ({}), { virtual: true })
jest.mock("react", () => ({ cache: (fn: unknown) => fn }))
let mockTenant = "padel-elite", mockRole = "ORGANIZADOR", mockAuthenticated = true, mockMissing = false
let mockMember = true, mockEnabled = false
const mockReads: string[] = []
jest.mock("@/config/tenant", () => ({ getTenantBranding: () => ({ key: mockTenant }) }))
jest.mock("@/lib/services/tenant-organization.service", () => ({ getTenantOrganization: async () => ({ id: "tpe" }) }))
jest.mock("@/utils/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: mockAuthenticated ? { id: "organizer" } : null }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: mockRole }, error: null }) }) }) }),
}) }))
jest.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => {
  mockReads.push(table)
  const filters: Record<string, unknown> = {}
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters[key] = value; return query },
    in: () => query,
    maybeSingle: async () => {
      if (table === "organization_members") return { data: mockMember && filters.organizacion_id === "tpe" && filters.user_id === "organizer" && filters.is_active === true ? { user_id: "organizer" } : null, error: null }
      return mockMissing ? { data: null, error: { code: "42P01" } } : { data: filters.organization_id === "tpe" ? { enabled: mockEnabled } : null, error: null }
    },
  }
  return query
} } }))

import { getBillingNotice, requireBillingPortalAccess } from "../portal-service"

beforeEach(() => {
  mockTenant = "padel-elite"; mockRole = "ORGANIZADOR"; mockAuthenticated = true
  mockMissing = false; mockMember = true; mockEnabled = false; mockReads.length = 0
})

it("rejects guests and players before reading billing data", async () => {
  mockAuthenticated = false
  await expect(requireBillingPortalAccess()).rejects.toMatchObject({ status: 401 })
  mockAuthenticated = true; mockRole = "PLAYER"
  await expect(getBillingNotice()).rejects.toMatchObject({ status: 403 })
  expect(mockReads).toEqual([])
})
it("rejects FV before any database read", async () => {
  mockTenant = "padel-fv"
  await expect(getBillingNotice()).rejects.toMatchObject({ status: 404 })
  expect(mockReads).toEqual([])
})
it("rejects an organizer without active owner/admin membership in TPE", async () => {
  mockMember = false
  await expect(getBillingNotice()).rejects.toMatchObject({ status: 403 })
  expect(mockReads).toEqual(["organization_members"])
})
it("reads only the current tenant manual switch and never infers it from amounts", async () => {
  expect(await getBillingNotice()).toEqual({ available: true, enabled: false })
  mockEnabled = true
  expect(await getBillingNotice()).toEqual({ available: true, enabled: true })
  expect(mockReads).not.toContain("tournament_billing_charges")
})
it("allows admin access to the current tenant", async () => {
  mockRole = "ADMIN"
  expect(await requireBillingPortalAccess()).toEqual({ organizationId: "tpe", userId: "organizer", role: "ADMIN" })
})
it("leaves the notice disabled until the owner deploys its migration", async () => {
  mockMissing = true
  expect(await getBillingNotice()).toEqual({ available: false, enabled: false })
})
