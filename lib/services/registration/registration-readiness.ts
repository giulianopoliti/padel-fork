import { createClientServiceRole } from '@/utils/supabase/server'
import { buildTournamentCapacitySummary } from '@/lib/services/tournament-capacity.service'
import { canAssignInscriptionSlot, getInscriptionState, type InscriptionStateInput } from '@/lib/tournaments/inscription-state'

export interface RegistrationReadiness {
  tournamentId: string
  occupied: number
  maximum: number | null
  isFull: boolean
  eligibleCount: number
  eligibleCoupleIds: string[]
  pendingWithoutSlot: number
  proofWithoutSlot: number
  signature: string | null
  acknowledged: boolean
  admissionsOpen: boolean
  excluded: { id: string; coupleId: string; name: string; label: string; hasProof: boolean; occupiesSlot: boolean; proofMissing: boolean; revision: number }[]
}

type ReadinessPair = InscriptionStateInput & { id: string; couple_id: string; name: string; has_proof: boolean; payment_revision: number }
type ReadinessSnapshot = {
  tournament: { id: string; max_participants: number | null; enable_transfer_proof: boolean; status?: string; bracket_status?: string; registration_locked?: boolean; registration_locked_by_capacity?: boolean }
  pairs: ReadinessPair[]
  exclusions: { signature: string | null; acknowledged: boolean }
}

/** Read as one DB snapshot, so an acknowledgement cannot cover unseen exclusions. */
export const getRegistrationReadiness = async (tournamentId: string): Promise<RegistrationReadiness> => {
  const supabase = await createClientServiceRole()
  const { data, error } = await supabase.rpc('get_tournament_registration_readiness', { p_tournament_id: tournamentId })
  if (error || !data) throw new Error(error?.message || 'No se pudo consultar el estado de las inscripciones.')
  const snapshot = data as ReadinessSnapshot
  const rows = snapshot.pairs.map(row => ({ ...row, state: getInscriptionState({ ...row,
    payment_proof_path: row.has_proof ? 'attached' : null,
  }, snapshot.tournament.enable_transfer_proof) }))
  const occupied = rows.filter(row => row.state.occupiesSlot).length
  return {
    tournamentId, occupied, maximum: snapshot.tournament.max_participants,
    isFull: buildTournamentCapacitySummary(snapshot.tournament.max_participants, occupied).isFull,
    eligibleCount: rows.filter(row => row.state.confirmed).length,
    eligibleCoupleIds: rows.filter(row => row.state.confirmed).map(row => row.couple_id),
    pendingWithoutSlot: rows.filter(row => !row.state.occupiesSlot).length,
    proofWithoutSlot: rows.filter(row => !row.state.occupiesSlot && row.has_proof).length,
    signature: snapshot.exclusions.signature, acknowledged: snapshot.exclusions.acknowledged,
    admissionsOpen: canAssignInscriptionSlot(snapshot.tournament),
    excluded: rows.filter(row => !row.state.confirmed).map(row => ({ id: row.id, coupleId: row.couple_id,
      name: row.name || 'Pareja sin nombre', label: row.state.label, hasProof: row.has_proof, occupiesSlot: row.state.occupiesSlot,
      proofMissing: row.state.proofMissing, revision: row.payment_revision })),
  }
}

export const assertRegistrationExclusionsReviewed = async (tournamentId: string): Promise<void> => {
  const readiness = await getRegistrationReadiness(tournamentId)
  if (!readiness.acknowledged) throw new Error('Hay inscripciones sin confirmar. Aceptalas o descartalas antes de organizar el torneo.')
}
