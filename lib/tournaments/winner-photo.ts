export const WINNER_PHOTO_STATUSES = ['FINISHED_POINTS_PENDING', 'FINISHED_POINTS_CALCULATED'] as const
export const WINNER_PHOTO_BUCKET = 'tournaments'
export const MAX_WINNER_PHOTO_SIZE = 5 * 1024 * 1024

export interface BracketWinnerPhoto {
  matchId: string
  bracketKey: 'MAIN' | 'GOLD' | 'SILVER'
  winnerId: string
  imageUrl: string | null
}

export interface WinnerPhotoAccess {
  tournamentId: string
  tournamentName: string
  status: string | null
  winnerId: string | null
  imageUrl: string | null
  canUpload: boolean
  winners: BracketWinnerPhoto[]
}

export const isWinnerPhotoStatus = (status: string | null | undefined): boolean =>
  WINNER_PHOTO_STATUSES.some((allowedStatus) => allowedStatus === status)

export const canUploadWinnerPhotoForCouple = (
  access: WinnerPhotoAccess | null,
  match: { id: string; round: string; status: string; winnerId: string | null | undefined },
  coupleId: string | null | undefined,
): boolean => Boolean(
  access?.canUpload && isWinnerPhotoStatus(access.status) &&
  match.round === 'FINAL' && match.status === 'FINISHED' &&
  coupleId && coupleId === match.winnerId &&
  access.winners.some((winner) => winner.matchId === match.id && winner.winnerId === coupleId),
)
