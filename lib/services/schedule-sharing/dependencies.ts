import type { ScheduleSlotInput, StoredScheduleSlot } from './types'
import { getCourtResource, getScheduleSlotIdentity, isPlayableScheduleSlot, localTimeToSeconds } from './validation'

export interface ScheduleMatchDependency {
  scheduled_time_slot_id: string | null
  scheduled_date: string | null
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  court_assignment: string | null
}

export interface ScheduleSlotDependencies {
  /** Includes available=false and notes: every stored answer has meaning. */
  availability_count: number
  matches: readonly ScheduleMatchDependency[]
}

/** Input matches must include direct references AND concrete programming for this fecha. */
export const isMatchDependentOnScheduleSlot = (slot: StoredScheduleSlot, match: ScheduleMatchDependency): boolean => {
  if (match.scheduled_time_slot_id === slot.id) return true
  if (match.scheduled_date !== slot.date) return false
  const matchCourt = getCourtResource(match.court_assignment)
  const slotCourt = getCourtResource(slot.court_name)
  if (matchCourt && slotCourt && matchCourt !== slotCourt) return false
  // Missing/invalid scheduling details cannot prove that modifying the slot is safe.
  if (!match.scheduled_start_time) return true
  const start = localTimeToSeconds(match.scheduled_start_time)
  const end = match.scheduled_end_time ? localTimeToSeconds(match.scheduled_end_time) : NaN
  if (!Number.isFinite(start)) return true
  const slotStart = localTimeToSeconds(slot.start_time)
  const slotEnd = localTimeToSeconds(slot.end_time)
  if (!Number.isFinite(end) || end <= start) return start < slotEnd
  return start < slotEnd && slotStart < end
}

/** Changing descriptive text preserves the physical option answered by couples. */
export const getScheduleMutationBlocker = (
  current: StoredScheduleSlot,
  next: ScheduleSlotInput | null,
  dependencies: ScheduleSlotDependencies,
): string | null => {
  if (!isPlayableScheduleSlot(current)) return 'Los horarios de sistema y FECHA LIBRE no se pueden modificar ni eliminar.'
  const changesPhysicalOption = !next || getScheduleSlotIdentity(current) !== getScheduleSlotIdentity(next)
  if (changesPhysicalOption && dependencies.availability_count > 0) {
    return 'El horario ya tiene respuestas de parejas. Conservá el día, las horas y la cancha para no invalidarlas.'
  }
  if (changesPhysicalOption && dependencies.matches.some(match => isMatchDependentOnScheduleSlot(current, match))) {
    return 'El horario tiene partidos programados. Reprogramalos antes de cambiarlo o eliminarlo.'
  }
  if (next && next.max_matches !== undefined && next.max_matches < (current.max_matches ?? 1) &&
      dependencies.matches.some(match => isMatchDependentOnScheduleSlot(current, match))) {
    return 'No se puede reducir la capacidad de un horario con partidos programados.'
  }
  return null
}
