jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))
jest.mock('@/lib/services/tournament-category-config', () => ({
  resolveInitialPlayerProfile: jest.fn(async () => ({ score: 100, categoryName: '7ma' })),
}))

import { NextRequest } from 'next/server'
import { POST } from '../[id]/substitutions/route'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'

const tournamentId = 'ab400000-0000-4000-8000-000000000001'
const coupleId = 'ab300000-0000-4000-8000-000000000001'
const context = { params: Promise.resolve({ id: tournamentId }) }
const newPlayer = { first_name: 'María', last_name: 'Ríos', gender: 'FEMALE' }
const request = (fields: Record<string, unknown> = {}) => new NextRequest(`http://localhost/api/tournaments/${tournamentId}/substitutions`, {
  method: 'POST', body: JSON.stringify({ action: 'create-player', coupleId, playerData: { ...newPlayer, ...fields } }),
})

describe('Crear un suplente desde el padrón', () => {
  const row = (data: unknown) => ({ data, error: null })
  const insert = jest.fn()
  const findByDni = jest.fn()
  const findByNamePage = jest.fn()
  const rpc = jest.fn()
  const tournament = { type: 'LONG', status: 'ZONE_PHASE', gender: 'FEMALE' }

  beforeEach(() => {
    jest.clearAllMocks()
    findByDni.mockResolvedValue(row(null))
    findByNamePage.mockResolvedValue(row([]))
    insert.mockReturnValue({ select: () => ({ single: async () => row({ id: 'new-player' }) }) })
    jest.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => row({ user: { id: 'manager' } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => row({ role: 'ORGANIZADOR' }) }) }) }),
    } as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true })
    jest.mocked(createClientServiceRole).mockResolvedValue({ rpc, from: (table: string) => {
      const query = { eq: () => query, limit: () => query, order: () => query }
      if (table === 'players') return { insert, select: () => Object.assign(query, { maybeSingle: findByDni, range: findByNamePage }) }
      if (table === 'tournaments') return { select: () => Object.assign(query, {
        maybeSingle: async () => row(tournament), single: async () => row(tournament),
      }) }
      if (table === 'inscriptions') return { select: () => Object.assign(query, {
        maybeSingle: async () => row({ couple: { player1_id: 'first', player2_id: 'second' } }),
      }) }
      throw new Error(`Unexpected table ${table}`)
    } } as never)
  })

  it('prefiere la ficha con cuenta vinculada en una coincidencia de nombre', async () => {
    findByNamePage.mockResolvedValue(row([
      { id: 'legacy', first_name: 'Maria', last_name: 'Rios' },
      { id: 'linked', ...newPlayer, user_id: 'account' },
    ]))

    const response = await POST(request(), context)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ player: { id: 'linked', first_name: 'María', last_name: 'Ríos' }, matchedBy: 'name' })
    expect(insert).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reutiliza una coincidencia de DNI antes de buscar por nombre', async () => {
    findByDni.mockResolvedValue(row({ id: 'existing', ...newPlayer, dni: '45678900' }))

    const response = await POST(request({ dni: '45.678.900' }), context)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ player: { id: 'existing' }, matchedBy: 'dni' })
    expect(findByNamePage).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('crea una ficha con la categoría de Inscripciones cuando la identidad es distinta', async () => {
    findByNamePage.mockResolvedValue(row([{ id: 'homonym', ...newPlayer, dni: '12345678', user_id: 'account' }]))

    const response = await POST(request({ dni: '45.678.900' }), context)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ player: { id: 'new-player' }, matchedBy: null })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ ...newPlayer, dni: '45678900', score: 100, category_name: '7ma' }))
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rechaza el alta forzada y el acceso sin permiso de gestión', async () => {
    expect((await POST(request({ forceCreateNew: true }), context)).status).toBe(400)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: false })
    jest.mocked(createClientServiceRole).mockClear()
    expect((await POST(request(), context)).status).toBe(403)
    expect(createClientServiceRole).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })
})
