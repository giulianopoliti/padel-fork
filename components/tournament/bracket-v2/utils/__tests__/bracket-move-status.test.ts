import { isBracketMoveAllowedStatus } from '../bracket-move-status'

describe('isBracketMoveAllowedStatus', () => {
  it('allows pending and waiting-opponent bracket states', () => {
    expect(isBracketMoveAllowedStatus('PENDING')).toBe(true)
    expect(isBracketMoveAllowedStatus('WAITING_OPONENT')).toBe(true)
    expect(isBracketMoveAllowedStatus('WAITING_OPPONENT')).toBe(true)
  })

  it('blocks states that should not be reordered from the UI', () => {
    expect(isBracketMoveAllowedStatus('FINISHED')).toBe(false)
    expect(isBracketMoveAllowedStatus('IN_PROGRESS')).toBe(false)
    expect(isBracketMoveAllowedStatus('CANCELED')).toBe(false)
    expect(isBracketMoveAllowedStatus('BYE')).toBe(false)
    expect(isBracketMoveAllowedStatus('DRAFT')).toBe(false)
  })

  it('blocks missing or unknown statuses', () => {
    expect(isBracketMoveAllowedStatus(null)).toBe(false)
    expect(isBracketMoveAllowedStatus(undefined)).toBe(false)
    expect(isBracketMoveAllowedStatus('COMPLETED')).toBe(false)
  })
})
