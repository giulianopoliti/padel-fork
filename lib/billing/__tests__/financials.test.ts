import { addBillingMonths, allocateCollection, attachCollectionFinancials, canSelectBillingItem,
  formatBillingMonth, getFinancialStatus, isBillingMonth, matchesBillingStatus, summarizeBilling } from "../financials"
import type { BillingCollection, BillingItem } from "../types"

const collection = (amounts = [...Array(14).fill(50_000), ...Array(7).fill(70_000)] as number[],
  budgets = [595_000, 595_000], maintenance = 69_750, paid = [0]): BillingCollection => {
  const totalAmountArs = budgets.reduce((sum, n) => sum + n + maintenance, 0)
  const amountPaidArs = budgets.reduce((sum, n, index) => sum + (paid.includes(index) ? n + maintenance : 0), 0)
  return {
    id: "collection-1", organizerId: null, organizerLabel: "FV", createdAt: "2026-09-27T00:00:00Z",
    tournamentSubtotalArs: amounts.reduce((sum, n) => sum + n, 0), maintenanceAmountPerInstallmentArs: maintenance,
    totalAmountArs, amountPaidArs, balanceArs: totalAmountArs - amountPaidArs,
    status: amountPaidArs === 0 ? "OPEN" : amountPaidArs === totalAmountArs ? "PAID" : "PARTIALLY_PAID",
    tournaments: amounts.map((amountArs, i) => ({ tournamentId: `t-${String(i).padStart(3, "0")}`,
      tournamentName: `Torneo ${i}`, clubName: "Club QA", billableUnits: amountArs > 50_000 ? 20 : 12,
      tournamentStatus: "ZONE_PHASE", amountArs })),
    installments: budgets.map((budget, i) => ({ id: `i-${i}`, installmentNumber: i + 1,
      amountArs: budget + maintenance, maintenanceAmountArs: maintenance, billingMonth: null,
      status: paid.includes(i) ? "PAID" : "PENDING", paidAt: paid.includes(i) ? "2026-10-07T19:04:00Z" : null,
      issuedAt: null })),
  }
}

const item = (overrides: Partial<BillingItem> = {}): BillingItem => ({
  tournamentId: "t-000", organizerId: null, organizerLabel: "FV", tournamentName: "Torneo",
  clubName: "Club", tournamentStatus: "ZONE_PHASE", createdAt: "2026-09-01T00:00:00Z", startDate: null,
  status: "PENDING", resolvedAt: null, updatedAt: null, isEligible: true, billingModel: "FV_LEAGUE",
  billableUnits: 12, pricingRule: "FV_UP_TO_16", unitAmountArs: 50_000, amountArs: 50_000,
  periodStart: null, periodEnd: null, financialStatus: "PENDING", amountPaidArs: 0, balanceArs: 50_000,
  collectionId: null, paidInstallments: 0, totalInstallments: 0, ...overrides,
})

