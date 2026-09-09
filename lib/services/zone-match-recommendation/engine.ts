import {
  ZoneMatchRecommendationInput,
  ZoneMatchRecommendationResult,
  ZoneRecommendationCandidateAssessment,
  ZoneRecommendationDiagnostic,
  ZoneRecommendationPair,
  zoneRecommendationPairKey,
} from './types'

/**
 * Motor puro de planificación de cruces.
 *
 * Modela los partidos pendientes como un grafo: cada pareja es un nodo y cada
 * cruce nuevo posible es una arista. La búsqueda intenta completar el grado
 * pendiente de todos los nodos sin reutilizar aristas.
 */

interface PreparedState {
  coupleIds: string[]
  requiredByCouple: Map<string, number>
  remainingByCouple: Map<string, number>
  committedPairKeys: Set<string>
  busyCoupleIds: Set<string>
  diagnostics: ZoneRecommendationDiagnostic[]
}

interface SearchResult {
  plan: ZoneRecommendationPair[] | null
  exhausted: boolean
  visitedNodes: number
}

const toRecord = (values: Map<string, number>) =>
  Object.fromEntries([...values.entries()].sort(([left], [right]) => left.localeCompare(right)))

const comparePairs = (left: ZoneRecommendationPair, right: ZoneRecommendationPair) =>
  zoneRecommendationPairKey(left.couple1Id, left.couple2Id)
    .localeCompare(zoneRecommendationPairKey(right.couple1Id, right.couple2Id))

const prepareState = (input: ZoneMatchRecommendationInput): PreparedState => {
  const couplesById = new Map(input.couples.map(couple => [couple.id, couple]))
  const coupleIds = [...couplesById.keys()].sort()
  const requiredByCouple = new Map(
    coupleIds.map(id => [id, Math.max(0, Math.floor(couplesById.get(id)?.requiredMatches || 0))]),
  )
  const assignedByCouple = new Map(coupleIds.map(id => [id, 0]))
  const committedPairCounts = new Map<string, number>()
  const committedPairKeys = new Set<string>()

  for (const match of input.committedMatches) {
    if (!match.couple1Id || !match.couple2Id || match.couple1Id === match.couple2Id) continue

    if (assignedByCouple.has(match.couple1Id)) {
      assignedByCouple.set(match.couple1Id, (assignedByCouple.get(match.couple1Id) || 0) + 1)
    }
    if (assignedByCouple.has(match.couple2Id)) {
      assignedByCouple.set(match.couple2Id, (assignedByCouple.get(match.couple2Id) || 0) + 1)
    }

    if (couplesById.has(match.couple1Id) && couplesById.has(match.couple2Id)) {
      const key = zoneRecommendationPairKey(match.couple1Id, match.couple2Id)
      committedPairKeys.add(key)
      committedPairCounts.set(key, (committedPairCounts.get(key) || 0) + 1)
    }
  }

  const diagnostics: ZoneRecommendationDiagnostic[] = []
  for (const [key, count] of committedPairCounts) {
    if (count <= 1) continue
    diagnostics.push({
      code: 'DUPLICATE_COMMITTED_PAIR',
      message: `El cruce ${key} aparece ${count} veces entre los partidos comprometidos.`,
    })
  }

  const remainingByCouple = new Map<string, number>()
  for (const coupleId of coupleIds) {
    const required = requiredByCouple.get(coupleId) || 0
    const assigned = assignedByCouple.get(coupleId) || 0
    if (assigned > required) {
      diagnostics.push({
        code: 'MATCH_LIMIT_EXCEEDED',
        coupleId,
        message: `La pareja tiene ${assigned} partidos comprometidos y un objetivo de ${required}.`,
      })
    }
    remainingByCouple.set(coupleId, Math.max(0, required - assigned))
  }

  return {
    coupleIds,
    requiredByCouple,
    remainingByCouple,
    committedPairKeys,
    busyCoupleIds: new Set(input.busyCoupleIds || []),
    diagnostics,
  }
}

