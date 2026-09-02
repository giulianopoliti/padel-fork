describe("getTenantCanonicalSiteUrl", () => {
  const initialTenantKey = process.env.NEXT_PUBLIC_TENANT_KEY

  afterEach(() => {
    jest.resetModules()
  })

  afterAll(() => {
    if (initialTenantKey === undefined) {
      delete process.env.NEXT_PUBLIC_TENANT_KEY
      return
    }

    process.env.NEXT_PUBLIC_TENANT_KEY = initialTenantKey
  })

  it("uses the FV www domain", async () => {
    process.env.NEXT_PUBLIC_TENANT_KEY = "padel-fv"
    const { getTenantCanonicalSiteUrl } = await import("@/config/tenant")

    expect(getTenantCanonicalSiteUrl()).toBe("https://www.padelfv.com")
  })

  it("uses the TPE www domain", async () => {
    process.env.NEXT_PUBLIC_TENANT_KEY = "padel-elite"
    const { getTenantCanonicalSiteUrl } = await import("@/config/tenant")

    expect(getTenantCanonicalSiteUrl()).toBe("https://www.tpepadel.com")
  })
})
