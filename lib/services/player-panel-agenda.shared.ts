export type PlayerPanelAgendaState =
  | 'MATCH_SCHEDULED'
  | 'AVAILABILITY_REQUIRED'
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

  const nextActionableFecha = fechas
    .filter(fecha => {
      if (!fecha.isApplicable || fecha.status === 'CANCELED') return false

      const dateBoundary = fecha.endDate || fecha.startDate
      if (!dateBoundary || dateBoundary < today) return false

      return fecha.playableSlotIds.length > 0
    })
    .sort(compareFechas)[0]

  if (!nextActionableFecha) {
    return {
      state: 'DEFAULT',
      scheduledMatchIds: [],
      availabilityFechaId: null,
    }
  }

  const respondedPlayableSlots = new Set(nextActionableFecha.respondedPlayableSlotIds)
  const hasAnsweredAvailability = nextActionableFecha.playableSlotIds.some(slotId => (
    respondedPlayableSlots.has(slotId)
  ))

  if (hasAnsweredAvailability || nextActionableFecha.freeDateSelected) {
    return {
      state: 'DEFAULT',
      scheduledMatchIds: [],
      availabilityFechaId: null,
    }
  }

  return {
    state: 'AVAILABILITY_REQUIRED',
    scheduledMatchIds: [],
    availabilityFechaId: nextActionableFecha.id,
  }
}
