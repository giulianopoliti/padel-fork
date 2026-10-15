'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { tournamentSortInputSchema } from '@/lib/tournaments/tournament-sort'

export const saveTournamentSortSettings = async (input: unknown): Promise<{ success: true } | { success: false; error: string }> => {
  const parsed = tournamentSortInputSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Revisá los criterios de orden.' }
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Iniciá sesión para guardar el orden.' }
    const { data: membership, error: membershipError } = await supabase.from('organization_members')
      .select('member_role').eq('user_id', user.id).eq('is_active', true).maybeSingle()
    if (membershipError) throw membershipError
    if (!membership || !['owner', 'admin'].includes(membership.member_role)) {
      return { success: false, error: 'Solo los administradores pueden guardar el orden.' }
    }
    const { error } = await supabase.from('tenant_tournament_list_settings').upsert({
      surface: parsed.data.surface,
      rules: parsed.data.rules,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'surface' })
    if (error) throw error
    revalidatePath('/panel')
    revalidatePath('/panel-cpa')
    revalidatePath('/my-tournaments')
    return { success: true }
  } catch (error) {
    console.error('[TournamentSort] Could not save settings:', error)
    return { success: false, error: 'No pudimos guardar el orden. Intentá nuevamente.' }
  }
}
