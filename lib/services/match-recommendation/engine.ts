import {
  FixedScheduledMatch,
  MatchRecommendationInput,
  MatchRecommendationResult,
  RecommendedMatch,
  RecommendationTimeSlot,
  pairKey,
} from './types'
import { ceilToHalfHour, intervalsOverlap, minutesToTime, timeToMinutes } from './time'

interface Candidate extends RecommendedMatch {
  id: string
  pairKey: string
  startMinute: number
  endMinute: number
  capacity: number
  resourceKey: string
  fairnessCost: number
}

const resourceKey = (date: string, courtName: string | null) =>
  `${date}|${courtName?.trim().toLowerCase() || 'unassigned'}`

const buildCandidates = (input: MatchRecommendationInput) => {
  const availabilityByCoupleAndSlot = new Map(
    input.availability.map(item => [`${item.coupleId}:${item.timeSlotId}`, item]),
  )
  const forbiddenPairs = new Set(input.forbiddenPairKeys)
  const fixedCouples = new Set(input.fixedMatches.flatMap(match => [match.couple1Id, match.couple2Id]))
  const eligibleCouples = input.couples.filter(couple => !couple.blockedForFecha && !fixedCouples.has(couple.id))
  const candidateMap = new Map<string, Candidate>()

  for (let firstIndex = 0; firstIndex < eligibleCouples.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < eligibleCouples.length; secondIndex += 1) {
      const first = eligibleCouples[firstIndex]
      const second = eligibleCouples[secondIndex]
      const currentPairKey = pairKey(first.id, second.id)
      if (forbiddenPairs.has(currentPairKey)) continue

      for (const slot of input.timeSlots) {
        const firstAvailability = availabilityByCoupleAndSlot.get(`${first.id}:${slot.id}`)
        const secondAvailability = availabilityByCoupleAndSlot.get(`${second.id}:${slot.id}`)
        if (!firstAvailability?.isAvailable || !secondAvailability?.isAvailable) continue
        if (firstAvailability.interpretationStatus === 'PENDING_REVIEW') continue
        if (secondAvailability.interpretationStatus === 'PENDING_REVIEW') continue
        if (firstAvailability.interpretationStatus === 'FAILED') continue
        if (secondAvailability.interpretationStatus === 'FAILED') continue

        const effectiveStart = Math.max(
          timeToMinutes(slot.startTime),
          timeToMinutes(firstAvailability.effectiveStartTime || slot.startTime),
          timeToMinutes(secondAvailability.effectiveStartTime || slot.startTime),
        )
        const effectiveEnd = Math.min(
          timeToMinutes(slot.endTime),
          timeToMinutes(firstAvailability.effectiveEndTime || slot.endTime),
          timeToMinutes(secondAvailability.effectiveEndTime || slot.endTime),
        )

        for (
          let startMinute = ceilToHalfHour(effectiveStart);
          startMinute + input.durationMinutes <= effectiveEnd;
          startMinute += 30
        ) {
          const endMinute = startMinute + input.durationMinutes
          const id = `${currentPairKey}:${slot.id}:${startMinute}`
          candidateMap.set(id, {
            id,
            pairKey: currentPairKey,
            couple1Id: first.id,
            couple2Id: second.id,
            timeSlotId: slot.id,
            date: slot.date,
            startTime: minutesToTime(startMinute),
            endTime: minutesToTime(endMinute),
            courtName: slot.courtName,
            startMinute,
            endMinute,
            capacity: Math.max(1, slot.maxConcurrentMatches),
            resourceKey: resourceKey(slot.date, slot.courtName),
            fairnessCost: first.completedZoneMatches + second.completedZoneMatches,
          })
        }
      }
    }
  }

  return [...candidateMap.values()]
}

const exceedsCapacity = (
  candidate: Candidate,
  selected: Candidate[],
  fixedMatches: FixedScheduledMatch[],
) => {
  let concurrent = selected.filter(other =>
    other.resourceKey === candidate.resourceKey &&
    intervalsOverlap(candidate.startMinute, candidate.endMinute, other.startMinute, other.endMinute),
  ).length

  concurrent += fixedMatches.filter(match =>
    resourceKey(match.date, match.courtName) === candidate.resourceKey &&
    intervalsOverlap(
      candidate.startMinute,
      candidate.endMinute,
      timeToMinutes(match.startTime),
      timeToMinutes(match.endTime),
    ),
  ).length

  return concurrent >= candidate.capacity
}

const isBetterSolution = (candidate: Candidate[], incumbent: Candidate[]) => {
  if (candidate.length !== incumbent.length) return candidate.length > incumbent.length
  const candidateFairness = candidate.reduce((sum, item) => sum + item.fairnessCost, 0)
  const incumbentFairness = incumbent.reduce((sum, item) => sum + item.fairnessCost, 0)
  if (candidateFairness !== incumbentFairness) return candidateFairness < incumbentFairness
  return candidate.map(item => item.id).sort().join('|') < incumbent.map(item => item.id).sort().join('|')
}

