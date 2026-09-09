/**
 * Contrato del motor agnóstico de recomendaciones.
 *
 * Este archivo no conoce Supabase, formatos de torneo ni estados de UI. El
 * adaptador de cada torneo debe traducir sus datos a estos tipos antes de
 * invocar al motor.
 */
export interface ZoneRecommendationCouple {
  id: string
  /** Cantidad total de partidos que esta pareja debe tener comprometidos. */
  requiredMatches: number
}

export interface ZoneRecommendationCommittedMatch {
  couple1Id: string
  couple2Id: string
}

export interface ZoneRecommendationPair {
  couple1Id: string
  couple2Id: string
}

export interface ZoneMatchRecommendationInput {
  couples: ZoneRecommendationCouple[]
  /** Partidos ya creados o finalizados; todos consumen cupo y bloquean repetir el cruce. */
  committedMatches: ZoneRecommendationCommittedMatch[]
  /** Parejas que no pueden comenzar otro partido ahora, pero sí aparecen en el plan futuro. */
  busyCoupleIds?: Iterable<string>
  /** Fusible para evitar que una búsqueda combinatoria demasiado grande monopolice el proceso. */
  maxSearchNodes?: number
  /** Cantidad máxima de cruces seguros adicionales que se devuelven. */
  maxAlternatives?: number
}

export type ZoneMatchRecommendationStatus =
  | 'READY'
  | 'WAITING_FOR_AVAILABLE_COUPLES'
  | 'COMPLETE'
  | 'IMPOSSIBLE'
  | 'SEARCH_LIMIT_REACHED'

export interface ZoneRecommendationDiagnostic {
  code:
    | 'DUPLICATE_COMMITTED_PAIR'
    | 'MATCH_LIMIT_EXCEEDED'
    | 'ODD_REMAINING_TOTAL'
    | 'NOT_ENOUGH_NEW_OPPONENTS'
    | 'NO_COMPLETE_PLAN'
    | 'SEARCH_LIMIT_REACHED'
  message: string
  coupleId?: string
}

export interface ZoneMatchRecommendationResult {
  status: ZoneMatchRecommendationStatus
  /** Primer cruce del lote, conservado por compatibilidad con consumidores simples. */
  recommendedNow: ZoneRecommendationPair | null
  /** Cruces libres, mutuamente compatibles y seguros para comprometer juntos. */
  recommendedBatch: ZoneRecommendationPair[]
  /** Testigo de que el torneo puede cerrarse; en READY comienza con recommendedNow. */
  futurePlan: ZoneRecommendationPair[]
  alternatives: ZoneRecommendationPair[]
  remainingByCouple: Record<string, number>
  diagnostics: ZoneRecommendationDiagnostic[]
  visitedNodes: number
}

export interface ZoneRecommendationCandidateAssessment {
  safe: boolean
  reason: 'SAFE' | 'COUPLE_BUSY' | 'PAIR_NOT_ELIGIBLE' | 'NO_COMPLETE_PLAN' | 'SEARCH_LIMIT_REACHED'
  remainingPlan: ZoneRecommendationPair[]
  result: ZoneMatchRecommendationResult
}

/** Clave canónica: A-B y B-A representan siempre el mismo cruce. */
export const zoneRecommendationPairKey = (couple1Id: string, couple2Id: string) =>
  [couple1Id, couple2Id].sort().join(':')
