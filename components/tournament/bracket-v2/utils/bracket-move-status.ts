import type { MatchStatus } from '../types/bracket-types'

type BracketMoveStatus = MatchStatus | 'WAITING_OPONENT' | string | null | undefined

const BRACKET_MOVE_ALLOWED_STATUSES = new Set<string>([
  'PENDING',
  'WAITING_OPONENT',
  'WAITING_OPPONENT',
])

/**
 * Matches can be reorganized only while they are not being played or finished.
 * Accept both WAITING_OPONENT (DB enum typo) and WAITING_OPPONENT (normalized UI type).
 */
export const isBracketMoveAllowedStatus = (status: BracketMoveStatus): boolean => {
  return !!status && BRACKET_MOVE_ALLOWED_STATUSES.has(status)
}
