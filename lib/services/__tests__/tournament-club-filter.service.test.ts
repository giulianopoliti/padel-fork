jest.mock('server-only', () => ({}))
import { validateTournamentClub, scopedTournamentQuery, getActiveTournamentClubs } from '../tournament-club-filter.service'
import type { SupabaseClient } from '@supabase/supabase-js'

const club = '11111111-1111-1111-1111-111111111111'
it('rejects inactive, unauthorized and injected club IDs', () => {
  const available = [{ id: club, name: 'Club' }]
  expect(validateTournamentClub(club, available)).toBe(club)
  expect(validateTournamentClub('all', available)).toBeUndefined()
  for (const id of ['22222222-2222-2222-2222-222222222222', 'x,club_id.not.is.null']) expect(() => validateTournamentClub(id, available)).toThrow()
})
it('combines embedded club and Others conditions in one OR instead of replacing a filter', () => {
  const query = { select: jest.fn(), eq: jest.fn(), or: jest.fn() }
  for (const method of Object.values(query)) method.mockReturnValue(query)
  const db = { from: jest.fn(() => query) } as unknown as SupabaseClient
  const other = 'status.not.in.(ZONE_PHASE),status.is.null'
  scopedTournamentQuery(db, { column: 'organization_id', id: 'org' }, 'id', true, club, other)
  expect(query.select).toHaveBeenCalledWith('id,club_filter:clubes_tournament()', { count: 'exact', head: true })
  expect(query.eq).toHaveBeenCalledWith('organization_id', 'org')
  expect(query.eq).toHaveBeenCalledWith('club_filter.club_id', club)
  expect(query.or).toHaveBeenCalledTimes(1)
  expect(query.or).toHaveBeenCalledWith(`and(or(club_id.eq.${club},club_filter.not.is.null),or(${other}))`)
})
it('loads active organization clubs, deduplicates and sorts them', async () => {
  const query = { select: jest.fn(), eq: jest.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [{ clubes: { id: club, name: 'Zeta' } }, { clubes: { id: 'second', name: 'Alfa' } }, { clubes: { id: club, name: 'Zeta' } }], error: null })) }
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query)
  const db = { from: jest.fn(() => query) } as unknown as SupabaseClient
  expect((await getActiveTournamentClubs(db, { column: 'organization_id', id: 'org' })).map(({ name }) => name)).toEqual(['Alfa', 'Zeta'])
  expect(query.eq).toHaveBeenCalledWith('clubes.is_active', true)
  expect(query.eq).toHaveBeenCalledWith('organizacion_id', 'org')
})
