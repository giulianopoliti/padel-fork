import { sanitizeTournamentPlayer } from '../tournament-player-privacy'

const player = {
  id: 'player-1', first_name: 'Ana', last_name: 'Pérez', score: 800,
  category_name: '6ta', gender: 'FEMALE', preferred_side: 'DRIVE',
  profile_image_url: '/avatar.png', phone: '+5491112345678', dni: '12345678',
  email: 'private@example.com', date_of_birth: '1990-01-01', address: 'Private address',
  user_id: 'auth-1', payment_details: { alias: 'private.alias' },
}

describe('public tournament player serialization', () => {
  it('exposes only the sporting allowlist to every non-manager', () => {
    expect(sanitizeTournamentPlayer(player, false)).toEqual({
      id: 'player-1', first_name: 'Ana', last_name: 'Pérez', score: 800,
      category_name: '6ta', gender: 'FEMALE', preferred_side: 'DRIVE',
      profile_image_url: '/avatar.png',
    })
    expect(player.phone).toBe('+5491112345678')
  })

  it('preserves authorized management data', () => {
    expect(sanitizeTournamentPlayer(player, true)).toBe(player)
  })

  it('preserves null sporting data and excludes future private fields', () => {
    expect(sanitizeTournamentPlayer({ id: 'p', score: null, secret: 'hidden' }, false))
      .toEqual({ id: 'p', score: null })
  })
})
