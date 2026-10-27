import type { SupabaseClient } from '@supabase/supabase-js'
import type { PointsCalculationResult } from '../types'
import { POINTS_CONFIGS } from '../types'
import { PointsReviewError } from './points-review.engine'
import { loadPointsReview } from './points-review.service'

/** Compatibility adapter. The authoritative preview is read-only. */
export class PointsCalculatorService {
  static async calculateTournamentPoints(tournamentId: string, supabase: SupabaseClient): Promise<PointsCalculationResult> {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new PointsReviewError('Iniciá sesión para revisar los puntos.', 401)
    const { createClientServiceRole } = await import('@/utils/supabase/server')
    const { review, matchPoints } = await loadPointsReview(await createClientServiceRole(), tournamentId, user.id)
    return {
      tournamentId, tournamentType: review.tournamentType, totalMatches: review.totalMatches,
      config: POINTS_CONFIGS[review.tournamentType], matchPoints,
      playerUpdates: review.playerScores.map(player => ({
        playerId: player.playerId, playerName: player.playerName, pointsEarned: player.matchPoints ?? 0,
        bonus: player.bonus ?? 0, totalPoints: player.pointsEarned, currentScore: player.pointsBefore, newScore: player.pointsAfter,
      })),
    }
  }
}
