import { createMatch, getMatchSchedulingData } from '../actions'
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

describe('match scheduling server boundaries', () => {
  let queries: Query[]
  let fechaFound: boolean
  let historyFailure: boolean
  let assignedStatus: string | null
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
    assignedStatus = null
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
          fecha_matches: assignedStatus ? [{ matches: { couple1_id: 'a', couple2_id: 'c', status: assignedStatus } }] : [],
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

  it.each(['DRAFT', 'PENDING', 'IN_PROGRESS', 'FINISHED', 'COMPLETED'])('rejects a second match for a couple already assigned in this fecha (%s)', async status => {
    assignedStatus = status
    const result = await createMatch('fecha', 'a', 'b')
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('asignado') })
    expect(queries.some(query => query.insert)).toBe(false)
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
