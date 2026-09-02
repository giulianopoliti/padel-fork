jest.mock("@/config/tenant", () => ({
  getTenantCanonicalSiteUrl: jest.fn(),
}))

import { getTenantCanonicalSiteUrl } from "@/config/tenant"
import robots from "@/app/robots"

const mockGetTenantCanonicalSiteUrl = jest.mocked(getTenantCanonicalSiteUrl)

describe("robots", () => {
  it("references the current tenant sitemap and excludes operational routes", () => {
    mockGetTenantCanonicalSiteUrl.mockReturnValue("https://www.tpepadel.com")

    const result = robots()
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules

    expect(result.sitemap).toBe("https://www.tpepadel.com/sitemap.xml")
    expect(rules?.allow).toBe("/")
    expect(rules?.disallow).toEqual(expect.arrayContaining(["/panel/", "/my-tournaments", "/tournaments/"]))
  })
})
