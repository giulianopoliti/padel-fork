import { getPublicTournamentListRedirect } from "@/lib/seo/legacy-public-route"

describe("getPublicTournamentListRedirect", () => {
  it.each([
    ["/tournaments", "/torneos"],
    ["/tournaments/upcoming", "/torneos/proximos"],
    ["/tournaments/in-progress", "/torneos/en-curso"],
    ["/tournaments/past", "/torneos/finalizados"],
  ] as const)("maps %s to %s", (legacyPath, destination) => {
    expect(getPublicTournamentListRedirect(legacyPath, {})).toBe(destination)
  })

  it("preserves public filters, pagination, and repeated query values", () => {
    expect(
      getPublicTournamentListRedirect("/tournaments/upcoming", {
        page: "2",
        category: ["sexta", "septima"],
        search: "copa primavera",
      }),
    ).toBe("/torneos/proximos?page=2&category=sexta&category=septima&search=copa+primavera")
  })
})
