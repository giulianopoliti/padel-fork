import { z } from 'zod'

export const TOURNAMENT_SORT_FIELDS = {
  created_at: 'Fecha de creación',
  status: 'Estado del torneo',
  category: 'Categoría',
  start_date: 'Fecha de inicio',
} as const

export type TournamentSortField = keyof typeof TOURNAMENT_SORT_FIELDS
export type TournamentSortSurface = 'panel' | 'my-tournaments'
export interface TournamentSortRule { field: TournamentSortField; direction: 'asc' | 'desc' }
export interface TournamentSortSettings {
  rules: TournamentSortRule[]
  configured: boolean
  canEdit: boolean
}

export const tournamentSortInputSchema = z.object({
  surface: z.enum(['panel', 'my-tournaments']),
  rules: z.array(z.object({
    field: z.enum(['created_at', 'status', 'category', 'start_date']),
    direction: z.enum(['asc', 'desc']),
  }).strict()).min(1).max(4),
}).strict().superRefine(({ surface, rules }, context) => {
  if (new Set(rules.map(({ field }) => field)).size !== rules.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Cada criterio debe aparecer una sola vez.' })
  }
  if (surface === 'my-tournaments' && rules.some(({ field }) => field === 'status')) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Mis Torneos ya está dividido por estado.' })
  }
})

export const getDefaultTournamentSortRules = (surface: TournamentSortSurface, tenant: string): TournamentSortRule[] =>
  surface === 'panel' && tenant === 'padel-elite'
    ? [{ field: 'status', direction: 'asc' }, { field: 'start_date', direction: 'asc' }]
    : [{ field: 'start_date', direction: 'asc' }]

export const getTournamentSortColumn = (field: TournamentSortField): string => {
  if (field === 'status') return 'status_sort_value'
  if (field === 'category') return 'category_sort_value'
  return field
}

export const describeTournamentSort = (rules: TournamentSortRule[]): string =>
  rules.map(({ field, direction }) => `${TOURNAMENT_SORT_FIELDS[field]} ${direction === 'asc' ? '↑' : '↓'}`).join(' · ')
