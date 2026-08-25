import type {
  BillingInscription,
  BillingModel,
  BillingSettings,
  BillingSnapshot,
  BillingTournamentRow,
} from "@/lib/billing/types"

export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires"

export const BILLING_DEFAULTS = {
  fvAmountUpTo16: 50_000,
  fvAmountOver16: 70_000,
  tpeAmountPerPlayer: 1_000,
} as const

export const FV_BACKFILL_CUTOFF_ISO = "2026-06-01T03:00:00.000Z"
export const TPE_BACKFILL_END_EXCLUSIVE_ISO = "2026-08-10T03:00:00.000Z"

const FV_ELIGIBLE_STATUSES = new Set([
  "ZONE_PHASE",
  "BRACKET_PHASE",
  "FINISHED_POINTS_PENDING",
  "FINISHED_POINTS_CALCULATED",
])

const TPE_ELIGIBLE_STATUSES = new Set([
  "NOT_STARTED",
  "BRACKET_PHASE",
  "FINISHED_POINTS_PENDING",
  "FINISHED_POINTS_CALCULATED",
])

export const getBillingModelForTenant = (tenantKey: "padel-fv" | "padel-elite"): BillingModel =>
  tenantKey === "padel-fv" ? "FV_LEAGUE" : "TPE_PLAYER"

export const isTournamentEligibleForBilling = (
  tournament: Pick<BillingTournamentRow, "type" | "status" | "es_prueba">,
  model: BillingModel,
) => {
  if (tournament.es_prueba === true) return false

  if (model === "FV_LEAGUE") {
    return tournament.type === "LONG" && FV_ELIGIBLE_STATUSES.has(tournament.status)
  }

  return tournament.type === "AMERICAN" && TPE_ELIGIBLE_STATUSES.has(tournament.status)
}

const normalizeRelation = <T>(relation: T | T[] | null | undefined): T | null => {
  if (Array.isArray(relation)) return relation[0] || null
  return relation || null
}

export const countBillableCouples = (inscriptions: BillingInscription[]) => {
  const coupleIds = new Set<string>()

  for (const inscription of inscriptions) {
    if (inscription.es_prueba === true || !inscription.couple_id) continue

    const couple = normalizeRelation(inscription.couple)
    if (!couple || couple.es_prueba === true) continue

    const player1 = normalizeRelation(couple.player1)
    const player2 = normalizeRelation(couple.player2)
    if (!player1 || !player2 || player1.es_prueba === true || player2.es_prueba === true) continue

    coupleIds.add(couple.id)
  }

  return coupleIds.size
}

export const countBillablePlayers = (inscriptions: BillingInscription[]) => {
  const playerIds = new Set<string>()

  for (const inscription of inscriptions) {
    if (inscription.es_prueba === true) continue

    if (inscription.couple_id) {
      const couple = normalizeRelation(inscription.couple)
      if (!couple || couple.es_prueba === true) continue

      const player1 = normalizeRelation(couple.player1)
      const player2 = normalizeRelation(couple.player2)

      if (player1 && player1.es_prueba !== true) playerIds.add(player1.id)
      if (player2 && player2.es_prueba !== true) playerIds.add(player2.id)
      continue
    }

    const player = normalizeRelation(inscription.player)
    if (player && player.es_prueba !== true) playerIds.add(player.id)
  }

  return playerIds.size
}

const dateOnlyFromUtcDate = (date: Date) => date.toISOString().slice(0, 10)

export const addDaysToDateOnly = (dateOnly: string, days: number) => {
  const date = new Date(`${dateOnly}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return dateOnlyFromUtcDate(date)
}

export const getMondayForDateOnly = (dateOnly: string) => {
  const date = new Date(`${dateOnly}T12:00:00Z`)
  const day = date.getUTCDay()
  const daysSinceMonday = day === 0 ? 6 : day - 1
  date.setUTCDate(date.getUTCDate() - daysSinceMonday)
  return dateOnlyFromUtcDate(date)
}

export const getArgentinaDateOnly = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ARGENTINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export const getArgentinaDateOnlyFromIso = (isoDate: string) =>
  getArgentinaDateOnly(new Date(isoDate))

export const getWeekRange = (requestedWeekStart?: string | null) => {
  const candidate = requestedWeekStart || getArgentinaDateOnly()
  const start = getMondayForDateOnly(candidate)
  return { start, end: addDaysToDateOnly(start, 6) }
}

export const getArgentinaWeekUtcRange = (weekStart: string) => ({
  startIso: `${weekStart}T03:00:00.000Z`,
  endExclusiveIso: `${addDaysToDateOnly(weekStart, 7)}T03:00:00.000Z`,
})

export const isStartDateInWeek = (startDate: string | null, weekStart: string, weekEnd: string) => {
  if (!startDate) return false
  const dateOnly = getArgentinaDateOnlyFromIso(startDate)
  return dateOnly >= weekStart && dateOnly <= weekEnd
}

export const calculateBillingSnapshot = (
  model: BillingModel,
  settings: BillingSettings,
  inscriptions: BillingInscription[],
  startDate: string | null,
): BillingSnapshot => {
  if (model === "FV_LEAGUE") {
    const billableUnits = countBillableCouples(inscriptions)
    const isLowerTier = billableUnits <= 16
    const amountArs = isLowerTier ? settings.fvAmountUpTo16 : settings.fvAmountOver16

    return {
      billingModel: model,
      billableUnits,
      pricingRule: isLowerTier ? "FV_UP_TO_16" : "FV_OVER_16",
      unitAmountArs: amountArs,
      amountArs,
      periodStart: null,
      periodEnd: null,
    }
  }

  const billableUnits = countBillablePlayers(inscriptions)
  const startDateOnly = startDate ? getArgentinaDateOnlyFromIso(startDate) : getArgentinaDateOnly()
  const weekStart = getMondayForDateOnly(startDateOnly)

  return {
    billingModel: model,
    billableUnits,
    pricingRule: "TPE_PER_PLAYER",
    unitAmountArs: settings.tpeAmountPerPlayer,
    amountArs: billableUnits * settings.tpeAmountPerPlayer,
    periodStart: weekStart,
    periodEnd: addDaysToDateOnly(weekStart, 6),
  }
}
