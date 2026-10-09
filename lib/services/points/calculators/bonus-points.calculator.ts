/**
 * BONUS POINTS CALCULATOR
 *
 * Calculates and applies bonus points for tournament winners and finalists
 */

import { TournamentPointsConfig, BonusApplicationResult } from '../types';
import type { TournamentBonuses } from '@/lib/tournaments/finalization';
import type { BracketKey } from '@/types/tournament-format-v2';

export class BonusPointsCalculator {
  /**
   * Applies bonus points to tournament winner and finalist
   *
   * @param matches All tournament matches
   * @param playerPoints Map of player points (will be mutated)
   * @param config Points configuration
   * @param supabase Supabase client
   * @returns Result with champion and finalist IDs
   */
  static async applyFinalBonuses(
    matches: any[],
    playerPoints: Map<string, { earned: number; bonus: number }>,
    config: TournamentPointsConfig,
    supabase: any,
    bonuses?: TournamentBonuses
  ): Promise<BonusApplicationResult> {
    const result: BonusApplicationResult = {
      championIds: [],
      finalistIds: [],
      bonusApplied: false
    };

    const finals = matches.filter((match: any) =>
      match.type === 'ELIMINATION' && match.round === 'FINAL' && match.status === 'FINISHED' && match.winner_id
    );
    for (const final of finals) {
      const key = (final.bracket_key || 'MAIN') as BracketKey;
      const bonus = bonuses ? bonuses[key] : {
        enabled: key !== 'SILVER', champion: config.bonusChampion, finalist: config.bonusFinalist,
      };
      if (!bonus?.enabled) continue;
      const loserId = final.couple1_id === final.winner_id ? final.couple2_id : final.couple1_id;
      for (const [coupleId, points, ids] of [
        [final.winner_id, bonus.champion, result.championIds],
        [loserId, bonus.finalist, result.finalistIds],
      ] as [string | null, number, string[]][]) {
        if (!coupleId || points === 0) continue;
        const { data: couple, error } = await supabase.from('couples')
          .select('id, player1_id, player2_id').eq('id', coupleId).single();
        if (error || !couple) throw new Error('No se pudieron obtener los jugadores para los bonos de la final.');
        for (const playerId of [couple.player1_id, couple.player2_id]) {
          if (!playerId) continue;
          const current = playerPoints.get(playerId) ?? { earned: 0, bonus: 0 };
          current.bonus += points;
          playerPoints.set(playerId, current);
          ids.push(playerId);
        }
        result.bonusApplied = true;
      }
    }

    return result;
  }

  /**
   * Checks if a player received a bonus
   */
  static hasBonus(
    playerId: string,
    bonusResult: BonusApplicationResult
  ): { hasBonus: boolean; type?: 'champion' | 'finalist' } {
    if (bonusResult.championIds.includes(playerId)) {
      return { hasBonus: true, type: 'champion' };
    }
    if (bonusResult.finalistIds.includes(playerId)) {
      return { hasBonus: true, type: 'finalist' };
    }
    return { hasBonus: false };
  }
}
