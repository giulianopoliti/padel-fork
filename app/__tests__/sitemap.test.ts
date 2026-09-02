jest.mock("@/config/tenant", () => ({
  getTenantCanonicalSiteUrl: jest.fn(),
}))

jest.mock("@/lib/services/tenant-organization.service", () => ({
  getTenantOrganization: jest.fn(),
}))

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(),
}))

import { getTenantCanonicalSiteUrl } from "@/config/tenant"
import { getTenantOrganization } from "@/lib/services/tenant-organization.service"
import { createClient } from "@/utils/supabase/server"
import sitemap from "@/app/sitemap"

const mockGetTenantCanonicalSiteUrl = jest.mocked(getTenantCanonicalSiteUrl)
const mockGetTenantOrganization = jest.mocked(getTenantOrganization)
const mockCreateClient = jest.mocked(createClient)

const createTournamentQuery = ({
  data,
  error = null,
}: {
  data: Array<{ seo_slug: string | null; start_date: string | null; end_date: string | null }> | null
  error?: unknown
}) => {
  const order = jest.fn().mockResolvedValue({ data, error })
  const neq = jest.fn().mockReturnValue({ order })
  const not = jest.fn().mockReturnValue({ neq })
  const eq = jest.fn().mockReturnValue({ not })
  const select = jest.fn().mockReturnValue({ eq })

  return {
    client: { from: jest.fn().mockReturnValue({ select }) },
    select,
    eq,
    not,
    neq,
  }
}

describe("sitemap", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetTenantCanonicalSiteUrl.mockReturnValue("https://www.padelfv.com")
    mockGetTenantOrganization.mockResolvedValue({ id: "organization-fv" })
  })

  it("publishes only canonical FV URLs and public tournament slugs", async () => {
    const query = createTournamentQuery({
      data: [
        {
          seo_slug: "liga-de-primavera",
          start_date: "2026-09-05T12:00:00.000Z",
          end_date: "2026-09-07T20:00:00.000Z",
        },
        { seo_slug: null, start_date: "2026-09-10T12:00:00.000Z", end_date: null },
      ],
    })
    mockCreateClient.mockResolvedValue(query.client)

    const entries = await sitemap()

    expect(entries.map((entry) => entry.url)).toEqual([
      "https://www.padelfv.com/",
      "https://www.padelfv.com/torneos",
      "https://www.padelfv.com/torneos/proximos",
      "https://www.padelfv.com/torneos/en-curso",
      "https://www.padelfv.com/torneos/finalizados",
      "https://www.padelfv.com/torneos/liga-de-primavera",
    ])
    expect(entries.at(-1)?.lastModified).toBe("2026-09-07T20:00:00.000Z")
    expect(query.select).toHaveBeenCalledWith("seo_slug, start_date, end_date")
    expect(query.eq).toHaveBeenCalledWith("organization_id", "organization-fv")
    expect(query.not).toHaveBeenCalledWith("seo_slug", "is", null)
    expect(query.neq).toHaveBeenCalledWith("is_draft", true)
  })

  it("keeps static tenant pages available when the tournament query fails", async () => {
    const query = createTournamentQuery({ data: null, error: { message: "column tournaments.updated_at does not exist" } })
    mockCreateClient.mockResolvedValue(query.client)
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)

    const entries = await sitemap()

    expect(entries).toHaveLength(5)
    expect(entries.every((entry) => entry.url.startsWith("https://www.padelfv.com/"))).toBe(true)
    expect(consoleError).toHaveBeenCalledWith("[sitemap] Could not load public tournaments:", expect.anything())
    consoleError.mockRestore()
  })

  it("does not silently emit an empty sitemap when the tenant organization is unavailable", async () => {
    mockGetTenantOrganization.mockResolvedValue(null)
    mockCreateClient.mockResolvedValue({ from: jest.fn() })
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)

    const entries = await sitemap()

    expect(entries).toHaveLength(5)
    expect(consoleError).toHaveBeenCalledWith(
      "[sitemap] Could not resolve the current tenant organization; publishing static entries only.",
    )
    consoleError.mockRestore()
  })
})
