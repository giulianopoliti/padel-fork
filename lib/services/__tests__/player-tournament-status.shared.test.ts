import {
  resolvePlayerTournamentStatus,
  type PlayerTournamentStatusInscription,
  type PlayerTournamentStatusMatch
} from '@/lib/services/player-tournament-status.shared'

describe('resolvePlayerTournamentStatus', () => {
  const playerId = 'player-1'
  const tournamentId = 'tournament-1'

  const makeCoupleInscription = (
    overrides: Partial<PlayerTournamentStatusInscription> = {}
  ): PlayerTournamentStatusInscription => ({
    id: 'inscription-1',
    tournament_id: tournamentId,
    couple_id: 'couple-1',
    player_id: null,
    is_eliminated: false,
    is_pending: false,
    created_at: '2026-05-04T00:00:00.000Z',
    couples: {
      id: 'couple-1',
      player1_id: playerId,
      player2_id: 'player-2'
    },
    ...overrides
  })

  const makeMatch = (
    overrides: Partial<PlayerTournamentStatusMatch> = {}
  ): PlayerTournamentStatusMatch => ({
    id: 'match-1',
    tournament_id: tournamentId,
    couple1_id: 'couple-1',
    couple2_id: 'couple-2',
    status: 'PENDING',
    ...overrides
  })

  it('returns NOT_REGISTERED when no inscriptions exist', () => {
    const result = resolvePlayerTournamentStatus(playerId, tournamentId, [], [])
    expect(result.state).toBe('NOT_REGISTERED')
    expect(result.uiState).toBe('NOT_REGISTERED')
    expect(result.isInscribed).toBe(false)
  })

  it('keeps a saved couple without a place in the pending view',()=>{
    const result=resolvePlayerTournamentStatus(playerId,tournamentId,[makeCoupleInscription({occupies_slot:false})],[])
    expect(result).toMatchObject({state:'REGISTERED_PENDING',isInscribed:true,isPending:true})
  })

  it('preserves existing matches after the receipt is removed',()=>{
    const result=resolvePlayerTournamentStatus(playerId,tournamentId,[makeCoupleInscription({occupies_slot:true,registration_incomplete:true})],[makeMatch()])
    expect(result.uiState).toBe('REGISTERED_ACTIVE')
  })

  it('returns REGISTERED_ACTIVE for active couple inscription', () => {
    const result = resolvePlayerTournamentStatus(
      playerId,
      tournamentId,
      [makeCoupleInscription()],
      []
    )
    expect(result.state).toBe('REGISTERED_ACTIVE')
    expect(result.uiState).toBe('REGISTERED_ACTIVE')
    expect(result.isInscribed).toBe(true)
    expect(result.isEliminated).toBe(false)
    expect(result.isPending).toBe(false)
  })

  it('returns REGISTERED_ELIMINATED when inscription is eliminated', () => {
    const result = resolvePlayerTournamentStatus(
      playerId,
      tournamentId,
      [makeCoupleInscription({ is_eliminated: true })],
      []
    )
    expect(result.state).toBe('REGISTERED_ELIMINATED')
    expect(result.uiState).toBe('REGISTERED_ELIMINATED')
    expect(result.isEliminated).toBe(true)
  })

  it('returns REGISTERED_PENDING when inscription is pending', () => {
    const result = resolvePlayerTournamentStatus(
      playerId,
      tournamentId,
      [makeCoupleInscription({ is_pending: true })],
      []
    )
    expect(result.state).toBe('REGISTERED_PENDING')
    expect(result.uiState).toBe('REGISTERED_PENDING')
    expect(result.isPending).toBe(true)
  })

  it('returns INCONSISTENT_DATA when active match exists without active inscription', () => {
    const result = resolvePlayerTournamentStatus(
      playerId,
      tournamentId,
      [],
      [makeMatch()]
    )
    expect(result.state).toBe('INCONSISTENT_DATA')
    expect(result.uiState).toBe('NOT_REGISTERED')
    expect(result.inconsistencyType).toBe('MATCH_WITHOUT_ACTIVE_INSCRIPTION')
  })
})