const getEligibleOpponents = (
  coupleId: string,
  coupleIds: string[],
  remainingByCouple: Map<string, number>,
  forbiddenPairKeys: Set<string>,
) => coupleIds.filter(otherId =>
  otherId !== coupleId &&
  (remainingByCouple.get(otherId) || 0) > 0 &&
  !forbiddenPairKeys.has(zoneRecommendationPairKey(coupleId, otherId)),
)

const getFeasibilityDiagnostic = (
  coupleIds: string[],
  remainingByCouple: Map<string, number>,
  forbiddenPairKeys: Set<string>,
): ZoneRecommendationDiagnostic | null => {
  // Dos podas baratas antes del backtracking: paridad global y cantidad de
  // rivales inéditos disponibles para cada pareja.
  const totalRemaining = [...remainingByCouple.values()].reduce((sum, count) => sum + count, 0)
  if (totalRemaining % 2 !== 0) {
    return {
      code: 'ODD_REMAINING_TOTAL',
      message: 'La suma de partidos faltantes es impar y no puede dividirse en cruces de dos parejas.',
    }
  }

  for (const coupleId of coupleIds) {
    const needed = remainingByCouple.get(coupleId) || 0
    if (needed === 0) continue
    const opponentCount = getEligibleOpponents(
      coupleId,
      coupleIds,
      remainingByCouple,
      forbiddenPairKeys,
    ).length
    if (needed > opponentCount) {
      return {
        code: 'NOT_ENOUGH_NEW_OPPONENTS',
        coupleId,
        message: `La pareja necesita ${needed} partido(s), pero sólo conserva ${opponentCount} rival(es) nuevo(s) con cupo.`,
      }
    }
  }

  return null
}

const findCompletionPlan = (
  coupleIds: string[],
  initialRemaining: Map<string, number>,
  initialForbiddenPairKeys: Set<string>,
  maxSearchNodes: number,
): SearchResult => {
  // DFS con backtracking. Se elige primero la pareja más restringida (MRV),
  // porque encontrar un callejón sin salida temprano reduce mucho la búsqueda.
  let visitedNodes = 0
  let exhausted = false
  const failedStates = new Set<string>()

  const search = (
    remainingByCouple: Map<string, number>,
    forbiddenPairKeys: Set<string>,
  ): ZoneRecommendationPair[] | null => {
    visitedNodes += 1
    if (visitedNodes > maxSearchNodes) {
      exhausted = true
      return null
    }

    const totalRemaining = [...remainingByCouple.values()].reduce((sum, count) => sum + count, 0)
    if (totalRemaining === 0) return []

    if (getFeasibilityDiagnostic(coupleIds, remainingByCouple, forbiddenPairKeys)) return null

    // Memorizar estados imposibles evita explorar el mismo subproblema más de una vez.
    const stateKey = `${coupleIds.map(id => `${id}:${remainingByCouple.get(id) || 0}`).join(',')}|${[...forbiddenPairKeys].sort().join(',')}`
    if (failedStates.has(stateKey)) return null

    const constrainedCoupleId = coupleIds
      .filter(id => (remainingByCouple.get(id) || 0) > 0)
      .map(id => ({
        id,
        opponents: getEligibleOpponents(id, coupleIds, remainingByCouple, forbiddenPairKeys),
        needed: remainingByCouple.get(id) || 0,
      }))
      .sort((left, right) =>
        left.opponents.length - right.opponents.length ||
        right.needed - left.needed ||
        left.id.localeCompare(right.id),
      )[0]

    if (!constrainedCoupleId) return []

    const opponents = constrainedCoupleId.opponents.sort((left, right) => {
      const leftOptions = getEligibleOpponents(left, coupleIds, remainingByCouple, forbiddenPairKeys).length
      const rightOptions = getEligibleOpponents(right, coupleIds, remainingByCouple, forbiddenPairKeys).length
      return leftOptions - rightOptions || left.localeCompare(right)
    })

    for (const opponentId of opponents) {
      const nextRemaining = new Map(remainingByCouple)
      nextRemaining.set(constrainedCoupleId.id, (nextRemaining.get(constrainedCoupleId.id) || 0) - 1)
      nextRemaining.set(opponentId, (nextRemaining.get(opponentId) || 0) - 1)

      const nextForbidden = new Set(forbiddenPairKeys)
      nextForbidden.add(zoneRecommendationPairKey(constrainedCoupleId.id, opponentId))

      const rest = search(nextRemaining, nextForbidden)
      if (rest) {
        return [{ couple1Id: constrainedCoupleId.id, couple2Id: opponentId }, ...rest]
      }
      if (exhausted) return null
    }

    failedStates.add(stateKey)
    return null
  }

  const plan = search(new Map(initialRemaining), new Set(initialForbiddenPairKeys))
  return { plan, exhausted, visitedNodes }
}

