import {
  transformCurrentApiMatchToBracketV2,
  transformMatchStatus,
  type CurrentApiMatch
} from '../format-adapters'

const makeCouple = (id: string) => ({
  id,
  player1: {
    first_name: `Player ${id}`,
    last_name: 'One'
  },
  player2: {
    first_name: `Player ${id}`,
    last_name: 'Two'
  }
})

const makeMatch = (overrides: Partial<CurrentApiMatch>): CurrentApiMatch => ({
  id: 'match-1',
  tournament_id: 'tournament-1',
  round: '4TOS',
  status: 'PENDING',
  created_at: '2026-05-27T00:00:00.000Z',
  order_in_round: 1,
  couple1_id: 'couple-1',
  couple2_id: 'couple-2',
  couple1: makeCouple('couple-1'),
  couple2: makeCouple('couple-2'),
  seed1: {
    id: 'seed-1',
    couple_id: 'couple-1',
    seed: 1,
    bracket_position: 1,
    placeholder_label: '1A',
    is_placeholder: false
  },
  seed2: {
    id: 'seed-2',
    couple_id: 'couple-2',
    seed: 2,
    bracket_position: 2,
    placeholder_label: '2B',
    is_placeholder: false
  },
  couple1_placeholder_label: '1A',
  couple1_is_placeholder: false,
  couple2_placeholder_label: '2B',
  couple2_is_placeholder: false,
  ...overrides
})

describe('format-adapters match status normalization', () => {
  it('keeps PENDING when both real couples are present even if seed labels exist', () => {
    const match = transformCurrentApiMatchToBracketV2(makeMatch({}), [])

    expect(match.status).toBe('PENDING')
  })

  it('converts stale WAITING_OPONENT to PENDING when both real couples are present', () => {
    const match = transformCurrentApiMatchToBracketV2(makeMatch({ status: 'WAITING_OPONENT' }), [])

    expect(match.status).toBe('PENDING')
  })

  it('keeps a pending match waiting when a real opponent is missing', () => {
    const match = transformCurrentApiMatchToBracketV2(
      makeMatch({
        couple2_id: null,
        couple2: null,
        seed2: {
          id: 'seed-2',
          couple_id: null,
          seed: 2,
          bracket_position: 2,
          placeholder_label: '2B',
          is_placeholder: true
        },
        couple2_placeholder_label: '2B',
        couple2_is_placeholder: true
      }),
      []
    )

    expect(match.status).toBe('WAITING_OPPONENT')
  })

  it('preserves active and finished states when both real couples are present', () => {
    const inProgress = transformCurrentApiMatchToBracketV2(makeMatch({ status: 'IN_PROGRESS' }), [])
    const finished = transformCurrentApiMatchToBracketV2(makeMatch({ status: 'FINISHED' }), [])

    expect(inProgress.status).toBe('IN_PROGRESS')
    expect(finished.status).toBe('FINISHED')
  })

  it('preserves DRAFT when both real couples are present', () => {
    const match = transformCurrentApiMatchToBracketV2(makeMatch({ status: 'DRAFT' }), [])

    expect(match.status).toBe('DRAFT')
  })

  it('normalizes the legacy WAITING_OPONENT typo', () => {
    expect(transformMatchStatus('WAITING_OPONENT')).toBe('WAITING_OPPONENT')
  })
})
