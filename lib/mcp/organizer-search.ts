import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getTenantCanonicalSiteUrl } from '@/config/tenant'
import { getOrganizerRole } from './organizer-auth'
import { organizerCanReadLeague, readAll } from './organizer-fixture'

const searchText = z.string().trim().min(1).max(100)
export const searchSchema = z.object({
  nombre: searchText.optional(),
  sede: searchText.optional(),
  categoria: searchText.optional(),
  estado: z.enum(['active', 'past', 'all']).default('all'),
  pagina: z.number().int().min(1).max(100).default(1),
}).strict()

const activeStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'ZONE_PHASE', 'BRACKET_PHASE']
const pastStatuses = ['FINISHED', 'FINISHED_POINTS_PENDING', 'FINISHED_POINTS_CALCULATED']
const pageSize = 10
const contains = (value: string) => `%${value.replace(/[\\%_]/g, '\\$&')}%`

interface SearchTournament {
  id: string
  name: string
  category_name: string | null
  status: string
  start_date: string
  is_draft: boolean | null
  club: { name: string } | { name: string }[] | null
}

export const searchOrganizerTournaments = async (
  supabase: SupabaseClient, input: z.infer<typeof searchSchema>, actorId: string,
) => {
  const role = await getOrganizerRole(supabase, actorId)
  if (!role) return { error: 'Tu cuenta no tiene permisos de organización.' }

  // These scopes match checkTournamentPermissions: club ownership or active organization membership.
  // Apply them before filtering/pagination so counts and pages cannot reveal unrelated tournaments.
  let scope: { column: 'club_id' | 'organization_id'; ids: string[] } | undefined
  if (role === 'CLUB') {
    const clubs = await readAll<{ id: string }>((from, to) => supabase.from('clubes')
      .select('id').eq('user_id', actorId).order('id').range(from, to))
    scope = { column: 'club_id', ids: clubs.map(club => club.id) }
  } else if (role === 'ORGANIZADOR') {
    const memberships = await readAll<{ organizacion_id: string }>((from, to) => supabase.from('organization_members')
      .select('organizacion_id').eq('user_id', actorId).eq('is_active', true).order('id').range(from, to))
    scope = { column: 'organization_id', ids: [...new Set(memberships.map(member => member.organizacion_id))] }
  }
  const empty = { pagina: input.pagina, hayMas: false, torneos: [] }
  if (scope && !scope.ids.length) return empty

  let query = supabase.from('tournaments')
    .select(`id, name, category_name, status, start_date, is_draft, club:clubes${input.sede ? '!inner' : ''}(name)`)
    .eq('type', 'LONG')
  if (scope) query = query.in(scope.column, scope.ids)
  if (input.estado !== 'all') query = query.in('status', input.estado === 'active' ? activeStatuses : pastStatuses)
  if (input.nombre) query = query.ilike('name', contains(input.nombre))
  if (input.sede) query = query.ilike('club.name', contains(input.sede))
  if (input.categoria) query = query.ilike('category_name', input.categoria.replace(/[\\%_]/g, '\\$&'))
  const offset = (input.pagina - 1) * pageSize
  const { data, error } = await query.order('start_date', { ascending: false, nullsFirst: false })
    .order('id').range(offset, offset + pageSize)
  if (error) throw error

  // Recheck the existing permission function before returning any record, including membership changes.
  const rows = (data ?? []) as unknown as SearchTournament[]
  const permissions = await Promise.all(rows.map(row => organizerCanReadLeague(supabase, actorId, row.id)))
  const allowed = rows.filter((_, index) => permissions[index])
  return {
    pagina: input.pagina,
    hayMas: allowed.length > pageSize,
    torneos: allowed.slice(0, pageSize).map(tournament => ({
      tournamentId: tournament.id,
      nombre: tournament.name,
      categoria: tournament.category_name,
      sede: (Array.isArray(tournament.club) ? tournament.club[0] : tournament.club)?.name ?? null,
      estado: tournament.status,
      fechaInicio: tournament.start_date,
      borrador: tournament.is_draft === true,
      url: new URL(`/tournaments/${tournament.id}`, getTenantCanonicalSiteUrl()).href,
    })),
  }
}
