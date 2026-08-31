import type { TenantBranding } from '@/config/tenant'

interface TournamentTenantRegistrationPolicyInput {
  tenantKey: TenantBranding['key']
  tournamentType?: string | null
  enablePublicInscriptions?: boolean | null
}

export const shouldTreatTournamentRegistrationAsPublic = ({
  tenantKey,
  enablePublicInscriptions,
}: TournamentTenantRegistrationPolicyInput) => {
  // In TPE, organizers may hide the roster without closing registration.
  // Registration availability is still governed by status, capacity and the
  // manual registration lock.
  if (tenantKey === 'padel-elite') {
    return true
  }

  return Boolean(enablePublicInscriptions)
}
