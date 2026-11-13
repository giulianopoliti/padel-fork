jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))

import { GET, PUT } from '../[id]/inscriptions/player-alerts/route'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'

const tournamentId = 'ab400000-0000-4000-8000-000000000001'
const coupleId = 'ab300000-0000-4000-8000-000000000001'
const playerId = 'ab100000-0000-4000-8000-000000000002'
const otherId = 'ab100000-0000-4000-8000-000000000003'
const context = { params: Promise.resolve({ id: tournamentId }) }
const url = `http://localhost/api/tournaments/${tournamentId}/inscriptions/player-alerts`
const update = (message: string | null, target = playerId) => new Request(url, {
  method: 'PUT', body: JSON.stringify({ coupleId, playerId: target, message }),
})

describe('Inscription player alerts', () => {
  const tournament = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn() }
  const inscription = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), maybeSingle: jest.fn() }
  const alerts = { select: jest.fn().mockReturnThis(), eq: jest.fn(), upsert: jest.fn(), delete: jest.fn().mockReturnThis() }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'manager' } } }) } } as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true })
    jest.mocked(createClientServiceRole).mockResolvedValue({ from: (table: string) => {
      if (table === 'tournaments') return tournament
      if (table === 'inscriptions') return inscription
      if (table === 'tournament_player_alerts') return alerts
      throw new Error(`Unexpected table ${table}`)
    } } as never)
    tournament.maybeSingle.mockResolvedValue({ data: { type: 'LONG' } })
    inscription.maybeSingle.mockResolvedValue({ data: { couple: { player1_id: otherId, player2_id: playerId } } })
    alerts.upsert.mockResolvedValue({ error: null })
    alerts.eq.mockResolvedValue({ data: [{ player_id: playerId, message: 'Confirmar horario' }] })
  })

  it('requires management permission before reading or writing notes', async () => {
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: false })
    expect((await GET(new Request(url), context)).status).toBe(403)
    expect((await PUT(update('Alerta'), context)).status).toBe(403)
    expect(createClientServiceRole).not.toHaveBeenCalled()
  })

  it('scopes private reads to the tournament', async () => {
    const response = await GET(new Request(url), context)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(alerts.eq).toHaveBeenCalledWith('tournament_id', tournamentId)
    expect(await response.json()).toEqual({ data: [{ player_id: playerId, message: 'Confirmar horario' }] })
  })

  it('stores the alert for the selected member and rejects a player outside the couple', async () => {
    expect((await PUT(update('  Confirmar horario  '), context)).status).toBe(200)
    expect(inscription.eq.mock.calls).toEqual([['tournament_id', tournamentId], ['couple_id', coupleId]])
    expect(alerts.upsert).toHaveBeenCalledWith({ tournament_id: tournamentId, player_id: playerId, message: 'Confirmar horario' })
    expect((await PUT(update('Alerta', tournamentId), context)).status).toBe(404)
    expect(alerts.upsert).toHaveBeenCalledTimes(1)
  })
})
