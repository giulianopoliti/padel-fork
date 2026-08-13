import { recommendMatches } from '../engine'
import { MatchRecommendationInput, pairKey } from '../types'

const baseInput = (): MatchRecommendationInput => ({
  couples: ['a', 'b', 'c', 'd'].map(id => ({ id, name: id, completedZoneMatches: 0 })),
  timeSlots: [{
    id: 'slot', date: '2026-08-20', startTime: '14:00', endTime: '22:00', courtName: 'Cancha 1', maxConcurrentMatches: 1,
  }],
  availability: ['a', 'b', 'c', 'd'].map(coupleId => ({ coupleId, timeSlotId: 'slot', isAvailable: true })),
  fixedMatches: [],
  forbiddenPairKeys: [],
  durationMinutes: 90,
})

describe('recommendMatches', () => {
  it('maximizes the number of matches and never schedules a couple twice', () => {
    const result = recommendMatches(baseInput())
    expect(result.matches).toHaveLength(2)
    expect(new Set(result.matches.flatMap(match => [match.couple1Id, match.couple2Id])).size).toBe(4)
  })

  it('does not repeat a zone pairing', () => {
    const input = baseInput()
    input.forbiddenPairKeys = [pairKey('a', 'b'), pairKey('a', 'c'), pairKey('a', 'd')]
    const result = recommendMatches(input)
    expect(result.matches).toHaveLength(1)
    expect(result.unscheduled.find(item => item.coupleId === 'a')?.reason).toBe('NO_NEW_OPPONENT')
  })

  it('uses approved effective availability and supports 75 minute endings', () => {
    const input = baseInput()
    input.couples = input.couples.slice(0, 2)
    input.durationMinutes = 75
    input.availability = input.availability.slice(0, 2).map(item => ({
      ...item,
      effectiveStartTime: item.coupleId === 'a' ? '20:00' : '19:00',
      effectiveEndTime: '22:00',
      interpretationStatus: 'APPROVED',
    }))
    const result = recommendMatches(input)
    expect(result.matches[0]).toMatchObject({ startTime: '20:00', endTime: '21:15' })
  })

  it('does not overlap capacity one and permits adjacent matches', () => {
    const result = recommendMatches(baseInput())
    const [first, second] = result.matches
    expect(first.endTime <= second.startTime || second.endTime <= first.startTime).toBe(true)
  })

  it('excludes pending note interpretations', () => {
    const input = baseInput()
    input.availability = input.availability.map(item => item.coupleId === 'a'
      ? { ...item, interpretationStatus: 'PENDING_REVIEW' }
      : item)
    const result = recommendMatches(input)
    expect(result.matches.flatMap(match => [match.couple1Id, match.couple2Id])).not.toContain('a')
    expect(result.unscheduled.find(item => item.coupleId === 'a')?.reason).toBe('PENDING_NOTE_REVIEW')
  })

  it('counts fixed matches without a slot id against court capacity', () => {
    const input = baseInput()
    input.couples = input.couples.slice(0, 2)
    input.timeSlots[0].endTime = '15:30'
    input.fixedMatches = [{
      id: 'fixed', couple1Id: 'x', couple2Id: 'y', date: '2026-08-20', startTime: '14:00', endTime: '15:30', courtName: 'Cancha 1',
    }]
    expect(recommendMatches(input).matches).toHaveLength(0)
  })

  it('finds a maximum matching when the first valid pair is a greedy trap', () => {
    const input = baseInput()
    input.forbiddenPairKeys = [pairKey('a', 'd'), pairKey('b', 'c'), pairKey('c', 'd')]
    const result = recommendMatches(input)
    expect(result.matches).toHaveLength(2)
    expect(result.matches.map(match => pairKey(match.couple1Id, match.couple2Id)).sort()).toEqual([
      pairKey('a', 'c'),
      pairKey('b', 'd'),
    ].sort())
  })

  it('uses lower completed-match counts as the deterministic tie-break', () => {
    const input = baseInput()
    input.couples = input.couples.slice(0, 3)
    input.couples.find(item => item.id === 'c')!.completedZoneMatches = 5
    const result = recommendMatches(input)
    expect(pairKey(result.matches[0].couple1Id, result.matches[0].couple2Id)).toBe(pairKey('a', 'b'))
  })
})
