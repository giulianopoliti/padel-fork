jest.mock('server-only', () => ({}))

import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrganizerPanelTournaments, getOrganizerPanelTournamentPage } from '../organizer-panel.service'
import { aggregatePanelMetrics, type PanelTournament } from '../organizer-panel-metrics'

const tournament = (id: string, status = 'NOT_STARTED', start_date: string | null = '2026-10-12'): PanelTournament => ({
  id, seo_slug: null, status, start_date, name: id, category_name: '7ma', gender: 'MALE', type: 'LONG', price: 1000, is_draft: false, clubes: null,
})

type Row = Record<string, unknown>
const createDatabase = (tables: Record<string, Row[]>, failedTable?: string, rowLimit = 1000) => {
  const requests: { table: string; rows: Row[]; head: boolean }[] = []
  const supabase = {
    from: (table: string) => {
      let rows = [...(tables[table] || [])]
      const orders: { key: string; ascending?: boolean; nullsFirst?: boolean }[] = []
      let limit = Infinity
      let head = false
      let clubFilter: unknown
      let from = 0
      let to = Infinity
      const query = {
        select: (_: string, options?: { head?: boolean }) => { head = options?.head || false; return query },
        eq: (key: string, value: unknown) => { if (key === 'club_filter.club_id') clubFilter = value; else rows = rows.filter((row) => row[key] === value); return query },
        or: () => { rows = rows.filter((row) => row.club_id === clubFilter || (row.club_links as unknown[] || []).includes(clubFilter)); return query },
        in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return query },
        order: (key: string, options: { ascending?: boolean; nullsFirst?: boolean }) => { orders.push({ key, ...options }); return query },
        limit: (value: number) => { limit = value; return query },
        range: (start: number, end: number) => { from = start; to = end; return query },
        then: (resolve: (value: unknown) => unknown) => {
          rows.sort((a, b) => {
            for (const order of orders) {
              const av = a[order.key], bv = b[order.key]
              if (av === bv) continue
              if (av == null) return order.nullsFirst ? -1 : 1
              if (bv == null) return order.nullsFirst ? 1 : -1
              const compared = String(av).localeCompare(String(bv))
              if (compared) return order.ascending === false ? -compared : compared
            }
            return 0
          })
          const selected = head ? [] : rows.slice(from, Math.min(to + 1, from + rowLimit, limit))
          requests.push({ table, rows: selected, head })
          return Promise.resolve(resolve({ data: selected, count: rows.length, error: table === failedTable ? new Error('Database unavailable') : null }))
        },
      }
      return query
    },
  } as unknown as SupabaseClient
  return { supabase, requests }
}

const storedTournament = (row: PanelTournament, organization_id = 'org', es_prueba = false): Row => ({ ...row, organization_id, es_prueba })

describe('organizer panel selection', () => {
  it.each(['padel-fv', 'padel-elite'] as const)('lets category outrank status for %s and reverses states on descending order', async (tenant) => {
    const db = createDatabase({ tournaments: [
      { ...storedTournament(tournament('first-upcoming')), category_sort_value: 1, status_sort_value: 1 },
      { ...storedTournament(tournament('first-bracket', 'BRACKET_PHASE')), category_sort_value: 1, status_sort_value: 3 },
      { ...storedTournament(tournament('ninth-zone', 'ZONE_PHASE')), category_sort_value: 9, status_sort_value: 2 },
      { ...storedTournament(tournament('unknown')), category_sort_value: null, status_sort_value: 1 },
    ] })
    const result = await getOrganizerPanelTournamentPage(db.supabase, 'org', tenant, 1, undefined, [
      { field: 'category', direction: 'asc' }, { field: 'status', direction: 'desc' },
    ])
    expect(result.tournaments.map(({ id }) => id)).toEqual(['first-bracket', 'first-upcoming', 'ninth-zone', 'unknown'])
    expect(db.requests.filter(({ table }) => table === 'tournaments')).toHaveLength(1)
  })
  it('FV filters before limiting, orders dates ascending/nulls last and scopes to the organization', async () => {
    const eligible = Array.from({ length: 10 }, (_, i) => storedTournament(tournament(`t${i}`, i % 2 ? 'BRACKET_PHASE' : 'ZONE_PHASE', `2026-10-${String(i + 10).padStart(2, '0')}`)))
    const database = createDatabase({ tournaments: [
      storedTournament(tournament('finished', 'FINISHED', '2020-01-01')),
      storedTournament(tournament('other-org'), 'another'),
      storedTournament(tournament('test'), 'org', true),
      storedTournament(tournament('no-date', 'NOT_STARTED', null)),
      ...eligible.reverse(),
    ] })
    const result = await getOrganizerPanelTournaments(database.supabase, 'org', 'padel-fv')
    expect(result.map(({ id }) => id)).toEqual(['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'])
    expect(database.requests.map(({ table }) => table)).toEqual(['tournaments', 'inscriptions', 'matches'])
  })

  it('TPE prioritizes NOT_STARTED even when a zone tournament has an earlier date', async () => {
    const database = createDatabase({ tournaments: [
      storedTournament(tournament('zone', 'ZONE_PHASE', '2026-01-01')),
      storedTournament(tournament('bracket', 'BRACKET_PHASE', '2026-02-01')),
      storedTournament(tournament('upcoming-late', 'NOT_STARTED', '2026-12-01')),
      storedTournament(tournament('upcoming', 'NOT_STARTED', '2026-11-01')),
      storedTournament(tournament('cancelled', 'CANCELED', '2025-01-01')),
    ] })
    const result = await getOrganizerPanelTournaments(database.supabase, 'org', 'padel-elite')
    expect(result.map(({ id }) => id)).toEqual(['upcoming', 'upcoming-late', 'zone', 'bracket'])
  })

  it('only counts the secondary TPE group when 8 upcoming tournaments fill the page', async () => {
    const database = createDatabase({ tournaments: Array.from({ length: 10 }, (_, i) => storedTournament(tournament(`t${i}`))) })
    expect(await getOrganizerPanelTournaments(database.supabase, 'org', 'padel-elite')).toHaveLength(8)
    expect(database.requests.filter(({ table }) => table === 'tournaments')).toHaveLength(2)
    expect(database.requests.filter(({ table }) => table === 'tournaments')[1].head).toBe(true)
  })

  it('skips metrics when there are no eligible tournaments', async () => {
    const database = createDatabase({ tournaments: [] })
    expect(await getOrganizerPanelTournaments(database.supabase, 'org', 'padel-fv')).toEqual([])
    expect(database.requests).toHaveLength(1)
  })

  it('propagates metric failures instead of displaying zero counts', async () => {
    const database = createDatabase({ tournaments: [storedTournament(tournament('t'))] }, 'matches')
    await expect(getOrganizerPanelTournaments(database.supabase, 'org', 'padel-fv')).rejects.toThrow('Database unavailable')
  })

  it('reads all metric pages even when the API row cap is smaller than the requested page', async () => {
    const database = createDatabase({
      tournaments: [storedTournament(tournament('t'))],
      matches: Array.from({ length: 1005 }, (_, i) => ({ id: String(i).padStart(5, '0'), tournament_id: 't', status: 'FINISHED', couple1_id: 'a', couple2_id: 'b', es_prueba: false })),
    }, undefined, 400)
    const result = await getOrganizerPanelTournaments(database.supabase, 'org', 'padel-fv')
    expect(result[0].matchesFinished).toBe(1005)
    expect(database.requests.filter(({ table }) => table === 'matches')).toHaveLength(3)
  })
})

