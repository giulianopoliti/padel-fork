import { getFinalizationEligibility, getTournamentBonuses } from '@/lib/tournaments/finalization'
import { EloPointsCalculator } from '../calculators/elo-points.calculator'
import { POINTS_CONFIGS } from '../types/points-config.types'
import type {
  ManualCategoryDecision, PointsContextResponse, PointsReviewPlayer, PointsSettlementInput,
} from '../types/points-review.types'
import type { BracketKey } from '@/types/tournament-format-v2'

export class PointsReviewError extends Error {
  constructor(message: string, public readonly status = 409) { super(message) }
}

/** Pure calculation. Preview never creates snapshots or changes players. */
export const buildPointsReview = ({ context, fingerprint, settlement }: PointsContextResponse): PointsSettlementInput => {
  if (settlement) return { review: settlement, matchPoints: [] }
  const { tournament, categories, history } = context
  if (tournament.type !== 'AMERICAN' && tournament.type !== 'LONG') {
    throw new PointsReviewError('Este tipo de torneo no admite este cálculo de puntos.', 400)
  }
  if (tournament.status === 'FINISHED_POINTS_CALCULATED') {
    if (!history.length) throw new PointsReviewError('El torneo figura acreditado pero no tiene historial. Revisá el cierre antes de continuar.')
    return { matchPoints: [], review: {
      tournamentId: tournament.id, tournamentType: tournament.type, state: 'LEGACY', rulesVersion: 'legacy',
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
  const config = POINTS_CONFIGS[tournament.type]
  const bonuses = getTournamentBonuses(tournament, eligibility.bracketKeys)
  const players = new Map(context.players.map(player => [player.id, player]))
  const couples = new Map(context.couples.map(couple => [couple.id, couple]))
  const snapshots = new Map(context.snapshots.map(snapshot => [snapshot.player_id, snapshot]))
  if (snapshots.size !== context.snapshots.length) throw new PointsReviewError('Hay snapshots duplicados. Revisá la base de puntajes del torneo.')
  const registeredCouples = new Set(context.inscriptions.filter(row => row.couple_id && row.is_pending !== true).map(row => row.couple_id))
  const eligiblePlayers = new Set<string>()
  for (const row of context.inscriptions.filter(row => row.is_pending !== true)) {
    if (row.player_id) eligiblePlayers.add(row.player_id)
    const couple = row.couple_id ? couples.get(row.couple_id) : null
    for (const id of [couple?.player1_id, couple?.player2_id]) if (id) eligiblePlayers.add(id)
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
    })
    return updates.get(id)!
  }
  const getCouplePlayers = (id: string): string[] => {
    const couple = couples.get(id)
    if (!couple?.player1_id || !couple.player2_id || couple.player1_id === couple.player2_id || !registeredCouples.has(id)) {
      throw new PointsReviewError('Cada pareja debe tener dos jugadores distintos y una inscripción habilitada.')
    }
    return [couple.player1_id, couple.player2_id]
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
    const winners = getCouplePlayers(match.winner_id)
    const losers = getCouplePlayers(loserId)
    if (new Set([...winners, ...losers]).size !== 4) throw new PointsReviewError('Un jugador aparece en ambos lados de un partido.')
    if (disqualifiedMatches.has(match.id)) continue
    const average = (ids: string[]): number => ids.reduce((total, id) => total + (snapshots.get(id)?.score ?? players.get(id)!.score!), 0) / 2
    const { winnerPoints, loserPoints } = EloPointsCalculator.calculate(average(winners) - average(losers), config)
    for (const id of winners) getPlayerUpdate(id).matchPoints! += winnerPoints
    for (const id of losers) getPlayerUpdate(id).matchPoints! += loserPoints
    matchPoints.push({ match_id: match.id, winner_couple_id: match.winner_id, loser_couple_id: loserId, points_winner: winnerPoints, points_loser: loserPoints })
  }
  for (const final of matches.filter(match => match.type === 'ELIMINATION' && match.round === 'FINAL')) {
    const cup = (final.bracket_key || 'MAIN') as BracketKey
    const bonus = bonuses[cup]
    if (!bonus?.enabled || !final.winner_id || !final.couple1_id || !final.couple2_id) continue
    const finalist = final.winner_id === final.couple1_id ? final.couple2_id : final.couple1_id
    // Preserve the existing cup award policy, including a final decided by disqualification.
    for (const [coupleId, position, points] of [
      [final.winner_id, 'champion', bonus.champion], [finalist, 'finalist', bonus.finalist],
    ] as const) {
      for (const id of getCouplePlayers(coupleId)) {
        const update = getPlayerUpdate(id)
        update.bonus! += points
        update.bonusAwards.push({ cup, position, points })
      }
    }
  }
  let withSnapshot = 0
  const playerScores = [...updates.values()].sort((a, b) => a.playerName.localeCompare(b.playerName, 'es') || a.playerId.localeCompare(b.playerId))
  for (const update of playerScores) {
    if (snapshots.has(update.playerId)) withSnapshot++
    update.pointsEarned = update.matchPoints! + update.bonus!
    update.pointsAfter = update.pointsBefore + update.pointsEarned
    if (!Number.isSafeInteger(update.pointsAfter) || update.pointsAfter < -2147483648 || update.pointsAfter > 2147483647) throw new PointsReviewError('El puntaje resultante está fuera del rango permitido.')
  }
  return { matchPoints, review: {
    tournamentId: tournament.id, tournamentType: tournament.type, state: 'PREVIEW', rulesVersion: 'manual-categories-v1',
    fingerprint, playerScores, categories, bonuses, totalMatches: matchPoints.length,
    scoreBasis: withSnapshot === 0 ? 'CURRENT' : withSnapshot === playerScores.length ? 'SNAPSHOT' : 'MIXED',
  } }
}

export const applyManualCategoryDecisions = (input: PointsSettlementInput, decisions: ManualCategoryDecision[]): PointsSettlementInput => {
  const review = structuredClone(input.review)
  const seen = new Set<string>()
  for (const decision of decisions) {
    const player = review.playerScores.find(row => row.playerId === decision.playerId)
    if (!player || seen.has(decision.playerId)) throw new PointsReviewError('Las decisiones contienen jugadores ajenos o repetidos.', 400)
    if (!player.categoryBefore) throw new PointsReviewError('Primero asigná la categoría inicial del jugador desde su ficha.', 400)
    if (!review.categories.some(category => category.name === decision.newCategory)) throw new PointsReviewError('La categoría elegida no existe.', 400)
    seen.add(decision.playerId)
    player.categoryAfter = decision.newCategory
  }
  return { ...input, review }
}
