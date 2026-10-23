import type { BillingItem, BillingPendingWeek } from "./types"

export const TPE_BILLING_PAYMENT_ALIAS = "Julivaldez94"

export const getPendingBillingWeeks = (items: BillingItem[], currentWeekStart: string): BillingPendingWeek[] => {
  const weeks = new Map<string, BillingPendingWeek>()
  for (const item of items) {
    if (item.financialStatus !== "PENDING" || item.balanceArs <= 0 || !item.periodStart || !item.periodEnd || item.periodStart > currentWeekStart) continue
    const week = weeks.get(item.periodStart) ?? { weekStart: item.periodStart, weekEnd: item.periodEnd, amountArs: 0 }
    week.amountArs += item.balanceArs
    weeks.set(item.periodStart, week)
  }
  return Array.from(weeks.values()).sort((first, second) => first.weekStart.localeCompare(second.weekStart))
}
