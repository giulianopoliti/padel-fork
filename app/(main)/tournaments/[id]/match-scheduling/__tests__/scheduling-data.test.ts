import { createMatch, getBracketMatchFechaOptions, getMatchSchedulingData, modifyMatchSchedule } from '../actions'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/services/ranking', () => ({ updateZonePositionsForTournament: jest.fn() }))
jest.mock('@/lib/services/incremental-placeholder-updater', () => ({ IncrementalPlaceholderUpdater: {} }))
jest.mock('@/lib/services/messages', () => ({ sendTournamentMessage: jest.fn() }))

interface Query {
  table: string
  columns: string
  filters: [string, unknown][]
  insert?: Record<string, unknown>
  offset?: number
}

describe('bracket scheduling with more than one fecha', () => {
  const schedule = { matchId: 'match', date: '2099-11-06', startTime: '09:00', endTime: '10:30', court: null }
  const first = { id: 'first', name: 'Primera jornada', fecha_number: 1, start_date: '2099-11-06', end_date: '2099-11-06',
    tournament_id: 'tournament', round_type: '8VOS', bracket_key: 'GOLD' }
  const second = { ...first, id: 'second', name: 'Segunda jornada', fecha_number: 2, start_date: '2099-11-08', end_date: '2099-11-08' }
  const otherRound = { ...first, id: 'quarterfinal', round_type: '4TOS' }
  const otherCup = { ...first, id: 'silver', bracket_key: 'SILVER' }
  const otherTournament = { ...first, id: 'foreign', tournament_id: 'foreign-tournament' }
  let fechas: (typeof first)[]
  let linked: string | null
  const upsert = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    linked = null
    fechas = [first, second, otherRound, otherCup, otherTournament]
    upsert.mockResolvedValue({ error: null })
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true })
    const from = (table: string) => {
      const filters: [string, unknown][] = []
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => { filters.push([column, value]); return builder },
        order: () => builder,
        single: async () => ({ data: { tournament_id: 'tournament', type: 'ELIMINATION', round: '8VOS', bracket_key: 'GOLD', club_id: null }, error: null }),
        maybeSingle: async () => ({ data: linked ? { fecha_id: linked } : null, error: null }),
        then: (resolve: (value: unknown) => void) => {
          resolve({ data: fechas.filter(fecha => filters.every(([key, value]) => fecha[key as keyof typeof fecha] === value)), error: null })
        },
        upsert,
      }
      if (!['matches', 'fecha_matches', 'tournament_fechas'].includes(table)) throw new Error(`Unexpected table: ${table}`)
      return builder
    }
    jest.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'organizer' } } }) }, from,
    } as unknown as Awaited<ReturnType<typeof createClient>>)
  })

  it('loads only fechas matching the tournament, round and cup', async () => {
    linked = second.id
    const result = await getBracketMatchFechaOptions('match')
    expect(result.data?.fechas.map(fecha => fecha.id)).toEqual([first.id, second.id])
    expect(result.data?.currentFechaId).toBe(second.id)
  })

  it('automatically assigns the only compatible fecha', async () => {
    fechas = fechas.filter(fecha => fecha.id !== second.id)
    expect((await modifyMatchSchedule(schedule)).success).toBe(true)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ match_id: 'match', fecha_id: first.id }), expect.anything())
  })

  it('asks the user to choose when multiple compatible fechas exist', async () => {
    expect((await modifyMatchSchedule(schedule)).error).toMatch(/Elegí en la llave/)
    expect(upsert).not.toHaveBeenCalled()
    expect((await modifyMatchSchedule({ ...schedule, fechaId: second.id, date: second.start_date })).success).toBe(true)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ fecha_id: second.id }), expect.objectContaining({ onConflict: 'match_id' }))
  })

  it('preserves a compatible existing fecha and clears the old slot when switching fechas', async () => {
    linked = first.id
    expect((await modifyMatchSchedule(schedule)).success).toBe(true)
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('scheduled_time_slot_id')
    expect((await modifyMatchSchedule({ ...schedule, fechaId: second.id, date: second.start_date })).success).toBe(true)
    expect(upsert.mock.calls[1][0]).toMatchObject({ fecha_id: second.id, scheduled_time_slot_id: null })
  })

  it.each([otherRound.id, otherCup.id, otherTournament.id])('rejects the incompatible fecha %s even as an existing link', async fechaId => {
    linked = fechaId
    expect((await modifyMatchSchedule(schedule)).error).toMatch(/mismo torneo, ronda y copa/)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('rejects a move to a different fecha if the match day is outside its period', async () => {
    linked = first.id
    expect((await modifyMatchSchedule({ ...schedule, fechaId: second.id })).error).toMatch(/dentro del período/)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('match scheduling server boundaries', () => {
  let queries: Query[]
  let fechaFound: boolean
  let historyFailure: boolean
  let assignedStatuses: string[]
  let draftMode: boolean
  let registered: string[]
  let opponentReserved: boolean
  let paginatedHistory: boolean
  const player = { first_name: 'Ana', last_name: 'Pérez', phone: '+5491123456789' }

  beforeEach(() => {
    jest.clearAllMocks()
    queries = []
    fechaFound = true
    historyFailure = false
    assignedStatuses = []
    draftMode = false
    registered = ['a', 'b']
    opponentReserved = false
    paginatedHistory = false
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true })

    const from = jest.fn((table: string) => {
      const query: Query = { table, columns: '', filters: [] }
      queries.push(query)
      const resolve = (): { data: unknown; error: { message: string } | null } => {
        if (table === 'matches' && historyFailure) return { data: null, error: { message: 'History unavailable' } }
        if (query.insert) return { data: table === 'matches' ? { id: 'new-match' } : null, error: null }
        if (table === 'matches' && query.offset !== undefined && paginatedHistory) {
          const length = query.offset === 0 ? 500 : 1
          return { data: Array.from({ length }, (_, index) => ({
            id: `history-${query.offset! + index}`, couple1_id: 'a', couple2_id: `rival-${query.offset! + index}`,
            status: 'FINISHED', round: 'ZONE', bracket_is_active: true,
          })), error: null }
        }
        const rows: Record<string, unknown> = {
          tournament_fechas: fechaFound ? { id: 'fecha', tournament_id: 'tournament', round_type: 'ZONE', estimated_match_duration_minutes: 60 } : null,
          couples: [{ id: 'a', player1: player, player2: [player], zone_positions: [] }, { id: 'b', player1: player, player2: player, zone_positions: [] }],
          tournament_time_slots: [],
          couple_time_availability: [],
          fecha_matches: assignedStatuses.map((status, index) => ({
            matches: { id: `assigned-${index}`, round: 'ZONE', couple1_id: 'a', couple2_id: `rival-${index}`, status },
          })),
          inscriptions: registered.map(couple_id => ({ couple_id })),
          tournaments: { id: 'tournament', type: 'LONG', enable_draft_matches: draftMode },
          zones: { id: 'zone' },
          matches: query.offset === undefined ? (opponentReserved ? [{ id: 'reserved', status: 'DRAFT' }] : []) : [
            { id: 'old-1', couple1_id: 'a', couple2_id: 'c', status: 'FINISHED', round: 'ZONE', bracket_is_active: true },
            { id: 'old-2', couple1_id: 'b', couple2_id: 'c', status: 'DRAFT', round: 'ZONE', bracket_is_active: true },
          ],
        }
        return { data: rows[table] ?? null, error: null }
      }
      const builder: Record<string, jest.Mock> = {}
      builder.select = jest.fn((columns: string) => { query.columns = columns; return builder })
      builder.eq = jest.fn((column: string, value: unknown) => { query.filters.push([column, value]); return builder })
      builder.in = jest.fn((column: string, value: unknown) => { query.filters.push([column, value]); return builder })
      builder.insert = jest.fn((value: Record<string, unknown>) => { query.insert = value; return builder })
      builder.range = jest.fn((offset: number) => { query.offset = offset; return builder })
      for (const method of ['order', 'neq', 'or']) builder[method] = jest.fn(() => builder)
      builder.single = jest.fn(async () => resolve())
      builder.then = jest.fn((onResolve: (value: ReturnType<typeof resolve>) => unknown) => Promise.resolve(resolve()).then(onResolve))
      return builder
    })
    jest.mocked(createClient).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'organizer' } } }) }, from,
      rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
    } as unknown as Awaited<ReturnType<typeof createClient>>)
  })

  it('returns every registered couple with contacts, zone totals and zero time columns', async () => {
    const result = await getMatchSchedulingData('tournament', 'fecha')
    expect(result.success).toBe(true)
    expect(result.data?.timeSlots).toEqual([])
    expect(result.data?.couples).toHaveLength(2)
    expect(result.data?.couples[0]).toMatchObject({
      zone_position: null, player1: { phone: player.phone }, player2: { phone: player.phone },
      zone_match_counts: { played: 1, draft: 0, pending: 0 }, opponent_statuses: { c: 'played' },
    })
    expect(result.data?.couples[1].zone_match_counts).toEqual({ played: 0, draft: 1, pending: 0 })
    expect(queries.find(query => query.table === 'tournament_fechas')?.filters).toContainEqual(['tournament_id', 'tournament'])
    expect(queries.find(query => query.table === 'matches')?.filters).toEqual(expect.arrayContaining([
      ['tournament_id', 'tournament'], ['round', 'ZONE'], ['bracket_is_active', true],
    ]))
  })

  it('does not load player contacts without management permission', async () => {
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: false })
    expect((await getMatchSchedulingData('tournament', 'fecha')).success).toBe(false)
    expect(queries).toHaveLength(0)
  })

  it('loads history beyond the first page so old rivals and totals are not truncated', async () => {
    paginatedHistory = true
    const result = await getMatchSchedulingData('tournament', 'fecha')
    expect(result.data?.couples[0].zone_match_counts?.played).toBe(501)
    expect(result.data?.couples[0].opponent_statuses?.['rival-500']).toBe('played')
    expect(queries.filter(query => query.table === 'matches').map(query => query.offset)).toEqual([0, 500])
  })

  it('does not return contacts or scheduling data for a fecha outside the tournament', async () => {
    fechaFound = false
    expect((await getMatchSchedulingData('tournament', 'other-fecha')).success).toBe(false)
    expect(queries.some(query => query.table === 'couples')).toBe(false)
  })

  it.each([false, true])('creates an unscheduled match with the correct pending/draft status (draft=%s)', async enableDraft => {
    draftMode = enableDraft
    const result = await createMatch('fecha', 'a', 'b')
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ status: enableDraft ? 'DRAFT' : 'PENDING', scheduledDate: null, scheduledStartTime: null, timeSlotId: null })
    expect(queries.find(query => query.table === 'fecha_matches' && query.insert)?.insert).toMatchObject({
      fecha_id: 'fecha', scheduled_time_slot_id: null, scheduled_date: null, scheduled_start_time: null, scheduled_end_time: null,
    })
  })

  it.each([
    ['DRAFT', 'DRAFT'],
    ['PENDING', 'PENDING'],
    ['IN_PROGRESS', 'PENDING'],
    ['FINISHED', 'FINISHED'],
    ['COMPLETED', 'FINISHED'],
  ])('reports a %s assignment and allows a second match against a different couple', async (status, expectedStatus) => {
    assignedStatuses = [status]
    const schedule = await getMatchSchedulingData('tournament', 'fecha')
    expect(schedule.data?.couples[0]).toMatchObject({ has_played_in_this_date: true, match_status: expectedStatus })
    expect(schedule.data?.couples[1]).toMatchObject({ has_played_in_this_date: false, match_status: null })
    expect((await createMatch('fecha', 'a', 'b')).success).toBe(true)
    expect(queries.find(query => query.table === 'fecha_matches' && query.insert)?.insert).toMatchObject({
      match_id: 'new-match', fecha_id: 'fecha',
    })
  })

  it('keeps a finished match visible when the same couple also has pending and draft matches', async () => {
    assignedStatuses = ['COMPLETED', 'PENDING', 'DRAFT']
    const result = await getMatchSchedulingData('tournament', 'fecha')
    expect(result.data?.couples[0]).toMatchObject({ match_status: 'FINISHED', matches_in_fecha: 1 })
  })

  it('rejects a rematch already reserved in another fecha', async () => {
    opponentReserved = true
    expect(await createMatch('fecha', 'a', 'b')).toMatchObject({ success: false, error: expect.stringContaining('reservado') })
    expect(queries.some(query => query.insert)).toBe(false)
  })

  it('does not create a match when opponent history could not be verified', async () => {
    historyFailure = true
    expect((await createMatch('fecha', 'a', 'b')).success).toBe(false)
    expect(queries.some(query => query.insert)).toBe(false)
  })

  it('rejects a couple registered in another tournament', async () => {
    registered = ['a']
    expect((await createMatch('fecha', 'a', 'b')).success).toBe(false)
    expect(queries.some(query => query.insert)).toBe(false)
  })
})
