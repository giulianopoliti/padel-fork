import type { FixedRankingPolicy } from '../types/points-review.types'

export const FIXED_RANKING = {
  FV_LEAGUE: { win: 12, champion: 300, eliminated: { '16VOS': 30, '8VOS': 50, '4TOS': 100, SEMIFINAL: 150, FINAL: 200 } },
  ELITE_AMERICAN: { win: 6, champion: 150, eliminated: { '16VOS': 15, '8VOS': 25, '4TOS': 50, SEMIFINAL: 75, FINAL: 100 } },
} satisfies Record<FixedRankingPolicy, { win: number; champion: number; eliminated: Record<string, number> }>

export const getFixedRankingPolicy = (policy: FixedRankingPolicy | null | undefined, type: string): FixedRankingPolicy | null => {
  if (policy === 'FV_LEAGUE' && type === 'LONG') return policy
  if (policy === 'ELITE_AMERICAN' && ['AMERICAN', 'AMERICAN_OTP', 'AMERICANO'].includes(type)) return policy
  return null
}
