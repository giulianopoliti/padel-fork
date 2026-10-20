/**
 * POINTS CALCULATOR SERVICE
 *
 * Main orchestrator for tournament points calculation
 */

import { PointsConfigService } from '../config/points.config.service';
import { MatchPointsCalculator } from '../calculators/match-points.calculator';
import { BonusPointsCalculator } from '../calculators/bonus-points.calculator';
import {
  PointsCalculationResult,
  PlayerSnapshotMap,
  PlayerPointsUpdate,
  MatchPointsCouple,
  TournamentType
} from '../types';
import { getActiveDisqualificationMatchIds } from '@/lib/services/tournament-disqualifications';
import { getTournamentBonuses, loadTournamentFinalization } from '@/lib/tournaments/finalization';

export class PointsCalculatorService {
  /**
   * Calculates all points for a tournament
   *
   * Flow:
   * 1. Get tournament type
   * 2. Create snapshot of player scores
   * 3. Calculate points for all matches
   * 4. Apply final bonuses
   * 5. Build result with player updates
   */
  static async calculateTournamentPoints(
    tournamentId: string,
    supabase: any
  ): Promise<PointsCalculationResult> {
    console.log(`[PointsCalculator] Starting calculation for tournament ${tournamentId}`);

    const finalization = await loadTournamentFinalization(supabase, tournamentId);
    if (finalization.tournament.status !== 'FINISHED_POINTS_PENDING' || !finalization.allMatchesFinished) {
      throw new Error(finalization.reason || 'Primero finalizá el torneo antes de calcular puntos.');
    }

    // 1. Get tournament type
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('type')
      .eq('id', tournamentId)
      .single();

    if (tournamentError || !tournament) {
      throw new Error('Error fetching tournament type');
    }

    const tournamentType = tournament.type as TournamentType;
    const config = PointsConfigService.getConfig(tournamentType);

    console.log(
      `[PointsCalculator] Tournament type: ${tournamentType}, Config: ${PointsConfigService.getConfigDescription(tournamentType)}`
    );

    // 2. Create snapshot
    await this.createSnapshot(tournamentId, supabase);

    // 3. Load snapshot map
    const snapshotMap = await this.loadSnapshotMap(tournamentId, supabase);

    // 4. Get all finished matches
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('id, type, round, bracket_key, status, winner_id, couple1_id, couple2_id, bracket_is_active')
      .eq('tournament_id', tournamentId)
      .eq('bracket_is_active', true)
      .eq('status', 'FINISHED');

    if (matchesError) {
      throw new Error(`Error fetching matches (${matchesError.code}): ${matchesError.message}`);
    }

    const disqualifiedMatchIds = await getActiveDisqualificationMatchIds(tournamentId, supabase);
    const pointEligibleMatches = (matches || []).filter((match: any) =>
      match.bracket_is_active !== false && !disqualifiedMatchIds.has(match.id) &&
      match.winner_id && match.couple1_id && match.couple2_id
    );

    console.log(`[PointsCalculator] Processing ${pointEligibleMatches.length} finished matches (${disqualifiedMatchIds.size} disqualified matches excluded)`);

    // 5. Calculate points per match
    const playerPoints = new Map<string, { earned: number; bonus: number }>();
    const matchPointsCouples: Omit<MatchPointsCouple, 'id' | 'created_at'>[] = [];

    for (const match of pointEligibleMatches) {
      if (!match.winner_id || !match.couple1_id || !match.couple2_id) {
        console.warn(`[PointsCalculator] Skipping incomplete match ${match.id}`);
        continue;
      }

      const matchPlayerPoints = await MatchPointsCalculator.calculateForMatch(
        match,
        snapshotMap,
        config,
        supabase
      );

      // Accumulate points per player
      matchPlayerPoints.forEach((mp) => {
        if (!playerPoints.has(mp.playerId)) {
          playerPoints.set(mp.playerId, { earned: 0, bonus: 0 });
        }
        const current = playerPoints.get(mp.playerId)!;
        current.earned += mp.points;
      });

      // Track match points for couples
      const winnerPointsValue =
        matchPlayerPoints.find((mp) => mp.points > 0)?.points ?? config.baseWinner;
      const loserPointsValue =
        matchPlayerPoints.find((mp) => mp.points < 0)?.points ?? config.baseLoser;

      const winnerIsCouple1 = match.winner_id === match.couple1_id;
      const loserId = winnerIsCouple1 ? match.couple2_id : match.couple1_id;

      matchPointsCouples.push({
        match_id: match.id,
        winner_couple_id: match.winner_id,
        loser_couple_id: loserId,
        points_winner: winnerPointsValue,  // ✅ DB column name
        points_loser: loserPointsValue     // ✅ DB column name
      });
    }

    // 6. Apply final bonuses
    await BonusPointsCalculator.applyFinalBonuses(
      matches,
      playerPoints,
      config,
      supabase,
      getTournamentBonuses(finalization.tournament, finalization.bracketKeys)
    );

    // 7. Build result with player updates
    const result = await this.buildPlayerUpdates(
      tournamentId,
      tournamentType,
      playerPoints,
      pointEligibleMatches.length,
      config,
      matchPointsCouples,
      supabase
    );

    console.log(
      `[PointsCalculator] Calculation complete: ${result.playerUpdates.length} players, ${result.totalMatches} matches`
    );

    return result;
  }

