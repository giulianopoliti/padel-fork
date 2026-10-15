import { createClientServiceRole } from '@/utils/supabase/server'
import { TournamentValidationService } from '@/lib/services/tournament-validation.service'

jest.mock('@/utils/supabase/server', () => ({
  createClientServiceRole: jest.fn(),
}))

function createValidationSupabaseMock({
  tournament,
  coupleCount,
}: {
  tournament: Record<string, any>
  coupleCount: number
}) {
  const tournamentQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: tournament, error: null }),
  }

  const inscriptionsQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockResolvedValue({ count: coupleCount, error: null }),
  }

  return {
    from: jest.fn((table: string) => {
      if (table === 'tournaments') {
        return tournamentQuery
      }

      if (table === 'inscriptions') {
        return inscriptionsQuery
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

describe('TournamentValidationService capacity rules', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('allows registrations when the tournament still has room', async () => {
    ;(createClientServiceRole as jest.Mock).mockResolvedValue(
      createValidationSupabaseMock({
        tournament: {
          id: 'tournament-1',
          status: 'NOT_STARTED',
          registration_locked: false,
          registration_locked_by_capacity: false,
          bracket_status: 'NOT_STARTED',
          bracket_generated_at: null,
          max_participants: 16,
          created_at: '2026-06-01T12:00:00.000Z',
        },
        coupleCount: 15,
      }),
    )

    const result = await TournamentValidationService.validateCoupleRegistration('tournament-1')

    expect(result.allowed).toBe(true)
  })

  it('blocks registrations when the tournament is full', async () => {
    ;(createClientServiceRole as jest.Mock).mockResolvedValue(
      createValidationSupabaseMock({
        tournament: {
          id: 'tournament-1',
          status: 'NOT_STARTED',
          registration_locked: true,
          registration_locked_by_capacity: true,
          bracket_status: 'NOT_STARTED',
          bracket_generated_at: null,
          max_participants: 16,
          created_at: '2026-06-01T12:00:00.000Z',
        },
        coupleCount: 16,
      }),
    )

    const result = await TournamentValidationService.validateCoupleRegistration('tournament-1')

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('Tournament full')
  })
})
