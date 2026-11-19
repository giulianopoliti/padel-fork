import type { SupabaseClient } from '@supabase/supabase-js'
import { readOrganizerHistory } from '../organizer-fixture'

jest.mock('server-only', () => ({}))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))

const player = (id: string) => ({ id, first_name: id, last_name: null })
const couple1 = { id: 'pareja-1', player1: player('titular'), player2: player('compañero') }
const couple2 = { id: 'pareja-2', player1: player('rival-1'), player2: player('rival-2') }
const played = {
  id: 'jugado', status: 'FINISHED', round: 'ZONE', winner_id: couple1.id,
  couple1_id: couple1.id, couple2_id: couple2.id, couple1, couple2,
  result_couple1: '2', result_couple2: '0',
  fecha_matches: {
    fecha_id: 'fecha-3', scheduled_date: '2026-11-01', scheduled_start_time: '19:00:00',
    scheduled_end_time: '20:30:00', court_assignment: null,
    tournament_fechas: { tournament_id: 'liga', fecha_number: 3 },
  },
}

const database = () => {
  const rows: Record<string, unknown> = {
    inscriptions: [{ couples: couple1 }, { couples: couple2 }],
    matches: [played, { ...played, id: 'pendiente', status: 'PENDING' }],
  }
  const from = (table: string) => {
    const query = { range: async () => ({ data: rows[table], error: null }) }
    for (const method of ['select', 'eq', 'not', 'in', 'order']) Object.assign(query, { [method]: () => query })
    return query
  }
  const rpc = jest.fn(async () => ({
    data: [{ match_id: played.id, couple_id: couple1.id, slot: 1, player: player('suplente') }],
    error: null,
  }))
  return { from, rpc } as unknown as SupabaseClient
}

it('counts actual lineups, keeps zero-match players and separates reserved opponents', async () => {
  const history = await readOrganizerHistory(database(), { tournamentId: 'liga', pagina: 1 })
  expect(history.totalPartidos).toBe(1)
  expect(history.resumenJugadores).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'suplente', jugados: 1 }),
    expect.objectContaining({ id: 'titular', jugados: 0 }),
  ]))
  expect(history.resumenParejas).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: couple1.id, jugados: 1, jugadosEnZona: 1, rivales: [couple2.id] }),
  ]))
  expect(history.crucesDeZonaReservados).toEqual([{ pareja1Id: couple1.id, pareja2Id: couple2.id, estado: 'PENDING' }])
})

it('returns the played opponents for the substitute when filtering by player', async () => {
  const history = await readOrganizerHistory(database(), { tournamentId: 'liga', jugadorId: 'suplente', pagina: 1 })
  expect(history.resumenJugadores).toEqual([{ id: 'suplente', nombre: 'suplente', jugados: 1 }])
  expect(history.partidos).toEqual([expect.objectContaining({
    fechaNumero: 3, pareja2: expect.objectContaining({ id: couple2.id }),
    programacion: { dia: '2026-11-01', inicio: '19:00:00', fin: '20:30:00', cancha: null },
  })])
})
