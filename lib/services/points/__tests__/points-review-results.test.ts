import { buildPointsReview, applyManualCategoryDecisions } from '../services/points-review.engine'
import { groupPointsByTournamentResult } from '../services/points-review-results'
import { makeContext } from '../testing/fixtures'
import { getTournamentFormatPreset } from '@/config/tournament-format-presets'

describe('Sporting order of the points review', () => {
  it('keeps champions together above finalists, then shows Silver results without awarding Gold bonuses', () => {
    const source = makeContext(true)
    source.context.rankingPolicy = 'FV_LEAGUE'
    source.context.tournament = { ...source.context.tournament, type: 'LONG', category_name: '7ma',
      format_config: getTournamentFormatPreset('LONG_SINGLE_ZONE_GOLD_SILVER') }
    source.context.players[0].first_name = 'Zeta'
    source.context.players[1].first_name = 'Último'
    const input = buildPointsReview(source)
    const groups = groupPointsByTournamentResult(input.review.playerScores)
    expect(groups.map(g => g.label)).toEqual(['Campeones · Oro', 'Subcampeones · Oro', 'Campeones · Plata', 'Subcampeones · Plata'])
    expect(groups[0].players.map(p => p.playerId).sort()).toEqual(['p1', 'p2'])
    expect(groups[0].players[0]).toMatchObject({ wins: 1, matchesPlayed: 1, automaticPromotion: true })
    expect(groups[2].players.every(p => p.bonus === 0 && !p.automaticPromotion)).toBe(true)
    const declined = applyManualCategoryDecisions(input, [{ playerId: 'p1', newCategory: '7ma' }])
    expect(groupPointsByTournamentResult(declined.review.playerScores).map(g => g.id)).toEqual(groups.map(g => g.id))
  })
  it('labels a disconnected winner and unplayed registrations without inventing a final place', () => {
    const source = makeContext()
    source.context.players.push(...[5, 6, 7, 8].map(i => ({ ...source.context.players[0], id: 'p' + i, first_name: 'Player ' + i })))
    source.context.couples.push({ id: 'c3', player1_id: 'p5', player2_id: 'p6' }, { id: 'c4', player1_id: 'p7', player2_id: 'p8' })
    source.context.inscriptions.push({ player_id: null, couple_id: 'c3', is_pending: false }, { player_id: null, couple_id: 'c4', is_pending: false })
    source.context.matches.push({ ...source.context.matches[0], id: 'disconnected', round: '8VOS', couple1_id: 'c3', couple2_id: 'c2', winner_id: 'c3' })
    const review = buildPointsReview(source).review
    expect(review.playerScores.find(p => p.playerId === 'p5')?.tournamentResult).toMatchObject({ stage: 'UNRESOLVED', lastRound: '8VOS' })
    expect(review.playerScores.find(p => p.playerId === 'p7')).toMatchObject({ wins: 0, matchesPlayed: 0, tournamentResult: { stage: 'NO_MATCHES' } })
    const groups = groupPointsByTournamentResult(review.playerScores)
    expect(groups[0].label).toBe('Campeones · Torneo')
    expect(groups.at(-1)?.label).toBe('Sin partidos registrados')
  })
  it('reconciles the nine recorded Canning matches, including Silver wins and 39 unplayed registrations', () => {
    // The actual local fixture has one zone match and four disconnected
    // knockout matches in each cup. Never infer missing wins from final place.
    const source = makeContext(true)
    source.context.rankingPolicy = 'FV_LEAGUE'
    source.context.tournament = { ...source.context.tournament, type: 'LONG', category_name: '7ma',
      format_config: getTournamentFormatPreset('LONG_SINGLE_ZONE_GOLD_SILVER') }
    source.context.categories.push({ name: '8va', level: 8, initial_score: 0 })
    source.context.players = Array.from({ length: 65 }, (_, i) => ({
      id: 'p' + (i + 1), first_name: 'QA', last_name: String(i + 1), score: 0, category_name: i === 21 ? '8va' : '7ma',
    }))
    source.context.couples = Array.from({ length: 32 }, (_, i) => ({
      id: 'c' + (i + 1), player1_id: 'p' + (2 * i + 1), player2_id: 'p' + (2 * i + 2),
    }))
    source.context.inscriptions = source.context.couples.map(c => ({ couple_id: c.id, player_id: null, is_pending: false }))
    source.context.inscriptions.push({ couple_id: null, player_id: 'p65', is_pending: false })
    const recorded = [
      ['GOLD', '8VOS', 'c1', 'c2', 'c1'], ['GOLD', '4TOS', 'c3', 'c4', 'c4'],
      ['GOLD', 'SEMIFINAL', 'c5', 'c4', 'c4'], ['GOLD', 'FINAL', 'c4', 'c6', 'c4'],
      ['MAIN', 'ZONE', 'c7', 'c8', 'c8'], ['SILVER', '8VOS', 'c9', 'c10', 'c10'],
      ['SILVER', '4TOS', 'c11', 'c12', 'c11'], ['SILVER', 'SEMIFINAL', 'c13', 'c11', 'c11'],
      ['SILVER', 'FINAL', 'c8', 'c11', 'c8'],
    ]
    source.context.matches = recorded.map(([cup, round, a, b, winner], i) => ({
      id: 'm' + i, bracket_key: cup, round, type: round === 'ZONE' ? 'ZONE' : 'ELIMINATION',
      couple1_id: a, couple2_id: b, winner_id: winner, status: 'FINISHED', bracket_is_active: true,
    }))
    const input = buildPointsReview(source)
    const scores = input.review.playerScores
    const player = (id: string) => scores.find(p => p.playerId === id)!
    expect(input.matchPoints).toHaveLength(9)
    expect(player('p7')).toMatchObject({ wins: 3, matchPoints: 36, bonus: 0, automaticPromotion: true, pointsAfter: 0 })
    expect(player('p11')).toMatchObject({ wins: 0, bonus: 200, pointsAfter: 200 })
    expect(player('p9').bonus).toBe(150)
    expect(player('p5').bonus).toBe(100)
    expect(player('p3').bonus).toBe(50)
    expect(player('p15')).toMatchObject({ wins: 2, matchPoints: 24, bonus: 0, pointsAfter: 24,
      tournamentResult: { cup: 'SILVER', stage: 'champion' } })
    expect(player('p22')).toMatchObject({ wins: 2, matchPoints: 24, pointsAfter: 0, rankingCategory: '7ma', categoryBefore: '8va' })
    expect(scores.filter(p => p.tournamentResult?.stage === 'NO_MATCHES')).toHaveLength(39)
    expect(groupPointsByTournamentResult(scores).filter(g => g.result?.stage === 'UNRESOLVED')).toHaveLength(2)
    expect(scores.reduce((sum, p) => sum + p.matchPoints!, 0)).toBe(216)
    expect(scores.reduce((sum, p) => sum + p.bonus!, 0)).toBe(1000)
    expect(scores.reduce((sum, p) => sum + p.pointsAfter, 0)).toBe(1120)
    const declined = applyManualCategoryDecisions(input, [{ playerId: 'p7', newCategory: '7ma' }])
    expect(declined.review.playerScores.find(p => p.playerId === 'p7')).toMatchObject({ bonus: 300, pointsAfter: 336 })
  })
})
