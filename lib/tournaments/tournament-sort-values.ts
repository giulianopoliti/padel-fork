export interface TournamentSortSource {
  category_name?: unknown
  category_config?: unknown
  status?: unknown
}

export interface TournamentSortValues {
  category_sort_value: number | null
  status_sort_value: number | null
}

const parseCategory = (value: unknown): number | null => {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^([1-9])(?:ra|da|ta|ma|va|na|ro|do|to|mo|vo|no|[ªº°])?$/i)
  return match ? Number(match[1]) : null
}

const parseSum = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 2 || value > 18) return null
  return value / 2
}

const parseLegacyCategory = (value: unknown): number | null => {
  if (typeof value !== 'string') return null
  const label = value.trim()
  const sum = label.match(/^suma\s*(\d+)$/i)
  if (sum) return parseSum(Number(sum[1]))
  const single = parseCategory(label)
  if (single !== null) return single
  const range = label.split(/\s*(?:-|–|\/|\+|\by\b)\s*/i)
  if (range.length !== 2) return null
  const values = range.map(parseCategory)
  return values.every((item) => item !== null) ? Math.min(...values as number[]) : null
}

export const calculateTournamentCategorySortValue = (source: TournamentSortSource): number | null => {
  const config = source.category_config
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    const candidate = config as Record<string, unknown>
    if (candidate.mode === 'SINGLE') return parseCategory(candidate.category)
    if (candidate.mode === 'MIXED_SUM') return parseSum(candidate.targetSum)
    if (candidate.mode === 'RANGE') {
      const first = parseCategory(candidate.categoryA)
      const second = parseCategory(candidate.categoryB)
      return first !== null && second !== null ? Math.min(first, second) : null
    }
  }
  return parseLegacyCategory(source.category_name)
}

export const calculateTournamentStatusSortValue = (status: unknown): number | null => {
  if (status === 'NOT_STARTED') return 1
  if (status === 'ZONE_PHASE') return 2
  if (status === 'BRACKET_PHASE') return 3
  return null
}

export const calculateTournamentSortValues = (source: TournamentSortSource): TournamentSortValues => ({
  category_sort_value: calculateTournamentCategorySortValue(source),
  status_sort_value: calculateTournamentStatusSortValue(source.status),
})

// Call at the write boundary: never trust derived values supplied by the browser.
// Partial category edits must include the effective category_config (or pass the current source).
export const withTournamentSortValues = <T extends object>(payload: T, current: TournamentSortSource = {}): T & Partial<TournamentSortValues> => {
  const input = payload as TournamentSortSource & Partial<TournamentSortValues>
  const { category_sort_value: _category, status_sort_value: _status, ...clean } = input
  const result: TournamentSortSource & Partial<TournamentSortValues> = { ...clean }
  if ('category_name' in input || 'category_config' in input) {
    result.category_sort_value = calculateTournamentCategorySortValue({ ...current, ...clean })
  }
  if ('status' in input) result.status_sort_value = calculateTournamentStatusSortValue(input.status)
  return result as T & Partial<TournamentSortValues>
}
