export type PlayerTournamentState =
  | 'NOT_REGISTERED'
  | 'REGISTERED_ACTIVE'
  | 'REGISTERED_ELIMINATED'
  | 'REGISTERED_PENDING'
  | 'INCONSISTENT_DATA'

export type PlayerTournamentUIState =
  | 'NOT_REGISTERED'
  | 'REGISTERED_ACTIVE'
  | 'REGISTERED_ELIMINATED'
  | 'REGISTERED_PENDING'

export type PlayerTournamentInconsistencyType =
  | 'MATCH_WITHOUT_ACTIVE_INSCRIPTION'
  | 'ACTIVE_MATCH_WHILE_ELIMINATED'
  | 'ACTIVE_MATCH_WHILE_PENDING'

export interface PlayerTournamentStatusInscription {
  id: string
  tournament_id: string
  couple_id: string | null
  player_id: string | null
  is_eliminated: boolean | null
  is_pending: boolean | null
  occupies_slot?: boolean
  registration_incomplete?: boolean
  created_at?: string | null
  couples?: {
    id: string
    player1_id: string
    player2_id: string
  } | null
}

export interface PlayerTournamentStatusMatch {
  id: string
  tournament_id: string
  couple1_id: string | null
  couple2_id: string | null
  status: string
}

export interface PlayerTournamentStatus {
  tournamentId: string
  playerId: string
  state: PlayerTournamentState
  uiState: PlayerTournamentUIState
  isInscribed: boolean
  isEliminated: boolean
  isPending: boolean
  coupleId: string | null
  inscriptionId: string | null
  inconsistencyType?: PlayerTournamentInconsistencyType
}

const statePriority: Record<PlayerTournamentUIState, number> = {
  REGISTERED_ELIMINATED: 4,
  REGISTERED_ACTIVE: 3,
  REGISTERED_PENDING: 2,
  NOT_REGISTERED: 1
}

function mapInscriptionToUiState(
  inscription: PlayerTournamentStatusInscription
): PlayerTournamentUIState {
  if (inscription.is_eliminated) return 'REGISTERED_ELIMINATED'
  if (inscription.is_pending || inscription.couple_id && (inscription.occupies_slot === false || inscription.registration_incomplete)) return 'REGISTERED_PENDING'
  return 'REGISTERED_ACTIVE'
}

function getCandidateInscriptionsForPlayer(
  inscriptions: PlayerTournamentStatusInscription[],
  playerId: string
): PlayerTournamentStatusInscription[] {
  return inscriptions.filter((inscription) => {
    if (inscription.player_id === playerId) return true

    const couple = inscription.couples
    if (!couple) return false

    return couple.player1_id === playerId || couple.player2_id === playerId
  })
}

function pickBestInscription(
  inscriptions: PlayerTournamentStatusInscription[]
): PlayerTournamentStatusInscription | null {
  if (inscriptions.length === 0) return null

  return inscriptions
    .slice()
    .sort((a, b) => {
      const stateDiff = statePriority[mapInscriptionToUiState(b)] - statePriority[mapInscriptionToUiState(a)]
      if (stateDiff !== 0) return stateDiff

      const aHasCouple = a.couple_id ? 1 : 0
      const bHasCouple = b.couple_id ? 1 : 0
      if (aHasCouple !== bHasCouple) return bHasCouple - aHasCouple

      const aTs = a.created_at ? new Date(a.created_at).getTime() : 0
      const bTs = b.created_at ? new Date(b.created_at).getTime() : 0
      return bTs - aTs
    })[0]
}

function getActiveMatchesForPlayer(
  matches: PlayerTournamentStatusMatch[],
  candidateCoupleIds: string[]
): PlayerTournamentStatusMatch[] {
  if (candidateCoupleIds.length === 0) return matches

  return matches.filter((match) =>
    candidateCoupleIds.includes(match.couple1_id || '') ||
    candidateCoupleIds.includes(match.couple2_id || '')
  )
}

export function resolvePlayerTournamentStatus(
  playerId: string,
  tournamentId: string,
  inscriptions: PlayerTournamentStatusInscription[],
  pendingOrInProgressMatches: PlayerTournamentStatusMatch[]
): PlayerTournamentStatus {
  const candidateInscriptions = getCandidateInscriptionsForPlayer(inscriptions, playerId)
  const bestInscription = pickBestInscription(candidateInscriptions)

  const playerCoupleIds = Array.from(
    new Set(
      candidateInscriptions
        .map((inscription) => inscription.couple_id)
        .filter((coupleId): coupleId is string => Boolean(coupleId))
    )
  )

  const activeMatches = getActiveMatchesForPlayer(pendingOrInProgressMatches, playerCoupleIds)

  if (!bestInscription) {
    if (activeMatches.length > 0) {
      return {
        tournamentId,
        playerId,
        state: 'INCONSISTENT_DATA',
        uiState: 'NOT_REGISTERED',
        isInscribed: false,
        isEliminated: false,
        isPending: false,
        coupleId: null,
        inscriptionId: null,
        inconsistencyType: 'MATCH_WITHOUT_ACTIVE_INSCRIPTION'
      }
    }

    return {
      tournamentId,
      playerId,
      state: 'NOT_REGISTERED',
      uiState: 'NOT_REGISTERED',
      isInscribed: false,
      isEliminated: false,
      isPending: false,
      coupleId: null,
      inscriptionId: null
    }
  }

  // Receipt edits do not hide an already scheduled participant's matches.
  const effectiveInscription = bestInscription.occupies_slot !== false && !bestInscription.is_pending && activeMatches.length > 0
    ? { ...bestInscription, registration_incomplete: false } : bestInscription
  const uiState = mapInscriptionToUiState(effectiveInscription)

  if (uiState === 'REGISTERED_ELIMINATED' && activeMatches.length > 0) {
    return {
      tournamentId,
      playerId,
      state: 'INCONSISTENT_DATA',
      uiState,
      isInscribed: true,
      isEliminated: true,
      isPending: false,
      coupleId: bestInscription.couple_id,
      inscriptionId: bestInscription.id,
      inconsistencyType: 'ACTIVE_MATCH_WHILE_ELIMINATED'
    }
  }

  if (uiState === 'REGISTERED_PENDING' && activeMatches.length > 0) {
    return {
      tournamentId,
      playerId,
      state: 'INCONSISTENT_DATA',
      uiState,
      isInscribed: true,
      isEliminated: false,
      isPending: true,
      coupleId: bestInscription.couple_id,
      inscriptionId: bestInscription.id,
      inconsistencyType: 'ACTIVE_MATCH_WHILE_PENDING'
    }
  }

  return {
    tournamentId,
    playerId,
    state: uiState,
    uiState,
    isInscribed: uiState !== 'NOT_REGISTERED',
    isEliminated: uiState === 'REGISTERED_ELIMINATED',
    isPending: uiState === 'REGISTERED_PENDING',
    coupleId: bestInscription.couple_id,
    inscriptionId: bestInscription.id
  }
}