const candidatePairs = (state: PreparedState) => {
  // busyCoupleIds sólo limita qué se puede jugar AHORA. No se usa para el plan
  // global porque esas parejas volverán a quedar libres al terminar su partido.
  const pairs: ZoneRecommendationPair[] = []
  for (let firstIndex = 0; firstIndex < state.coupleIds.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < state.coupleIds.length; secondIndex += 1) {
      const couple1Id = state.coupleIds[firstIndex]
      const couple2Id = state.coupleIds[secondIndex]
      if ((state.remainingByCouple.get(couple1Id) || 0) === 0) continue
      if ((state.remainingByCouple.get(couple2Id) || 0) === 0) continue
      if (state.busyCoupleIds.has(couple1Id) || state.busyCoupleIds.has(couple2Id)) continue
      if (state.committedPairKeys.has(zoneRecommendationPairKey(couple1Id, couple2Id))) continue
      pairs.push({ couple1Id, couple2Id })
    }
  }

  return pairs.sort((left, right) => {
    const leftFlexibility =
      getEligibleOpponents(left.couple1Id, state.coupleIds, state.remainingByCouple, state.committedPairKeys).length +
      getEligibleOpponents(left.couple2Id, state.coupleIds, state.remainingByCouple, state.committedPairKeys).length
    const rightFlexibility =
      getEligibleOpponents(right.couple1Id, state.coupleIds, state.remainingByCouple, state.committedPairKeys).length +
      getEligibleOpponents(right.couple2Id, state.coupleIds, state.remainingByCouple, state.committedPairKeys).length
    return leftFlexibility - rightFlexibility || comparePairs(left, right)
  })
}

const applyCandidate = (state: PreparedState, candidate: ZoneRecommendationPair) => {
  const remaining = new Map(state.remainingByCouple)
  remaining.set(candidate.couple1Id, (remaining.get(candidate.couple1Id) || 0) - 1)
  remaining.set(candidate.couple2Id, (remaining.get(candidate.couple2Id) || 0) - 1)
  const forbidden = new Set(state.committedPairKeys)
  forbidden.add(zoneRecommendationPairKey(candidate.couple1Id, candidate.couple2Id))
  return { remaining, forbidden }
}

const buildPlayableBatch = (
  plan: ZoneRecommendationPair[],
  busyCoupleIds: Set<string>,
) => {
  const usedCoupleIds = new Set<string>()
  const batch: ZoneRecommendationPair[] = []

  // Todas las aristas pertenecen al mismo plan completo. Tomar un matching de
  // ese plan permite comprometer varios cruces juntos sin usar una pareja dos
  // veces ni perder la prueba de que el fixture todavía puede cerrarse.
  for (const match of plan) {
    if (busyCoupleIds.has(match.couple1Id) || busyCoupleIds.has(match.couple2Id)) continue
    if (usedCoupleIds.has(match.couple1Id) || usedCoupleIds.has(match.couple2Id)) continue

    batch.push(match)
    usedCoupleIds.add(match.couple1Id)
    usedCoupleIds.add(match.couple2Id)
  }

  return batch
}

