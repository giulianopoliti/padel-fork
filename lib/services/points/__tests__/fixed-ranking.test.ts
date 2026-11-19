import { buildPointsReview, applyManualCategoryDecisions } from '../services/points-review.engine'
import { makeContext } from '../testing/fixtures'
import { getTournamentFormatPreset } from '@/config/tournament-format-presets'

const league = () => {
  const source = makeContext()
  source.context.rankingPolicy = 'FV_LEAGUE'
  source.context.tournament = { ...source.context.tournament, type: 'LONG', category_name: '8va',
    format_config: getTournamentFormatPreset('LONG_SINGLE_ZONE_BRACKET') }
  source.context.categories = [{ name: '8va', level: 8, initial_score: 0 },
    { name: '7ma', level: 7, initial_score: 0 }]
  source.context.players.forEach(player => { player.score = 240; player.category_name = '8va' })
  return source
}

describe('Fixed ranking and league promotions', () => {
  it('credits fixed wins and one finalist bonus, and promotes the champions with zero active points', () => {
    const { review } = buildPointsReview(league())
    expect(review.rulesVersion).toBe('fixed-ranking-v1')
    expect(review.playerScores[0]).toMatchObject({ matchPoints: 12, bonus: 0, categoryAfter: '7ma', pointsAfter: 0,
      automaticPromotion: true, categoryPointsAfter: 252, champion: true })
    expect(review.playerScores[2]).toMatchObject({ matchPoints: 0, bonus: 200, pointsAfter: 440 })
  })
  it('uses 12 points independently of prior Elo and never subtracts points for a loss', () => {
    const source = league()
    source.context.snapshots = source.context.players.map((p, i) => ({ player_id: p.id, score: i < 2 ? 9000 : 0, category: '8va' }))
    expect(buildPointsReview(source).review.playerScores[0].matchPoints).toBe(12)
    expect(buildPointsReview(source).matchPoints[0].points_loser).toBe(0)
  })
  it.each([['16VOS', 30], ['8VOS', 50], ['4TOS', 100], ['SEMIFINAL', 150]] as const)('awards the %s elimination bonus once', (round, points) => {
    const source = league()
    source.context.matches.push({ ...source.context.matches[0], id: 'earlier', round, couple1_id: 'c1', couple2_id: 'c3', winner_id: 'c1' })
    source.context.couples.push({ id: 'c3', player1_id: 'p5', player2_id: 'p6' })
    source.context.players.push(...[5, 6].map(i => ({ ...source.context.players[0], id: `p${i}`, first_name: `Player ${i}` })))
    source.context.inscriptions.push({ player_id: null, couple_id: 'c3', is_pending: false })
    expect(buildPointsReview(source).review.playerScores.find(p => p.playerId === 'p5')).toMatchObject({ matchPoints: 0, bonus: points })
  })
  it('ignores BYE and administrative wins and sends administrative finals to manual review', () => {
    const source = league()
    source.context.matches[0].administrative_result = true
    source.context.matches.push({ ...source.context.matches[0], id: 'bye', round: 'SEMIFINAL', couple2_id: null })
    expect(buildPointsReview(source).review.playerScores[0]).toMatchObject({ matchPoints: 0, bonus: 300,
      categoryAfter: '8va', promotionNeedsReview: true })
  })
  it('archives points from a late lower-category tournament without promoting the player twice', () => {
    const source = league()
    source.context.players[0].category_name = '7ma'
    source.context.players[0].score = 36
    expect(buildPointsReview(source).review.playerScores[0]).toMatchObject({ rankingCategory: '8va',
      champion: true, bonus: 300, pointsEarned: 312, pointsAfter: 36, categoryAfter: '7ma' })
  })
  it('prevents overriding an automatic promotion from the accreditation request', () => {
    expect(() => applyManualCategoryDecisions(buildPointsReview(league()), [{ playerId: 'p1', newCategory: '8va' }])).toThrow('Ascensos')
  })
  it('credits half the points in Elite and records champions without promotion', () => {
    const source = makeContext()
    source.context.rankingPolicy = 'ELITE_AMERICAN'
    source.context.tournament.category_name = '7ma'
    const { review } = buildPointsReview(source)
    expect(review.playerScores[0]).toMatchObject({ matchPoints: 6, bonus: 150, champion: true, categoryAfter: '7ma', pointsAfter: 1046 })
    expect(review.playerScores[2]).toMatchObject({ matchPoints: 0, bonus: 100, pointsAfter: 990 })
    const moved = applyManualCategoryDecisions(buildPointsReview(source), [{ playerId: 'p1', newCategory: '6ta' }])
    expect(moved.review.playerScores[0]).toMatchObject({ categoryAfter: '6ta', pointsAfter: 0, categoryPointsAfter: 1046 })
  })
  it('credits the confirmed round-robin champion', () => {
    const source = makeContext()
    source.context.rankingPolicy = 'ELITE_AMERICAN'
    source.context.tournament.format_config = getTournamentFormatPreset('AMERICAN_SINGLE_ZONE_ROUND_ROBIN_CHAMPION')
    source.context.matches[0] = { ...source.context.matches[0], type: 'ZONE', round: null }
    source.context.roundRobinChampion = 'c1'
    expect(buildPointsReview(source).review.playerScores[0]).toMatchObject({ champion: true, bonus: 150 })
    source.context.roundRobinChampion = null
    expect(() => buildPointsReview(source)).toThrow('tabla definitiva')
  })
})
