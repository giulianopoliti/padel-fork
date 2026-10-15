import { calculateTournamentCategorySortValue, calculateTournamentStatusSortValue, withTournamentSortValues } from '../tournament-sort-values'

describe('TypeScript category ordering', () => {
  it.each([[12, 6], [13, 6.5], [14, 7], [15, 7.5], [18, 9]])('maps SUMA%s to %s', (sum, value) => {
    expect(calculateTournamentCategorySortValue({ category_config: { mode: 'MIXED_SUM', targetSum: sum } })).toBe(value)
  })
  it.each([['SUMA14', 7], ['suma 13', 6.5], ['6ta-7ma', 6], ['7ma / 6ta', 6], ['1ra', 1], ['9na', 9], ['8ª', 8]])('supports legacy label %s', (label, value) => {
    expect(calculateTournamentCategorySortValue({ category_name: label })).toBe(value)
  })
  it('prefers the structured category and uses the smaller range in either order', () => {
    expect(calculateTournamentCategorySortValue({ category_name: '9na', category_config: { mode: 'SINGLE', category: '3ra' } })).toBe(3)
    expect(calculateTournamentCategorySortValue({ category_config: { mode: 'RANGE', categoryA: '7ma', categoryB: '6ta' } })).toBe(6)
  })
  it.each(['SUMA0', 'SUMA19', 'SUMA13.5', '10ma', 'libre', 'torneo 7', '6ta-inválida'])('leaves unknown/invalid %s unranked', (label) => {
    expect(calculateTournamentCategorySortValue({ category_name: label })).toBeNull()
  })
  it('does not disguise malformed structured categories as legacy labels', () => {
    expect(calculateTournamentCategorySortValue({ category_name: '7ma', category_config: { mode: 'RANGE', categoryA: '6ta', categoryB: 'invalid' } })).toBeNull()
    expect(calculateTournamentCategorySortValue({ category_config: { mode: 'MIXED_SUM', targetSum: 13.5 } })).toBeNull()
  })
})

describe('derived tournament writes', () => {
  it('computes values atomically and replaces browser-supplied values', () => {
    expect(withTournamentSortValues({ category_name: 'SUMA13', status: 'BRACKET_PHASE', category_sort_value: 9, status_sort_value: 1 })).toMatchObject({ category_sort_value: 6.5, status_sort_value: 3 })
  })
  it('preserves unrelated data and does not wipe category on status-only updates', () => {
    expect(withTournamentSortValues({ name: 'Example' })).toEqual({ name: 'Example' })
    expect(withTournamentSortValues({ status: 'ZONE_PHASE' })).toEqual({ status: 'ZONE_PHASE', status_sort_value: 2 })
  })
  it('can compute partial category edits with the existing structured source', () => {
    expect(withTournamentSortValues({ category_name: '7ma' }, { category_config: { mode: 'MIXED_SUM', targetSum: 13 } })).toMatchObject({ category_sort_value: 6.5 })
  })
  it.each([['NOT_STARTED', 1], ['ZONE_PHASE', 2], ['BRACKET_PHASE', 3], ['CANCELED', null]])('maps state %s', (status, value) => {
    expect(calculateTournamentStatusSortValue(status)).toBe(value)
  })
})
