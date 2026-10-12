import { createClientServiceRole } from '@/utils/supabase/server'
import { ensureLongTournamentGeneralZone } from '@/lib/services/tournaments/long-general-zone'
import { ensureAmericanSingleZone } from '@/lib/services/tournaments/american-single-zone'
import { ensureCanonicalZoneMembership } from '@/lib/services/tournament-zone-membership'

// Called after save, completion, approval or cancellation. Never undo a saved
// inscription because this independent assignment needs another attempt.
export const reconcileCompleteInscriptions = async (tournamentId: string): Promise<void> => {
  const supabase = await createClientServiceRole()
  const { count, error } = await supabase.from('inscriptions').select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId).eq('payment_method', 'TRANSFER').is('payment_proof_path', null)
  if (error) throw error
  if (count) return
  const { data: tournament, error: tournamentError } = await supabase.from('tournaments').select('type').eq('id', tournamentId).single()
  if (tournamentError) throw tournamentError
  if (tournament.type !== 'LONG') {
    const result = await ensureAmericanSingleZone(tournamentId)
    if (!result.success) throw new Error('GeneralZoneReconciliationFailed')
    return
  }
  const { data: inscriptions, error: inscriptionsError } = await supabase.from('inscriptions').select('couple_id')
    .eq('tournament_id', tournamentId).eq('is_pending', false).not('couple_id', 'is', null)
  if (inscriptionsError) throw inscriptionsError
  if (!inscriptions?.length) return
  const zone = await ensureLongTournamentGeneralZone(tournamentId)
  if (!zone.success || !zone.zoneId) throw new Error('GeneralZoneUnavailable')
  for (const inscription of inscriptions) {
    const result = await ensureCanonicalZoneMembership({ supabase, tournamentId, zoneId: zone.zoneId, coupleId: inscription.couple_id })
    if (!result.success) throw new Error('ZoneAssignmentFailed')
  }
}
