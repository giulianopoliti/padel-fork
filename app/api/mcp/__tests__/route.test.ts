import { getPublicLongResults, type PublicLongMatch } from '@/lib/services/public-long-results.service'
import { POST } from '../route'
import { getTenantBranding } from '@/config/tenant'
import { getOrganizerActor, getOrganizerOAuth } from '@/lib/mcp/organizer-auth'
import { organizerCanReadLeague } from '@/lib/mcp/organizer-fixture'
import { searchOrganizerTournaments } from '@/lib/mcp/organizer-search'

jest.mock('@/config/tenant', () => ({ getTenantBranding: jest.fn(() => ({ key: 'padel-fv' })) }))
jest.mock('server-only', () => ({}))
jest.mock('@/lib/mcp/organizer-auth', () => ({
  getOrganizerOAuth: jest.fn(), getOrganizerActor: jest.fn(), organizerScope: 'padelfv.organizer.read',
  organizerAuthChallenge: () => 'Bearer resource_metadata="https://www.padelfv.com/.well-known/oauth-protected-resource/api/mcp"',
}))
jest.mock('@/lib/mcp/organizer-fixture', () => ({
  organizerCanReadLeague: jest.fn(), readOrganizerDates: jest.fn(),
  readOrganizerFixtureDate: jest.fn(), readOrganizerHistory: jest.fn(),
}))
jest.mock('@/lib/mcp/organizer-search', () => ({
  ...jest.requireActual('@/lib/mcp/organizer-search'), searchOrganizerTournaments: jest.fn(),
}))
jest.mock('@/lib/services/public-long-results.service', () => ({ getPublicLongResults: jest.fn() }))

const tournamentId = '89677039-1f90-45ef-b8e1-6d7a946e6c4b'
const fechaId = 'c8854981-8dfa-4d59-bf38-3615c6e22d8b'

const callMcp = async (method: string, params?: object) => {
  const response = await POST(new Request('http://localhost/api/mcp', {
    method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }))
  return response.json()
}

const database = {} as NonNullable<Awaited<ReturnType<typeof getOrganizerActor>>>['supabase']

