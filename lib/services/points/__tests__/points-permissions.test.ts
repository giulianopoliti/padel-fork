jest.mock('@/utils/supabase/server', () => ({ createClientServiceRole: jest.fn() }))
jest.mock('../services/points-review.service', () => ({ loadPointsReview: jest.fn() }))

import type { SupabaseClient } from '@supabase/supabase-js'
import { PointsCalculatorService } from '../services/points.calculator.service'
import { PointsApplicationService } from '../services/points.application.service'
import { loadPointsReview } from '../services/points-review.service'
import { createClientServiceRole } from '@/utils/supabase/server'

describe('Legacy points adapters', () => {
  it('requires an authenticated actor and uses the reviewed read-only service', async () => {
    const service = {} as SupabaseClient
    jest.mocked(createClientServiceRole).mockResolvedValue(service)
    jest.mocked(loadPointsReview).mockResolvedValue({ review: {
      tournamentType: 'AMERICAN', totalMatches: 1,
      playerScores: [{ playerId: 'p1', playerName: 'Player', pointsBefore: 890, pointsAfter: 932, pointsEarned: 42, matchPoints: 12, bonus: 30 }],
    }, matchPoints: [] } as never)
    const userClient = { auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'owner' } } })) } } as unknown as SupabaseClient
    const result = await PointsCalculatorService.calculateTournamentPoints('tournament', userClient)
    expect(loadPointsReview).toHaveBeenCalledWith(service, 'tournament', 'owner')
    expect(result.playerUpdates[0]).toMatchObject({ totalPoints: 42, newScore: 932 })
    const anonymous = { auth: { getUser: jest.fn(async () => ({ data: { user: null } })) } } as unknown as SupabaseClient
    await expect(PointsCalculatorService.calculateTournamentPoints('tournament', anonymous)).rejects.toThrow('Iniciá sesión')
  })
  it('never lets an old caller bypass atomic confirmation with a calculated payload', async () => {
    const update = jest.fn()
    const client = { from: update } as unknown as SupabaseClient
    const result = await PointsApplicationService.applyPoints({} as never, client)
    expect(result.success).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })
})
