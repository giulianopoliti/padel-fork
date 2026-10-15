import { tournamentSortInputSchema, getTournamentSortColumn } from '../tournament-sort'

describe('tenant sort input', () => {
  it('preserves priority and direction, mapping semantic orders to numeric columns', () => {
    const input = { surface: 'panel', rules: [{ field: 'category', direction: 'desc' }, { field: 'status', direction: 'asc' }] }
    expect(tournamentSortInputSchema.parse(input)).toEqual(input)
    expect(getTournamentSortColumn('category')).toBe('category_sort_value')
    expect(getTournamentSortColumn('status')).toBe('status_sort_value')
  })
  it.each([
    { surface: 'panel', rules: [] },
    { surface: 'panel', rules: [{ field: 'category', direction: 'asc' }, { field: 'category', direction: 'desc' }] },
    { surface: 'my-tournaments', rules: [{ field: 'status', direction: 'asc' }] },
    { surface: 'panel', rules: [{ field: 'arbitrary_column', direction: 'asc' }] },
    { surface: 'panel', rules: [{ field: 'category', direction: 'sideways' }] },
    { surface: 'panel', organization_id: 'other-tenant', rules: [{ field: 'category', direction: 'asc' }] },
  ])('rejects invalid input %j', (input) => {
    expect(tournamentSortInputSchema.safeParse(input).success).toBe(false)
  })
})
