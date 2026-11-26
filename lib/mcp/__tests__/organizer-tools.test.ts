import { createPilotMcp } from '@/scripts/match-scheduling-mcp-pilot.mjs'
import { getOrganizerActor } from '../organizer-auth'
import { organizerCanReadLeague, readOrganizerDates, readOrganizerFixtureDate, readOrganizerHistory } from '../organizer-fixture'
import { organizerTools } from '../organizer-tools'

jest.mock('server-only', () => ({}))
jest.mock('../organizer-auth', () => ({
  getOrganizerOAuth: () => ({}),
  getOrganizerActor: jest.fn(),
  organizerScope: 'padelfv.organizer.read',
  organizerAuthChallenge: () => 'Bearer resource_metadata="https://www.padelfv.com/.well-known/oauth-protected-resource/api/mcp"',
}))
jest.mock('../organizer-fixture', () => ({
  organizerCanReadLeague: jest.fn(),
  readOrganizerDates: jest.fn(),
  readOrganizerFixtureDate: jest.fn(),
  readOrganizerHistory: jest.fn(),
}))

const tournamentId = '9f8944a1-2037-4edc-a324-bc239aa6bcba'
const playerId = 'bce88644-e831-422d-845b-0c2172b91f4f'
const database = {} as NonNullable<Awaited<ReturnType<typeof getOrganizerActor>>>['supabase']
const handler = createPilotMcp(organizerTools)

const call = async (name: string, args: object) => {
  const request = new Request('https://www.padelfv.com/api/mcp', {
    method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  })
  return (await (await handler.fetch(request)).json()).result
}

beforeEach(() => jest.resetAllMocks())

it('lists the organizer-created dates after checking access to the real league', async () => {
  jest.mocked(getOrganizerActor).mockResolvedValue({ userId: 'manager', supabase: database })
  jest.mocked(organizerCanReadLeague).mockResolvedValue(true)
  jest.mocked(readOrganizerDates).mockResolvedValue({
    tournamentId, zonaHoraria: 'America/Argentina/Buenos_Aires', fechas: [{ id: 'fecha-real', fecha_number: 4 }],
  })
  const result = await call('consultar_fechas', { tournamentId })
  expect(result.structuredContent.fechas).toEqual([{ id: 'fecha-real', fecha_number: 4 }])
  expect(readOrganizerDates).toHaveBeenCalledWith(database, { tournamentId }, 'manager')
})

it('does not expose dates to an anonymous caller', async () => {
  jest.mocked(getOrganizerActor).mockResolvedValue(null)
  expect((await call('consultar_fechas', { tournamentId })).isError).toBe(true)
  expect(readOrganizerDates).not.toHaveBeenCalled()
})

it('challenges anonymous access without querying the notes', async () => {
  jest.mocked(getOrganizerActor).mockResolvedValue(null)
  const result = await call('consultar_disponibilidad_fecha', { tournamentId, fechaNumero: 3 })
  expect(result.isError).toBe(true)
  expect(result._meta['mcp/www_authenticate']).toHaveLength(1)
  expect(organizerCanReadLeague).not.toHaveBeenCalled()
  expect(readOrganizerFixtureDate).not.toHaveBeenCalled()
})

it('checks the authenticated user against the requested league before reading', async () => {
  jest.mocked(getOrganizerActor).mockResolvedValue({ userId: 'other-organizer', supabase: database })
  jest.mocked(organizerCanReadLeague).mockResolvedValue(false)
  const result = await call('consultar_disponibilidad_fecha', { tournamentId, fechaNumero: 3 })
  expect(result.isError).toBe(true)
  expect(organizerCanReadLeague).toHaveBeenCalledWith(database, 'other-organizer', tournamentId)
  expect(readOrganizerFixtureDate).not.toHaveBeenCalled()
})

it('passes the approved organizer and real date to the availability reader', async () => {
  jest.mocked(getOrganizerActor).mockResolvedValue({ userId: 'manager', supabase: database })
  jest.mocked(organizerCanReadLeague).mockResolvedValue(true)
  jest.mocked(readOrganizerFixtureDate).mockResolvedValue({ error: 'Fixture de prueba' })
  await call('consultar_disponibilidad_fecha', { tournamentId, fechaNumero: 3 })
  expect(readOrganizerFixtureDate).toHaveBeenCalledWith(database, { tournamentId, fechaNumero: 3 }, true, 'manager')
})

it('accepts a player filter and defaults history to the first page', async () => {
  jest.mocked(getOrganizerActor).mockResolvedValue({ userId: 'manager', supabase: database })
  jest.mocked(organizerCanReadLeague).mockResolvedValue(true)
  jest.mocked(readOrganizerHistory).mockResolvedValue({
    tournamentId, consultadoEn: new Date().toISOString(), zonaHoraria: 'America/Argentina/Buenos_Aires', pagina: 1, totalPartidos: 0, hayMas: false,
    resumenJugadores: [], resumenParejas: [], crucesDeZonaReservados: [], partidos: [],
  })
  await call('consultar_historial_partidos', { tournamentId, jugadorId: playerId })
  expect(readOrganizerHistory).toHaveBeenCalledWith(database, { tournamentId, jugadorId: playerId, pagina: 1 }, 'manager')
})
