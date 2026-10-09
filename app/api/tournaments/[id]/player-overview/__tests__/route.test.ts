import { GET } from '../route'
import { createClient } from '@/utils/supabase/server'
import { getUserDetails } from '@/utils/db/getUserDetails'
import { getAmericanPlayerTournamentData } from '@/utils/american-player-matches'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/utils/db/getUserDetails', () => ({ getUserDetails: jest.fn() }))
jest.mock('@/utils/american-player-matches', () => ({ getAmericanPlayerTournamentData: jest.fn() }))

describe('authenticated player overview', () => {
  const getUser = jest.fn()
  const client = { auth: { getUser } }
  const run = () => GET(new Request('http://localhost/api/tournaments/tournament/player-overview?playerId=another-player'), {
    params: Promise.resolve({ id: 'tournament' }),
  })

  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(createClient).mockResolvedValue(client as never)
    getUser.mockResolvedValue({ data: { user: { id: 'user' } } })
    jest.mocked(getUserDetails).mockResolvedValue({ id: 'user', role: 'PLAYER', player_id: 'own-player' } as never)
    jest.mocked(getAmericanPlayerTournamentData).mockResolvedValue({ isRegistered: true } as never)
  })

  it('reads the authenticated player through the server client and prevents caching', async () => {
    const response = await run()
    expect(response.status).toBe(200)
    expect(getAmericanPlayerTournamentData).toHaveBeenCalledWith('own-player', 'tournament', client)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ data: { isRegistered: true } })
  })

  it('rejects anonymous requests', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await run()).status).toBe(401)
    expect(getAmericanPlayerTournamentData).not.toHaveBeenCalled()
  })

  it('rejects a profile belonging to a different session', async () => {
    jest.mocked(getUserDetails).mockResolvedValue({ id: 'other', role: 'PLAYER', player_id: 'other-player' } as never)
    expect((await run()).status).toBe(403)
    expect(getAmericanPlayerTournamentData).not.toHaveBeenCalled()
  })
})
