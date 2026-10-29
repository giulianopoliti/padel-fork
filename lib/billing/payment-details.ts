import type { BillingItem, BillingPendingWeek, BillingWeekSummary } from "./types"

export const TPE_BILLING_PAYMENT_ALIAS = "Julivaldez94"

export const BILLING_WEEK_STATUS_LABELS: Record<BillingWeekSummary["status"], string> = {
  PENDING: "Pendiente", PARTIALLY_PAID: "Pago parcial", PAID: "Pagada", DISMISSED: "Descartada", NO_CHARGE: "Sin importe",
}

export const getBillingWeeks = (items: BillingItem[]): BillingWeekSummary[] => {
  const groups = new Map<string, BillingItem[]>()
  for (const item of items) {
    if (!item.periodStart || !item.periodEnd) continue
    const group = groups.get(item.periodStart) ?? []
    group.push(item)
    groups.set(item.periodStart, group)
  }
  return Array.from(groups, ([weekStart, group]): BillingWeekSummary => {
    const amountArs = group.reduce((sum, item) => sum + item.amountArs, 0)
    const amountPaidArs = group.reduce((sum, item) => sum + item.amountPaidArs, 0)
    const balanceArs = group.reduce((sum, item) => sum + item.balanceArs, 0)
    const status = balanceArs > 0 ? (amountPaidArs > 0 ? "PARTIALLY_PAID" : "PENDING")
      : group.every((item) => item.financialStatus === "DISMISSED") ? "DISMISSED"
      : amountPaidArs > 0 || group.every((item) => item.financialStatus === "PAID") ? "PAID" : "NO_CHARGE"
    return { weekStart, weekEnd: group[0].periodEnd!, amountArs, amountPaidArs, balanceArs, status }
  }).sort((first, second) => second.weekStart.localeCompare(first.weekStart))
}

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
