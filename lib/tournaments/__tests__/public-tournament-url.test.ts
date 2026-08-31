import { getPublicTournamentHref } from "@/lib/tournaments/public-tournament-url"

describe("getPublicTournamentHref", () => {
  it("uses the SEO route when a slug is available", () => {
    expect(
      getPublicTournamentHref({
        id: "fbc8daa3-79ca-4bae-9d54-ff4156c13858",
        seoSlug: "americano-m11-nova-padel-center-30-agosto",
      }),
    ).toBe("/torneos/americano-m11-nova-padel-center-30-agosto")
  })

  it("keeps the UUID route as a safe fallback", () => {
    expect(getPublicTournamentHref({ id: "fbc8daa3-79ca-4bae-9d54-ff4156c13858" })).toBe(
      "/tournaments/fbc8daa3-79ca-4bae-9d54-ff4156c13858",
    )
  })
})
