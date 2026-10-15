import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TenantBranding } from '@/config/tenant'
import { aggregatePanelMetrics, type PanelTournament } from './organizer-panel-metrics'
import { readTournamentMetrics } from './tournament-metrics.service'
import { scopedTournamentQuery } from './tournament-club-filter.service'
import { getTournamentSortColumn, type TournamentSortRule } from '@/lib/tournaments/tournament-sort'

export const PANEL_PAGE_SIZE = 8
const SELECT = 'id,seo_slug,name,status,start_date,category_name,gender,type,price,is_draft,clubes(id,name)'

// organizationId comes from the authenticated user's active membership.
export const getOrganizerPanelTournamentPage = async (
  supabase: SupabaseClient, organizationId: string, tenant: TenantBranding['key'], page = 1, clubId?: string,
  sortRules?: TournamentSortRule[],
) => {
  const scope = { column: 'organization_id' as const, id: organizationId }
  const selectGroup = async (states: string[], offset: number, limit: number) => {
    let query = scopedTournamentQuery(supabase, scope, SELECT, limit === 0, clubId).in('status', states)
    for (const rule of sortRules ?? [{ field: 'start_date', direction: 'asc' }] as TournamentSortRule[]) {
      query = query.order(getTournamentSortColumn(rule.field), { ascending: rule.direction === 'asc', nullsFirst: false })
    }
    query = query.order('id', { ascending: true })
    if (limit > 0) query = query.range(offset, offset + limit - 1)
    const { data, error, count } = await query
    if (error) throw error
    if (count === null) throw new Error('No se pudo obtener el total de torneos')
    return { tournaments: (data || []) as unknown as PanelTournament[], total: count }
  }
  const offset = (page - 1) * PANEL_PAGE_SIZE
  let tournaments: PanelTournament[]
  let total: number
  if (tenant === 'padel-elite' && !sortRules) {
    const upcoming = await selectGroup(['NOT_STARTED'], offset, PANEL_PAGE_SIZE)
    const remaining = PANEL_PAGE_SIZE - upcoming.tournaments.length
    const active = await selectGroup(['ZONE_PHASE', 'BRACKET_PHASE'], Math.max(0, offset - upcoming.total), remaining)
    tournaments = [...upcoming.tournaments, ...active.tournaments]
    total = upcoming.total + active.total
  } else {
    const group = await selectGroup(['NOT_STARTED', 'ZONE_PHASE', 'BRACKET_PHASE'], offset, PANEL_PAGE_SIZE)
    tournaments = group.tournaments
    total = group.total
  }
  const pages = Math.max(1, Math.ceil(total / PANEL_PAGE_SIZE))
  if (page > pages) return { tournaments: [], total, pages, redirectPage: pages }
  const { inscriptions, matches } = await readTournamentMetrics(supabase, tournaments.map(({ id }) => id))
  return { tournaments: aggregatePanelMetrics(tournaments, inscriptions, matches), total, pages, redirectPage: null }
}

// Backwards-compatible first-page consumer for existing panel tests/integrations.
export const getOrganizerPanelTournaments = async (supabase: SupabaseClient, organizationId: string, tenant: TenantBranding['key']) =>
  (await getOrganizerPanelTournamentPage(supabase, organizationId, tenant)).tournaments
