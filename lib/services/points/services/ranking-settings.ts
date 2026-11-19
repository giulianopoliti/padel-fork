import type { SupabaseClient } from '@supabase/supabase-js'
import type { FixedRankingPolicy } from '../types/points-review.types'

export const getRankingSettings = async (supabase: SupabaseClient): Promise<{ policy: FixedRankingPolicy; started_at: string } | null> => {
  const { data, error } = await supabase.from('ranking_settings').select('policy, started_at').maybeSingle()
  if (error && !['42P01', 'PGRST205'].includes(error.code)) throw new Error('No se pudo consultar la configuración del ranking.')
  return data ?? null
}
