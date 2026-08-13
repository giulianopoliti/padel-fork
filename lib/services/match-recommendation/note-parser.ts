import { minutesToTime, timeToMinutes } from './time'

export interface ParsedAvailabilityNote {
  kind: 'PARSED' | 'AMBIGUOUS' | 'NO_CONSTRAINT'
  earliestStartTime: string | null
  latestEndTime: string | null
  summary: string
  confidence: number
}

const normalizeNote = (note: string) => note
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim()

const TIME_PATTERN = '(\\d{1,2})(?:[:.]([0-5]\\d))?\\s*(?:h|hs|hrs|horas)?'

const resolveTime = (
  hourText: string,
  minuteText: string | undefined,
  slotStartTime: string,
  slotEndTime: string,
) => {
  let hour = Number(hourText)
  const minute = Number(minuteText || 0)
  if (hour > 23 || minute > 59) return null

  const slotStart = timeToMinutes(slotStartTime)
  const slotEnd = timeToMinutes(slotEndTime)
  const candidates = [hour * 60 + minute]
  if (hour <= 11) candidates.push((hour + 12) * 60 + minute)

  const inWindow = candidates.find(value => value >= slotStart && value <= slotEnd)
  if (inWindow !== undefined) return minutesToTime(inWindow)

  hour = Number(hourText)
  return minutesToTime(hour * 60 + minute)
}

export const parseAvailabilityNote = (
  rawNote: string | null | undefined,
  slotStartTime: string,
  slotEndTime: string,
): ParsedAvailabilityNote => {
  const note = normalizeNote(rawNote || '')
  if (!note) {
    return {
      kind: 'NO_CONSTRAINT',
      earliestStartTime: null,
      latestEndTime: null,
      summary: 'Sin nota horaria',
      confidence: 1,
    }
  }

  const range = note.match(new RegExp(`(?:entre|de)\\s+${TIME_PATTERN}\\s+(?:y|a|hasta)\\s+${TIME_PATTERN}`))
  if (range) {
    const start = resolveTime(range[1], range[2], slotStartTime, slotEndTime)
    const end = resolveTime(range[3], range[4], slotStartTime, slotEndTime)
    if (start && end && timeToMinutes(start) < timeToMinutes(end)) {
      return {
        kind: 'PARSED',
        earliestStartTime: start,
        latestEndTime: end,
        summary: `Disponible de ${start} a ${end}`,
        confidence: 1,
      }
    }
  }

  const earliest = note.match(new RegExp(`(?:desde|a partir de|(?<!no )despues de|luego de|no antes de)\\s+(?:las\\s+)?${TIME_PATTERN}`))
  const latest = note.match(new RegExp(`(?:hasta|(?<!no )antes de|no despues de)\\s+(?:las\\s+)?${TIME_PATTERN}`))

  if (earliest && latest) {
    const start = resolveTime(earliest[1], earliest[2], slotStartTime, slotEndTime)
    const end = resolveTime(latest[1], latest[2], slotStartTime, slotEndTime)
    if (start && end && timeToMinutes(start) < timeToMinutes(end)) {
      return {
        kind: 'PARSED',
        earliestStartTime: start,
        latestEndTime: end,
        summary: `Disponible de ${start} a ${end}`,
        confidence: 1,
      }
    }
  }

  if (earliest) {
    const start = resolveTime(earliest[1], earliest[2], slotStartTime, slotEndTime)
    if (start) {
      return {
        kind: 'PARSED',
        earliestStartTime: start,
        latestEndTime: null,
        summary: `Disponible desde las ${start}`,
        confidence: 1,
      }
    }
  }

  if (latest) {
    const end = resolveTime(latest[1], latest[2], slotStartTime, slotEndTime)
    if (end) {
      return {
        kind: 'PARSED',
        earliestStartTime: null,
        latestEndTime: end,
        summary: `Disponible hasta las ${end}`,
        confidence: 1,
      }
    }
  }

  return {
    kind: 'AMBIGUOUS',
    earliestStartTime: null,
    latestEndTime: null,
    summary: 'La nota necesita interpretacion',
    confidence: 0,
  }
}
