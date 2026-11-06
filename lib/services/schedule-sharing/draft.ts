import type {
  ScheduleDraftSlot, ScheduleResult, ScheduleSlotInput, ScheduleValidationOptions,
} from './types'
import { isPlayableScheduleSlot, localTimeToSeconds, normalizeLocalTime, normalizeScheduleSlot, validateScheduleSlots } from './validation'

export type ScheduleDraftOperation =
  | { type: 'add'; slot: ScheduleDraftSlot }
  | { type: 'update'; key: string; patch: Partial<ScheduleSlotInput> }
  | { type: 'remove'; key: string }
  | { type: 'split'; key: string; at: string; newKey: string }
  | { type: 'move'; key: string; minutes: number }
  | { type: 'copy-day'; sourceDate: string; targetDates: readonly string[]; mode: 'add' | 'replace' }

export const secondsToLocalTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return [hours, minutes, seconds % 60].map(value => String(value).padStart(2, '0')).join(':')
}

export const splitScheduleSlot = (
  slot: ScheduleDraftSlot, at: string, newKey: string,
): ScheduleResult<[ScheduleDraftSlot, ScheduleDraftSlot]> => {
  const result = normalizeScheduleSlot(slot)
  if (!result.ok) return result
  const splitTime = normalizeLocalTime(at)
  const splitSeconds = splitTime ? localTimeToSeconds(splitTime) : NaN
  if (!splitTime || splitSeconds <= localTimeToSeconds(result.data.start_time) ||
      splitSeconds >= localTimeToSeconds(result.data.end_time)) {
    return { ok: false, issues: [{ code: 'INVALID_SPLIT', slot_key: slot.key, message: 'La división debe estar dentro de la franja.' }] }
  }
  if (!newKey || newKey === slot.key) {
    return { ok: false, issues: [{ code: 'INVALID_KEY', slot_key: slot.key, message: 'La segunda franja necesita una identidad nueva.' }] }
  }
  return { ok: true, data: [
    { ...result.data, key: slot.key, end_time: splitTime },
    { ...result.data, key: newKey, start_time: splitTime },
  ] }
}

/** Fields may use any minute; only the visual drag adapter should snap to 15 minutes. */
export const moveScheduleSlot = (slot: ScheduleDraftSlot, minutes: number): ScheduleResult<ScheduleDraftSlot> => {
  const result = normalizeScheduleSlot(slot)
  if (!result.ok) return result
  if (!Number.isSafeInteger(minutes)) {
    return { ok: false, issues: [{ code: 'INVALID_OFFSET', slot_key: slot.key, message: 'El desplazamiento debe expresarse en minutos enteros.' }] }
  }
  const start = localTimeToSeconds(result.data.start_time) + minutes * 60
  const end = localTimeToSeconds(result.data.end_time) + minutes * 60
  if (start < 0 || end >= 86400) {
    return { ok: false, issues: [{ code: 'INVALID_RANGE', slot_key: slot.key, message: 'El movimiento debe quedar dentro del mismo día; 24:00 todavía no está habilitado.' }] }
  }
  return { ok: true, data: { ...result.data, key: slot.key, start_time: secondsToLocalTime(start), end_time: secondsToLocalTime(end) } }
}

/** Changes memory only. Replacing draft days is never permission to delete persisted rows. */
export const applyScheduleDraftOperation = (
  slots: readonly ScheduleDraftSlot[],
  operation: ScheduleDraftOperation,
  options: ScheduleValidationOptions = {},
  createKey: () => string = () => crypto.randomUUID(),
): ScheduleResult<ScheduleDraftSlot[]> => {
  if (slots.some(slot => !isPlayableScheduleSlot(slot))) {
    return { ok: false, issues: [{ code: 'SYSTEM_SLOT', message: 'El borrador no puede modificar ni eliminar franjas de sistema.' }] }
  }
  let next = slots.map(slot => ({ ...slot }))
  if (operation.type === 'add') next.push({ ...operation.slot })
  else if (operation.type === 'copy-day') {
    const source = slots.filter(slot => slot.date === operation.sourceDate)
    if (source.length === 0) return { ok: false, issues: [{ code: 'SLOT_NOT_FOUND', message: 'El día de origen no tiene franjas para copiar.' }] }
    const dates = [...new Set(operation.targetDates)].filter(date => date !== operation.sourceDate)
    if (operation.mode === 'replace') next = next.filter(slot => !dates.includes(slot.date))
    for (const date of dates) {
      next.push(...source.map(slot => ({ ...slot, date, key: createKey() })))
    }
  } else {
    const index = next.findIndex(slot => slot.key === operation.key)
    if (index < 0) return { ok: false, issues: [{ code: 'SLOT_NOT_FOUND', slot_key: operation.key, message: 'La franja ya no existe en el borrador.' }] }
    const slot = next[index]
    if (operation.type === 'remove') next.splice(index, 1)
    if (operation.type === 'update') next[index] = { ...slot, ...operation.patch, key: slot.key }
    if (operation.type === 'split') {
      const result = splitScheduleSlot(slot, operation.at, operation.newKey)
      if (!result.ok) return result
      next.splice(index, 1, ...result.data)
    }
    if (operation.type === 'move') {
      const result = moveScheduleSlot(slot, operation.minutes)
      if (!result.ok) return result
      next[index] = result.data
    }
  }
  return validateScheduleSlots(next, options)
}
