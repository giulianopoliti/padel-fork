jest.mock('@/app/api/tournaments/actions', () => ({
  advanceWinnerUsingHierarchy: jest.fn(async () => ({ success: true, message: 'advanced' })),
}))
jest.mock('@/lib/services/registration/registration-readiness', () => ({
  assertRegistrationExclusionsReviewed: jest.fn(async () => {}),
}))

import { generateBracketFromSeeding } from '@/utils/bracket-generator-core'
import { assertRegistrationExclusionsReviewed } from '@/lib/services/registration/registration-readiness'

const query = (terminal: any = { data: null, error: null }) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  then: (resolve: any) => resolve(terminal),
})

describe('tournament flow unit: bracket state', () => {
  it('deletes match_hierarchy before matches and fails if tournament state update fails', async () => {
    const order: string[] = []
    const seeds = query({
      data: [
        { couple_id: 'c1', seed: 1, bracket_position: 1 },
        { couple_id: 'c2', seed: 2, bracket_position: 2 },
      ],
      error: null,
    })
    const deleteHierarchy = query({ data: null, error: null })
    const deleteMatches = query({ data: null, error: null })
    const insertMatches = query({
      data: [
        {
          id: 'match-1',
          round: 'FINAL',
          status: 'PENDING',
          couple1_id: 'c1',
          couple2_id: 'c2',
          winner_id: null,
        },
      ],
      error: null,
    })
    const updateTournament = query({ data: null, error: { message: 'missing state permission' } })

    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'tournament_couple_seeds') return seeds
        if (table === 'match_hierarchy') {
          order.push('match_hierarchy')
          return deleteHierarchy
        }
        if (table === 'matches' && order.length === 1) {
          order.push('matches-delete')
          return deleteMatches
        }
        if (table === 'matches') return insertMatches
        return updateTournament
      }),
    }

    await expect(generateBracketFromSeeding('tournament-1', supabase)).rejects.toThrow(
      'Error updating tournament bracket status'
    )

    expect(order).toEqual(['match_hierarchy', 'matches-delete'])
    expect(assertRegistrationExclusionsReviewed).toHaveBeenCalledWith('tournament-1')
    expect(updateTournament.update).toHaveBeenCalledWith(expect.objectContaining({
      bracket_status: 'BRACKET_GENERATED',
      status: 'BRACKET_PHASE',
      bracket_generated_at: expect.any(String),
    }))
    expect(updateTournament.update.mock.calls[0][0]).not.toHaveProperty('updated_at')
  })
})
