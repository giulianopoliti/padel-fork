export type BillingModel = "FV_LEAGUE" | "TPE_PLAYER"
export type BillingStatus = "PENDING" | "PAID" | "DISMISSED"
export type BillingCollectionStatus = "OPEN" | "PARTIALLY_PAID" | "PAID"
export type BillingInstallmentStatus = "PENDING" | "ISSUED" | "PAID"

export interface BillingSettings {
  organizationId: string
  billingModel: BillingModel
  currency: "ARS"
  fvAmountUpTo16: number
  fvAmountOver16: number
  tpeAmountPerPlayer: number
  updatedAt: string
}

export interface BillingInscription {
  tournament_id: string
  player_id: string | null
  couple_id: string | null
  es_prueba: boolean | null
  couple?: {
    id: string
    player1_id: string | null
    player2_id: string | null
    es_prueba: boolean | null
    player1?: { id: string; es_prueba: boolean | null } | null
    player2?: { id: string; es_prueba: boolean | null } | null
  } | null
  player?: { id: string; es_prueba: boolean | null } | null
}

export interface BillingTournamentRow {
  id: string
  name: string | null
  clubes?: { name: string | null } | { name: string | null }[] | null
  type: string | null
  status: string
  created_at: string
  start_date: string | null
  organization_id: string | null
  organizador_id: string | null
  es_prueba: boolean | null
}

export interface BillingChargeRow {
  tournament_id: string
  organization_id: string
  billing_model: BillingModel
  status: BillingStatus
  billable_units: number
  pricing_rule: string
  unit_amount_ars: number
  amount_ars: number
  period_start: string | null
  period_end: string | null
  resolved_at: string | null
  updated_by: string | null
  updated_at: string
}

export interface BillingSnapshot {
  billingModel: BillingModel
  billableUnits: number
  pricingRule: string
  unitAmountArs: number
  amountArs: number
  periodStart: string | null
  periodEnd: string | null
}

export interface BillingItem extends BillingSnapshot {
  tournamentId: string
  organizerId: string | null
  organizerLabel: string | null
  tournamentName: string
  clubName: string
  tournamentStatus: string
  createdAt: string
  startDate: string | null
  status: BillingStatus
  resolvedAt: string | null
  updatedAt: string | null
  isEligible: boolean
}

export interface BillingCollectionTournament {
  tournamentId: string
  tournamentName: string
  clubName: string
  billableUnits: number
  amountArs: number
}

export interface BillingInstallment {
  id: string
  installmentNumber: number
  amountArs: number
  status: BillingInstallmentStatus
  issuedAt: string | null
  paidAt: string | null
}

export interface BillingCollection {
  id: string
  organizerId: string | null
  organizerLabel: string
  totalAmountArs: number
  amountPaidArs: number
  balanceArs: number
  status: BillingCollectionStatus
  createdAt: string
  tournaments: BillingCollectionTournament[]
  installments: BillingInstallment[]
}

export interface BillingDashboardData {
  tenantKey: "padel-fv" | "padel-elite"
  tenantName: string
  organizationId: string
  billingModel: BillingModel
  settings: BillingSettings
  items: BillingItem[]
  collections: BillingCollection[]
  weekStart: string | null
  weekEnd: string | null
}
