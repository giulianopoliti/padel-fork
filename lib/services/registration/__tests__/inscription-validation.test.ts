import {
  getTournamentInscriptionPendingState,
  shouldRequireInscriptionValidation,
} from '@/lib/services/registration/inscription-validation'

describe('inscription validation policy', () => {
  it.each(['PLAYER', 'COACH', undefined])(
    'keeps registration direct for a %s actor even with an old validation flag',
    (actorRole) => {
      expect(shouldRequireInscriptionValidation({
        validateInscriptions: true,
        actorRole,
      })).toBe(false)
    }
  )

  it.each(['ADMIN', 'CLUB', 'ORGANIZADOR'])(
    'keeps organizer registration direct for role %s',
    (actorRole) => {
      expect(shouldRequireInscriptionValidation({
        validateInscriptions: true,
        actorRole,
      })).toBe(false)
    }
  )

  it('keeps player registration direct when validation is disabled', () => {
    expect(shouldRequireInscriptionValidation({
      validateInscriptions: false,
      actorRole: 'PLAYER',
    })).toBe(false)
  })

  it('honors an authorized organizer registration flag', () => {
    expect(shouldRequireInscriptionValidation({
      validateInscriptions: true,
      actorRole: 'PLAYER',
      isOrganizerRegistration: true,
    })).toBe(false)
  })

  it('loads the tournament setting for legacy registration paths', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { validate_inscriptions: true },
        error: null,
      }),
    }
    const supabase = { from: jest.fn().mockReturnValue(query) }

    await expect(getTournamentInscriptionPendingState({
      supabase,
      tournamentId: 'tournament-1',
      actorRole: 'PLAYER',
    })).resolves.toBe(false)
  })

  it('fails closed when the tournament setting cannot be loaded', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'query failed' },
      }),
    }
    const supabase = { from: jest.fn().mockReturnValue(query) }

    await expect(getTournamentInscriptionPendingState({
      supabase,
      tournamentId: 'tournament-1',
      actorRole: 'PLAYER',
    })).rejects.toThrow('query failed')
  })
})
