export interface TournamentRegistrationAvailabilityInput {
  status?: string | null
  enablePublicInscriptions?: boolean | null
  registrationLocked?: boolean | null
  bracketStatus?: string | null
  isFull?: boolean | null
  allowActivePhaseRegistration?: boolean
}

const DEFAULT_PUBLIC_REGISTRATION_STATUSES = new Set(['NOT_STARTED'])

const ACTIVE_PHASE_PUBLIC_REGISTRATION_STATUSES = new Set([
  ...DEFAULT_PUBLIC_REGISTRATION_STATUSES,
  'ZONE_PHASE',
  'ZONE_REGISTRATION',
])

const LOCKED_BRACKET_STATUSES = new Set([
  'BRACKET_GENERATED',
  'BRACKET_ACTIVE',
])

export const canShowPublicRegistration = ({
  status,
  enablePublicInscriptions,
  registrationLocked,
  bracketStatus,
  isFull,
  allowActivePhaseRegistration = false,
}: TournamentRegistrationAvailabilityInput) => {
  if (!enablePublicInscriptions || registrationLocked || isFull) {
    return false
  }

  const publicRegistrationStatuses = allowActivePhaseRegistration
    ? ACTIVE_PHASE_PUBLIC_REGISTRATION_STATUSES
    : DEFAULT_PUBLIC_REGISTRATION_STATUSES

  if (!status || !publicRegistrationStatuses.has(status)) {
    return false
  }

  return !bracketStatus || !LOCKED_BRACKET_STATUSES.has(bracketStatus)
}

export const getPublicRegistrationClosedLabel = ({
  isFull,
}: Pick<TournamentRegistrationAvailabilityInput, 'isFull'>) => {
  if (isFull) {
    return 'Torneo completo'
  }

  return 'Inscripciones cerradas'
}
