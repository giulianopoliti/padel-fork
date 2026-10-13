jest.mock('server-only', () => ({}))
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { getTournamentListingContext, getTournamentListCounts, getTournamentListPage } from '../tournament-list.service'
import { normalizeListFilter, normalizeListPage, getTournamentListHref, getOrganizerPanelHref } from '@/lib/tournaments/tournament-list-filters'

type Row = Record<string, unknown>
const database = (tables: Record<string, Row[]>, failedTable?: string, userId: string | null = 'user') => {
  const requests: { table: string; head: boolean; ids: unknown[] }[] = []
  const supabase = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
    from: (table: string) => {
      let rows = [...(tables[table] || [])]
      let head = false, start = 0, end = Infinity
      let clubFilter: unknown
      const orders: { key: string; ascending: boolean; nullsFirst?: boolean }[] = []
      const query = {
        select: (_: string, options?: { head?: boolean }) => { head = options?.head || false; return query },
        eq: (key: string, value: unknown) => { if (key === 'club_filter.club_id') clubFilter = value; else rows = rows.filter((row) => row[key] === value); return query },
        in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return query },
        or: (expression: string) => {
          if (expression.includes('club_filter')) rows = rows.filter((row) => row.club_id === clubFilter || (row.club_links as unknown[] || []).includes(clubFilter))
          if (expression.includes('status.not.in')) {
            const excluded = expression.match(/status\.not\.in\.\((.*?)\)/)![1].split(',')
            rows = rows.filter((row) => row.status == null || !excluded.includes(String(row.status)))
          }
          return query
        },
        order: (key: string, options: { ascending: boolean; nullsFirst?: boolean }) => { orders.push({ key, ...options }); return query },
        range: (from: number, to: number) => { start = from; end = to; return query },
        single: async () => ({ data: rows.length === 1 ? rows[0] : null, error: rows.length === 1 ? null : new Error('Membership missing') }),
        then: (resolve: (value: unknown) => unknown) => {
          rows.sort((a, b) => {
            for (const { key, ascending, nullsFirst } of orders) {
              if (a[key] === b[key]) continue
              if (a[key] == null) return nullsFirst ? -1 : 1
              if (b[key] == null) return nullsFirst ? 1 : -1
              const compared = String(a[key]).localeCompare(String(b[key]))
              if (compared) return ascending ? compared : -compared
            }
            return 0
          })
          const selected = head ? [] : rows.slice(start, Math.min(end + 1, start + 1000))
          requests.push({ table, head, ids: selected.map(({ id }) => id) })
          return Promise.resolve(resolve({ data: head ? null : selected, count: rows.length, error: table === failedTable ? new Error('Unavailable') : null }))
        },
      }
      return query
    },
  } as unknown as SupabaseClient
  return { supabase, requests }
}
const stored = (id: string, status = 'NOT_STARTED', organization_id = 'org', club_id = 'club'): Row => ({
  id, seo_slug: `torneo-${id}`, is_draft: false, name: id, status, organization_id, club_id, es_prueba: false, created_at: '2026-10-12',
})
const scope = { column: 'organization_id', id: 'org' } as const

describe('paged tournament backend', () => {
  it('loads only the selected state/page and metrics of its 12 IDs, retaining SEO links', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => stored(String(i).padStart(2, '0')))
    const db = database({ tournaments: [...rows, stored('zone', 'ZONE_PHASE'), stored('foreign', 'NOT_STARTED', 'other'), { ...stored('test'), es_prueba: true }],
      inscriptions: rows.map((row) => ({ id: row.id, tournament_id: row.id, is_pending: true, es_prueba: false })),
      matches: rows.map((row) => ({ id: row.id, tournament_id: row.id, status: 'FINISHED', couple1_id: 'a', couple2_id: null, es_prueba: false })),
    })
    const result = await getTournamentListPage(db.supabase, scope, 'upcoming', 2)
    expect(result.total).toBe(30)
    expect(result.pages).toBe(3)
    expect(result.tournaments.map(({ id }) => id)).toEqual(['12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'])
    expect(result.tournaments[0]).toMatchObject({ seo_slug: 'torneo-12', inscriptions: 1, totalMatches: 1, matchesFinished: 1 })
    expect(db.requests).toHaveLength(3)
    expect(db.requests[1].ids).toHaveLength(12)
    expect(db.requests[2].ids).toHaveLength(12)
  })
  it('corrects out of range pages without fetching metrics', async () => {
    const db = database({ tournaments: [stored('a')] })
    const result = await getTournamentListPage(db.supabase, scope, 'upcoming', 9)
    expect(result.redirectPage).toBe(1)
    expect(db.requests).toHaveLength(1)
  })
  it('returns an empty state without metric requests', async () => {
    const db = database({ tournaments: [stored('a')] })
    expect((await getTournamentListPage(db.supabase, scope, 'canceled', 1)).total).toBe(0)
    expect(db.requests).toHaveLength(1)
  })
  it('gets accurate counts above 999 using only head requests and preserves active definition', async () => {
    const db = database({ tournaments: [...Array.from({ length: 1200 }, (_, i) => stored(String(i))), stored('zones', 'ZONE_PHASE'), stored('brackets', 'BRACKET_PHASE'), stored('other', 'PAIRING'), stored('foreign', 'FINISHED', 'other')] })
    const result = await getTournamentListCounts(db.supabase, scope)
    expect(result).toMatchObject({ total: 1203, active: 2, counts: { upcoming: 1200, zones: 1, brackets: 1, other: 1 } })
    expect(db.requests).toHaveLength(6)
    expect(db.requests.every(({ head, ids }) => head && ids.length === 0)).toBe(true)
  })
  it('preserves club scope and exposes previously hidden states through Others', async () => {
    const db = database({ tournaments: [stored('a', 'PAIRING'), stored('b', 'IN_PROGRESS'), stored('c', 'ZONE_PHASE'), stored('foreign', 'PAIRING', 'org', 'foreign')] })
    const result = await getTournamentListPage(db.supabase, { column: 'club_id', id: 'club' }, 'other', 1)
    expect(result.tournaments.map(({ id }) => id)).toEqual(['a', 'b'])
  })
  it('does not disguise failed counts or metrics as zero', async () => {
    const db = database({ tournaments: [stored('a')] }, 'matches')
    await expect(getTournamentListPage(db.supabase, scope, 'upcoming', 1)).rejects.toThrow('Unavailable')
    const countDb = database({ tournaments: [] }, 'tournaments')
    await expect(getTournamentListCounts(countDb.supabase, scope)).rejects.toThrow('Unavailable')
  })
})