export const recommendZoneMatches = (
  input: ZoneMatchRecommendationInput,
): ZoneMatchRecommendationResult => {
  const state = prepareState(input)
  const maxSearchNodes = input.maxSearchNodes ?? 500_000
  const maxAlternatives = input.maxAlternatives ?? 3
  const remainingByCouple = toRecord(state.remainingByCouple)
  let visitedNodes = 0

  if (state.diagnostics.length > 0) {
    return {
      status: 'IMPOSSIBLE',
      recommendedNow: null,
      recommendedBatch: [],
      futurePlan: [],
      alternatives: [],
      remainingByCouple,
      diagnostics: state.diagnostics,
      visitedNodes,
    }
  }

  if ([...state.remainingByCouple.values()].every(count => count === 0)) {
    return {
      status: 'COMPLETE',
      recommendedNow: null,
      recommendedBatch: [],
      futurePlan: [],
      alternatives: [],
      remainingByCouple,
      diagnostics: [],
      visitedNodes,
    }
  }

  const feasibilityDiagnostic = getFeasibilityDiagnostic(
    state.coupleIds,
    state.remainingByCouple,
    state.committedPairKeys,
  )
  if (feasibilityDiagnostic) {
    return {
      status: 'IMPOSSIBLE',
      recommendedNow: null,
      recommendedBatch: [],
      futurePlan: [],
      alternatives: [],
      remainingByCouple,
      diagnostics: [feasibilityDiagnostic],
      visitedNodes,
    }
  }

  // Primero demostramos que existe al menos un cierre global, incluyendo a las
  // parejas ocupadas. Luego probamos cada cruce actualmente jugable y sólo
  // recomendamos los que preservan algún cierre completo.
  const globalSearch = findCompletionPlan(
    state.coupleIds,
    state.remainingByCouple,
    state.committedPairKeys,
    maxSearchNodes,
  )
  visitedNodes += globalSearch.visitedNodes

  if (!globalSearch.plan) {
    const code = globalSearch.exhausted ? 'SEARCH_LIMIT_REACHED' : 'NO_COMPLETE_PLAN'
    return {
      status: globalSearch.exhausted ? 'SEARCH_LIMIT_REACHED' : 'IMPOSSIBLE',
      recommendedNow: null,
      recommendedBatch: [],
      futurePlan: [],
      alternatives: [],
      remainingByCouple,
      diagnostics: [{
        code,
        message: globalSearch.exhausted
          ? 'La búsqueda alcanzó el límite de seguridad antes de demostrar una solución.'
          : 'No existe una combinación que complete todos los partidos sin repetir cruces.',
      }],
      visitedNodes,
    }
  }

  const safePlans: Array<{
    candidate: ZoneRecommendationPair
    plan: ZoneRecommendationPair[]
    batch: ZoneRecommendationPair[]
  }> = []
  let candidateSearchExhausted = false
  const availableCoupleCount = state.coupleIds.filter(coupleId =>
    !state.busyCoupleIds.has(coupleId) && (state.remainingByCouple.get(coupleId) || 0) > 0,
  ).length
  const maximumBatchSize = Math.floor(availableCoupleCount / 2)
  const maxSafePlansToCompare = Math.max(maxAlternatives + 1, 12)

  for (const candidate of candidatePairs(state)) {
    const simulated = applyCandidate(state, candidate)
    const search = findCompletionPlan(
      state.coupleIds,
      simulated.remaining,
      simulated.forbidden,
      maxSearchNodes,
    )
    visitedNodes += search.visitedNodes
    if (search.plan) {
      const plan = [candidate, ...search.plan]
      safePlans.push({
        candidate,
        plan,
        batch: buildPlayableBatch(plan, state.busyCoupleIds),
      })

      const hasMaximumBatch = safePlans.some(item => item.batch.length === maximumBatchSize)
      if (
        (hasMaximumBatch && safePlans.length >= maxAlternatives + 1) ||
        safePlans.length >= maxSafePlansToCompare
      ) break
    } else if (search.exhausted) {
      candidateSearchExhausted = true
    }
  }

  if (safePlans.length === 0) {
    return {
      status: candidateSearchExhausted ? 'SEARCH_LIMIT_REACHED' : 'WAITING_FOR_AVAILABLE_COUPLES',
      recommendedNow: null,
      recommendedBatch: [],
      futurePlan: globalSearch.plan,
      alternatives: [],
      remainingByCouple,
      diagnostics: candidateSearchExhausted ? [{
        code: 'SEARCH_LIMIT_REACHED',
        message: 'No se pudo verificar un cruce jugable antes de alcanzar el límite de búsqueda.',
      }] : [],
      visitedNodes,
    }
  }

  const [selected, ...alternativePlans] = safePlans.sort((left, right) =>
    right.batch.length - left.batch.length || comparePairs(left.candidate, right.candidate),
  )
  const selectedBatchKeys = new Set(selected.batch.map(match =>
    zoneRecommendationPairKey(match.couple1Id, match.couple2Id),
  ))

  return {
    status: 'READY',
    recommendedNow: selected.candidate,
    recommendedBatch: selected.batch,
    futurePlan: selected.plan,
    alternatives: alternativePlans
      .filter(item => !selectedBatchKeys.has(zoneRecommendationPairKey(
        item.candidate.couple1Id,
        item.candidate.couple2Id,
      )))
      .slice(0, maxAlternatives)
      .map(item => item.candidate),
    remainingByCouple,
    diagnostics: [],
    visitedNodes,
  }
}

