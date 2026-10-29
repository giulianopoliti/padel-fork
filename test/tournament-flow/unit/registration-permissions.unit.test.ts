import { AmericanTournamentStrategy } from '@/lib/services/registration/american-tournament-strategy'
import { LongTournamentStrategy } from '@/lib/services/registration/long-tournament-strategy'
import { createClientServiceRole } from '@/utils/supabase/server'

jest.mock('@/utils/supabase/server', () => ({ createClientServiceRole: jest.fn() }))

const context = {
  tournament: {
    id: 'tournament-1',
    name: 'Test',
    type: 'LONG' as const,
    gender: 'MALE' as const,
    status: 'NOT_STARTED',
    validate_inscriptions: false,
  },
  user: { id: 'user-1', role: 'PLAYER' },
  supabase: {},
}

describe.each([
  ['LONG', () => new LongTournamentStrategy()],
  ['AMERICAN', () => new AmericanTournamentStrategy()],
])('%s registration authorization', (_type, createStrategy) => {
  it('rejects a forged organizer registration flag', async () => {
    const strategy = createStrategy()
    jest.spyOn(strategy as any, 'validateCoupleRegistration').mockResolvedValue({ isValid: true })
    jest.spyOn(strategy as any, 'checkRegistrationPermissions').mockResolvedValue({
      success: true,
      isOrganizer: false,
    })

    const result = await strategy.registerCouple({
      tournamentId: 'tournament-1',
      player1Id: 'player-1',
      player2Id: 'player-2',
      isOrganizerRegistration: true,
    }, context as any)

    expect(result).toEqual({
      success: false,
      error: 'No tiene permisos para registrar como organizador.',
    })
  })

  it('detects a player stored as the second member of an existing couple', async () => {
    const strategy = createStrategy() as any
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockResolvedValue({
        data: [{
          couples: {
            player1_id: 'another-player',
            player2_id: 'player-2',
          },
        }],
        error: null,
      }),
    }
    const supabase = { from: jest.fn().mockReturnValue(query) }
    jest.mocked(createClientServiceRole).mockResolvedValue(supabase as never)

    const result = await strategy.checkExistingPlayerInscriptions(
      'player-1',
      'player-2',
      'tournament-1',
      supabase
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('inscrito')
  })

  it.each([
    { actorRole: 'PLAYER', isOrganizerRegistration: false, expectedPending: false },
    { actorRole: 'ORGANIZADOR', isOrganizerRegistration: true, expectedPending: false },
  ])(
    'stores is_pending=$expectedPending for $actorRole registrations when validation is enabled',
    async ({ actorRole, isOrganizerRegistration, expectedPending }) => {
      const strategy = createStrategy() as any
      jest.spyOn(strategy, 'validateCoupleRegistration').mockResolvedValue({ isValid: true })
      jest.spyOn(strategy, 'checkRegistrationPermissions').mockResolvedValue({
        success: true,
        isOrganizer: actorRole === 'ORGANIZADOR',
      })
      jest.spyOn(strategy, 'categorizePlayers').mockResolvedValue({ success: true })
      jest.spyOn(strategy, 'checkExistingPlayerInscriptions').mockResolvedValue({ success: true })
      jest.spyOn(strategy, 'createOrFindCouple').mockResolvedValue({
        success: true,
        coupleId: 'couple-1',
      })

      if (_type === 'LONG') {
        jest.spyOn(strategy, 'assignCoupleToGeneralZone').mockResolvedValue({
          success: true,
          zoneId: 'zone-1',
        })
      }

      const existingQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      }
      const insert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'inscription-1' },
            error: null,
          }),
        }),
      })
      const supabase = {
        from: jest.fn()
          .mockReturnValueOnce(existingQuery)
          .mockReturnValueOnce({ insert }),
      }

      const result = await strategy.registerCouple({
        tournamentId: 'tournament-1',
        player1Id: 'player-1',
        player2Id: 'player-2',
        isOrganizerRegistration,
      }, {
        tournament: {
          ...context.tournament,
          type: _type,
          validate_inscriptions: true,
        },
        user: { id: 'user-1', role: actorRole },
        supabase,
      })

      expect(result.success).toBe(true)
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({
        is_pending: expectedPending,
      }))
    }
  )
})
