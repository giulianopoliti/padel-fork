import { getArgentinaToday, normalizeLocalTime } from './schedule-sharing/validation'

export type PlayerPanelAgendaState =
  | 'MATCH_SCHEDULED'
  | 'AVAILABILITY_REQUIRED'
  | 'AVAILABILITY_RECORDED'
  | 'AVAILABILITY_NOT_PUBLISHED'
  | 'NO_CURRENT_SLOTS'
  | 'DEFAULT'

export interface PlayerPanelScheduledMatchCandidate {
  id: string
  scheduledDate: string | null
  scheduledStartTime: string | null
}

export interface PlayerPanelFechaCandidate {
  id: string
  name: string
  fechaNumber: number
  startDate: string | null
  endDate: string | null
  status: string
  isApplicable: boolean
  playableSlotIds: string[]
  respondedPlayableSlotIds: string[]
  freeDateSelected: boolean
  hasPublishedSlots?: boolean
}

const argentinaTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

export const isCurrentPlayerTimeSlot = (slot: { date: string; end_time: string }, now = new Date()) => {
  const today = getArgentinaToday(now)
  return slot.date > today || (slot.date === today && (normalizeLocalTime(slot.end_time, true) ?? '') > argentinaTimeFormatter.format(now))
}

export const isOpenPlayerFecha = (fecha: { status?: string | null; end_date?: string | null; start_date?: string | null }, today: string) => {
  const lastDay = fecha.end_date || fecha.start_date
  return fecha.status !== 'CANCELED' && fecha.status !== 'COMPLETED' && (!lastDay || lastDay >= today)
}

export interface PlayerPanelAgendaResolution {
  state: PlayerPanelAgendaState
  scheduledMatchIds: string[]
  availabilityFechaId: string | null
}

interface ResolvePlayerPanelAgendaInput {
  isLongTournament: boolean
  isEliminated: boolean
  today: string
  matches: PlayerPanelScheduledMatchCandidate[]
  fechas: PlayerPanelFechaCandidate[]
}

const compareScheduledMatches = (
  firstMatch: PlayerPanelScheduledMatchCandidate,
  secondMatch: PlayerPanelScheduledMatchCandidate,
) => {
  const dateComparison = (firstMatch.scheduledDate || '').localeCompare(secondMatch.scheduledDate || '')
  if (dateComparison !== 0) return dateComparison

  return (firstMatch.scheduledStartTime || '').localeCompare(secondMatch.scheduledStartTime || '')
}

const compareFechas = (firstFecha: PlayerPanelFechaCandidate, secondFecha: PlayerPanelFechaCandidate) => {
  const firstDate = firstFecha.startDate || firstFecha.endDate || '9999-12-31'
  const secondDate = secondFecha.startDate || secondFecha.endDate || '9999-12-31'

  if (firstDate !== secondDate) return firstDate.localeCompare(secondDate)
  return firstFecha.fechaNumber - secondFecha.fechaNumber
}

export const resolvePlayerPanelAgenda = ({
  isLongTournament,
  isEliminated,
  today,
  matches,
  fechas,
}: ResolvePlayerPanelAgendaInput): PlayerPanelAgendaResolution => {
  if (!isLongTournament || isEliminated) {
    return {
      state: 'DEFAULT',
      scheduledMatchIds: [],
      availabilityFechaId: null,
    }
  }

  const scheduledMatches = matches
    .filter(match => (
      Boolean(match.scheduledDate) &&
      Boolean(match.scheduledStartTime) &&
      (match.scheduledDate || '') >= today
    ))
    .sort(compareScheduledMatches)

  if (scheduledMatches.length > 0) {
    return {
      state: 'MATCH_SCHEDULED',
      scheduledMatchIds: scheduledMatches.map(match => match.id),
      availabilityFechaId: null,
    }
  }

  const openFechas = fechas
    .filter(fecha => fecha.isApplicable && isOpenPlayerFecha({ status: fecha.status, start_date: fecha.startDate, end_date: fecha.endDate }, today))
    .sort(compareFechas)
  const nextActionableFecha = openFechas.find(fecha => fecha.playableSlotIds.length > 0)

  if (!nextActionableFecha) {
    const nextFecha = openFechas[0]
    return {
      state: !nextFecha ? 'DEFAULT' : nextFecha.hasPublishedSlots ? 'NO_CURRENT_SLOTS' : 'AVAILABILITY_NOT_PUBLISHED',
      scheduledMatchIds: [],
      availabilityFechaId: nextFecha?.id ?? null,
    }
  }

  const respondedPlayableSlots = new Set(nextActionableFecha.respondedPlayableSlotIds)
  const hasAnsweredAvailability = nextActionableFecha.playableSlotIds.some(slotId => (
    respondedPlayableSlots.has(slotId)
  ))

  return {
    state: hasAnsweredAvailability || nextActionableFecha.freeDateSelected ? 'AVAILABILITY_RECORDED' : 'AVAILABILITY_REQUIRED',
    scheduledMatchIds: [],
    availabilityFechaId: nextActionableFecha.id,
  }
}
