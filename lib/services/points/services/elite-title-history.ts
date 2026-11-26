import { getTenantBranding } from '@/config/tenant'
import { resolveTournamentCategoryConfig } from '@/lib/services/tournament-category-config'
import { createClientServiceRole } from '@/utils/supabase/server'

export type EliteTitle = { tournamentId: string; tournamentName: string; category: string }

export const getEliteTitleHistory = async (
  playerIds: string[], tournament: { type?: string | null; category_name?: string | null; category_config?: unknown },
): Promise<Map<string, EliteTitle[]>> => {
  const titles = new Map<string, EliteTitle[]>()
  if (getTenantBranding().key !== 'padel-elite' || !['AMERICAN', 'AMERICAN_OTP', 'AMERICANO'].includes(tournament.type ?? '') || !playerIds.length) return titles
  const category = resolveTournamentCategoryConfig(tournament)
  if (category?.mode !== 'SINGLE') return titles

  const service = await createClientServiceRole()
  const uniquePlayers = [...new Set(playerIds)]
  for (let playerOffset = 0; playerOffset < uniquePlayers.length; playerOffset += 100) {
    const players = uniquePlayers.slice(playerOffset, playerOffset + 100)
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await service.from('player_tournament_history')
        .select('player_id, tournament_id, tournaments!inner(name)')
        .in('player_id', players).eq('ranking_category', category.category)
        .eq('ranking_champion', true).eq('es_prueba', false)
        .order('created_at', { ascending: false }).order('tournament_id').order('player_id').range(offset, offset + 499)
      if (error) {
        if (!['42703', 'PGRST204'].includes(error.code)) console.error('[Elite titles]', error.code)
        return titles
      }
      for (const row of data ?? []) {
        const tournament = Array.isArray(row.tournaments) ? row.tournaments[0] : row.tournaments
        const title = { tournamentId: row.tournament_id, tournamentName: tournament?.name ?? 'Americano', category: category.category }
        const existing = titles.get(row.player_id) ?? []
        existing.push(title)
        titles.set(row.player_id, existing)
      }
      if (!data || data.length < 500) break
    }
  }
  return titles
}
