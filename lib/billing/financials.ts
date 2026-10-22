import type { BillingCollection, BillingFinancialStatus, BillingItem } from "./types"

export type BillingStatusFilter = "ALL" | BillingFinancialStatus | "UNPAID"

export interface TournamentAllocation {
  tournamentId: string
  amountPaidArs: number
  balanceArs: number
  installments: Record<string, number>
}

const assertMoney = (amount: number): void => {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2_000_000_000) {
    throw new Error("El cobro contiene un importe inválido")
  }
}

export const getFinancialStatus = (total: number, paid: number): BillingFinancialStatus => {
  if (paid === total) return "PAID"
  return paid > 0 ? "PARTIALLY_PAID" : "PENDING"
}

/** Allocate the complete schedule first, so payment order cannot change rounding. */
export const allocateCollection = (collection: BillingCollection): TournamentAllocation[] => {
  const tournaments = [...collection.tournaments].sort((a, b) =>
    a.tournamentId < b.tournamentId ? -1 : a.tournamentId > b.tournamentId ? 1 : 0,
  )
  const installments = [...collection.installments].sort((a, b) => a.installmentNumber - b.installmentNumber)
  const fail = (): never => { throw new Error(`El cobro #${collection.id.slice(0, 8)} no concilia. Revisá sus torneos, cuotas y pagos.`) }
  const amounts = tournaments.map((tournament) => tournament.amountArs)
  ;[...amounts, collection.totalAmountArs, collection.tournamentSubtotalArs,
    collection.amountPaidArs, collection.balanceArs].forEach(assertMoney)
  if (new Set(tournaments.map((t) => t.tournamentId)).size !== tournaments.length ||
      new Set(installments.map((i) => i.id)).size !== installments.length ||
      !installments.length || installments.some((i, index) => i.installmentNumber !== index + 1)) fail()

  let tournamentTotal = amounts.reduce((sum, amount) => sum + amount, 0)
  if (tournamentTotal !== collection.tournamentSubtotalArs) fail()
  let scheduleTotal = 0
  let paidTotal = 0
  const result = tournaments.map((tournament): TournamentAllocation => ({
    tournamentId: tournament.tournamentId, amountPaidArs: 0, balanceArs: tournament.amountArs, installments: {},
  }))

  for (const installment of installments) {
    assertMoney(installment.amountArs)
    assertMoney(installment.maintenanceAmountArs)
    const budget = installment.amountArs - installment.maintenanceAmountArs
    if (budget < 0 || budget > tournamentTotal) fail()
    scheduleTotal += installment.amountArs
    if (installment.status === "PAID") paidTotal += installment.amountArs
    const parts = amounts.map((amount, index) => {
      // Integer arithmetic: a product of two valid peso amounts can exceed Number's exact range.
      const numerator = BigInt(amount) * BigInt(budget)
      const denominator = BigInt(tournamentTotal || 1)
      return { index, amount: Number(numerator / denominator), remainder: numerator % denominator }
    })
    let remaining = budget - parts.reduce((sum, part) => sum + part.amount, 0)
    const ranked = [...parts].sort((a, b) => a.remainder === b.remainder
      ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)
    for (const part of ranked) {
      if (remaining === 0) break
      if (part.amount < amounts[part.index]) { part.amount += 1; remaining -= 1 }
    }
    if (remaining !== 0) fail()
    for (const part of parts) {
      amounts[part.index] -= part.amount
      const allocation = result[part.index]
      allocation.installments[installment.id] = part.amount
      if (installment.status === "PAID") allocation.amountPaidArs += part.amount
    }
    tournamentTotal -= budget
  }
  if (tournamentTotal !== 0 || scheduleTotal !== collection.totalAmountArs ||
      paidTotal !== collection.amountPaidArs || paidTotal + collection.balanceArs !== scheduleTotal ||
      collection.status !== (paidTotal === 0 ? "OPEN" : paidTotal === scheduleTotal ? "PAID" : "PARTIALLY_PAID")) fail()
  return result.map((allocation, index) => ({
    ...allocation, balanceArs: tournaments[index].amountArs - allocation.amountPaidArs,
  }))
}

