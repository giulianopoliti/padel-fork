/**
 * POINTS APPLICATION SERVICE
 *
 * Handles applying calculated points to the database
 */

import { PointsCalculationResult } from '../types';

export class PointsApplicationService {
  /**
   * Applies calculated points to players and saves history
   *
   * @param result Points calculation result
   * @param supabase Supabase client
   */
  static async applyPoints(
    result: PointsCalculationResult,
    supabase: any
  ): Promise<{ success: boolean; message: string }> {
    console.log(
      `[PointsApplication] Applying points for tournament ${result.tournamentId}`
    );

    try {
      // 1. Update player scores
      await this.updatePlayerScores(result, supabase);

      // 2. Save match points couples
      await this.saveMatchPointsCouples(result, supabase);

      // 3. Save tournament history
      await this.saveTournamentHistory(result, supabase);

      // La recategorización se ejecuta por decisión del organizador desde su pantalla.

      console.log(
        `[PointsApplication] Successfully applied points for ${result.playerUpdates.length} players`
      );

      return {
        success: true,
        message: `Puntos aplicados correctamente a ${result.playerUpdates.length} jugadores`
      };
    } catch (error: any) {
      console.error(`[PointsApplication] Error applying points:`, error);
      return {
        success: false,
        message: `Error al aplicar puntos: ${error.message}`
      };
    }
  }

  /**
   * Updates player scores in database
   */
  private static async updatePlayerScores(
    result: PointsCalculationResult,
    supabase: any
  ): Promise<void> {
    console.log(`[PointsApplication] Updating scores for ${result.playerUpdates.length} players`);

    for (const update of result.playerUpdates) {
      const { error } = await supabase
        .from('players')
        .update({ score: update.newScore })
        .eq('id', update.playerId);

      if (error) {
        throw new Error(
          `Error updating player ${update.playerId}: ${error.message}`
        );
      }
    }
  }

  /**
   * Saves match points couples for history tracking
   */
  private static async saveMatchPointsCouples(
    result: PointsCalculationResult,
    supabase: any
  ): Promise<void> {
    if (result.matchPoints.length === 0) {
      console.log(`[PointsApplication] No match points to save`);
      return;
    }

    console.log(`[PointsApplication] Saving ${result.matchPoints.length} match points records`);

    // Check if table exists and has correct schema
    const { error } = await supabase
      .from('match_points_couples')
      .insert(result.matchPoints);

    if (error) {
      console.warn(`[PointsApplication] Could not save match points:`, error.message);
      // Non-critical error, continue - table exists but may have schema issues
    } else {
      console.log(`[PointsApplication] ✅ Saved ${result.matchPoints.length} match points records`);
    }
  }

  /**
   * Saves tournament history
   * Schema: player_tournament_history (player_id, tournament_id, points_before, points_after, points_earned)
   */
  private static async saveTournamentHistory(
    result: PointsCalculationResult,
    supabase: any
  ): Promise<void> {
    console.log(`[PointsApplication] Saving tournament history`);

    // Map to DB schema - only use columns that exist in player_tournament_history
    const historyRecords = result.playerUpdates.map((update) => ({
      tournament_id: result.tournamentId,
      player_id: update.playerId,
      points_before: update.currentScore,
      points_after: update.newScore,
      points_earned: update.totalPoints
      // Note: bonus_points, match_points, player_name are NOT in the table schema
    }));

    const { error } = await supabase
      .from('player_tournament_history')
      .insert(historyRecords);

    if (error) {
      console.error(`[PointsApplication] Error saving history:`, error);
      // Non-critical error, continue
    } else {
      console.log(`[PointsApplication] ✅ Saved history for ${historyRecords.length} players`);
    }
  }

  /**
   * Recategorizes players based on new scores
   */
  private static async recategorizePlayersIfNeeded(
    tournamentId: string,
    supabase: any
  ): Promise<void> {
    console.log(
      `[PointsApplication] Starting automatic recategorization for tournament ${tournamentId}`
    );

    try {
      // Import recategorization function from actions
      // Note: This should ideally be in a separate service too
      // Using dynamic import to avoid circular dependencies
      const actionsModule = await import('../../../../app/api/tournaments/actions');

      // Check if function exists (it may not be exported)
      if (typeof actionsModule.recategorizePlayersAfterPoints !== 'function') {
        console.log(
          `[PointsApplication] ⚠️ Recategorization function not available (not exported from actions.ts)`
        );
        return;
      }

      const stats = await actionsModule.recategorizePlayersAfterPoints(tournamentId, supabase);

      if (stats && stats.recategorized && stats.recategorized.length > 0) {
        console.log(
          `[PointsApplication] ✅ Recategorized ${stats.recategorized.length} players`
        );
      } else {
        console.log(
          `[PointsApplication] ✓ No recategorization needed`
        );
      }
    } catch (error: any) {
      // Recategorization is complementary, don't fail the main process
      console.warn(
        `[PointsApplication] ⚠️ Recategorization skipped (non-critical): ${error.message}`
      );
    }
  }

  /**
   * Validates that points can be applied
   */
  static async validateCanApplyPoints(
    tournamentId: string,
    supabase: any
  ): Promise<{ valid: boolean; error?: string }> {
    // Check tournament status
    const { data: tournament, error } = await supabase
      .from('tournaments')
      .select('status')
      .eq('id', tournamentId)
      .single();

    if (error || !tournament) {
      return { valid: false, error: 'Tournament not found' };
    }

    if (tournament.status === 'FINISHED_POINTS_CALCULATED') {
      return { valid: false, error: 'Points already calculated' };
    }

    if (tournament.status !== 'FINISHED_POINTS_PENDING') {
      return { valid: false, error: 'Tournament not ready for points calculation' };
    }

    return { valid: true };
  }
}
