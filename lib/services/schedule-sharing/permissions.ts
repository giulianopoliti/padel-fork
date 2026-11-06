export type ScheduleManagementRole = 'ADMIN' | 'CLUB' | 'ORGANIZADOR'

export interface SchedulePermissionScope {
  user_id: string
  role: ScheduleManagementRole
  owned_club_ids: readonly string[]
  active_organization_ids: readonly string[]
}

export interface ScheduleTournamentResource {
  id: string
  club_id: string | null
  organization_id: string | null
  type: string
  status: string
}

export const isScheduleManagementRole = (role: unknown): role is ScheduleManagementRole =>
  role === 'ADMIN' || role === 'CLUB' || role === 'ORGANIZADOR'

/** Mirrors checkTournamentPermissions; club association alone never grants an organizer access. */
export const canManageScheduleTournament = (
  scope: SchedulePermissionScope, tournament: ScheduleTournamentResource,
): boolean => {
  if (scope.role === 'ADMIN') return true
  if (scope.role === 'CLUB') return !!tournament.club_id && scope.owned_club_ids.includes(tournament.club_id)
  return !!tournament.organization_id && scope.active_organization_ids.includes(tournament.organization_id)
}

export const isScheduleTournamentEligible = (tournament: ScheduleTournamentResource): boolean =>
  tournament.type === 'LONG' && ![
    'COMPLETED', 'FINISHED', 'FINISHED_POINTS_PENDING', 'FINISHED_POINTS_CALCULATED', 'CANCELED', 'CANCELLED',
  ].includes(tournament.status)
