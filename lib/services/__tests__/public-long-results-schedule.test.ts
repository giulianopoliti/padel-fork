import { createClientServiceRole } from '@/utils/supabase/server'
import { getPublicLongResults } from '../public-long-results.service'

jest.mock('server-only', () => ({}))
jest.mock('@/config/tenant', () => ({ getTenantBranding: () => ({ key: 'padel-fv' }) }))
jest.mock('../tenant-organization.service', () => ({
  getTenantOrganization: async () => ({ id: 'fv-organization' }),
}))
jest.mock('@/utils/supabase/server', () => ({ createClientServiceRole: jest.fn() }))
jest.mock('../long-match-lineups', () => ({ getLongMatchLineupChanges: async () => new Map() }))

const schedule = {
  fecha_id: 'fecha-3',
  scheduled_date: '2026-11-21',
  scheduled_start_time: '18:00:00',
  scheduled_end_time: '19:30:00',
  court_assignment: 'Cancha 2',
  tournament_fechas: { id: 'fecha-3', fecha_number: 3, tournament_id: 'league' },
}

const setup = ({
  fecha = { id: 'fecha-3', fecha_number: 3 } as { id: string; fecha_number: number } | null,
  hideVenue = false,
} = {}) => {
  const rows: Record<string, unknown> = {
    tournaments: { id: 'league', name: 'Liga demo', status: 'ZONE_PHASE', hide_venue: hideVenue },
    tournament_fechas: fecha,
    matches: [
      { id: 'result', status: 'FINISHED', fecha_matches: [schedule] },
      {
        id: 'other-league-link',
        status: 'FINISHED',
        fecha_matches: { ...schedule, tournament_fechas: { ...schedule.tournament_fechas, tournament_id: 'another-league' } },
      },
    ],
  }
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const from = jest.fn((table: string) => {
    const response = { data: table in rows ? rows[table] : [], error: null }
    const query = {
      maybeSingle: async () => response,
      then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve),
    }
    for (const method of ['select', 'eq', 'neq', 'in', 'not', 'order']) {
      Object.assign(query, {
        [method]: (...args: unknown[]) => {
          calls.push({ table, method, args })
          return query
        },
      })
    }
    return query
  })
  jest.mocked(createClientServiceRole).mockResolvedValue({
    from,
  } as unknown as Awaited<ReturnType<typeof createClientServiceRole>>)
  return { from, calls }
}

describe('completed public LONG schedules', () => {
  it('scopes the date to the tournament and restricts matches before reading their schedules', async () => {
    const { calls } = setup()
    const result = await getPublicLongResults('league', { activeMatchesOnly: true, fecha: { number: 3 } })

    expect(calls).toEqual(expect.arrayContaining([
      { table: 'tournaments', method: 'eq', args: ['organization_id', 'fv-organization'] },
      { table: 'tournaments', method: 'neq', args: ['is_draft', true] },
      { table: 'tournament_fechas', method: 'eq', args: ['tournament_id', 'league'] },
      { table: 'tournament_fechas', method: 'eq', args: ['fecha_number', 3] },
      { table: 'matches', method: 'eq', args: ['tournament_id', 'league'] },
      { table: 'matches', method: 'eq', args: ['bracket_is_active', true] },
      { table: 'matches', method: 'in', args: ['status', ['FINISHED', 'COMPLETED']] },
      { table: 'matches', method: 'select', args: [expect.stringContaining('fecha_matches!inner')] },
      { table: 'matches', method: 'eq', args: ['fecha_matches.fecha_id', 'fecha-3'] },
    ]))
    expect(result?.matches.map(match => match.schedule)).toEqual([
      {
        fecha: { id: 'fecha-3', number: 3 }, date: '2026-11-21',
        startTime: '18:00:00', endTime: '19:30:00', court: 'Cancha 2',
      },
      null,
    ])
  })

  it('omits the court when the tournament has a hidden venue', async () => {
    setup({ hideVenue: true })
    const result = await getPublicLongResults('league', { includeCompletedSchedule: true })
    expect(result?.matches[0].schedule).toMatchObject({ court: null, date: '2026-11-21' })
  })

  it('does not read matches if the requested date does not belong to the tournament', async () => {
    const { from } = setup({ fecha: null })
    const result = await getPublicLongResults('league', { fecha: { id: 'missing' } })
    expect(result).toMatchObject({ fecha: null, matches: [] })
    expect(from).not.toHaveBeenCalledWith('matches')
  })
})
