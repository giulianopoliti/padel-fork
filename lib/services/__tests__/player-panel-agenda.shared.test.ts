import {
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

  it('does not warn after any playable slot response, including unavailable', () => {
    expect(resolve({
      fechas: [buildFecha({ respondedPlayableSlotIds: ['slot-1'] })],
    }).state).toBe('DEFAULT')
  })

  it('does not warn when the couple selected fecha libre', () => {
    expect(resolve({
      fechas: [buildFecha({ freeDateSelected: true })],
    }).state).toBe('DEFAULT')
  })

  it('does not warn when the organizer has not published playable slots', () => {
    expect(resolve({
      fechas: [buildFecha({ playableSlotIds: [] })],
    }).state).toBe('DEFAULT')
  })

  it('ignores past, canceled and non-applicable fechas', () => {
    expect(resolve({
      fechas: [
        buildFecha({ id: 'past', startDate: '2026-09-01', endDate: '2026-09-02' }),
        buildFecha({ id: 'canceled', status: 'CANCELED' }),
        buildFecha({ id: 'other-bracket', isApplicable: false }),
      ],
    }).state).toBe('DEFAULT')
  })

  it('does not create agenda actions for eliminated or non-LONG inscriptions', () => {
    expect(resolve({ isEliminated: true }).state).toBe('DEFAULT')
    expect(resolve({ isLongTournament: false }).state).toBe('DEFAULT')
  })
})
