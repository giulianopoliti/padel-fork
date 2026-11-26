import type { BracketKey } from '@/types/tournament-format-v2'
import type { TournamentBonuses } from '@/lib/tournaments/finalization'
import type { MatchPointsCouple } from './points-calculation.types'

export interface PointsCategory {
  name: string
  level: number | null
  initial_score: number
}

export type FixedRankingPolicy = 'FV_LEAGUE' | 'ELITE_AMERICAN'

export interface PointsPlayer {
  id: string
  first_name: string | null
  last_name: string | null
  score: number | null
  category_name: string | null
}

export interface PointsCouple {
  id: string
  player1_id: string | null
  player2_id: string | null
}

export interface PointsMatch {
  id: string
  type: string | null
  round: string | null
  bracket_key: string | null
  status: string
  winner_id: string | null
  couple1_id: string | null
  couple2_id: string | null
  bracket_is_active: boolean
  administrative_result?: boolean
}

export interface BonusAward {
  cup: BracketKey
  position: 'champion' | 'finalist' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL'
  points: number
}

export interface PointsReviewPlayer {
  playerId: string
  playerName: string
  categoryBefore: string | null
  categoryAfter: string | null
  pointsBefore: number
  matchPoints: number | null
  bonus: number | null
  bonusAwards: BonusAward[]
  pointsEarned: number
  pointsAfter: number
  rankingCategory?: string | null
  categoryPointsAfter?: number
  titleMatchId?: string | null
  champion?: boolean
  automaticPromotion?: boolean
  promotionNeedsReview?: boolean
  promotionDeclined?: boolean
  wins?: number
  matchesPlayed?: number
  tournamentResult?: PointsTournamentResult
}

export interface PointsTournamentResult {
  coupleId: string
  coupleName: string
  cup: BracketKey | null
  stage: 'champion' | 'finalist' | 'SEMIFINAL' | '4TOS' | '8VOS' | '16VOS' | '32VOS' | 'UNRESOLVED' | 'ZONE' | 'NO_MATCHES'
  lastRound?: string | null
}

export interface PointsReview {
  tournamentId: string
  tournamentType: 'AMERICAN' | 'LONG'
  state: 'PREVIEW' | 'APPLIED' | 'LEGACY'
  rulesVersion: 'manual-categories-v1' | 'fixed-ranking-v1' | 'legacy'
  fingerprint: string
  playerScores: PointsReviewPlayer[]
  categories: PointsCategory[]
  bonuses: TournamentBonuses
  totalMatches: number
  scoreBasis: 'SNAPSHOT' | 'CURRENT' | 'MIXED' | 'FIXED' | 'LEGACY'
  hasSubstitutionBaselines?: boolean
  appliedAt?: string
}

export interface ManualCategoryDecision {
  playerId: string
  newCategory: string
}

export interface PointsContext {
  tournament: {
    id: string
    type: string
    status: string
    format_type: string | null
    format_config: unknown
    category_name?: string | null
    category_config?: unknown
    winner_id?: string | null
    es_prueba?: boolean
  }
  players: PointsPlayer[]
  couples: PointsCouple[]
  matches: PointsMatch[]
  lineups?: { match_id: string; couple_id: string; player1_id: string; player2_id: string; substitute_slot: 1 | 2 }[]
  inscriptions: { player_id: string | null; couple_id: string | null; is_pending: boolean | null }[]
  categories: PointsCategory[]
  snapshots: { player_id: string; score: number; category: string | null; basis?: 'START' | 'SUBSTITUTION' }[]
  disqualifications: { match_id: string | null; couple_id: string }[]
  history: { player_id: string; points_before: number; points_after: number; points_earned: number }[]
  rankingPolicy?: FixedRankingPolicy | null
  roundRobinChampion?: string | null
}

export interface PointsContextResponse {
  context: PointsContext
  fingerprint: string
  settlement: PointsReview | null
}

export interface PointsSettlementInput {
  review: PointsReview
  matchPoints: Omit<MatchPointsCouple, 'id' | 'created_at'>[]
}
