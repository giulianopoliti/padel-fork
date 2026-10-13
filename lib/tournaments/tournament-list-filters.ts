export const LIST_PAGE_SIZE = 12
export const TOURNAMENT_LIST_FILTERS = {
  upcoming: { label: 'Próximos', states: ['NOT_STARTED', 'ZONE_REGISTRATION'] },
  zones: { label: 'Zonas', states: ['ZONE_PHASE'] },
  brackets: { label: 'Llaves', states: ['BRACKET_PHASE'] },
  finished: { label: 'Finalizados', states: ['FINISHED', 'FINISHED_POINTS_PENDING', 'FINISHED_POINTS_CALCULATED'] },
  canceled: { label: 'Cancelados', states: ['CANCELED'] },
  other: { label: 'Otros', states: [] },
} as const

export type TournamentListFilter = keyof typeof TOURNAMENT_LIST_FILTERS
export const STANDARD_LIST_STATES = Object.values(TOURNAMENT_LIST_FILTERS).flatMap(({ states }) => [...states])
export const normalizeListFilter = (value?: string | string[]): TournamentListFilter => {
  const candidate = Array.isArray(value) ? value[0] : value
  return candidate && Object.prototype.hasOwnProperty.call(TOURNAMENT_LIST_FILTERS, candidate) ? candidate as TournamentListFilter : 'upcoming'
}
export const normalizeListPage = (value?: string | string[]): number => {
  const candidate = Array.isArray(value) ? value[0] : value
  if (!candidate || !/^\d+$/.test(candidate)) return 1
  const page = Number(candidate)
  return Number.isSafeInteger(page) && page > 0 && page <= 1000000 ? page : 1
}
export const getTournamentListHref = (filter: TournamentListFilter, page = 1, clubId?: string): string =>
  `/my-tournaments?estado=${filter}&page=${page}${clubId ? `&club=${encodeURIComponent(clubId)}` : ''}`
export const getOrganizerPanelHref = (page = 1, clubId?: string): string =>
  `/panel?page=${page}${clubId ? `&club=${encodeURIComponent(clubId)}` : ''}`
