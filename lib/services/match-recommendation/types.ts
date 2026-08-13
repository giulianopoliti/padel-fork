export type MatchDurationMinutes = 60 | 75 | 90

export type NoteInterpretationStatus =
  | 'NONE'
  | 'PARSED'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'IGNORED'
  | 'FAILED'

export interface RecommendationCouple {
  id: string
  name: string
  completedZoneMatches: number
  blockedForFecha?: boolean
}

export interface RecommendationTimeSlot {
  id: string
  date: string
  startTime: string
  endTime: string
  courtName: string | null
  maxConcurrentMatches: number
}

export interface RecommendationAvailability {
  coupleId: string
  timeSlotId: string
  isAvailable: boolean
  effectiveStartTime?: string | null
  effectiveEndTime?: string | null
  interpretationStatus?: NoteInterpretationStatus
}

export interface FixedScheduledMatch {
  id: string
  couple1Id: string
  couple2Id: string
  date: string
  startTime: string
  endTime: string
  courtName: string | null
}

export interface MatchRecommendationInput {
  couples: RecommendationCouple[]
  timeSlots: RecommendationTimeSlot[]
  availability: RecommendationAvailability[]
  fixedMatches: FixedScheduledMatch[]
  forbiddenPairKeys: string[]
  durationMinutes: MatchDurationMinutes
  maxSearchNodes?: number
}

export interface RecommendedMatch {
  couple1Id: string
  couple2Id: string
  timeSlotId: string
  date: string
  startTime: string
  endTime: string
  courtName: string | null
}

export type UnscheduledReason =
  | 'BLOCKED_FOR_FECHA'
  | 'PENDING_NOTE_REVIEW'
  | 'NO_AVAILABILITY'
  | 'NO_NEW_OPPONENT'
  | 'NO_COMMON_WINDOW'
  | 'CAPACITY_EXHAUSTED'
  | 'OPTIMIZATION_TRADEOFF'

export interface UnscheduledCouple {
  coupleId: string
  reason: UnscheduledReason
}

export interface MatchRecommendationResult {
  matches: RecommendedMatch[]
  unscheduled: UnscheduledCouple[]
  searchStatus: 'OPTIMAL' | 'BEST_EFFORT'
  visitedNodes: number
}

export const pairKey = (couple1Id: string, couple2Id: string) =>
  [couple1Id, couple2Id].sort().join(':')
