import type { BracketKey } from '@/types/tournament-format-v2'
import type { TournamentBonuses } from '@/lib/tournaments/finalization'
import type { MatchPointsCouple } from './points-calculation.types'

export interface PointsCategory {
  name: string
  lower_range: number
  upper_range: number | null
}

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
}

export interface BonusAward {
  cup: BracketKey
  position: 'champion' | 'finalist'
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
}

export interface PointsReview {
  tournamentId: string
  tournamentType: 'AMERICAN' | 'LONG'
  state: 'PREVIEW' | 'APPLIED' | 'LEGACY'
  rulesVersion: 'manual-categories-v1' | 'legacy'
  fingerprint: string
  playerScores: PointsReviewPlayer[]
  categories: PointsCategory[]
  bonuses: TournamentBonuses
  totalMatches: number
  scoreBasis: 'SNAPSHOT' | 'CURRENT' | 'MIXED' | 'LEGACY'
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
  }
  players: PointsPlayer[]
  couples: PointsCouple[]
  matches: PointsMatch[]
  inscriptions: { player_id: string | null; couple_id: string | null; is_pending: boolean | null }[]
  categories: PointsCategory[]
  snapshots: { player_id: string; score: number; category: string | null }[]
  disqualifications: { match_id: string | null; couple_id: string }[]
  history: { player_id: string; points_before: number; points_after: number; points_earned: number }[]
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
