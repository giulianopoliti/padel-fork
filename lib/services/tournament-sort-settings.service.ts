import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getTenantBranding } from '@/config/tenant'
import { getDefaultTournamentSortRules, tournamentSortInputSchema, type TournamentSortSettings, type TournamentSortSurface } from '@/lib/tournaments/tournament-sort'

// One tenant per database. The Supabase connection selects the tenant; surface selects its settings.
export const getTournamentSortSettings = async (
  supabase: SupabaseClient, surface: TournamentSortSurface,
): Promise<TournamentSortSettings> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Iniciá sesión para consultar el orden.')
  const [settings, membership] = await Promise.all([
    supabase.from('tenant_tournament_list_settings').select('rules')
      .eq('surface', surface).maybeSingle(),
    supabase.from('organization_members').select('member_role')
      .eq('user_id', user.id).eq('is_active', true).maybeSingle(),
  ])
  if (settings.error) throw settings.error
  if (membership.error) throw membership.error
  const canEdit = ['owner', 'admin'].includes(membership.data?.member_role ?? '')
  if (!settings.data) return { rules: getDefaultTournamentSortRules(surface, getTenantBranding().key), configured: false, canEdit }
  const parsed = tournamentSortInputSchema.safeParse({ surface, rules: settings.data.rules })
  if (!parsed.success) throw new Error('El orden guardado no es válido.')
  return { rules: parsed.data.rules, configured: true, canEdit }
}