describe('panel metrics', () => {
  it('counts unique confirmed players/couples, separates requests and excludes BYEs', () => {
    const result = aggregatePanelMetrics([tournament('t')], [
      { tournament_id: 't', player_id: 'p1', couple_id: 'a', is_pending: false, couples: { player1_id: 'p1', player2_id: 'p2' } },
      { tournament_id: 't', player_id: 'p2', couple_id: 'a', is_pending: false, couples: { player1_id: 'p1', player2_id: 'p2' } },
      { tournament_id: 't', player_id: 'p3', couple_id: null, is_pending: false, couples: null },
      { tournament_id: 't', player_id: 'p4', couple_id: 'b', is_pending: true, couples: { player1_id: 'p4', player2_id: 'p5' } },
    ], [
      { tournament_id: 't', status: 'FINISHED', couple1_id: 'a', couple2_id: 'b' },
      { tournament_id: 't', status: 'FINISHED', couple1_id: 'a', couple2_id: null },
      { tournament_id: 't', status: 'BYE', couple1_id: null, couple2_id: 'a' },
      { tournament_id: 't', status: 'PENDING', couple1_id: null, couple2_id: null },
      { tournament_id: 't', status: 'IN_PROGRESS', couple1_id: 'a', couple2_id: 'b' },
      { tournament_id: 'other', status: 'FINISHED', couple1_id: 'a', couple2_id: 'b' },
    ])
    expect(result[0]).toMatchObject({ players: 3, couples: 1, pendingInscriptions: 1, matchesFinished: 1, matchesPending: 2, totalMatches: 3 })
  })
})

const selectedClub = '11111111-1111-1111-1111-111111111111'
it('paginates across the TPE priority boundary without duplicates or missing tournaments', async () => {
  const rows = [
    ...Array.from({ length: 11 }, (_, i) => storedTournament(tournament(`u${String(i).padStart(2, '0')}`))),
    ...Array.from({ length: 13 }, (_, i) => storedTournament(tournament(`a${String(i).padStart(2, '0')}`, i % 2 ? 'BRACKET_PHASE' : 'ZONE_PHASE', '2025-01-01'))),
  ]
  const db = createDatabase({ tournaments: rows })
  const pages = await Promise.all([1, 2, 3].map((page) => getOrganizerPanelTournamentPage(db.supabase, 'org', 'padel-elite', page)))
  expect(pages.every((page) => page.total === 24 && page.pages === 3 && page.tournaments.length === 8)).toBe(true)
  expect(pages[1].tournaments.map(({ id }) => id)).toEqual(['u08', 'u09', 'u10', 'a00', 'a01', 'a02', 'a03', 'a04'])
  expect(new Set(pages.flatMap((page) => page.tournaments.map(({ id }) => id))).size).toBe(24)
})
it('filters panel tournaments by primary or additional club before pagination', async () => {
  const rows = [
    ...Array.from({ length: 10 }, (_, i) => ({ ...storedTournament(tournament(`t${i}`, 'ZONE_PHASE')), club_id: i % 2 ? 'another' : selectedClub, club_links: i % 2 ? [selectedClub, selectedClub] : [] })),
    { ...storedTournament(tournament('finished', 'FINISHED')), club_id: selectedClub },
    { ...storedTournament(tournament('foreign'), 'another-org'), club_id: selectedClub },
    { ...storedTournament(tournament('other')), club_id: 'another' },
  ]
  const db = createDatabase({ tournaments: rows })
  const result = await getOrganizerPanelTournamentPage(db.supabase, 'org', 'padel-fv', 2, selectedClub)
  expect(result.total).toBe(10)
  expect(result.tournaments.map(({ id }) => id)).toEqual(['t8', 't9'])
  const invalid = await getOrganizerPanelTournamentPage(db.supabase, 'org', 'padel-fv', 9, selectedClub)
  expect(invalid.redirectPage).toBe(2)
})
