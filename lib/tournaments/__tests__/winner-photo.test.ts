import { canUploadWinnerPhotoForCouple, type WinnerPhotoAccess } from '../winner-photo'

const access: WinnerPhotoAccess = {
  tournamentId: 'tournament', tournamentName: 'Torneo', status: 'FINISHED_POINTS_PENDING',
  winnerId: 'champions', imageUrl: null, canUpload: true,
  winners: [{ matchId: 'final', bracketKey: 'MAIN', winnerId: 'champions', imageUrl: null }],
}
const final = { id: 'final', round: 'FINAL', status: 'FINISHED', winnerId: 'champions' }

describe('winner photo menu eligibility', () => {
  it.each(['FINISHED_POINTS_PENDING', 'FINISHED_POINTS_CALCULATED'])('allows only the champions in %s', (status) => {
    expect(canUploadWinnerPhotoForCouple({ ...access, status }, final, 'champions')).toBe(true)
    expect(canUploadWinnerPhotoForCouple({ ...access, status }, final, 'runners-up')).toBe(false)
  })
  it.each(['FINISHED', 'BRACKET_PHASE', 'ZONE_PHASE', 'CANCELED'])('hides the menu in %s', (status) => {
    expect(canUploadWinnerPhotoForCouple({ ...access, status }, final, 'champions')).toBe(false)
  })
  it('rejects public users, non-finals, unfinished matches and stale winners', () => {
    expect(canUploadWinnerPhotoForCouple({ ...access, canUpload: false }, final, 'champions')).toBe(false)
    expect(canUploadWinnerPhotoForCouple(access, { ...final, round: 'SEMIFINAL' }, 'champions')).toBe(false)
    expect(canUploadWinnerPhotoForCouple(access, { ...final, status: 'IN_PROGRESS' }, 'champions')).toBe(false)
    expect(canUploadWinnerPhotoForCouple(access, { ...final, winnerId: 'other' }, 'other')).toBe(false)
    expect(canUploadWinnerPhotoForCouple(null, final, 'champions')).toBe(false)
  })
  it('allows both cup champions but rejects mixing their final matches', () => {
    const cups = { ...access, winners: [
      { matchId: 'gold-final', bracketKey: 'GOLD' as const, winnerId: 'gold', imageUrl: null },
      { matchId: 'silver-final', bracketKey: 'SILVER' as const, winnerId: 'silver', imageUrl: null },
    ] }
    expect(canUploadWinnerPhotoForCouple(cups, { ...final, id: 'gold-final', winnerId: 'gold' }, 'gold')).toBe(true)
    expect(canUploadWinnerPhotoForCouple(cups, { ...final, id: 'silver-final', winnerId: 'silver' }, 'silver')).toBe(true)
    expect(canUploadWinnerPhotoForCouple(cups, { ...final, id: 'gold-final', winnerId: 'silver' }, 'silver')).toBe(false)
  })
})