export const assessZoneMatchCandidate = (
  input: ZoneMatchRecommendationInput,
  candidate: ZoneRecommendationPair,
): ZoneRecommendationCandidateAssessment => {
  // Este es el mismo chequeo que usa la escritura: simula el partido solicitado
  // como ya comprometido y vuelve a resolver el resto del fixture.
  const state = prepareState(input)
  const key = zoneRecommendationPairKey(candidate.couple1Id, candidate.couple2Id)
  const pairIsEligible =
    candidate.couple1Id !== candidate.couple2Id &&
    state.remainingByCouple.has(candidate.couple1Id) &&
    state.remainingByCouple.has(candidate.couple2Id) &&
    (state.remainingByCouple.get(candidate.couple1Id) || 0) > 0 &&
    (state.remainingByCouple.get(candidate.couple2Id) || 0) > 0 &&
    !state.committedPairKeys.has(key)

  const currentResult = recommendZoneMatches(input)
  if (!pairIsEligible) {
    return { safe: false, reason: 'PAIR_NOT_ELIGIBLE', remainingPlan: [], result: currentResult }
  }
  if (state.busyCoupleIds.has(candidate.couple1Id) || state.busyCoupleIds.has(candidate.couple2Id)) {
    return { safe: false, reason: 'COUPLE_BUSY', remainingPlan: [], result: currentResult }
  }

  const simulatedInput: ZoneMatchRecommendationInput = {
    ...input,
    committedMatches: [...input.committedMatches, candidate],
    busyCoupleIds: [...state.busyCoupleIds, candidate.couple1Id, candidate.couple2Id],
  }
  const result = recommendZoneMatches(simulatedInput)
  const safe = result.status !== 'IMPOSSIBLE' && result.status !== 'SEARCH_LIMIT_REACHED'
  return {
    safe,
    reason: safe ? 'SAFE' : result.status === 'SEARCH_LIMIT_REACHED' ? 'SEARCH_LIMIT_REACHED' : 'NO_COMPLETE_PLAN',
    remainingPlan: safe ? result.futurePlan : [],
    result,
  }
}
