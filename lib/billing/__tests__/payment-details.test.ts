import { getPendingBillingWeeks } from "../payment-details"
import type { BillingItem } from "../types"

const item = (values: Partial<BillingItem>): BillingItem => ({
  financialStatus: "PENDING", balanceArs: 1000, periodStart: "2026-10-12", periodEnd: "2026-10-18",
  ...values,
} as BillingItem)

it("counts unique pending weeks and sums multiple tournaments in the same week", () => {
  expect(getPendingBillingWeeks([
    item({}), item({ balanceArs: 500 }),
    item({ periodStart: "2026-10-19", periodEnd: "2026-10-25", balanceArs: 2000 }),
  ], "2026-10-19")).toEqual([
    { weekStart: "2026-10-12", weekEnd: "2026-10-18", amountArs: 1500 },
    { weekStart: "2026-10-19", weekEnd: "2026-10-25", amountArs: 2000 },
  ])
})

it("excludes settled, dismissed, zero balance and future weeks", () => {
  expect(getPendingBillingWeeks([
    item({ financialStatus: "PAID" }), item({ financialStatus: "DISMISSED" }), item({ balanceArs: 0 }),
    item({ periodStart: "2026-10-26", periodEnd: "2026-11-01" }), item({ periodStart: null }),
  ], "2026-10-19")).toEqual([])
})