export const attachCollectionFinancials = (items: BillingItem[], collections: BillingCollection[]): BillingItem[] => {
  const financials = new Map<string, {
    collection: BillingCollection; allocation: TournamentAllocation;
    tournament: BillingCollection["tournaments"][number]
  }>()
  for (const collection of collections) {
    const allocations = new Map(allocateCollection(collection).map((allocation) => [allocation.tournamentId, allocation]))
    for (const tournament of collection.tournaments) {
      if (financials.has(tournament.tournamentId)) throw new Error("Un torneo pertenece a más de un cobro")
      financials.set(tournament.tournamentId, { collection, tournament, allocation: allocations.get(tournament.tournamentId)! })
    }
  }
  return items.map((item) => {
    const linked = financials.get(item.tournamentId)
    if (!linked) return item
    if (item.status !== "PENDING") throw new Error("Un torneo tiene un cobro individual y un cobro en cuotas superpuestos")
    const { collection, tournament, allocation } = linked
    return {
      ...item, amountArs: tournament.amountArs, unitAmountArs: tournament.amountArs,
      billableUnits: tournament.billableUnits,
      pricingRule: tournament.billableUnits <= 16 ? "FV_UP_TO_16" : "FV_OVER_16",
      financialStatus: getFinancialStatus(tournament.amountArs, allocation.amountPaidArs),
      amountPaidArs: allocation.amountPaidArs, balanceArs: allocation.balanceArs,
      collectionId: collection.id,
      paidInstallments: collection.installments.filter((i) => i.status === "PAID").length,
      totalInstallments: collection.installments.length,
    }
  })
}

export const matchesBillingStatus = (item: BillingItem, filter: BillingStatusFilter): boolean => {
  if (filter === "ALL") return true
  if (filter === "PENDING") return item.financialStatus === "PENDING" || item.financialStatus === "PARTIALLY_PAID"
  if (filter === "UNPAID") return item.financialStatus === "PENDING"
  return item.financialStatus === filter
}

export const canSelectBillingItem = (item: BillingItem): boolean => item.status === "PENDING" && !item.collectionId

export const summarizeBilling = (items: BillingItem[], collections: BillingCollection[]) => {
  // Collections own their totals, including any historical tournament missing from the current catalog.
  const individualItems = items.filter((item) => !item.collectionId)
  const maintenancePendingArs = collections.reduce((sum, c) => sum + c.installments
    .filter((i) => i.status !== "PAID").reduce((total, i) => total + i.maintenanceAmountArs, 0), 0)
  const tournamentPendingArs = individualItems.reduce((sum, i) => sum + i.balanceArs, 0) +
    collections.reduce((sum, c) => sum + c.balanceArs, 0) - maintenancePendingArs
  return {
    tournamentPendingArs, maintenancePendingArs, pendingArs: tournamentPendingArs + maintenancePendingArs,
    paidArs: individualItems.reduce((sum, i) => sum + i.amountPaidArs, 0) + collections.reduce((sum, c) => sum + c.amountPaidArs, 0),
    dismissedArs: individualItems.filter((i) => i.status === "DISMISSED").reduce((sum, i) => sum + i.amountArs, 0),
  }
}

export const isBillingMonth = (month: string): boolean => /^\d{4}-(0[1-9]|1[0-2])-01$/.test(month) && Number(month.slice(0, 4)) >= 2000 && Number(month.slice(0, 4)) <= 9998

export const addBillingMonths = (month: string, offset: number): string => {
  if (!isBillingMonth(month) || !Number.isInteger(offset) || offset < 0 || offset > 23) throw new Error("Mes de facturación inválido")
  const date = new Date(`${month}T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  const result = date.toISOString().slice(0, 10)
  if (!isBillingMonth(result)) throw new Error("Mes de facturación fuera de rango")
  return result
}

export const formatBillingMonth = (month: string | null): string => month
  ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}T12:00:00Z`))
  : "Mes por confirmar"
