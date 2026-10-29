import { createClientServiceRole } from '@/utils/supabase/server'
import { ensureLongTournamentGeneralZone } from '@/lib/services/tournaments/long-general-zone'
import { ensureAmericanSingleZone } from '@/lib/services/tournaments/american-single-zone'
import { ensureCanonicalZoneMembership } from '@/lib/services/tournament-zone-membership'
import { isInscriptionEligible } from '@/lib/tournaments/inscription-state'

// Called after save, completion, approval or cancellation. Never undo a saved
// inscription because this independent assignment needs another attempt.
export const reconcileCompleteInscriptions = async (tournamentId: string): Promise<'READY' | 'CLOSED'> => {
  const supabase = await createClientServiceRole()
  const { data: tournament, error: tournamentError } = await supabase.from('tournaments').select('type,status,enable_transfer_proof').eq('id', tournamentId).single()
  if (tournamentError) throw tournamentError
  if (tournament.status && !['NOT_STARTED', 'PAIRING', 'ZONE_REGISTRATION', 'ZONE_PHASE'].includes(tournament.status)) return 'CLOSED'
  if (tournament.type !== 'LONG') {
    const result = await ensureAmericanSingleZone(tournamentId)
    if (!result.success) throw new Error('GeneralZoneReconciliationFailed')
    return 'READY'
  }
  const { data: inscriptions, error: inscriptionsError } = await supabase.from('inscriptions').select('couple_id,is_pending,occupies_slot,payment_method,payment_proof_path,proof_waived_at')
    .eq('tournament_id', tournamentId).eq('is_pending', false).not('couple_id', 'is', null)
  if (inscriptionsError) throw inscriptionsError
  const eligible = (inscriptions || []).filter(inscription => isInscriptionEligible(inscription, tournament.enable_transfer_proof))
  if (!eligible.length) return 'READY'
  const zone = await ensureLongTournamentGeneralZone(tournamentId)
  if (!zone.success || !zone.zoneId) throw new Error('GeneralZoneUnavailable')
  for (const inscription of eligible) {
    const result = await ensureCanonicalZoneMembership({ supabase, tournamentId, zoneId: zone.zoneId, coupleId: inscription.couple_id })
    if (!result.success) throw new Error('ZoneAssignmentFailed')
    if (result.mirrorWarning) throw new Error('ZoneMirrorPending')
  }
  return 'READY'
}
