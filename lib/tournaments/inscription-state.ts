/** A saved inscription, a reserved place and a receipt are independent facts. */
export interface InscriptionStateInput {
  couple_id?: string | null
  is_pending?: boolean | null
  occupies_slot?: boolean | null
  payment_method?: string | null
  payment_proof_path?: string | null
  proof_waived_at?: string | null
}

export interface InscriptionState {
  occupiesSlot: boolean
  proofRequired: boolean
  proofMissing: boolean
  approvalPending: boolean
  confirmed: boolean
  reasons: string[]
  label: string
}

export const getInscriptionState = (
  inscription: InscriptionStateInput,
  enableTransferProof: boolean | null | undefined,
): InscriptionState => {
  // Missing fields are legacy rows; deployments retain their existing places.
  const occupiesSlot = inscription.occupies_slot !== false
  const proofRequired = inscription.couple_id !== null && enableTransferProof === true
    && inscription.payment_method === 'TRANSFER' && !inscription.proof_waived_at
  const proofMissing = proofRequired && !inscription.payment_proof_path
  // Manual approval is retired. Receipts describe payment, not participation.
  const approvalPending = false
  const reasons = [
    ...(!occupiesSlot && inscription.couple_id !== null ? ['cupo'] : []),
  ]
  const confirmed = reasons.length === 0
  return {
    occupiesSlot, proofRequired, proofMissing, approvalPending, confirmed, reasons,
    label: confirmed ? 'Confirmada' : `Pendiente de ${reasons.join(' y ')}`,
  }
}

export const isInscriptionEligible = (inscription: InscriptionStateInput, enableTransferProof: boolean | null | undefined): boolean =>
  Boolean(inscription.couple_id) && getInscriptionState(inscription, enableTransferProof).confirmed

export const reserveOnSignupRequired = (requestDeposit: boolean): boolean => !requestDeposit

export const registrationPolicyDescription = (requestDeposit: boolean, reserveOnSignup: boolean): string => {
  if (!requestDeposit) return 'La pareja obtiene cupo al inscribirse, sin adjuntar comprobante. Podés cobrar más adelante.'
  return reserveOnSignup ? 'La pareja obtiene cupo al inscribirse. El comprobante de la seña puede quedar pendiente.'
    : 'La pareja queda registrada sin cupo. Al cargar el comprobante obtiene lugar, si hay disponibilidad.'
}

export const registrationSignupDescription = (settings: { transfer: boolean; reserveSlot?: boolean; requireApproval?: boolean } | undefined, method?: string | null): string => {
  if (!settings) return 'Tu inscripción se guarda. Consultá su estado para saber si tiene cupo asignado.'
  const needsProof = settings.transfer && method !== 'CASH'
  if (settings.reserveSlot !== false || !needsProof) return needsProof
    ? 'Tu cupo se reserva al inscribirte. Podés adjuntar el comprobante de la seña después.'
    : 'Tu cupo se reserva al inscribirte, sin adjuntar comprobante.'
  return needsProof ? 'Tu inscripción se guarda sin reservar cupo. Al adjuntar el comprobante obtenés lugar según disponibilidad.'
    : 'Tu cupo se reserva al inscribirte, sin adjuntar comprobante.'
}

export const canAssignInscriptionSlot = (tournament: {
  status?: string | null; bracket_status?: string | null; registration_locked?: boolean | null; registration_locked_by_capacity?: boolean | null
}): boolean => (!tournament.status || ['NOT_STARTED', 'PAIRING', 'ZONE_REGISTRATION', 'ZONE_PHASE'].includes(tournament.status))
  && !(tournament.registration_locked && !tournament.registration_locked_by_capacity)
  && !['BRACKET_GENERATED', 'BRACKET_ACTIVE'].includes(tournament.bracket_status || '')

export interface TournamentPaymentSettings {
  validate_inscriptions?: boolean
  enable_transfer_proof?: boolean
  reserve_slot_without_proof?: boolean
  allow_cash_payment?: boolean
  transfer_alias?: string | null
  transfer_amount?: number | null
}

export const validateTournamentPaymentSettings = (settings: TournamentPaymentSettings): string | null => {
  for (const key of ['validate_inscriptions', 'enable_transfer_proof', 'reserve_slot_without_proof', 'allow_cash_payment'] as const) {
    if (settings[key] !== undefined && typeof settings[key] !== 'boolean') return 'Las opciones de inscripción deben ser verdadero o falso.'
  }
  if (settings.validate_inscriptions === true) return 'La aprobación manual de inscripciones ya no se utiliza.'
  if (settings.transfer_alias != null && typeof settings.transfer_alias !== 'string') return 'El alias debe ser un texto.'
  if (settings.transfer_amount != null && (typeof settings.transfer_amount !== 'number' || !Number.isFinite(settings.transfer_amount))) return 'El importe de transferencia debe ser un número válido.'
  if (!settings.enable_transfer_proof) return null
  if (!settings.transfer_alias?.trim()) return 'El alias es obligatorio cuando la transferencia está activa.'
  if (typeof settings.transfer_amount !== 'number' || !Number.isFinite(settings.transfer_amount) || settings.transfer_amount <= 0) {
    return 'El importe de transferencia debe ser mayor a cero.'
  }
  return null
}