const diagnoseUnscheduled = (
  input: MatchRecommendationInput,
  candidates: Candidate[],
  selected: Candidate[],
) => {
  const selectedCouples = new Set(selected.flatMap(match => [match.couple1Id, match.couple2Id]))
  const fixedCouples = new Set(input.fixedMatches.flatMap(match => [match.couple1Id, match.couple2Id]))
  const forbidden = new Set(input.forbiddenPairKeys)

  return input.couples
    .filter(couple => !selectedCouples.has(couple.id) && !fixedCouples.has(couple.id))
    .map(couple => {
      if (couple.blockedForFecha) return { coupleId: couple.id, reason: 'BLOCKED_FOR_FECHA' as const }
      const availabilities = input.availability.filter(item => item.coupleId === couple.id && item.isAvailable)
      if (availabilities.some(item => item.interpretationStatus === 'PENDING_REVIEW')) {
        return { coupleId: couple.id, reason: 'PENDING_NOTE_REVIEW' as const }
      }
      if (availabilities.length === 0) return { coupleId: couple.id, reason: 'NO_AVAILABILITY' as const }
      const possibleOpponents = input.couples.filter(other =>
        other.id !== couple.id && !forbidden.has(pairKey(couple.id, other.id)),
      )
      if (possibleOpponents.length === 0) return { coupleId: couple.id, reason: 'NO_NEW_OPPONENT' as const }
      const coupleCandidates = candidates.filter(item =>
        item.couple1Id === couple.id || item.couple2Id === couple.id,
      )
      if (coupleCandidates.length === 0) return { coupleId: couple.id, reason: 'NO_COMMON_WINDOW' as const }
      if (coupleCandidates.every(item => exceedsCapacity(item, selected, input.fixedMatches))) {
        return { coupleId: couple.id, reason: 'CAPACITY_EXHAUSTED' as const }
      }
      return { coupleId: couple.id, reason: 'OPTIMIZATION_TRADEOFF' as const }
    })
}

export const recommendMatches = (input: MatchRecommendationInput): MatchRecommendationResult => {
  const candidates = buildCandidates(input).sort((left, right) =>
    left.fairnessCost - right.fairnessCost || left.id.localeCompare(right.id),
  )
  const optionsByCouple = new Map<string, Candidate[]>()
  for (const couple of input.couples) {
    optionsByCouple.set(
      couple.id,
      candidates.filter(item => item.couple1Id === couple.id || item.couple2Id === couple.id),
    )
  }

  const maxNodes = input.maxSearchNodes ?? 500_000
  let visitedNodes = 0
  let exhausted = false
  let provablyOptimal = false
  let best: Candidate[] = []
  const playableCoupleIds = new Set(
    input.couples
      .filter(couple => (optionsByCouple.get(couple.id) || []).length > 0)
      .map(couple => couple.id),
  )
  const maximumMatchCount = Math.floor(playableCoupleIds.size / 2)
  const minimumFairnessAtMaximum = input.couples
    .filter(couple => playableCoupleIds.has(couple.id))
    .map(couple => couple.completedZoneMatches)
    .sort((left, right) => left - right)
    .slice(0, maximumMatchCount * 2)
    .reduce((sum, count) => sum + count, 0)

  const updateBest = (selected: Candidate[]) => {
    if (isBetterSolution(selected, best)) best = [...selected]
    const fairness = best.reduce((sum, item) => sum + item.fairnessCost, 0)
    if (best.length === maximumMatchCount && fairness === minimumFairnessAtMaximum) {
      provablyOptimal = true
    }
  }

  const search = (availableCoupleIds: Set<string>, selected: Candidate[]) => {
    if (provablyOptimal) return
    visitedNodes += 1
    if (visitedNodes > maxNodes) {
      exhausted = true
      return
    }
    if (selected.length + Math.floor(availableCoupleIds.size / 2) < best.length) return
    if (availableCoupleIds.size < 2) {
      updateBest(selected)
      return
    }

    const coupleId = [...availableCoupleIds].sort((left, right) => {
      const leftCount = (optionsByCouple.get(left) || []).filter(option =>
        availableCoupleIds.has(option.couple1Id) && availableCoupleIds.has(option.couple2Id),
      ).length
      const rightCount = (optionsByCouple.get(right) || []).filter(option =>
        availableCoupleIds.has(option.couple1Id) && availableCoupleIds.has(option.couple2Id),
      ).length
      return leftCount - rightCount || left.localeCompare(right)
    })[0]

    const options = (optionsByCouple.get(coupleId) || []).filter(option =>
      availableCoupleIds.has(option.couple1Id) &&
      availableCoupleIds.has(option.couple2Id) &&
      !exceedsCapacity(option, selected, input.fixedMatches),
    )

    for (const option of options) {
      const nextAvailable = new Set(availableCoupleIds)
      nextAvailable.delete(option.couple1Id)
      nextAvailable.delete(option.couple2Id)
      search(nextAvailable, [...selected, option])
      if (exhausted || provablyOptimal) break
    }

    if (!exhausted && !provablyOptimal) {
      const nextAvailable = new Set(availableCoupleIds)
      nextAvailable.delete(coupleId)
      search(nextAvailable, selected)
    }
  }

  search(playableCoupleIds, [])

  const matches = best
    .sort((left, right) => left.date.localeCompare(right.date) || left.startMinute - right.startMinute || left.id.localeCompare(right.id))
    .map(({ id: _id, pairKey: _pairKey, startMinute: _start, endMinute: _end, capacity: _capacity, resourceKey: _resource, fairnessCost: _fairness, ...match }) => match)

  return {
    matches,
    unscheduled: diagnoseUnscheduled(input, candidates, best),
    searchStatus: exhausted && !provablyOptimal ? 'BEST_EFFORT' : 'OPTIMAL',
    visitedNodes,
  }
}
