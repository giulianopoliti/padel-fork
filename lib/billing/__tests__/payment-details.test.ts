import { getBillingWeeks, getPendingBillingWeeks } from "../payment-details"
import type { BillingItem } from "../types"

const item = (values: Partial<BillingItem>): BillingItem => ({
  financialStatus: "PENDING", amountArs: 1000, amountPaidArs: 0, balanceArs: 1000, periodStart: "2026-10-12", periodEnd: "2026-10-18",
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

it("keeps paid weeks in the history while excluding them from pending debt", () => {
  const rows = [item({ periodStart: "2026-08-31", periodEnd: "2026-09-06", financialStatus: "PAID", amountArs: 86000, amountPaidArs: 86000, balanceArs: 0 }), item({})]
  expect(getBillingWeeks(rows).find((week) => week.weekStart === "2026-08-31")).toEqual({
    weekStart: "2026-08-31", weekEnd: "2026-09-06", status: "PAID", amountArs: 86000, amountPaidArs: 86000, balanceArs: 0,
  })
  expect(getPendingBillingWeeks(rows, "2026-10-19").map((week) => week.weekStart)).toEqual(["2026-10-12"])
})

it("shows partial weeks without marking the whole week as paid", () => {
  expect(getBillingWeeks([item({ financialStatus: "PAID", amountPaidArs: 1000, balanceArs: 0 }), item({})])[0]).toMatchObject({
    status: "PARTIALLY_PAID", amountArs: 2000, amountPaidArs: 1000, balanceArs: 1000,
  })
})

it("excludes settled, dismissed, zero balance and future weeks", () => {
  expect(getPendingBillingWeeks([
    item({ financialStatus: "PAID" }), item({ financialStatus: "DISMISSED" }), item({ balanceArs: 0 }),
    item({ periodStart: "2026-10-26", periodEnd: "2026-11-01" }), item({ periodStart: null }),
  ], "2026-10-19")).toEqual([])
})
