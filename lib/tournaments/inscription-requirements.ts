/** Stored transfer choices and uploaded files are history; the current tournament sets the requirement. */
export const isInscriptionProofPending = (inscription: { payment_method?: string | null; payment_proof_path?: string | null; proof_waived_at?: string | null }, enableTransferProof: boolean | null | undefined): boolean =>
  enableTransferProof === true && inscription.payment_method === "TRANSFER" && !inscription.payment_proof_path && !inscription.proof_waived_at
