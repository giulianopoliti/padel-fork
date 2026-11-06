import type {
  ScheduleDraftSlot, ScheduleIssue, SchedulePeriod, ScheduleResult,
  ScheduleSlotContent, ScheduleSlotInput, ScheduleValidationOptions, StoredScheduleSlot,
} from './types'

export const isCivilDate = (value: string): boolean => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= days[month - 1]
}

export const getArgentinaToday = (now: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find(value => value.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** PostgreSQL's HH:mm:ss and form HH:mm inputs share a canonical representation. */
export const normalizeLocalTime = (value: string, allowEndOfDay = false): string | null => {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) return null
  const [, hoursText, minutesText, secondsText = '00'] = match
  const [hours, minutes, seconds] = [hoursText, minutesText, secondsText].map(Number)
  if (hours === 24 && minutes === 0 && seconds === 0 && allowEndOfDay) return '24:00:00'
  if (hours > 23 || minutes > 59 || seconds > 59) return null
  return `${String(hours).padStart(2, '0')}:${minutesText}:${secondsText}`
}

export const localTimeToSeconds = (value: string): number => {
  const normalized = normalizeLocalTime(value, true)
  if (!normalized) return NaN
  const [hours, minutes, seconds] = normalized.split(':').map(Number)
  return hours * 3600 + minutes * 60 + seconds
}

export const normalizeScheduleText = (value: string | null | undefined): string | null =>
  value?.trim().replace(/\s+/g, ' ') || null

export const getCourtResource = (value: string | null | undefined): string =>
  normalizeScheduleText(value)?.toLocaleLowerCase('es-AR') || ''

export const isPlayableScheduleSlot = (slot: Pick<StoredScheduleSlot, 'slot_type' | 'is_system'>): boolean =>
  slot.slot_type !== 'FREE_DATE' && !slot.is_system

export const normalizeScheduleSlot = (
  slot: ScheduleSlotInput,
  allowEndOfDay = false,
): ScheduleResult<ScheduleSlotContent> => {
  const issues: ScheduleIssue[] = []
  if (!isPlayableScheduleSlot(slot)) return { ok: false, issues: [{ code: 'SYSTEM_SLOT', message: 'Las franjas de sistema y FECHA LIBRE no se pueden copiar ni editar.' }] }
  const start = normalizeLocalTime(slot.start_time)
  const end = normalizeLocalTime(slot.end_time, allowEndOfDay)
  if (!isCivilDate(slot.date)) issues.push({ code: 'INVALID_DATE', message: 'La fecha debe ser un día válido (AAAA-MM-DD).' })
  if (!start || !end) issues.push({ code: 'INVALID_TIME', message: 'Las horas deben ser válidas; el límite 24:00 todavía no está habilitado.' })
  if (start && end && localTimeToSeconds(start) >= localTimeToSeconds(end)) {
    issues.push({ code: 'INVALID_RANGE', message: 'La hora de fin debe ser posterior a la hora de inicio. Separá los cruces de medianoche en dos días.' })
  }
  const capacity = slot.max_matches ?? 1
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    issues.push({ code: 'INVALID_CAPACITY', message: 'La capacidad debe ser un entero positivo.' })
  }
  if (issues.length > 0 || !start || !end) return { ok: false, issues }
  return { ok: true, data: {
    date: slot.date, start_time: start, end_time: end,
    court_name: normalizeScheduleText(slot.court_name), max_matches: capacity,
    description: slot.description?.trim() || null, is_available: slot.is_available ?? true,
  } }
}

export const validateSchedulePeriod = (period: SchedulePeriod): ScheduleIssue[] => {
  if ((period.start_date !== null && !isCivilDate(period.start_date)) ||
      (period.end_date !== null && !isCivilDate(period.end_date)) ||
      (period.start_date && period.end_date && period.start_date > period.end_date)) {
    return [{ code: 'INVALID_PERIOD', message: 'El período de la fecha es inválido.' }]
  }
  return []
}

