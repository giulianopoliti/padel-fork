import { shouldTreatTournamentRegistrationAsPublic } from '../tenant-registration-policy'

describe('tenant registration policy', () => {
  it('keeps TPE registration available even when the public roster is hidden', () => {
    expect(
      shouldTreatTournamentRegistrationAsPublic({
        tenantKey: 'padel-elite',
        tournamentType: 'AMERICAN',
        enablePublicInscriptions: false,
      })
    ).toBe(true)
  })

  it('keeps the existing registration flag behavior for Padel FV', () => {
    expect(
      shouldTreatTournamentRegistrationAsPublic({
        tenantKey: 'padel-fv',
        tournamentType: 'LONG',
        enablePublicInscriptions: false,
      })
    ).toBe(false)
  })
})
