import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PanelInscription, PanelMatch } from './organizer-panel-metrics'

export const readTournamentMetrics = async (supabase: SupabaseClient, tournamentIds: string[]) => {
  const readRows = async <T>(table: 'inscriptions' | 'matches', select: string): Promise<T[]> => {
    if (tournamentIds.length === 0) return []
    const rows: T[] = []
    for (let offset = 0; ; ) {
      const { data, error, count } = await supabase.from(table)
        .select(select, { count: 'exact' })
        .in('tournament_id', tournamentIds).eq('es_prueba', false)
        .order('id', { ascending: true }).range(offset, offset + 999)
      if (error) throw error
      const page = (data || []) as unknown as T[]
      rows.push(...page)
      offset += page.length
      if (count !== null && offset >= count) break
      if (page.length === 0) {
        if (count !== null && offset < count) throw new Error('No se pudieron cargar todas las métricas')
        break
      }
      if (count === null && page.length < 1000) break
    }
    return rows
  }
  const [inscriptions, matches] = await Promise.all([
    readRows<PanelInscription>('inscriptions', 'tournament_id,player_id,couple_id,is_pending,couples!inscriptions_couple_id_fkey(player1_id,player2_id)'),
    readRows<PanelMatch>('matches', 'tournament_id,status,couple1_id,couple2_id'),
  ])
  return { inscriptions, matches }
}
