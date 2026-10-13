import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ActiveTournamentClub { id: string; name: string }
export interface TournamentClubScope { column: 'organization_id' | 'club_id'; id: string }

export const getActiveTournamentClubs = async (supabase: SupabaseClient, scope: TournamentClubScope): Promise<ActiveTournamentClub[]> => {
  if (scope.column === 'club_id') {
    const { data, error } = await supabase.from('clubes').select('id,name').eq('id', scope.id).eq('is_active', true)
    if (error) throw error
    return (data || []) as ActiveTournamentClub[]
  }
  const { data, error } = await supabase.from('organization_clubs')
    .select('clubes!inner(id,name)').eq('organizacion_id', scope.id).eq('clubes.is_active', true)
  if (error) throw error
  const clubs = new Map<string, ActiveTournamentClub>()
  for (const row of data || []) {
    const club = (Array.isArray(row.clubes) ? row.clubes[0] : row.clubes) as ActiveTournamentClub | null
    if (club) clubs.set(club.id, { id: club.id, name: club.name || 'Club sin nombre' })
  }
  return [...clubs.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

// Do not interpolate arbitrary URL values into PostgREST's OR expression.
export const validateTournamentClub = (value: string | string[] | undefined, clubs: ActiveTournamentClub[]): string | undefined => {
  const id = Array.isArray(value) ? value[0] : value
  if (!id || id === 'all') return undefined
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !clubs.some((club) => club.id === id)) {
    throw new Error('El club seleccionado no está activo o no está disponible para tu usuario.')
  }
  return id
}

export const scopedTournamentQuery = (
  supabase: SupabaseClient, scope: TournamentClubScope, select: string, head = false, clubId?: string, otherStates?: string,
) => {
  let query = supabase.from('tournaments')
    .select(clubId ? `${select},club_filter:clubes_tournament()` : select, { count: 'exact', head })
    .eq(scope.column, scope.id).eq('es_prueba', false)
  if (clubId) {
    if (!/^[0-9a-f-]{36}$/i.test(clubId)) throw new Error('Club inválido')
    query = query.eq('club_filter.club_id', clubId)
    const clubCondition = `club_id.eq.${clubId},club_filter.not.is.null`
    query = query.or(otherStates ? `and(or(${clubCondition}),or(${otherStates}))` : clubCondition)
  } else if (otherStates) query = query.or(otherStates)
  return query
}
