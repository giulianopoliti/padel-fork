import type { SupabaseClient } from '@supabase/supabase-js'
import { searchOrganizerTournaments, searchSchema } from '../organizer-search'

jest.mock('server-only', () => ({}))
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/config/tenant', () => ({ getTenantCanonicalSiteUrl: () => 'https://www.padelfv.com' }))

type Row = Record<string, unknown>
const database = () => {
  const rows: Record<string, Row[]> = {
    users: [
      { id: 'organizer-a', role: 'ORGANIZADOR' }, { id: 'organizer-b', role: 'ORGANIZADOR' },
      { id: 'club-owner', role: 'CLUB' }, { id: 'admin', role: 'ADMIN' }, { id: 'player', role: 'PLAYER' },
    ],
    organization_members: [
      { id: 'member-a', user_id: 'organizer-a', organizacion_id: 'org-a', is_active: true },
      { id: 'member-b', user_id: 'organizer-b', organizacion_id: 'org-b', is_active: true },
    ],
    clubes: [{ id: 'club-a', user_id: 'club-owner' }],
    tournaments: [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `a-${i}`, organization_id: 'org-a', club_id: 'club-a', type: 'LONG',
        name: `Clausura Caballito ${i}`, category_name: '4ta', status: 'ZONE_PHASE',
        start_date: `2026-11-${String(i + 1).padStart(2, '0')}`, is_draft: i === 0,
        club: { name: 'Lasaigues Caballito' },
      })),
      { id: 'b', organization_id: 'org-b', club_id: 'club-b', type: 'LONG', name: 'Caballito ajeno',
        category_name: '5ta', status: 'FINISHED_POINTS_PENDING', start_date: '2026-11-25', club: { name: 'Otra sede' } },
      { id: 'american', organization_id: 'org-a', club_id: 'club-a', type: 'AMERICAN', name: 'Americano', start_date: '2026-11-26' },
    ],
  }
  const from = jest.fn((table: string) => {
    const predicates: Array<(row: Row) => boolean> = []
    const orders: Array<{ key: string; ascending: boolean }> = []
    let range: [number, number] | undefined
    const values = () => {
      const filtered = (rows[table] ?? []).filter(row => predicates.every(predicate => predicate(row)))
      filtered.sort((a, b) => {
        for (const { key, ascending } of orders) {
          const comparison = String(a[key] ?? '').localeCompare(String(b[key] ?? ''))
          if (comparison) return ascending ? comparison : -comparison
        }
        return 0
      })
      return range ? filtered.slice(range[0], range[1] + 1) : filtered
    }
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return query },
      in: (key: string, ids: unknown[]) => { predicates.push(row => ids.includes(row[key])); return query },
      ilike: (key: string, pattern: string) => {
        const value = pattern.replace(/^%|%$/g, '').toLowerCase()
        predicates.push(row => String(key === 'club.name' ? (row.club as Row)?.name : row[key]).toLowerCase().includes(value))
        return query
      },
      order: (key: string, options?: { ascending?: boolean }) => { orders.push({ key, ascending: options?.ascending !== false }); return query },
      range: (start: number, end: number) => { range = [start, end]; return query },
      single: async () => ({ data: values()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: values()[0] ?? null, error: null }),
      then: (resolve: (result: { data: Row[]; error: null }) => unknown) => Promise.resolve(resolve({ data: values(), error: null })),
    }
    return query
  })
  return { client: { from } as unknown as SupabaseClient, rows, from }
}

it('scopes each organizer before pagination and never includes unrelated tournaments in pages or hayMas', async () => {
  const { client } = database()
  const first = await searchOrganizerTournaments(client, searchSchema.parse({}), 'organizer-a')
  expect(first).toMatchObject({ pagina: 1, hayMas: true })
  expect(first.torneos).toHaveLength(10)
  expect(first.torneos?.every(row => row.tournamentId.startsWith('a-'))).toBe(true)
  const second = await searchOrganizerTournaments(client, searchSchema.parse({ pagina: 2 }), 'organizer-a')
  expect(second).toMatchObject({ pagina: 2, hayMas: false })
  expect(second.torneos).toHaveLength(2)
  expect(second.torneos?.some(row => row.borrador)).toBe(true)
  const other = await searchOrganizerTournaments(client, searchSchema.parse({}), 'organizer-b')
  expect(other.hayMas).toBe(false)
  expect(other.torneos?.map(row => row.tournamentId)).toEqual(['b'])
})

it('honors club ownership, name/venue/category filters and finished-points-pending status', async () => {
  const { client } = database()
  const own = await searchOrganizerTournaments(client, searchSchema.parse({ nombre: 'Clausura', sede: 'Caballito', categoria: '4TA', estado: 'active' }), 'club-owner')
  expect(own.torneos).toHaveLength(10)
  expect(own.torneos?.every(row => row.tournamentId.startsWith('a-'))).toBe(true)
  const unrelated = await searchOrganizerTournaments(client, searchSchema.parse({ nombre: 'ajeno' }), 'club-owner')
  expect(unrelated).toMatchObject({ hayMas: false, torneos: [] })
  const past = await searchOrganizerTournaments(client, searchSchema.parse({ estado: 'past' }), 'admin')
  expect(past.torneos?.map(row => row.tournamentId)).toEqual(['b'])
})

it('returns no tournaments after membership removal and denies player searches before listing anything', async () => {
  const { client, rows, from } = database()
  rows.organization_members[0].is_active = false
  expect(await searchOrganizerTournaments(client, searchSchema.parse({}), 'organizer-a')).toMatchObject({ torneos: [], hayMas: false })
  expect(from).not.toHaveBeenCalledWith('tournaments')
  from.mockClear()
  expect(await searchOrganizerTournaments(client, searchSchema.parse({}), 'player')).toHaveProperty('error')
  expect(from).not.toHaveBeenCalledWith('tournaments')
})
