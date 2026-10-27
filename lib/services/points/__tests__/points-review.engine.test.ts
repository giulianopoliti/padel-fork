import { applyManualCategoryDecisions, buildPointsReview } from '../services/points-review.engine'
import { makeContext } from '../testing/fixtures'


describe('Reviewed tournament points', () => {
  it('is pure, shows the current score fallback, and never promotes by points', () => {
    const source = makeContext()
    const original = structuredClone(source)
    const { review } = buildPointsReview(source)
    expect(source).toEqual(original)
    expect(review.scoreBasis).toBe('CURRENT')
    expect(review.playerScores[0]).toMatchObject({ pointsBefore: 890, matchPoints: 12, bonus: 30, pointsAfter: 932, categoryAfter: '7ma' })
    expect(review.playerScores[2]).toMatchObject({ matchPoints: -8, bonus: 10, pointsAfter: 892 })
  })
  it('changes only the selected member and keeps the sporting score, without a threshold requirement', () => {
    const input = buildPointsReview(makeContext())
    const output = applyManualCategoryDecisions(input, [{ playerId: 'p3', newCategory: '6ta' }])
    expect(output.review.playerScores[2]).toMatchObject({ categoryAfter: '6ta', pointsAfter: 892 })
    expect(output.review.playerScores[3].categoryAfter).toBe('7ma')
    expect(input.review.playerScores[2].categoryAfter).toBe('7ma')
  })
  it.each(['both', 'gold', 'silver', 'none'])('uses independent cup bonuses: %s', choice => {
    const source = makeContext(true)
    source.context.tournament.format_config = { ...(source.context.tournament.format_config as object), bonuses: {
      GOLD: { enabled: ['both', 'gold'].includes(choice), champion: 80, finalist: 20 },
      SILVER: { enabled: ['both', 'silver'].includes(choice), champion: 40, finalist: 0 },
    } }
    const review = buildPointsReview(source).review
    expect(review.playerScores.find(player => player.playerId === 'p1')?.bonus).toBe(['both', 'gold'].includes(choice) ? 80 : 0)
    expect(review.playerScores.find(player => player.playerId === 'p5')?.bonus).toBe(['both', 'silver'].includes(choice) ? 40 : 0)
    expect(review.playerScores.find(player => player.playerId === 'p7')?.bonus).toBe(0)
    expect(review.totalMatches).toBe(2)
  })
  it('uses captured scores for the formula and current balances for accreditation', () => {
    const source = makeContext()
    source.context.snapshots = source.context.players.map(player => ({ player_id: player.id, score: player.id === 'p1' || player.id === 'p2' ? 1090 : 890, category: '7ma' }))
    const review = buildPointsReview(source).review
    expect(review.scoreBasis).toBe('SNAPSHOT')
    expect(review.playerScores[0]).toMatchObject({ pointsBefore: 890, matchPoints: 6, pointsAfter: 926 })
  })
  it('labels partial captures and rejects duplicate snapshots', () => {
    const source = makeContext()
    source.context.snapshots = [{ player_id: 'p1', score: 890, category: '7ma' }]
    expect(buildPointsReview(source).review.scoreBasis).toBe('MIXED')
    source.context.snapshots.push(source.context.snapshots[0])
    expect(() => buildPointsReview(source)).toThrow('snapshots duplicados')
  })
  it('does not award match points for a disqualification, retaining the existing cup award policy', () => {
    const source = makeContext()
    source.context.disqualifications = [{ match_id: 'm1', couple_id: 'c2' }]
    const result = buildPointsReview(source)
    expect(result.review.totalMatches).toBe(0)
    expect(result.review.playerScores[0]).toMatchObject({ matchPoints: 0, bonus: 30 })
  })
  it('ignores inactive branches and BYEs, without omitting zero-point participants', () => {
    const source = makeContext()
    source.context.matches.push({ ...source.context.matches[0], id: 'bye', round: 'SEMIFINAL', couple2_id: null })
    source.context.matches.push({ ...source.context.matches[0], id: 'old-final', status: 'PENDING', bracket_is_active: false })
    const result = buildPointsReview(source)
    expect(result.review.totalMatches).toBe(1)
    expect(result.review.playerScores).toHaveLength(4)
  })
  it.each(['pending', 'bad-winner', 'missing-finalist', 'unregistered', 'incomplete-couple', 'prior-history', 'missing-score'])('rejects an unsafe settlement: %s', choice => {
    const source = makeContext()
    if (choice === 'pending') source.context.matches[0].status = 'PENDING'
    if (choice === 'bad-winner') source.context.matches[0].winner_id = 'foreign'
    if (choice === 'missing-finalist') source.context.matches[0].couple2_id = null
    if (choice === 'unregistered') source.context.inscriptions.pop()
    if (choice === 'incomplete-couple') source.context.couples[0].player2_id = null
    if (choice === 'prior-history') source.context.history = [{ player_id: 'p1', points_before: 1, points_after: 2, points_earned: 1 }]
    if (choice === 'missing-score') source.context.players[0].score = null
    expect(() => buildPointsReview(source)).toThrow()
  })
  it('rejects foreign players, duplicate decisions and unknown categories', () => {
    const input = buildPointsReview(makeContext())
    expect(() => applyManualCategoryDecisions(input, [{ playerId: 'foreign', newCategory: '6ta' }])).toThrow()
    expect(() => applyManualCategoryDecisions(input, [{ playerId: 'p1', newCategory: 'unknown' }])).toThrow()
    expect(() => applyManualCategoryDecisions(input, [{ playerId: 'p1', newCategory: '6ta' }, { playerId: 'p1', newCategory: '6ta' }])).toThrow()
  })
  it('returns an immutable stored settlement instead of recalculating current scores', () => {
    const source = makeContext()
    source.settlement = { ...buildPointsReview(source).review, state: 'APPLIED' }
    source.context.players[0].score = 5000
    expect(buildPointsReview(source).review.playerScores[0].pointsAfter).toBe(932)
  })
  it('reads legacy history without inventing bonus or category breakdowns', () => {
    const source = makeContext()
    source.context.tournament.status = 'FINISHED_POINTS_CALCULATED'
    source.context.history = [{ player_id: 'p1', points_before: 890, points_after: 932, points_earned: 42 }]
    expect(buildPointsReview(source).review).toMatchObject({ state: 'LEGACY', playerScores: [{ matchPoints: null, bonus: null, pointsAfter: 932 }] })
  })
})
