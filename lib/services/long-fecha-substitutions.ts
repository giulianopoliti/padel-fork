import type { SupabaseClient } from '@supabase/supabase-js'

export interface LongFechaSubstitution {
  fecha_id: string
  couple_id: string
  player1_name: string
  player2_name: string
  is_substitute: boolean
  can_vote: boolean
}

export type LongSubstitutePanelFecha = Pick<LongFechaSubstitution, 'fecha_id' | 'couple_id' | 'player1_name' | 'player2_name'> & {
  tournament_id: string
  tournament_name: string
  fecha_name: string
  has_slots: boolean
}

export const getMyLongSubstitutePanelFechas = async (supabase: Pick<SupabaseClient, 'rpc'>) => {
  const { data, error } = await supabase.rpc('get_my_long_substitute_panel_fechas')
  if (error?.code === 'PGRST202') return []
  if (error) throw error
  return (data ?? []) as LongSubstitutePanelFecha[]
}

export const getMyLongFechaSubstitutions = async (supabase: Pick<SupabaseClient, 'rpc'>, tournamentId: string) => {
  const { data, error } = await supabase.rpc('get_my_long_fecha_substitutions', { p_tournament_id: tournamentId })
  if (error?.code === 'PGRST202') return []
  if (error) throw error
  return (data ?? []) as LongFechaSubstitution[]
}
