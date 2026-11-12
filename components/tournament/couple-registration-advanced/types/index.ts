export interface PlayerInfo {
  id: string
  first_name?: string | null
  last_name?: string | null
  score?: number | null
  dni?: string | null
  phone?: string | null
  user_id?: string | null
}

export interface NewPlayerData {
  first_name: string
  last_name: string
  dni?: string | null
  phone?: string
  gender: string
  forceCreateNew?: boolean
}

export type PlayerSelectionType = 'new' | 'existing' | 'none'

export interface PlayerSelection {
  type: PlayerSelectionType
  existingPlayer?: PlayerInfo | null
  newPlayerData?: NewPlayerData | null
}

export interface CoupleSelectionState {
  player1: PlayerSelection
  player2: PlayerSelection
}

export interface CoupleRegistrationAdvancedProps {
  tournamentId: string
  onComplete: (success: boolean) => void
  players: PlayerInfo[]
  isClubMode?: boolean
  userPlayerId?: string | null
  tournamentGender: string
} 