describe('authenticated listing context', () => {
  it('derives organizer scope from an active membership', async () => {
    const db = database({ users: [{ id: 'user', role: 'ORGANIZADOR' }], organization_members: [{ user_id: 'user', is_active: true, organizacion_id: 'org' }] })
    jest.mocked(createClient).mockResolvedValue(db.supabase)
    expect((await getTournamentListingContext()).scope).toEqual(scope)
  })
  it('rejects inactive memberships and unrelated roles', async () => {
    const db = database({ users: [{ id: 'user', role: 'ORGANIZADOR' }], organization_members: [{ user_id: 'user', is_active: false, organizacion_id: 'org' }] })
    jest.mocked(createClient).mockResolvedValue(db.supabase)
    await expect(getTournamentListingContext()).rejects.toThrow('organización activa')
    jest.mocked(createClient).mockResolvedValue(database({ users: [{ id: 'user', role: 'PLAYER' }] }).supabase)
    await expect(getTournamentListingContext()).rejects.toThrow('Tu rol')
  })
  it('derives club scope from ownership and rejects unauthenticated requests', async () => {
    jest.mocked(createClient).mockResolvedValue(database({ users: [{ id: 'user', role: 'CLUB' }], clubes: [{ id: 'club', user_id: 'user' }] }).supabase)
    expect((await getTournamentListingContext()).scope).toEqual({ column: 'club_id', id: 'club' })
    jest.mocked(createClient).mockResolvedValue(database({}, undefined, null).supabase)
    await expect(getTournamentListingContext()).rejects.toMatchObject({ needsLogin: true })
  })
})

it('validates untrusted URL parameters', () => {
  expect(normalizeListFilter('__proto__')).toBe('upcoming')
  expect(normalizeListFilter(['finished', 'zones'])).toBe('finished')
  for (const value of ['0', '-1', '1.5', 'Infinity', '1000001', 'abc']) expect(normalizeListPage(value)).toBe(1)
  expect(normalizeListPage('2')).toBe(2)
})

it('combines club and state, including secondary sites, and scopes counts to that club', async () => {
  const club = '11111111-1111-1111-1111-111111111111'
  const db = database({ tournaments: [
    stored('primary', 'ZONE_PHASE', 'org', club),
    { ...stored('secondary', 'ZONE_PHASE'), club_links: [club, club] },
    stored('other-site', 'ZONE_PHASE'),
    stored('finished', 'FINISHED', 'org', club),
    stored('pairing', 'PAIRING', 'org', club),
    stored('foreign', 'ZONE_PHASE', 'other', club),
  ] })
  const zones = await getTournamentListPage(db.supabase, scope, 'zones', 1, club)
  expect(zones.tournaments.map(({ id }) => id)).toEqual(['primary', 'secondary'])
  const others = await getTournamentListPage(db.supabase, scope, 'other', 1, club)
  expect(others.tournaments.map(({ id }) => id)).toEqual(['pairing'])
  expect(await getTournamentListCounts(db.supabase, scope, club)).toMatchObject({ total: 4, active: 2, counts: { zones: 2, finished: 1, other: 1 } })
  expect(getTournamentListHref('zones', 2, club)).toContain(`estado=zones&page=2&club=${club}`)
  expect(getOrganizerPanelHref(2, club)).toBe(`/panel?page=2&club=${club}`)
})

it.each(['upcoming', 'zones', 'brackets', 'finished', 'canceled', 'other'] as const)('orders %s by start date ascending, nulls last, with stable ties', async (filter) => {
  const states = { upcoming: 'NOT_STARTED', zones: 'ZONE_PHASE', brackets: 'BRACKET_PHASE', finished: 'FINISHED', canceled: 'CANCELED', other: 'PAIRING' }
  const db = database({ tournaments: [
    { ...stored('no-date', states[filter]), start_date: null, created_at: '2000-01-01' },
    { ...stored('later', states[filter]), start_date: '2026-12-01', created_at: '2001-01-01' },
    { ...stored('b', states[filter]), start_date: '2026-10-01', created_at: '2030-01-01' },
    { ...stored('a', states[filter]), start_date: '2026-10-01', created_at: '2020-01-01' },
  ] })
  expect((await getTournamentListPage(db.supabase, scope, filter, 1)).tournaments.map(({ id }) => id)).toEqual(['a', 'b', 'later', 'no-date'])
})