describe('Padel FV organizer MCP', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(getOrganizerOAuth).mockReturnValue({} as NonNullable<ReturnType<typeof getOrganizerOAuth>>)
    jest.mocked(getOrganizerActor).mockResolvedValue({ userId: 'manager', supabase: database })
    jest.mocked(organizerCanReadLeague).mockResolvedValue(true)
    jest.mocked(getTenantBranding).mockReturnValue({ key: 'padel-fv' } as ReturnType<typeof getTenantBranding>)
  })

  it('rejects the Elite deployment before calling any data service', async () => {
    jest.mocked(getTenantBranding).mockReturnValue({ key: 'padel-elite' } as ReturnType<typeof getTenantBranding>)
    const response = await POST(new Request('https://www.tpepadel.com/api/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'buscar_torneos', arguments: {} } }),
    }))
    expect(response.status).toBe(404)
    expect(searchOrganizerTournaments).not.toHaveBeenCalled()
    expect(getPublicLongResults).not.toHaveBeenCalled()
  })

  it('advertises all seven tools as OAuth-only and read-only', async () => {
    const { result } = await callMcp('tools/list')
    expect(result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'consultar_fecha', 'buscar_torneos', 'consultar_resultados',
      'consultar_fechas', 'consultar_horarios_fecha', 'consultar_disponibilidad_fecha', 'consultar_historial_partidos',
    ])
    expect(result.tools.every((tool: { annotations: { readOnlyHint: boolean } }) => tool.annotations.readOnlyHint)).toBe(true)
    expect(result.tools[0].inputSchema.properties.fechaNumero.type).toBe('integer')
    expect(result.tools.every((tool: { securitySchemes: object[]; _meta: { securitySchemes: object[] } }) =>
      JSON.stringify(tool.securitySchemes) === JSON.stringify([{ type: 'oauth2', scopes: ['padelfv.organizer.read'] }]) &&
      JSON.stringify(tool._meta.securitySchemes) === JSON.stringify(tool.securitySchemes))).toBe(true)
  })

  it('searches using the verified actor instead of an anonymous web session', async () => {
    const tournament = {
      tournamentId, nombre: 'Clausura C4', categoria: '4ta', sede: 'Lasaigues Canning',
      estado: 'ZONE_PHASE', fechaInicio: '2026-11-21', borrador: false,
      url: `https://www.padelfv.com/tournaments/${tournamentId}`,
    }
    jest.mocked(searchOrganizerTournaments).mockResolvedValue({ pagina: 1, hayMas: false, torneos: [tournament] })
    const { result } = await callMcp('tools/call', {
      name: 'buscar_torneos', arguments: { nombre: 'Clausura C4', sede: 'Canning', categoria: '4TA', estado: 'active' },
    })
    expect(searchOrganizerTournaments).toHaveBeenCalledWith(database, {
      nombre: 'Clausura C4', sede: 'Canning', categoria: '4TA', estado: 'active', pagina: 1,
    }, 'manager')
    expect(result.structuredContent.torneos).toEqual([tournament])
  })

  it.each(['buscar_torneos', 'consultar_fecha', 'consultar_resultados', 'consultar_fechas', 'consultar_horarios_fecha', 'consultar_disponibilidad_fecha', 'consultar_historial_partidos'])('requires authentication before any data access through %s', async name => {
    jest.mocked(getOrganizerActor).mockResolvedValue(null)
    const { result } = await callMcp('tools/call', { name, arguments: { tournamentId, fechaNumero: 3 } })
    expect(result.isError).toBe(true)
    expect(result._meta['mcp/www_authenticate']).toHaveLength(1)
    expect(searchOrganizerTournaments).not.toHaveBeenCalled()
    expect(getPublicLongResults).not.toHaveBeenCalled()
    expect(organizerCanReadLeague).not.toHaveBeenCalled()
  })

  it.each(['consultar_fecha', 'consultar_resultados'])('blocks unrelated tournaments before reading results through %s', async name => {
    jest.mocked(organizerCanReadLeague).mockResolvedValue(false)
    const { result } = await callMcp('tools/call', { name, arguments: { tournamentId, fechaNumero: 3 } })
    expect(result.isError).toBe(true)
    expect(getPublicLongResults).not.toHaveBeenCalled()
  })

  it('fails closed when OAuth is not configured, without falling back to public tools', async () => {
    jest.mocked(getOrganizerOAuth).mockReturnValue(null)
    const response = await POST(new Request('https://www.padelfv.com/api/mcp', {
      method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }))
    expect(response.status).toBe(503)
    expect(getOrganizerActor).not.toHaveBeenCalled()
  })

  it('returns final scores only and uses the lineup that actually played', async () => {
    const match: PublicLongMatch = {
      id: 'finished', type: 'ZONE', round: 'ZONE', bracketKey: null, zoneId: 'zone',
      couple1Id: 'first', couple2Id: 'second', winnerId: 'first', resultCouple1: '2', resultCouple2: '0',
      status: 'FINISHED', court: null, orderInRound: 1,
      sets: [{ id: 'set', setNumber: 1, couple1Games: 6, couple2Games: 3 }],
      lineup1: {
        id: 'first',
        player1: { id: 'replacement', firstName: 'Nombre', lastName: 'Suplente', profileImageUrl: null },
        player2: null,
      },
      schedule: {
        fecha: { id: fechaId, number: 3 },
        date: '2026-11-21',
        startTime: '18:00:00',
        endTime: '19:30:00',
        court: 'Cancha 2',
      },
    }
    jest.mocked(getPublicLongResults).mockResolvedValue({
      tournament: { id: tournamentId, name: 'Clausura C4', status: 'ZONE_PHASE' },
      matches: [match, { ...match, id: 'pending', status: 'PENDING' }],
      couples: { second: { id: 'second', player1: null, player2: null } },
      zones: [],
    })

    const { result } = await callMcp('tools/call', {
      name: 'consultar_resultados', arguments: { tournamentId },
    })
    expect(getPublicLongResults).toHaveBeenCalledWith(tournamentId, {
      activeMatchesOnly: true, includeCompletedSchedule: true,
    })
    expect(result.structuredContent.partidos).toEqual([expect.objectContaining({
      id: 'finished',
      pareja1: { id: 'first', jugadores: ['Nombre Suplente'] },
      marcador: ['2', '0'],
      sets: [[6, 3]],
      fechaId, fechaNumero: 3, dia: '2026-11-21', horaInicio: '18:00',
      horaFin: '19:30', cancha: 'Cancha 2',
    })])
  })

  it('consults a real date by number and preserves an existing date with no results', async () => {
    jest.mocked(getPublicLongResults).mockResolvedValue({
      tournament: { id: tournamentId, name: 'Clausura C4', status: 'ZONE_PHASE' },
      fecha: { id: fechaId, number: 3 },
      matches: [], couples: {}, zones: [],
    })

    const { result } = await callMcp('tools/call', {
      name: 'consultar_fecha', arguments: { tournamentId, fechaNumero: 3 },
    })
    expect(getPublicLongResults).toHaveBeenCalledWith(tournamentId, {
      activeMatchesOnly: true, includeCompletedSchedule: true, fecha: { number: 3 },
    })
    expect(result.structuredContent).toMatchObject({
      fecha: { id: fechaId, numero: 3 }, partidos: [],
    })
  })

  it('accepts a real date ID as a results filter and reports when it is not in the league', async () => {
    jest.mocked(getPublicLongResults).mockResolvedValue({
      tournament: { id: tournamentId, name: 'Clausura C4', status: 'ZONE_PHASE' },
      fecha: null,
      matches: [], couples: {}, zones: [],
    })

    const { result } = await callMcp('tools/call', {
      name: 'consultar_resultados', arguments: { tournamentId, fechaId },
    })
    expect(getPublicLongResults).toHaveBeenCalledWith(tournamentId, {
      activeMatchesOnly: true, includeCompletedSchedule: true, fecha: { id: fechaId },
    })
    expect(result.isError).toBe(true)
  })

  it('does not expose fictional demo data from the organizer endpoint', async () => {
    const { result } = await callMcp('tools/call', {
      name: 'consultar_fecha', arguments: { tournamentId: 'torneo-demo', fechaId: 'fecha-3' },
    })
    expect(result.isError).toBe(true)
    expect(getPublicLongResults).not.toHaveBeenCalled()
    expect(organizerCanReadLeague).not.toHaveBeenCalled()
  })

  it('rejects a demo ID for real results without touching the database service', async () => {
    const { result } = await callMcp('tools/call', {
      name: 'consultar_resultados', arguments: { tournamentId: 'torneo-demo' },
    })
    expect(result.isError).toBe(true)
    expect(getPublicLongResults).not.toHaveBeenCalled()
  })
})
