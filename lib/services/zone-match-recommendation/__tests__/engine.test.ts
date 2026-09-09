import { assessZoneMatchCandidate, recommendZoneMatches } from '../engine'
import { ZoneMatchRecommendationInput, zoneRecommendationPairKey } from '../types'

const pair = (couple1Id: string, couple2Id: string) => ({ couple1Id, couple2Id })

const uniqueClosingInput = (): ZoneMatchRecommendationInput => ({
  couples: ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id, requiredMatches: 2 })),
  committedMatches: [pair('a', 'b'), pair('a', 'd'), pair('b', 'c')],
  busyCoupleIds: [],
})

describe('zone match recommendation engine', () => {
  it('rejects a locally valid pair when it blocks the only complete closing plan', () => {
    const input = uniqueClosingInput()
    const result = recommendZoneMatches(input)

    expect(result.status).toBe('READY')
    expect(result.futurePlan).toHaveLength(3)
    expect(assessZoneMatchCandidate(input, pair('c', 'd'))).toMatchObject({
      safe: false,
      reason: 'NO_COMPLETE_PLAN',
    })
  })

  it('keeps busy couples in the global plan but does not recommend them now', () => {
    const input = uniqueClosingInput()
    input.busyCoupleIds = ['c', 'd', 'e', 'f']

    const result = recommendZoneMatches(input)

    expect(result.status).toBe('WAITING_FOR_AVAILABLE_COUPLES')
    expect(result.recommendedNow).toBeNull()
    expect(result.recommendedBatch).toEqual([])
    expect(result.futurePlan).toHaveLength(3)
  })

  it('returns a batch of disjoint matches that can be committed together', () => {
    const input: ZoneMatchRecommendationInput = {
      couples: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => ({
        id,
        requiredMatches: 1,
      })),
      committedMatches: [],
      busyCoupleIds: [],
    }

    const result = recommendZoneMatches(input)
    const batchCoupleIds = result.recommendedBatch.flatMap(match => [
      match.couple1Id,
      match.couple2Id,
    ])
    const afterBatch = recommendZoneMatches({
      ...input,
      committedMatches: result.recommendedBatch,
      busyCoupleIds: batchCoupleIds,
    })
    const partialBatch = result.recommendedBatch.slice(0, 2)
    const afterPartialBatch = recommendZoneMatches({
      ...input,
      committedMatches: partialBatch,
      busyCoupleIds: partialBatch.flatMap(match => [match.couple1Id, match.couple2Id]),
    })

    expect(result.status).toBe('READY')
    expect(result.recommendedBatch).toHaveLength(4)
    expect(new Set(batchCoupleIds).size).toBe(batchCoupleIds.length)
    expect(afterPartialBatch.status).toBe('READY')
    expect(afterBatch.status).toBe('COMPLETE')
  })

  it('supports uneven remaining requirements without tournament-specific rules', () => {
    const input: ZoneMatchRecommendationInput = {
      couples: [
        { id: 'a', requiredMatches: 2 },
        { id: 'b', requiredMatches: 2 },
        { id: 'c', requiredMatches: 1 },
        { id: 'd', requiredMatches: 1 },
      ],
      committedMatches: [],
      busyCoupleIds: [],
    }

    const result = recommendZoneMatches(input)
    const appearances = result.futurePlan.flatMap(match => [match.couple1Id, match.couple2Id])

    expect(result.status).toBe('READY')
    expect(result.futurePlan).toHaveLength(3)
    expect(appearances.filter(id => id === 'a')).toHaveLength(2)
    expect(appearances.filter(id => id === 'b')).toHaveLength(2)
    expect(appearances.filter(id => id === 'c')).toHaveLength(1)
    expect(appearances.filter(id => id === 'd')).toHaveLength(1)
  })

  it('recalculates from committed matches instead of reserving an old plan', () => {
    const input: ZoneMatchRecommendationInput = {
      couples: ['a', 'b', 'c', 'd'].map(id => ({ id, requiredMatches: 1 })),
      committedMatches: [],
      busyCoupleIds: [],
    }
    const first = recommendZoneMatches(input)
    const manuallyCreated = pair('a', 'd')
    const recalculated = recommendZoneMatches({
      ...input,
      committedMatches: [manuallyCreated],
      busyCoupleIds: ['a', 'd'],
    })

    expect(first.status).toBe('READY')
    expect(recalculated.status).toBe('READY')
    expect(recalculated.recommendedNow && zoneRecommendationPairKey(
      recalculated.recommendedNow.couple1Id,
      recalculated.recommendedNow.couple2Id,
    )).toBe(zoneRecommendationPairKey('b', 'c'))
  })

  it('reports a completed fixture', () => {
    const result = recommendZoneMatches({
      couples: ['a', 'b'].map(id => ({ id, requiredMatches: 1 })),
      committedMatches: [pair('a', 'b')],
      busyCoupleIds: [],
    })

    expect(result.status).toBe('COMPLETE')
    expect(result.recommendedNow).toBeNull()
  })

  it('explains when a couple no longer has enough new opponents', () => {
    const result = recommendZoneMatches({
      couples: ['a', 'b', 'c', 'd'].map(id => ({ id, requiredMatches: 2 })),
      committedMatches: [pair('a', 'b'), pair('a', 'c'), pair('b', 'c')],
      busyCoupleIds: [],
    })

    expect(result.status).toBe('IMPOSSIBLE')
    expect(result.diagnostics[0]).toMatchObject({
      code: 'NOT_ENOUGH_NEW_OPPONENTS',
      coupleId: 'd',
    })
  })

  it('treats an odd requirement distribution as input policy, not engine policy', () => {
    const result = recommendZoneMatches({
      couples: [
        { id: 'a', requiredMatches: 2 },
        ...['b', 'c', 'd', 'e'].map(id => ({ id, requiredMatches: 3 })),
      ],
      committedMatches: [],
      busyCoupleIds: [],
    })

    expect(result.status).toBe('READY')
    expect(result.futurePlan).toHaveLength(7)
  })
})
