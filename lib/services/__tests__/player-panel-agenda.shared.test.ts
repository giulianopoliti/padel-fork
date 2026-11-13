import {
  isCurrentPlayerTimeSlot,
  resolvePlayerPanelAgenda,
  type PlayerPanelFechaCandidate,
  type PlayerPanelScheduledMatchCandidate,
} from '../player-panel-agenda.shared'

const buildFecha = (
  overrides: Partial<PlayerPanelFechaCandidate> = {},
): PlayerPanelFechaCandidate => ({
  id: 'fecha-1',
  name: 'Fecha 1',
  fechaNumber: 1,
  startDate: '2026-09-22',
  endDate: '2026-09-25',
  status: 'NOT_STARTED',
  isApplicable: true,
  playableSlotIds: ['slot-1', 'slot-2'],
  respondedPlayableSlotIds: [],
  freeDateSelected: false,
  ...overrides,
})

const buildMatch = (
  overrides: Partial<PlayerPanelScheduledMatchCandidate> = {},
): PlayerPanelScheduledMatchCandidate => ({
  id: 'match-1',
  scheduledDate: '2026-09-23',
  scheduledStartTime: '18:00:00',
  ...overrides,
})

const resolve = ({
  matches = [],
  fechas = [buildFecha()],
  isLongTournament = true,
  isEliminated = false,
}: {
  matches?: PlayerPanelScheduledMatchCandidate[]
  fechas?: PlayerPanelFechaCandidate[]
  isLongTournament?: boolean
  isEliminated?: boolean
} = {}) => resolvePlayerPanelAgenda({
  isLongTournament,
  isEliminated,
  today: '2026-09-18',
  matches,
  fechas,
})

describe('resolvePlayerPanelAgenda', () => {
  it('prioritizes a genuinely scheduled match', () => {
    expect(resolve({ matches: [buildMatch()] })).toEqual({
      state: 'MATCH_SCHEDULED',
      scheduledMatchIds: ['match-1'],
      availabilityFechaId: null,
    })
  })

  it('does not treat a pending match without date and time as scheduled', () => {
    expect(resolve({
      matches: [buildMatch({ scheduledDate: null, scheduledStartTime: null })],
    }).state).toBe('AVAILABILITY_REQUIRED')
  })

  it('asks for availability when the next fecha has playable slots and no response', () => {
    expect(resolve()).toEqual({
      state: 'AVAILABILITY_REQUIRED',
      scheduledMatchIds: [],
      availabilityFechaId: 'fecha-1',
    })
  })

  it('offers to review after any playable slot response, including unavailable', () => {
    expect(resolve({
      fechas: [buildFecha({ respondedPlayableSlotIds: ['slot-1'] })],
    })).toMatchObject({ state: 'AVAILABILITY_RECORDED', availabilityFechaId: 'fecha-1' })
  })

  it('shows the saved availability when the couple selected fecha libre', () => {
    expect(resolve({
      fechas: [buildFecha({ freeDateSelected: true })],
    }).state).toBe('AVAILABILITY_RECORDED')
  })

  it('shows the next fecha without a voting action when slots have not been published', () => {
    expect(resolve({
      fechas: [buildFecha({ playableSlotIds: [] })],
    })).toMatchObject({ state: 'AVAILABILITY_NOT_PUBLISHED', availabilityFechaId: 'fecha-1' })
  })

  it('ignores past, canceled and non-applicable fechas', () => {
    expect(resolve({
      fechas: [
        buildFecha({ id: 'past', startDate: '2026-09-01', endDate: '2026-09-02' }),
        buildFecha({ id: 'canceled', status: 'CANCELED' }),
        buildFecha({ id: 'completed', status: 'COMPLETED' }),
        buildFecha({ id: 'other-bracket', isApplicable: false }),
      ],
    }).state).toBe('DEFAULT')
  })

  it('keeps a rescheduled match visible after its original fecha ended', () => {
    expect(resolve({ matches: [buildMatch()], fechas: [buildFecha({ endDate: '2026-09-01' })] }).state).toBe('MATCH_SCHEDULED')
  })

  it('reports expired slots only when there is no other fecha with current slots', () => {
    const expired = buildFecha({ hasPublishedSlots: true, playableSlotIds: [] })
    expect(resolve({ fechas: [expired] })).toMatchObject({ state: 'NO_CURRENT_SLOTS', availabilityFechaId: 'fecha-1' })
    expect(resolve({ fechas: [expired, buildFecha({ id: 'fecha-2', fechaNumber: 2 })] }))
      .toMatchObject({ state: 'AVAILABILITY_REQUIRED', availabilityFechaId: 'fecha-2' })
  })

  it('uses Buenos Aires time to end voting at the end of each slot', () => {
    const now = new Date('2026-09-19T01:00:00Z')
    expect(isCurrentPlayerTimeSlot({ date: '2026-09-18', end_time: '22:00:00' }, now)).toBe(false)
    expect(isCurrentPlayerTimeSlot({ date: '2026-09-18', end_time: '22:30:00' }, now)).toBe(true)
    expect(isCurrentPlayerTimeSlot({ date: '2026-09-17', end_time: '23:59:00' }, now)).toBe(false)
    expect(isCurrentPlayerTimeSlot({ date: '2026-09-19', end_time: '08:00:00' }, now)).toBe(true)
  })

  it('does not create agenda actions for eliminated or non-LONG inscriptions', () => {
    expect(resolve({ isEliminated: true }).state).toBe('DEFAULT')
    expect(resolve({ isLongTournament: false }).state).toBe('DEFAULT')
  })
})