export const scheduleSlotsOverlap = (left: ScheduleSlotInput, right: ScheduleSlotInput): boolean =>
  left.date === right.date && getCourtResource(left.court_name) === getCourtResource(right.court_name) &&
  localTimeToSeconds(left.start_time) < localTimeToSeconds(right.end_time) &&
  localTimeToSeconds(right.start_time) < localTimeToSeconds(left.end_time)

/** Identifies a physical option, independently of description or capacity. */
export const getScheduleSlotIdentity = (slot: ScheduleSlotInput): string => JSON.stringify([
  slot.date, normalizeLocalTime(slot.start_time), normalizeLocalTime(slot.end_time, true), getCourtResource(slot.court_name),
])

export const getScheduleSlotFingerprint = (slot: ScheduleSlotContent): string => JSON.stringify([
  getScheduleSlotIdentity(slot), slot.max_matches, slot.description?.trim() || null, slot.is_available,
])

export const validateScheduleSlots = (
  slots: readonly ScheduleDraftSlot[],
  options: ScheduleValidationOptions = {},
): ScheduleResult<Array<ScheduleSlotContent & { key: string }>> => {
  const today = options.today ?? getArgentinaToday()
  const issues = options.period ? validateSchedulePeriod(options.period) : []
  if (!isCivilDate(today)) issues.push({ code: 'INVALID_DATE', message: 'El día de referencia es inválido.' })
  const keys = new Set<string>()
  const editingIds = new Set(options.editingSlotIds)
  const replacedIds = new Set(slots.filter(slot => editingIds.has(slot.key)).map(slot => slot.key))
  const normalized: Array<ScheduleSlotContent & { key: string }> = []
  const existing: Array<ScheduleSlotContent & { key: string }> = []
  for (const slot of options.existingSlots ?? []) {
    if (!isPlayableScheduleSlot(slot)) continue
    // Historical persisted 24:00 may be compared, even while creation is disabled.
    const result = normalizeScheduleSlot(slot, true)
    if (!result.ok) {
      issues.push({ code: 'INVALID_EXISTING_SLOT', related_key: slot.id, message: 'Hay un horario existente inválido. Revisalo antes de agregar franjas.' })
      continue
    }
    existing.push({ ...result.data, key: slot.id })
  }
  for (const slot of slots) {
    if (!slot.key || keys.has(slot.key)) issues.push({ code: 'INVALID_KEY', slot_key: slot.key, message: 'Cada franja debe tener una identidad única.' })
    keys.add(slot.key)
    const result = normalizeScheduleSlot(slot, options.allowEndOfDay)
    if (!result.ok) {
      issues.push(...result.issues.map(issue => ({ ...issue, slot_key: slot.key })))
      continue
    }
    const content = result.data
    const original = editingIds.has(slot.key) ? existing.find(candidate => candidate.key === slot.key) : undefined
    const preservesHistoricalRange = original && getScheduleSlotIdentity(original) === getScheduleSlotIdentity(content)
    if (content.date < today && !preservesHistoricalRange) {
      issues.push({ code: 'PAST_DATE', slot_key: slot.key, message: 'No se puede crear un horario en el pasado.' })
    }
    if ((options.period?.start_date && content.date < options.period.start_date) ||
        (options.period?.end_date && content.date > options.period.end_date)) {
      issues.push({ code: 'OUTSIDE_PERIOD', slot_key: slot.key, message: 'El día debe estar dentro del período de la fecha.' })
    }
    // Drafts are compared with each other, but never revalidate unrelated historical overlaps.
    for (const other of [...existing.filter(candidate => !replacedIds.has(candidate.key)), ...normalized]) {
      if (!scheduleSlotsOverlap(content, other)) continue
      const duplicate = getScheduleSlotIdentity(content) === getScheduleSlotIdentity(other)
      issues.push({ code: duplicate ? 'DUPLICATE' : 'OVERLAP', slot_key: slot.key, related_key: other.key,
        message: duplicate ? 'Ya existe una franja con el mismo día, horas y cancha.' : 'Hay solapamiento con otra franja del mismo día y cancha.' })
    }
    normalized.push({ ...content, key: slot.key })
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, data: normalized }
}
