import { buildTournamentSlugBase, getCompactCategorySlug, makeUniqueTournamentSlug, slugify } from "@/lib/tournaments/seo-slug"

describe("tournament SEO slugs", () => {
  test("normalizes text into ASCII URL segments", () => {
    expect(slugify("  Nova Pádel & Club  ")).toBe("nova-padel-club")
  })

  test("builds the agreed TPE American format without a year", () => {
    expect(buildTournamentSlugBase({
      name: "Americano noche",
      type: "AMERICAN",
      gender: "MALE",
      categoryName: "6ta",
      clubName: "Nova Pádel",
      startDate: "2026-09-02T22:30:00-03:00",
    })).toBe("americano-c6-nova-padel-02-septiembre")
  })

  test("builds the agreed Padel FV long format with month and year", () => {
    expect(buildTournamentSlugBase({
      name: "Lasaigues",
      type: "LONG",
      gender: "MALE",
      categoryName: "8va",
      clubName: "Caballito",
      startDate: "2026-08-18T12:00:00-03:00",
    })).toBe("lasaigues-caballito-c8-agosto-2026")
  })

  test("uses the category configuration for mixed sums and ranges", () => {
    expect(getCompactCategorySlug({ gender: "MIXED", categoryName: null, categoryConfig: { mode: "MIXED_SUM", targetSum: 14 } })).toBe("m14")
    expect(getCompactCategorySlug({ gender: "FEMALE", categoryName: null, categoryConfig: { mode: "RANGE", categoryA: "6ta", categoryB: "7ma" } })).toBe("d6-7")
  })

  test("uses a controlled numeric fallback only after a real collision", () => {
    const taken = new Set(["americano-c6-nova-padel-02-septiembre", "americano-c6-nova-padel-02-septiembre-2"])
    expect(makeUniqueTournamentSlug("americano-c6-nova-padel-02-septiembre", (slug) => taken.has(slug))).toBe("americano-c6-nova-padel-02-septiembre-3")
  })
})
