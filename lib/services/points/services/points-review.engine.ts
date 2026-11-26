import { getFinalizationEligibility, getTournamentBonuses } from '@/lib/tournaments/finalization'
import { resolveTournamentCategoryConfig } from '@/lib/services/tournament-category-config'
import { EloPointsCalculator } from '../calculators/elo-points.calculator'
import { FIXED_RANKING, getFixedRankingPolicy } from '../config/fixed-ranking'
import { POINTS_CONFIGS } from '../types/points-config.types'
import type {
  BonusAward, PointsContextResponse, PointsReviewPlayer, PointsSettlementInput, PointsTournamentResult,
} from '../types/points-review.types'
import type { BracketKey } from '@/types/tournament-format-v2'

import { PointsReviewError } from './points-review-error'
import { compareTournamentResults } from './points-review-results'
export { PointsReviewError } from './points-review-error'
export { applyManualCategoryDecisions } from './points-review-decisions'

/** Pure calculation. Preview never creates snapshots or changes players. */
export const buildPointsReview = ({ context, fingerprint, settlement }: PointsContextResponse): PointsSettlementInput => {
  if (settlement) return { review: settlement, matchPoints: [] }
  const { tournament, categories, history } = context
  const policy = getFixedRankingPolicy(context.rankingPolicy, tournament.type)
  const fixed = policy ? FIXED_RANKING[policy] : null
  const tournamentType = tournament.type === 'LONG' ? 'LONG' : 'AMERICAN'
  if (tournament.type !== 'AMERICAN' && tournament.type !== 'LONG' && policy !== 'ELITE_AMERICAN') {
    throw new PointsReviewError('Este tipo de torneo no admite este cálculo de puntos.', 400)
  }
  if (tournament.status === 'FINISHED_POINTS_CALCULATED') {
    if (!history.length) throw new PointsReviewError('El torneo figura acreditado pero no tiene historial. Revisá el cierre antes de continuar.')
    return { matchPoints: [], review: {
      tournamentId: tournament.id, tournamentType, state: 'LEGACY', rulesVersion: 'legacy',
      fingerprint, categories, bonuses: {}, totalMatches: 0, scoreBasis: 'LEGACY',
      playerScores: history.map(row => {
        const player = context.players.find(candidate => candidate.id === row.player_id)
        return {
          playerId: row.player_id, playerName: player ? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() : 'Jugador del historial',
          categoryBefore: null, categoryAfter: null, pointsBefore: row.points_before,
          matchPoints: null, bonus: null, bonusAwards: [], pointsEarned: row.points_earned, pointsAfter: row.points_after,
        }
      }),
    } }
  }
  const eligibility = getFinalizationEligibility(tournament, context.matches)
  if (tournament.status !== 'FINISHED_POINTS_PENDING' || !eligibility.allMatchesFinished) {
    throw new PointsReviewError(eligibility.reason || 'Primero finalizá el torneo para revisar sus puntos.')
  }
  if (history.length) throw new PointsReviewError('Este torneo tiene movimientos previos. Revisá el historial para evitar acreditar puntos dos veces.')
  const config = POINTS_CONFIGS[tournamentType]
  const bonuses = fixed ? {} : getTournamentBonuses(tournament, eligibility.bracketKeys)
  const categoryConfig = resolveTournamentCategoryConfig(tournament)
  const titleCategory = categoryConfig?.mode === 'SINGLE' ? categoryConfig.category : null
  const players = new Map(context.players.map(player => [player.id, player]))
  const couples = new Map(context.couples.map(couple => [couple.id, couple]))
  const snapshots = new Map(context.snapshots.map(snapshot => [snapshot.player_id, snapshot]))
  if (!fixed && snapshots.size !== context.snapshots.length) throw new PointsReviewError('Hay snapshots duplicados. Revisá la base de puntajes del torneo.')
  const registeredCouples = new Set(context.inscriptions.filter(row => row.couple_id && row.is_pending !== true).map(row => row.couple_id))
  const eligiblePlayers = new Set<string>()
  for (const row of context.inscriptions.filter(row => row.is_pending !== true)) {
    if (row.player_id) eligiblePlayers.add(row.player_id)
    const couple = row.couple_id ? couples.get(row.couple_id) : null
    for (const id of [couple?.player1_id, couple?.player2_id]) if (id) eligiblePlayers.add(id)
  }
  const lineups = new Map<string, [string, string]>()
  for (const lineup of tournament.type === 'LONG' ? context.lineups ?? [] : []) {
    if (!registeredCouples.has(lineup.couple_id)) throw new PointsReviewError('Una suplencia pertenece a una pareja sin inscripción habilitada.')
    lineups.set(`${lineup.match_id}:${lineup.couple_id}`, [lineup.player1_id, lineup.player2_id])
    eligiblePlayers.add(lineup.substitute_slot === 1 ? lineup.player1_id : lineup.player2_id)
  }
  const updates = new Map<string, PointsReviewPlayer>()
  const getPlayerUpdate = (id: string): PointsReviewPlayer => {
    const player = players.get(id)
    if (!player || !eligiblePlayers.has(id)) throw new PointsReviewError('Hay jugadores sin inscripción válida. Revisá los participantes del torneo.')
    if (!Number.isSafeInteger(player.score)) throw new PointsReviewError('Todos los participantes deben tener un puntaje válido antes de acreditar.')
    if (!updates.has(id)) updates.set(id, {
      playerId: id, playerName: `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
      categoryBefore: player.category_name, categoryAfter: player.category_name,
      pointsBefore: player.score!, matchPoints: 0, bonus: 0, bonusAwards: [], pointsEarned: 0, pointsAfter: player.score!,
      wins: 0, matchesPlayed: 0,
      ...(fixed ? { rankingCategory: titleCategory ?? snapshots.get(id)?.category ?? player.category_name } : {}),
    })
    return updates.get(id)!
  }
  const getCouplePlayers = (matchId: string, id: string): string[] => {
    const couple = couples.get(id)
    if (!couple?.player1_id || !couple.player2_id || couple.player1_id === couple.player2_id || !registeredCouples.has(id)) {
      throw new PointsReviewError('Cada pareja debe tener dos jugadores distintos y una inscripción habilitada.')
    }
    return lineups.get(`${matchId}:${id}`) ?? [couple.player1_id, couple.player2_id]
  }
  // Include all approved participants, even when their net movement is zero.
  for (const id of eligiblePlayers) getPlayerUpdate(id)
  if (!updates.size) throw new PointsReviewError('No hay participantes habilitados para acreditar puntos.')
  const disqualifiedMatches = new Set(context.disqualifications.map(row => row.match_id).filter(Boolean))
  const matches = context.matches.filter(match => match.bracket_is_active !== false)
  const matchPoints: PointsSettlementInput['matchPoints'] = []
  for (const match of matches) {
    if (!match.winner_id || ![match.couple1_id, match.couple2_id].includes(match.winner_id)) {
      throw new PointsReviewError('Hay un partido terminado sin ganador válido. Revisá sus resultados.')
    }
    if (!match.couple1_id || !match.couple2_id) {
      if (match.type === 'ELIMINATION' && match.round === 'FINAL') throw new PointsReviewError('La final debe tener campeón y subcampeón válidos.')
      continue // BYE: no match points.
    }
    const loserId = match.winner_id === match.couple1_id ? match.couple2_id : match.couple1_id
    const winners = getCouplePlayers(match.id, match.winner_id)
    const losers = getCouplePlayers(match.id, loserId)
    if (new Set([...winners, ...losers]).size !== 4) throw new PointsReviewError('Un jugador aparece en ambos lados de un partido.')
    if (disqualifiedMatches.has(match.id) || (fixed && match.administrative_result)) continue
    const average = (ids: string[]): number => ids.reduce((total, id) => total + (snapshots.get(id)?.score ?? players.get(id)!.score!), 0) / 2
    const { winnerPoints, loserPoints } = fixed
      ? { winnerPoints: fixed.win, loserPoints: 0 }
      : EloPointsCalculator.calculate(average(winners) - average(losers), config)
    for (const id of winners) {
      const player = getPlayerUpdate(id)
      player.matchPoints! += winnerPoints
      player.wins!++
      player.matchesPlayed!++
    }
    for (const id of losers) {
      const player = getPlayerUpdate(id)
      player.matchPoints! += loserPoints
      player.matchesPlayed!++
    }
    matchPoints.push({ match_id: match.id, winner_couple_id: match.winner_id, loser_couple_id: loserId, points_winner: winnerPoints, points_loser: loserPoints })
  }
  const finals = matches.filter(match => match.type === 'ELIMINATION' && match.round === 'FINAL')
  if (fixed) {
    const award = (player: PointsReviewPlayer, entry: BonusAward): void => {
      if (entry.points <= player.bonus!) return
      player.bonus = entry.points
      player.bonusAwards = [entry]
    }
    const eliminationBonuses: Record<string, number> = fixed.eliminated
    for (const match of matches) {
      if (match.type !== 'ELIMINATION' || match.bracket_key === 'SILVER' || !match.couple1_id || !match.couple2_id || !match.round) continue
      const points = eliminationBonuses[match.round]
      if (!points) continue
      const loserId = match.winner_id === match.couple1_id ? match.couple2_id : match.couple1_id
      for (const id of getCouplePlayers(match.id, loserId)) {
        award(getPlayerUpdate(id), { cup: (match.bracket_key || 'MAIN') as BracketKey,
          position: (match.round === 'FINAL' ? 'finalist' : match.round) as BonusAward['position'], points })
      }
    }

    const final = finals.find(match => match.bracket_key !== 'SILVER')
    const champion = final?.winner_id ?? (eligibility.bracketKeys.length === 0 ? context.roundRobinChampion : null)
    if (policy === 'ELITE_AMERICAN' && eligibility.bracketKeys.length === 0 && !champion) {
      throw new PointsReviewError('Confirmá la pareja campeona en la tabla definitiva de la zona antes de acreditar.')
    }
    if (champion) {
      const cup = (final?.bracket_key || 'MAIN') as BracketKey
      const titleHasSubstitute = final ? (context.lineups ?? []).some(lineup => lineup.match_id === final.id) : false
      const administrativeFinal = final ? disqualifiedMatches.has(final.id) || final.administrative_result : false
      const canPromote = policy === 'FV_LEAGUE' && final && titleCategory && !titleHasSubstitute && !administrativeFinal && !tournament.es_prueba
      const level = categories.find(category => category.name === titleCategory)?.level
      const destination = level && level >= 4 && level <= 8 ? categories.find(category => category.level === level - 1)?.name : undefined
      for (const id of getCouplePlayers(final?.id ?? '', champion)) {
        const player = getPlayerUpdate(id)
        player.champion = true
        player.titleMatchId = final?.id ?? null
        if (canPromote && destination && player.categoryBefore === titleCategory &&
          (!snapshots.get(id)?.category || snapshots.get(id)?.category === titleCategory)) {
          player.automaticPromotion = true
          player.categoryAfter = destination
        } else {
          award(player, { cup, position: 'champion', points: fixed.champion })
          if (policy === 'FV_LEAGUE' && (!canPromote || (level !== 3 && !destination))) player.promotionNeedsReview = true
        }
      }
    }
  }
  for (const final of fixed ? [] : finals) {
    const cup = (final.bracket_key || 'MAIN') as BracketKey
    const bonus = bonuses[cup]
    if (!bonus?.enabled || !final.winner_id || !final.couple1_id || !final.couple2_id) continue
    const finalist = final.winner_id === final.couple1_id ? final.couple2_id : final.couple1_id
    // Preserve the existing cup award policy, including a final decided by disqualification.
    for (const [coupleId, position, points] of [
      [final.winner_id, 'champion', bonus.champion], [finalist, 'finalist', bonus.finalist],
    ] as const) {
      for (const id of getCouplePlayers(final.id, coupleId)) {
        const update = getPlayerUpdate(id)
        update.bonus! += points
        update.bonusAwards.push({ cup, position, points })
      }
    }
  }
  // Record sporting results independently of points and promotion decisions.
  // Do not invent numbered places for tied rounds or incomplete local fixtures.
  const assignResult = (coupleId: string, ids: string[], result: Omit<PointsTournamentResult, 'coupleId' | 'coupleName'>): void => {
    const entry: PointsTournamentResult = { ...result, coupleId,
      coupleName: ids.map(id => getPlayerUpdate(id).playerName).join(' / ') }
    for (const id of ids) {
      const player = getPlayerUpdate(id)
      if (!player.tournamentResult || compareTournamentResults(entry, player.tournamentResult) < 0) player.tournamentResult = entry
    }
  }
  for (const coupleId of registeredCouples) {
    const couple = couples.get(coupleId!)
    const ids = [couple?.player1_id, couple?.player2_id].filter((id): id is string => !!id && eligiblePlayers.has(id))
    assignResult(coupleId!, ids, { cup: null, stage: 'NO_MATCHES' })
  }
  for (const player of updates.values()) {
    if (!player.tournamentResult) player.tournamentResult = {
      coupleId: 'individual:' + player.playerId, coupleName: player.playerName, cup: null, stage: 'NO_MATCHES',
    }
  }
  const eliminationStages = new Set(['SEMIFINAL', '4TOS', '8VOS', '16VOS', '32VOS'])
  for (const match of matches) {
    for (const coupleId of [match.couple1_id, match.couple2_id]) {
      if (!coupleId) continue
      const ids = getCouplePlayers(match.id, coupleId)
      const winner = match.winner_id === coupleId
      const stage: PointsTournamentResult['stage'] = match.type !== 'ELIMINATION'
        ? context.roundRobinChampion === coupleId ? 'champion' : 'ZONE'
        : match.round === 'FINAL' ? winner ? 'champion' : 'finalist'
          : !winner && eliminationStages.has(match.round ?? '') ? match.round as PointsTournamentResult['stage'] : 'UNRESOLVED'
      assignResult(coupleId, ids, { cup: match.type === 'ELIMINATION' ? (match.bracket_key || 'MAIN') as BracketKey : null,
        stage, lastRound: match.round })
    }
  }
  let withSnapshot = 0
  const playerScores = [...updates.values()].sort((a, b) => a.playerName.localeCompare(b.playerName, 'es') || a.playerId.localeCompare(b.playerId))
  for (const update of playerScores) {
    if (snapshots.has(update.playerId)) withSnapshot++
    update.pointsEarned = update.matchPoints! + update.bonus!
    const inCurrentCategory = !fixed || update.rankingCategory === update.categoryBefore
    update.pointsAfter = update.automaticPromotion ? 0 : update.pointsBefore + (inCurrentCategory ? update.pointsEarned : 0)
    if (fixed && inCurrentCategory) update.categoryPointsAfter = update.pointsBefore + update.pointsEarned
    if (!Number.isSafeInteger(update.pointsAfter) || update.pointsAfter < -2147483648 || update.pointsAfter > 2147483647) throw new PointsReviewError('El puntaje resultante está fuera del rango permitido.')
  }
  return { matchPoints, review: {
    tournamentId: tournament.id, tournamentType, state: 'PREVIEW', rulesVersion: fixed ? 'fixed-ranking-v1' : 'manual-categories-v1',
    fingerprint, playerScores, categories, bonuses, totalMatches: matchPoints.length,
    scoreBasis: fixed ? 'FIXED' : withSnapshot === 0 ? 'CURRENT' : withSnapshot === playerScores.length ? 'SNAPSHOT' : 'MIXED',
    ...(!fixed && context.snapshots.some(snapshot => snapshot.basis === 'SUBSTITUTION') ? { hasSubstitutionBaselines: true } : {}),
  } }
}