describe("collection financials", () => {
  it("reconstructs the 21 historical tournaments without allocating maintenance to them", () => {
    const c = collection()
    const allocated = allocateCollection(c)
    expect(allocated.slice(0, 14).every((t) => t.amountPaidArs === 25_000 && t.balanceArs === 25_000)).toBe(true)
    expect(allocated.slice(14).every((t) => t.amountPaidArs === 35_000 && t.balanceArs === 35_000)).toBe(true)
    expect(allocated.reduce((sum, t) => sum + t.amountPaidArs, 0)).toBe(595_000)
    const enriched = attachCollectionFinancials(c.tournaments.map((t) => item({ tournamentId: t.tournamentId })), [c])
    expect(enriched.every((t) => t.financialStatus === "PARTIALLY_PAID" && !canSelectBillingItem(t))).toBe(true)
    expect(enriched.every((t) => matchesBillingStatus(t, "PENDING") && matchesBillingStatus(t, "PARTIALLY_PAID") && !matchesBillingStatus(t, "UNPAID"))).toBe(true)
    expect(summarizeBilling(enriched, [c])).toMatchObject({ pendingArs: 664_750,
      tournamentPendingArs: 595_000, maintenancePendingArs: 69_750, paidArs: 664_750 })
  })

  it.each([[], [0], [1], [0, 1]].map((paid) => ({ paid })))("derives status for payment order $paid", ({ paid }) => {
    const c = collection([50_000, 70_000], [60_000, 60_000], 100, paid)
    const items = attachCollectionFinancials(c.tournaments.map((t) => item({ tournamentId: t.tournamentId })), [c])
    expect(items.every((t) => t.financialStatus === (paid.length === 0 ? "PENDING" : paid.length === 2 ? "PAID" : "PARTIALLY_PAID"))).toBe(true)
    expect(summarizeBilling(items, [c]).pendingArs).toBe(c.balanceArs)
  })

  it("allocates uneven installments independently of payment order with exact row and column sums", () => {
    const c = collection([33, 33, 34], [7, 39, 54], 5, [2])
    const allocations = allocateCollection(c)
    const reversed = allocateCollection({ ...c, tournaments: [...c.tournaments].reverse(), installments: [...c.installments].reverse() })
    expect(allocations).toEqual(reversed)
    expect(allocations.reduce((sum, t) => sum + t.amountPaidArs, 0)).toBe(54)
    for (const [index, i] of c.installments.entries()) {
      expect(allocations.reduce((sum, t) => sum + t.installments[i.id], 0)).toBe([7, 39, 54][index])
    }
    allocations.forEach((a, i) => expect(Object.values(a.installments).reduce((sum, n) => sum + n, 0)).toBe(c.tournaments[i].amountArs))
  })

  it("preserves every peso across many rounding combinations including large products", () => {
    for (let n = 1; n < 100; n++) {
      const amounts = [n, n * 13 + 1, n * 7 + 3]
      const sum = amounts.reduce((a, b) => a + b, 0)
      const c = collection(amounts, [Math.floor(sum / 3), Math.floor(sum / 3), sum - Math.floor(sum / 3) * 2], 0, [0, 1, 2])
      expect(allocateCollection(c).every((a) => a.balanceArs === 0)).toBe(true)
    }
    expect(allocateCollection(collection([999_999_999, 1_000_000_000], [999_999_999, 1_000_000_000], 0, [0, 1]))
      .every((a) => a.balanceArs === 0)).toBe(true)
  })

  it("uses the frozen price and pair count instead of changed rates or registrations", () => {
    const [actual] = attachCollectionFinancials([item({ amountArs: 99_000, billableUnits: 99 })], [collection()])
    expect(actual).toMatchObject({ amountArs: 50_000, billableUnits: 12, unitAmountArs: 50_000, amountPaidArs: 25_000 })
  })

  it("rejects inconsistent totals, duplicate tournaments, duplicate installment IDs and overlapping individual charges", () => {
    const c = collection()
    expect(() => allocateCollection({ ...c, amountPaidArs: 1 })).toThrow(/no concilia/)
    expect(() => allocateCollection({ ...c, tournamentSubtotalArs: 0 })).toThrow(/no concilia/)
    expect(() => allocateCollection({ ...c, tournaments: [...c.tournaments, c.tournaments[0]] })).toThrow(/no concilia/)
    expect(() => allocateCollection({ ...c, installments: c.installments.map((i) => ({ ...i, id: "duplicate" })) })).toThrow(/no concilia/)
    expect(() => attachCollectionFinancials([item({ status: "PAID" })], [c])).toThrow(/superpuestos/)
    expect(() => attachCollectionFinancials([], [c, c])).toThrow(/más de un cobro/)
  })

  it("keeps uncollected, dismissed and paid standalone TPE charges independent of collections", () => {
    const pending = item({ billingModel: "TPE_PLAYER" })
    const paid = item({ tournamentId: "paid", status: "PAID", financialStatus: "PAID", amountPaidArs: 50_000, balanceArs: 0 })
    const dismissed = item({ tournamentId: "dismissed", status: "DISMISSED", financialStatus: "DISMISSED", balanceArs: 0 })
    expect(attachCollectionFinancials([pending, paid, dismissed], [])).toEqual([pending, paid, dismissed])
    expect(summarizeBilling([pending, paid, dismissed], [])).toEqual({ pendingArs: 50_000, tournamentPendingArs: 50_000,
      maintenancePendingArs: 0, paidArs: 50_000, dismissedArs: 50_000 })
    expect(canSelectBillingItem(pending)).toBe(true)
    expect(matchesBillingStatus(dismissed, "PENDING")).toBe(false)
    expect(getFinancialStatus(50_000, 50_000)).toBe("PAID")
  })

  it("counts collection totals even if a linked tournament is absent from the current catalog", () => {
    expect(summarizeBilling([], [collection()]).pendingArs).toBe(664_750)
  })

  it("adds unpaid standalone tournaments to the remaining collection balance without duplicating partial receipts", () => {
    const c = collection()
    const items = attachCollectionFinancials([
      ...c.tournaments.map((t) => item({tournamentId:t.tournamentId})),
      item({tournamentId:"standalone"}),
    ], [c])
    expect(summarizeBilling(items,[c])).toMatchObject({pendingArs:714_750,tournamentPendingArs:645_000,
      maintenancePendingArs:69_750,paidArs:664_750})
    expect(items.filter(canSelectBillingItem).map((i)=>i.tournamentId)).toEqual(["standalone"])
  })
})

describe("monthly billing periods", () => {
  it("validates real first-of-month periods and crosses year boundaries", () => {
    expect(addBillingMonths("2026-12-01", 1)).toBe("2027-01-01")
    expect(addBillingMonths("2026-12-01", 23)).toBe("2028-11-01")
    expect(isBillingMonth("2026-13-01")).toBe(false)
    expect(isBillingMonth("2026-02-31")).toBe(false)
    expect(isBillingMonth("0000-01-01")).toBe(false)
    expect(() => addBillingMonths("9998-12-01", 1)).toThrow()
    expect(formatBillingMonth(null)).toBe("Mes por confirmar")
    expect(formatBillingMonth("2026-10-01")).toBe("octubre de 2026")
  })
})
