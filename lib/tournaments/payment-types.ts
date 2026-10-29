import { getInscriptionState } from './inscription-state'

export type PaymentInscription = {
  id: string
  method: 'CASH' | 'TRANSFER' | null
  hasProof: boolean
  proofStatus: string
  isPending: boolean
  alias?: string | null
  amount?: number | null
  revision: number
  uploadedAt?: string | null
  reviewedAt?: string | null
  individual?: boolean
  proofRequired?: boolean
  occupiesSlot?: boolean
  proofWaived?: boolean
  registrationLabel?: string
  confirmed?: boolean
}

// Explicit RPC boundary while database.types.ts remains the repository fallback.
export type ProofApprovalArgs = {
  p_id: string
  p_tournament_id: string
  p_revision: number
  p_path: string
  p_reviewer: string
}

export type PaymentData = {
  inscription: PaymentInscription | null
  inscriptions?: PaymentInscription[]
  settings: { cash: boolean; transfer: boolean; alias: string | null; amount: number | null; reserveSlot?: boolean; requireApproval?: boolean; isFull?: boolean; admissionsOpen?: boolean }
  incompleteCount?: number
  manager?: boolean
  tournamentName?: string
}

export type PaymentRow = {
  id: string; payment_method: 'CASH' | 'TRANSFER' | null; payment_proof_path: string | null
  payment_proof_status: string; is_pending: boolean; payment_revision: number
  occupies_slot?: boolean; proof_waived_at?: string | null; couple_id?: string | null
}
export const presentPayment = (row: PaymentRow, enableTransferProof = true): PaymentInscription => ({
  id: row.id, method: row.payment_method, hasProof: Boolean(row.payment_proof_path),
  proofStatus: row.payment_proof_status, isPending: row.is_pending, revision: row.payment_revision,
  proofRequired: getInscriptionState(row, enableTransferProof).proofRequired,
  occupiesSlot: row.occupies_slot !== false,
  proofWaived: Boolean(row.proof_waived_at),
  registrationLabel: getInscriptionState(row, enableTransferProof).label,
  confirmed: getInscriptionState(row, enableTransferProof).confirmed,
})

export const paymentPresentation = (inscription: PaymentInscription) => {
  if (inscription.hasProof) return {
    status: inscription.proofStatus === 'APPROVED' ? 'Comprobante aprobado' : 'Comprobante enviado',
    action: 'Ver comprobante',
  }
  if (inscription.method === 'CASH') return { status: 'Abonás en efectivo', action: 'Modificar pago' }
  if (inscription.proofWaived) return { status: 'Admitida sin comprobante por el organizador', action: '' }
  if (inscription.proofRequired === false) return { status: 'No se requiere comprobante', action: 'Ver detalles' }
  if (inscription.method === 'TRANSFER') return { status: 'Falta subir el comprobante', action: 'Subir comprobante' }
  return { status: '', action: 'Ver detalles' }
}
