import { performance } from 'perf_hooks'
import { recommendMatches } from '../engine'
import { intervalsOverlap, timeToMinutes } from '../time'
import { MatchRecommendationInput, MatchRecommendationResult, pairKey } from '../types'
import { dense32CouplesFixture, production32CouplesFixture } from '../test-fixtures/production-32-couples'

const assertValidResult = (input: MatchRecommendationInput, result: MatchRecommendationResult) => {
  const usedCouples = new Set<string>()
  const forbiddenPairs = new Set(input.forbiddenPairKeys)
  const availability = new Set(
    input.availability.filter(item => item.isAvailable).map(item => `${item.coupleId}:${item.timeSlotId}`),
  )

  for (const match of result.matches) {
    expect(usedCouples.has(match.couple1Id)).toBe(false)
    expect(usedCouples.has(match.couple2Id)).toBe(false)
    usedCouples.add(match.couple1Id)
    usedCouples.add(match.couple2Id)
    expect(forbiddenPairs.has(pairKey(match.couple1Id, match.couple2Id))).toBe(false)
    expect(availability.has(`${match.couple1Id}:${match.timeSlotId}`)).toBe(true)
    expect(availability.has(`${match.couple2Id}:${match.timeSlotId}`)).toBe(true)
    expect(timeToMinutes(match.endTime) - timeToMinutes(match.startTime)).toBe(input.durationMinutes)
  }

  for (const slot of input.timeSlots) {
    const scheduled = result.matches.filter(match => match.timeSlotId === slot.id)
    for (const match of scheduled) {
      const concurrent = scheduled.filter(other => intervalsOverlap(
        timeToMinutes(match.startTime),
        timeToMinutes(match.endTime),
        timeToMinutes(other.startTime),
        timeToMinutes(other.endTime),
      ))
      expect(concurrent.length).toBeLessThanOrEqual(slot.maxConcurrentMatches)
    }
  }
}

describe('recommendMatches at 32-couple scale', () => {
  it('handles an anonymized production availability graph', () => {
    const input = production32CouplesFixture()
    const startedAt = performance.now()
    const result = recommendMatches(input)
    const elapsedMs = performance.now() - startedAt

    assertValidResult(input, result)
    expect(result.matches).toHaveLength(12)
    expect(result.searchStatus).toBe('OPTIMAL')
    expect(elapsedMs).toBeLessThan(5_000)
  })

  it('schedules all 32 couples in a dense scenario without violating capacity', () => {
    const input = dense32CouplesFixture()
    const startedAt = performance.now()
    const result = recommendMatches(input)
    const elapsedMs = performance.now() - startedAt

    assertValidResult(input, result)
    expect(result.matches).toHaveLength(16)
    expect(elapsedMs).toBeLessThan(5_000)
  })

  it('is deterministic for the production-shaped fixture', () => {
    const first = recommendMatches(production32CouplesFixture())
    const second = recommendMatches(production32CouplesFixture())
    expect(second.matches).toEqual(first.matches)
    expect(second.unscheduled).toEqual(first.unscheduled)
  })

  it('respects effective note windows in the large fixture', () => {
    const input = dense32CouplesFixture()
    input.availability = input.availability.map(item => item.coupleId === 'C01'
      ? { ...item, effectiveStartTime: '20:00', interpretationStatus: 'APPROVED' as const }
      : item)
    const result = recommendMatches(input)

    assertValidResult(input, result)
    const c01Match = result.matches.find(match => match.couple1Id === 'C01' || match.couple2Id === 'C01')
    expect(c01Match).toBeDefined()
    expect(timeToMinutes(c01Match!.startTime)).toBeGreaterThanOrEqual(timeToMinutes('20:00'))
  })

  it.each([7, 19, 31, 43, 59, 71, 89, 101, 127, 149])(
    'preserves every invariant for randomized 32-couple matrix seed %i',
    seed => {
      let state = seed
      const random = () => {
        state = (state * 16807) % 2147483647
        return (state - 1) / 2147483646
      }
      const input = production32CouplesFixture()
      input.forbiddenPairKeys = []
      for (let first = 0; first < input.couples.length; first += 1) {
        for (let second = first + 1; second < input.couples.length; second += 1) {
          if (random() < 0.08) input.forbiddenPairKeys.push(pairKey(input.couples[first].id, input.couples[second].id))
        }
      }
      input.availability = input.couples.flatMap(couple => input.timeSlots.flatMap(slot => {
        if (random() >= 0.42) return []
        const constrained = random() < 0.12 && timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime) >= 180
        return [{
          coupleId: couple.id,
          timeSlotId: slot.id,
          isAvailable: true,
          effectiveStartTime: constrained
            ? `${String(Math.floor((timeToMinutes(slot.startTime) + 60) / 60)).padStart(2, '0')}:${String((timeToMinutes(slot.startTime) + 60) % 60).padStart(2, '0')}`
            : null,
          interpretationStatus: constrained ? 'APPROVED' as const : 'NONE' as const,
        }]
      }))
      input.maxSearchNodes = 100_000

      const result = recommendMatches(input)
      assertValidResult(input, result)
      expect(result.matches.length).toBeLessThanOrEqual(16)
      expect(result.visitedNodes).toBeLessThanOrEqual(100_001)
    },
  )
})
