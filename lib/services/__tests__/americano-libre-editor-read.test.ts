import { randomUUID } from 'node:crypto'
import { readFreeEditorData } from '../americano-libre-editor-read'
import { createClientServiceRole } from '@/utils/supabase/server'
jest.mock('@/utils/supabase/server', () => ({ createClientServiceRole: jest.fn() }))

describe('LIBRE editor reference data', () => {
  it('includes couples without results, reads sports/history/schedules and filters approval and disqualifications', async () => {
    const tournamentId = randomUUID(), zoneId = randomUUID(), id = randomUUID(), pending = randomUUID(), banned = randomUUID(), matchId = randomUUID()
    const rows = [id, pending, banned].map((couple_id, index) => ({ couple_id, position: index + 1, wins: null, losses: null, games_difference: null,
      zone: { id: zoneId, name: 'Zona A', tournament_id: tournamentId },
      couple: { id: couple_id, player1_id: randomUUID(), player2_id: randomUUID(), player1: [{ first_name: 'Ana', last_name: 'García' }], player2: { first_name: 'Luz', last_name: 'Paz' } },
    }))
    const responses: Record<string, unknown> = {
      zone_positions: { data: [...rows, { ...rows[0], couple_id: null, couple: null }] }, inscriptions: { data: [{ couple_id: id }, { couple_id: banned }] },
      tournament_couple_disqualifications: { data: [{ couple_id: banned }] },
      matches: { data: [{ id: matchId, result_couple1: null, result_couple2: null, court: null, sets: [], history: [{ id: randomUUID() }], agenda: [{ id: randomUUID() }] }] },
    }
    const client = { from: (table: string) => {
      const query = { select: () => query, eq: () => query, or: () => query, not: () => query, then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(responses[table])) }
      return query
    } }
    jest.mocked(createClientServiceRole).mockResolvedValue(client as never)
    const result = await readFreeEditorData(client as never, tournamentId, true)
    expect(result.couples).toHaveLength(3)
    expect(result.couples[0]).toMatchObject({ name: 'Ana García / Luz Paz', wins: 0, losses: 0, gamesDifference: 0, eligible: true })
    expect(result.couples[1]).toMatchObject({ eligible: false, reason: 'La inscripción no está aprobada.' })
    expect(result.couples[2]).toMatchObject({ eligible: false, reason: 'Pareja descalificada.' })
    expect(result.guards[matchId]).toEqual({ sports: true, agenda: true })
    jest.mocked(createClientServiceRole).mockClear()
    const publicResult = await readFreeEditorData(client as never, tournamentId, false)
    expect(publicResult.guards).toEqual({})
    expect(publicResult.couples.every((couple) => !couple.eligible && !couple.reason)).toBe(true)
    expect(createClientServiceRole).not.toHaveBeenCalled()
  })
})
