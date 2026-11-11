export type LongPlayerRegistrationStatus =
  | 'NOT_REGISTERED'
  | 'INDIVIDUAL'
  | 'PENDING'
  | 'ACTIVE'
  | 'ELIMINATED'
  | 'SUBSTITUTE'

export interface LongPlayerOverviewMatch {
  id: string
  isSubstitute?: boolean
  status: string
  round: string
  opponentName: string
  scheduledDate: string | null
  scheduledStartTime: string | null
  court: string | null
  winnerId: string | null
  resultCouple1: string | null
  resultCouple2: string | null
  playerCoupleId: string
  couple1Id: string | null
  couple2Id: string | null
  createdAt: string
}

export interface LongPlayerStanding {
  position: number
  wins: number
  losses: number
  setsDifference: number
  gamesDifference: number
}

export interface LongPlayerAvailabilitySummary {
  fechaId: string
  fechaName: string
  fechaNumber: number
  totalSlots: number
  respondedSlots: number
  canEdit: boolean
  restrictionReason: string | null
}

export interface LongPlayerOverview {
  registrationStatus: LongPlayerRegistrationStatus
  coupleId: string | null
  coupleName: string | null
  eliminatedAt: string | null
  eliminatedInRound: string | null
  nextMatch: LongPlayerOverviewMatch | null
  finishedMatches: LongPlayerOverviewMatch[]
  standing: LongPlayerStanding | null
  availability: LongPlayerAvailabilitySummary | null
}

export const selectPriorityAvailability = (
  summaries: LongPlayerAvailabilitySummary[]
): LongPlayerAvailabilitySummary | null => {
  if (summaries.length === 0) return null

  return (
    summaries.find(summary => summary.canEdit && summary.respondedSlots < summary.totalSlots) ||
    summaries.find(summary => summary.canEdit && summary.totalSlots > 0) ||
    summaries[0]
  )
}
