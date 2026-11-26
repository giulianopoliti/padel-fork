export interface TournamentReopenPlayer {
  playerId: string
  playerName: string
  pointsBefore: number
  pointsAfter: number
  categoryBefore: string | null
  categoryAfter: string | null
  creditedPoints: number
  extraBonusToRemove: number
  titleRemoved: boolean
  promotionRemoved: boolean
}

export interface TournamentReopenPreview {
  tournamentId: string
  tournamentName: string
  fingerprint: string
  statusBefore: 'FINISHED_POINTS_PENDING' | 'FINISHED_POINTS_CALCULATED'
  statusAfter: 'BRACKET_PHASE' | 'ZONE_PHASE'
  hadPoints: boolean
  estimatedPreviousState: boolean
  playerChanges: TournamentReopenPlayer[]
  titlesToRemove: number
  promotionsToRemove: number
  matchPointsToRemove: number
  blockers: string[]
  canReopen: boolean
}

export interface TournamentReopenResult {
  preview: TournamentReopenPreview
  alreadyReopened: boolean
}