  /**
   * Creates a snapshot of player scores at tournament start
   */
  private static async createSnapshot(
    tournamentId: string,
    supabase: any
  ): Promise<void> {
    console.log(`[PointsCalculator] Creating tournament snapshot`);

    // Check if snapshot already exists
    const { data: existingSnapshot } = await supabase
      .from('ranking_snapshots')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('snapshot_type', 'tournament_start')
      .limit(1);

    if (existingSnapshot && existingSnapshot.length > 0) {
      console.log(`[PointsCalculator] Snapshot already exists, skipping creation`);
      return;
    }

    // Get all players in tournament
    const allPlayerIds = new Set<string>();

    // Individual inscriptions
    const { data: individualInscriptions } = await supabase
      .from('inscriptions')
      .select('player_id')
      .eq('tournament_id', tournamentId)
      .is('couple_id', null)
      .not('player_id', 'is', null);

    individualInscriptions?.forEach((inscription: any) => {
      if (inscription.player_id) allPlayerIds.add(inscription.player_id);
    });

    // Couple inscriptions
    const { data: coupleInscriptions } = await supabase
      .from('inscriptions')
      .select(`
        couple_id,
        couples!inner(
          player1_id,
          player2_id
        )
      `)
      .eq('tournament_id', tournamentId)
      .not('couple_id', 'is', null);

    coupleInscriptions?.forEach((inscription: any) => {
      if (inscription.couples) {
        const couple = Array.isArray(inscription.couples)
          ? inscription.couples[0]
          : inscription.couples;
        if (couple.player1_id) allPlayerIds.add(couple.player1_id);
        if (couple.player2_id) allPlayerIds.add(couple.player2_id);
      }
    });

    // Get player data
    const { data: players } = await supabase
      .from('players')
      .select('id, first_name, last_name, score, category_name')
      .in('id', Array.from(allPlayerIds));

    // Create snapshot records
    const snapshotRecords = players?.map((player: any) => ({
      tournament_id: tournamentId,
      player_id: player.id,
      player_name: `${player.first_name} ${player.last_name}`,
      score: player.score || 0,
      category: player.category_name || null,
      snapshot_type: 'tournament_start'
    }));

    if (snapshotRecords && snapshotRecords.length > 0) {
      const { error: insertError } = await supabase
        .from('ranking_snapshots')
        .insert(snapshotRecords);

      if (insertError) {
        throw new Error(`Error creating snapshot: ${insertError.message}`);
      }

      console.log(`[PointsCalculator] Created snapshot for ${snapshotRecords.length} players`);
    }
  }

  /**
   * Loads snapshot map for fast lookup
   */
  private static async loadSnapshotMap(
    tournamentId: string,
    supabase: any
  ): Promise<PlayerSnapshotMap> {
    const { data: snapshotData, error: snapshotError } = await supabase
      .from('ranking_snapshots')
      .select('player_id, score, category, player_name')
      .eq('tournament_id', tournamentId)
      .eq('snapshot_type', 'tournament_start');

    if (snapshotError) {
      throw new Error('Error fetching tournament snapshot');
    }

    const snapshotMap: PlayerSnapshotMap = new Map();
    (snapshotData || []).forEach((player: any) => {
      snapshotMap.set(player.player_id, {
        score: player.score,
        category: player.category,
        playerName: player.player_name
      });
    });

    console.log(`[PointsCalculator] Loaded snapshot for ${snapshotMap.size} players`);

    return snapshotMap;
  }

  /**
   * Builds player updates with current and new scores
   */
  private static async buildPlayerUpdates(
    tournamentId: string,
    tournamentType: TournamentType,
    playerPoints: Map<string, { earned: number; bonus: number }>,
    totalMatches: number,
    config: any,
    matchPointsCouples: Omit<MatchPointsCouple, 'id' | 'created_at'>[],
    supabase: any
  ): Promise<PointsCalculationResult> {
    const playerIds = Array.from(playerPoints.keys());

    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, first_name, last_name, score')
      .in('id', playerIds);

    if (playersError) {
      throw new Error('Error fetching players for updates');
    }

    const playerUpdates: PlayerPointsUpdate[] = players.map((player: any) => {
      const points = playerPoints.get(player.id)!;
      const totalEarned = points.earned + points.bonus;
      const currentScore = player.score || 0;
      const newScore = currentScore + totalEarned;

      return {
        playerId: player.id,
        playerName: `${player.first_name} ${player.last_name}`,
        pointsEarned: points.earned,
        bonus: points.bonus,
        totalPoints: totalEarned,
        currentScore,
        newScore
      };
    });

    return {
      tournamentId,
      tournamentType,
      playerUpdates,
      totalMatches,
      config,
      matchPoints: matchPointsCouples
    };
  }
}
