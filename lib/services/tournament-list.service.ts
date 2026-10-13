import 'server-only'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { LIST_PAGE_SIZE, STANDARD_LIST_STATES, TOURNAMENT_LIST_FILTERS, type TournamentListFilter } from '@/lib/tournaments/tournament-list-filters'
import { readTournamentMetrics } from './tournament-metrics.service'
import { scopedTournamentQuery } from './tournament-club-filter.service'

export interface TournamentListingScope {
  column: 'organization_id' | 'club_id'
  id: string
}
export interface ListedTournament {
  id: string
  seo_slug: string | null
  name: string
  status: string
  pre_tournament_image_url: string | null
  start_date: string
  end_date: string | null
  category_name: string
  gender: string
  type: string
  price: number | string | null
  is_draft: boolean
  clubes: { id: string; name: string } | null
  inscriptions: number
  matchesFinished: number
  matchesPending: number
  totalMatches: number
}

export class TournamentListingAccessError extends Error {
  constructor(message: string, public readonly needsLogin = false) { super(message) }
}

// Request-local only. The scope always comes from the authenticated user's records.
export const getTournamentListingContext = cache(async (): Promise<{ supabase: SupabaseClient; scope: TournamentListingScope }> => {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new TournamentListingAccessError('Iniciá sesión para consultar tus torneos.', true)
  const { data: profile, error: roleError } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (roleError) throw roleError
  if (profile?.role === 'ORGANIZADOR') {
    const { data, error } = await supabase.from('organization_members').select('organizacion_id')
      .eq('user_id', user.id).eq('is_active', true).single()
    if (error || !data) throw new TournamentListingAccessError('No se encontró una organización activa para tu usuario.')
    return { supabase, scope: { column: 'organization_id', id: data.organizacion_id } }
  }
  if (profile?.role === 'CLUB') {
    const { data, error } = await supabase.from('clubes').select('id').eq('user_id', user.id).single()
    if (error || !data) throw new TournamentListingAccessError('No se encontró un club asociado a tu usuario.')
    return { supabase, scope: { column: 'club_id', id: data.id } }
  }
  throw new TournamentListingAccessError('Tu rol no tiene acceso a este listado.')
})

const scopedTournaments = scopedTournamentQuery

export const getTournamentListCounts = async (supabase: SupabaseClient, scope: TournamentListingScope, clubId?: string) => {
  const filters = Object.keys(TOURNAMENT_LIST_FILTERS).filter((key) => key !== 'other') as Exclude<TournamentListFilter, 'other'>[]
  const [all, ...groups] = await Promise.all([
    scopedTournaments(supabase, scope, 'id', true, clubId),
    ...filters.map((filter) => scopedTournaments(supabase, scope, 'id', true, clubId).in('status', [...TOURNAMENT_LIST_FILTERS[filter].states])),
  ])
  for (const result of [all, ...groups]) {
    if (result.error) throw result.error
    if (result.count === null) throw new Error('No se pudieron obtener los contadores')
  }
  const counts = Object.fromEntries(filters.map((filter, index) => [filter, groups[index].count!])) as Record<TournamentListFilter, number>
  counts.other = Math.max(0, all.count! - groups.reduce((sum, group) => sum + group.count!, 0))
  return { total: all.count!, active: counts.zones + counts.brackets, counts }
}

// Only internal server consumers with an already validated scope may call this.
export const getTournamentListPage = async (
  supabase: SupabaseClient, scope: TournamentListingScope, filter: TournamentListFilter, page: number, clubId?: string,
) => {
  let query = scopedTournaments(supabase, scope, 'id,seo_slug,name,status,pre_tournament_image_url,start_date,end_date,category_name,gender,type,price,is_draft,clubes(id,name)', false, clubId,
    filter === 'other' ? `status.not.in.(${STANDARD_LIST_STATES.join(',')}),status.is.null` : undefined)
  if (filter !== 'other') query = query.in('status', [...TOURNAMENT_LIST_FILTERS[filter].states])
  const { data, error, count } = await query.order('start_date', { ascending: true, nullsFirst: false }).order('id', { ascending: true })
    .range((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE - 1)
  if (error) throw error
  if (count === null) throw new Error('No se pudo obtener el total del filtro')
  const pages = Math.max(1, Math.ceil(count / LIST_PAGE_SIZE))
  if (page > pages) return { tournaments: [] as ListedTournament[], total: count, pages, redirectPage: pages }
  const tournaments = (data || []) as unknown as ListedTournament[]
  const { inscriptions, matches } = await readTournamentMetrics(supabase, tournaments.map(({ id }) => id))
  const summaries = new Map(tournaments.map(({ id }) => [id, { inscriptions: 0, matchesFinished: 0, matchesPending: 0, totalMatches: 0 }]))
  // Preserve the existing history card's counts; panel counts intentionally exclude BYEs.
  for (const inscription of inscriptions) {
    const summary = summaries.get(inscription.tournament_id)
    if (summary) summary.inscriptions += 1
  }
  for (const match of matches) {
    const summary = summaries.get(match.tournament_id)
    if (!summary) continue
    summary.totalMatches += 1
    if (match.status === 'FINISHED') summary.matchesFinished += 1
    if (match.status === 'PENDING' || match.status === 'IN_PROGRESS') summary.matchesPending += 1
  }
  return { tournaments: tournaments.map((tournament) => ({ ...tournament, ...summaries.get(tournament.id)! })), total: count, pages, redirectPage: null }
}
