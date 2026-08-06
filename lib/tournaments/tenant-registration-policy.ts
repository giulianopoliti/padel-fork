import type { TenantBranding } from '@/config/tenant'

interface TournamentTenantRegistrationPolicyInput {
  tenantKey: TenantBranding['key']
  tournamentType?: string | null
  enablePublicInscriptions?: boolean | null
}

export const shouldTreatTournamentRegistrationAsPublic = ({
  tenantKey,
  tournamentType,
  enablePublicInscriptions,
}: TournamentTenantRegistrationPolicyInput) => {
  if (tenantKey === 'padel-elite' && tournamentType === 'AMERICAN') {
    return true
  }

  return Boolean(enablePublicInscriptions)
}
