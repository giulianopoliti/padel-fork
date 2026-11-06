import type { FechaBracketKey, FechaRoundType } from '@/lib/services/fecha-bracket-policy'

/** Civil dates and local times never represent UTC instants. */
export interface SchedulePeriod {
  start_date: string | null
  end_date: string | null
}

export interface ScheduleMetadata extends SchedulePeriod {
  name: string
  description: string | null
}

export interface ScheduleSlotInput {
  date: string
  start_time: string
  end_time: string
  court_name?: string | null
  max_matches?: number
  description?: string | null
  is_available?: boolean
  slot_type?: 'TIME_RANGE' | 'FREE_DATE' | null
  is_system?: boolean | null
}

export interface ScheduleSlotContent extends ScheduleSlotInput {
  court_name: string | null
  max_matches: number
  description: string | null
  is_available: boolean
}

export interface ScheduleDraftSlot extends ScheduleSlotInput {
  key: string
}

export interface StoredScheduleSlot extends ScheduleSlotInput {
  id: string
}

export type ScheduleIssueCode =
  | 'INVALID_DATE' | 'INVALID_TIME' | 'INVALID_RANGE' | 'INVALID_CAPACITY'
  | 'INVALID_PERIOD' | 'OUTSIDE_PERIOD' | 'PAST_DATE' | 'SYSTEM_SLOT'
  | 'DUPLICATE' | 'OVERLAP' | 'INVALID_EXISTING_SLOT' | 'INVALID_KEY'
  | 'SLOT_NOT_FOUND' | 'INVALID_SPLIT' | 'INVALID_OFFSET'

export interface ScheduleIssue {
  code: ScheduleIssueCode
  message: string
  slot_key?: string
  related_key?: string
}

export type ScheduleResult<T> =
  | { ok: true; data: T }
  | { ok: false; issues: ScheduleIssue[] }

export interface ScheduleValidationOptions {
  /** Inject for reproducible previews/tests; defaults to today in Argentina. */
  today?: string
  period?: SchedulePeriod
  existingSlots?: readonly StoredScheduleSlot[]
  /** Only IDs loaded/authorized by the server may be used here. */
  editingSlotIds?: readonly string[]
  /** Off until all persisted-time consumers support the 24:00 boundary. */
  allowEndOfDay?: boolean
}

export interface ScheduleDestination {
  tournament_id: string
  fecha: { kind: 'create' } | { kind: 'adopt'; fecha_id: string }
  round_type: FechaRoundType
  bracket_key: FechaBracketKey
  estimated_match_duration_minutes: 60 | 75 | 90
  max_matches_per_couple: number | null
  /** Explicit manual equivalence selection when more than one persisted slot matches. */
  slot_adoptions?: Record<string, string>
  /** Cross-club court labels require an explicit decision in the review. */
  court_choice: 'preserve' | 'clear' | { rename: Record<string, string> }
}

/** No required source tournament. A group may start with a single destination. */
export interface ScheduleBatchDraft {
  operation_key: string
  group_id?: string
  complete_member_id?: string
  source_fecha_id: string | null
  metadata: ScheduleMetadata
  slots: ScheduleDraftSlot[]
  destinations: ScheduleDestination[]
}

export type ScheduleDistributionState =
  | 'COMPLETE' | 'MISSING_SLOTS' | 'LOCAL_CHANGES' | 'SHARED_CHANGES' | 'UNLINKED'

export interface ScheduleSlotTargetSnapshot {
  item_id: string
  status: 'active' | 'unlinked' | 'deleted'
  slot_id: string | null
  applied: ScheduleSlotContent
  /** Common content at application time, before deliberate destination court remapping. */
  applied_shared?: ScheduleSlotContent
}

export interface ScheduleSharedItem {
  id: string
  content: ScheduleSlotContent
  deleted: boolean
}

/** Load only authorized members before calculating coverage or counts. */
export interface ScheduleMemberSnapshot {
  status: 'active' | 'unlinked' | 'deleted'
  applied_metadata: ScheduleMetadata
  current_metadata: ScheduleMetadata
  slots: readonly StoredScheduleSlot[]
  targets: readonly ScheduleSlotTargetSnapshot[]
}
