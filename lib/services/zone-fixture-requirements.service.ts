export type ZoneFixtureMatch = {
  couple1_id?: string | null
  couple2_id?: string | null
  status?: string | null
}

export type ZoneFixtureRequirementInput = {
  coupleIds: string[]
  targetMatchesPerCouple: number
  matches: ZoneFixtureMatch[]
  zoneMode: 'MULTI_ZONE' | 'SINGLE_ZONE'
  baseType: 'AMERICAN' | 'LONG'
  disqualifiedCoupleIds?: Iterable<string>
}

export type ZoneFixtureRequirements = {
  expectedTotalMatches: number
  requiredByCouple: Record<string, number>
  incompleteCouples: Array<{ coupleId: string; matchCount: number; missingMatches: number }>
  overLimitCouples: Array<{ coupleId: string; matchCount: number; limit: number }>
  duplicateMatches: Array<{ couple1Id: string; couple2Id: string }>
  isComplete: boolean
  oddThreeMatchExceptionApplied: boolean
}

const pairKey = (first: string, second: string) => [first, second].sort().join(':')

/**
 * Finished matches against a subsequently disqualified couple remain valid
 * credits for their active opponent. Pending matches against that couple are
 * ignored because they neither complete nor constrain the active fixture.
 */
export const resolveZoneFixtureRequirements = (input: ZoneFixtureRequirementInput): ZoneFixtureRequirements => {
  const coupleIds = [...new Set(input.coupleIds)]
  const activeCoupleIds = new Set(coupleIds)
  const disqualifiedCoupleIds = new Set(input.disqualifiedCoupleIds || [])
  const counts = Object.fromEntries(coupleIds.map((id) => [id, 0])) as Record<string, number>
  const pairCounts = new Map<string, number>()
  let usableMatchCount = 0
  let hasHistoricalDisqualificationMatch = false

  for (const match of input.matches) {
    const first = match.couple1_id
    const second = match.couple2_id
    if (!first || !second || first === second) continue

    const firstIsActive = activeCoupleIds.has(first)
    const secondIsActive = activeCoupleIds.has(second)
    const firstIsDisqualified = disqualifiedCoupleIds.has(first)
    const secondIsDisqualified = disqualifiedCoupleIds.has(second)

    if (firstIsActive && secondIsActive) {
      counts[first] += 1
      counts[second] += 1
      const key = pairKey(first, second)
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1)
      usableMatchCount += 1
      continue
    }

    const activeCoupleId = firstIsActive ? first : secondIsActive ? second : null
    if (activeCoupleId && (firstIsDisqualified || secondIsDisqualified) && match.status === 'FINISHED') {
      counts[activeCoupleId] += 1
      usableMatchCount += 1
      hasHistoricalDisqualificationMatch = true
    }
  }
  const isSingleZoneAmerican = input.zoneMode === 'SINGLE_ZONE' && input.baseType === 'AMERICAN'
  const oddThreeMatchExceptionApplied = isSingleZoneAmerican && input.targetMatchesPerCouple === 3 && coupleIds.length >= 5 && coupleIds.length % 2 === 1
  const target = isSingleZoneAmerican && input.targetMatchesPerCouple === 3 && coupleIds.length === 3 ? 2 : input.targetMatchesPerCouple
  const requiredByCouple = Object.fromEntries(coupleIds.map((id) => [id, target])) as Record<string, number>
  const expectedTotalMatches = oddThreeMatchExceptionApplied ? Math.floor(coupleIds.length * 3 / 2) : Math.floor(coupleIds.length * target / 2)
  const matchCountValues = Object.values(counts)
  const oddExceptionCoupleId = oddThreeMatchExceptionApplied
    ? coupleIds.find((id) => counts[id] < target) || null
    : null
  if (oddExceptionCoupleId) {
    requiredByCouple[oddExceptionCoupleId] = target - 1
  }
  const hasValidOddException = !oddThreeMatchExceptionApplied || hasHistoricalDisqualificationMatch || (
    matchCountValues.filter((count) => count === 2).length === 1 &&
    matchCountValues.filter((count) => count === 3).length === coupleIds.length - 1
  )
  const incompleteCouples = coupleIds
    .filter((id) => counts[id] < requiredByCouple[id])
    .map((id) => ({ coupleId: id, matchCount: counts[id], missingMatches: requiredByCouple[id] - counts[id] }))
  const overLimitCouples = coupleIds.filter((id) => counts[id] > target).map((id) => ({ coupleId: id, matchCount: counts[id], limit: target }))
  const duplicateMatches = [...pairCounts.entries()].filter(([, count]) => count > 1).map(([key]) => {
    const [couple1Id, couple2Id] = key.split(':')
    return { couple1Id, couple2Id }
  })
  const hasExpectedMatchCount = hasHistoricalDisqualificationMatch || usableMatchCount === expectedTotalMatches
  return {
    expectedTotalMatches,
    requiredByCouple,
    incompleteCouples,
    overLimitCouples,
    duplicateMatches,
    oddThreeMatchExceptionApplied,
    isComplete: hasExpectedMatchCount && incompleteCouples.length === 0 && overLimitCouples.length === 0 && duplicateMatches.length === 0 && hasValidOddException,
  }
}
