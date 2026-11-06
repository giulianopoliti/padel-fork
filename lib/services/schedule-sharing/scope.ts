import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'
import {
  canManageScheduleTournament, isScheduleManagementRole, isScheduleTournamentEligible,
  type SchedulePermissionScope,
} from './permissions'

const clubSchema = z.object({ id: z.string().uuid(), name: z.string() })
const tournamentSchema = z.object({
  id: z.string().uuid(), name: z.string(), club_id: z.string().uuid().nullable(),
  organization_id: z.string().uuid().nullable(), type: z.string(), status: z.string(),
  category_name: z.string().nullable(), format_config: z.unknown(),
})

export type ScheduleWorkspaceTournament = z.infer<typeof tournamentSchema> & { eligible: boolean }
export interface ScheduleWorkspaceScope extends SchedulePermissionScope {
  clubs: z.infer<typeof clubSchema>[]
  tournaments: ScheduleWorkspaceTournament[]
}

/** Resource IDs come only from the authenticated user's effective permissions. */
export const getScheduleWorkspaceScope = async (): Promise<ScheduleWorkspaceScope> => {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Usuario no autenticado.')
  const { data: profile, error: profileError } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profileError || !isScheduleManagementRole(profile?.role)) throw new Error('No tenés permisos para gestionar fechas y horarios.')
  const scope: ScheduleWorkspaceScope = {
    user_id: user.id, role: profile.role, owned_club_ids: [], active_organization_ids: [], clubs: [], tournaments: [],
  }
  if (scope.role === 'CLUB') {
    const { data, error } = await supabase.from('clubes').select('id, name').eq('user_id', user.id)
    if (error) throw new Error('No se pudieron consultar tus clubes.')
    scope.clubs = z.array(clubSchema).parse(data)
    scope.owned_club_ids = scope.clubs.map(club => club.id)
    if (scope.owned_club_ids.length === 0) return scope
  }
  if (scope.role === 'ORGANIZADOR') {
    const { data, error } = await supabase.from('organization_members').select('organizacion_id').eq('user_id', user.id).eq('is_active', true)
    if (error) throw new Error('No se pudieron consultar tus organizaciones.')
    scope.active_organization_ids = z.array(z.object({ organizacion_id: z.string().uuid() })).parse(data).map(row => row.organizacion_id)
    if (scope.active_organization_ids.length === 0) return scope
  }
  // Page explicitly: PostgREST otherwise truncates scopes at the API row limit.
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from('tournaments')
      .select('id, name, club_id, organization_id, type, status, category_name, format_config')
      .eq('type', 'LONG').order('id').range(from, from + pageSize - 1)
    if (scope.role === 'CLUB') query = query.in('club_id', [...scope.owned_club_ids])
    if (scope.role === 'ORGANIZADOR') query = query.in('organization_id', [...scope.active_organization_ids])
    const { data, error } = await query
    if (error) throw new Error('No se pudieron consultar los torneos administrables.')
    const tournaments = z.array(tournamentSchema).parse(data)
    scope.tournaments.push(...tournaments.filter(tournament => canManageScheduleTournament(scope, tournament))
      .map(tournament => ({ ...tournament, eligible: isScheduleTournamentEligible(tournament) })))
    if (tournaments.length < pageSize) break
  }
  if (scope.role !== 'CLUB') {
    const ids = [...new Set(scope.tournaments.flatMap(tournament => tournament.club_id ? [tournament.club_id] : []))]
    for (let from = 0; from < ids.length; from += pageSize) {
      const { data, error } = await supabase.from('clubes').select('id, name').in('id', ids.slice(from, from + pageSize))
      if (error) throw new Error('No se pudieron consultar los clubes de tus torneos.')
      scope.clubs.push(...z.array(clubSchema).parse(data))
    }
  }
  return scope
}
