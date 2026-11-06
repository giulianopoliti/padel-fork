import { canManageScheduleTournament, isScheduleManagementRole, isScheduleTournamentEligible, type SchedulePermissionScope } from '../permissions'

const scope: SchedulePermissionScope = { user_id: 'user', role: 'CLUB', owned_club_ids: ['owned'], active_organization_ids: ['active-org'] }
const tournament = { id: 'tournament', club_id: 'owned', organization_id: null, type: 'LONG', status: 'NOT_STARTED' }

describe('schedule management permissions', () => {
  it('admits only management roles', () => {
    for (const role of ['PLAYER', 'COACH', null, undefined, 'admin']) expect(isScheduleManagementRole(role)).toBe(false)
    for (const role of ['ADMIN', 'CLUB', 'ORGANIZADOR']) expect(isScheduleManagementRole(role)).toBe(true)
  })
  it('permits ADMIN without manufacturing a club or organization identity', () => {
    expect(canManageScheduleTournament({ ...scope, role: 'ADMIN', owned_club_ids: [], active_organization_ids: [] }, { ...tournament, club_id: null })).toBe(true)
  })
  it('allows CLUB ownership even with null organization_id but rejects foreign clubs', () => {
    expect(canManageScheduleTournament(scope, tournament)).toBe(true)
    expect(canManageScheduleTournament(scope, { ...tournament, club_id: 'foreign', organization_id: 'active-org' })).toBe(false)
  })
  it('checks the tournament organization rather than inferring access from club association', () => {
    const organizer = { ...scope, role: 'ORGANIZADOR' as const }
    expect(canManageScheduleTournament(organizer, tournament)).toBe(false)
    expect(canManageScheduleTournament(organizer, { ...tournament, organization_id: 'active-org' })).toBe(true)
    expect(canManageScheduleTournament(organizer, { ...tournament, organization_id: 'other-org' })).toBe(false)
  })
  it('losing active membership immediately removes authorization', () => {
    expect(canManageScheduleTournament({ ...scope, role: 'ORGANIZADOR', active_organization_ids: [] }, { ...tournament, organization_id: 'active-org' })).toBe(false)
  })
  it('keeps historical tournaments queryable while excluding them from new batches', () => {
    for (const status of ['COMPLETED', 'FINISHED', 'FINISHED_POINTS_PENDING', 'FINISHED_POINTS_CALCULATED', 'CANCELED', 'CANCELLED']) {
      expect(isScheduleTournamentEligible({ ...tournament, status })).toBe(false)
    }
    expect(isScheduleTournamentEligible({ ...tournament, type: 'AMERICAN' })).toBe(false)
    expect(isScheduleTournamentEligible(tournament)).toBe(true)
  })
})
