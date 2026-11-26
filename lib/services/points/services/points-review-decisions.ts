import { FIXED_RANKING } from '../config/fixed-ranking'
import type { ManualCategoryDecision, PointsSettlementInput } from '../types/points-review.types'
import { PointsReviewError } from './points-review-error'

/** Shared by the preview and server; clients submit decisions, never scores. */
export const applyManualCategoryDecisions = (input: PointsSettlementInput, decisions: ManualCategoryDecision[]): PointsSettlementInput => {
  const review = structuredClone(input.review)
  const seen = new Set<string>()
  for (const decision of decisions) {
    const player = review.playerScores.find(row => row.playerId === decision.playerId)
    if (!player || seen.has(decision.playerId)) throw new PointsReviewError('Las decisiones contienen jugadores ajenos o repetidos.', 400)
    if (!player.categoryBefore) throw new PointsReviewError('Primero asigná la categoría inicial del jugador desde su ficha.', 400)
    if (!review.categories.some(category => category.name === decision.newCategory)) throw new PointsReviewError('La categoría elegida no existe.', 400)
    seen.add(decision.playerId)
    if (player.automaticPromotion) {
      if (decision.newCategory === player.categoryAfter) continue
      if (review.rulesVersion !== 'fixed-ranking-v1' || !player.champion || decision.newCategory !== player.categoryBefore) {
        throw new PointsReviewError('Podés mantener el ascenso propuesto o conservar la categoría actual.', 400)
      }
      const championBonus = FIXED_RANKING.FV_LEAGUE.champion
      player.automaticPromotion = false
      player.promotionDeclined = true
      player.categoryAfter = player.categoryBefore
      player.bonus = championBonus
      player.bonusAwards = [{ cup: player.tournamentResult?.cup ?? 'MAIN', position: 'champion', points: championBonus }]
      player.pointsEarned = (player.matchPoints ?? 0) + championBonus
      player.pointsAfter = player.pointsBefore + player.pointsEarned
      player.categoryPointsAfter = player.pointsAfter
      if (!Number.isSafeInteger(player.pointsAfter) || player.pointsAfter > 2147483647 || player.pointsAfter < -2147483648) {
        throw new PointsReviewError('El puntaje resultante está fuera del rango permitido.')
      }
      continue
    }
    player.categoryAfter = decision.newCategory
    if (review.rulesVersion === 'fixed-ranking-v1' && player.categoryBefore !== decision.newCategory) player.pointsAfter = 0
  }
  return { ...input, review }
}
