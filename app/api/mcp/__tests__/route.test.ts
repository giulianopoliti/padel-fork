import { getCategories, getClubsForFilter, getTournamentsOptimized } from '@/app/api/tournaments'
import { getPublicLongResults, type PublicLongMatch } from '@/lib/services/public-long-results.service'
import { POST } from '../route'

jest.mock('@/config/tenant', () => ({ getTenantBranding: () => ({ key: 'padel-fv' }) }))
jest.mock('@/lib/mcp/organizer-auth', () => ({ getOrganizerOAuth: () => null }))
jest.mock('@/lib/mcp/organizer-tools', () => ({ organizerTools: [] }))
jest.mock('@/app/api/tournaments', () => ({
  getClubsForFilter: jest.fn(),
  getCategories: jest.fn(),
  getTournamentsOptimized: jest.fn(),
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

describe('Padel FV public MCP', () => {
  beforeEach(() => jest.clearAllMocks())

  it('advertises the public tools as read-only and accepts a real date number', async () => {
    const { result } = await callMcp('tools/list')
    expect(result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'consultar_fecha', 'buscar_torneos', 'consultar_resultados',
    ])
    expect(result.tools.every((tool: { annotations: { readOnlyHint: boolean } }) => tool.annotations.readOnlyHint)).toBe(true)
    expect(result.tools[0].inputSchema.properties.fechaNumero.type).toBe('integer')
  })

  it('resolves the public club and category and only returns public summary fields', async () => {
    jest.mocked(getClubsForFilter).mockResolvedValue([{ id: 'club-1', name: 'Lasaigues Canning' }])
    jest.mocked(getCategories).mockResolvedValue([{ name: '4ta', level: 4, initial_score: 0 }])
    jest.mocked(getTournamentsOptimized).mockResolvedValue({
      tournaments: [{
        id: tournamentId,
        seoSlug: 'clausura-c4',
        name: 'Clausura C4',
        category: '4ta',
        club: { name: 'Lasaigues Canning' },
        status: 'ZONE_PHASE',
        startDate: '2026-11-21',
        transferAlias: 'internal-value',
      } as Awaited<ReturnType<typeof getTournamentsOptimized>>['tournaments'][number]],
      totalCount: 1,
      totalPages: 1,
    })

    const { result } = await callMcp('tools/call', {
      name: 'buscar_torneos',
      arguments: { nombre: 'Clausura C4', sede: 'Canning', categoria: '4TA', estado: 'active' },
    })
    expect(getTournamentsOptimized).toHaveBeenCalledWith(expect.objectContaining({
      status: 'active',
      filters: { type: 'LONG', clubId: 'club-1', visibleVenueOnly: true, categoryName: '4ta', search: 'Clausura C4' },
    }))
    expect(result.structuredContent.torneos).toEqual([{
      tournamentId, nombre: 'Clausura C4', categoria: '4ta', sede: 'Lasaigues Canning',
      estado: 'ZONE_PHASE', fechaInicio: '2026-11-21', url: 'https://www.padelfv.com/torneos/clausura-c4',
    }])
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

  it('still returns the original fictitious date for the demo IDs', async () => {
    const { result } = await callMcp('tools/call', {
      name: 'consultar_fecha', arguments: { tournamentId: 'torneo-demo', fechaId: 'fecha-3' },
    })
    expect(result.structuredContent.tournament.id).toBe('torneo-demo')
    expect(getPublicLongResults).not.toHaveBeenCalled()
  })

  it('rejects a demo ID for real results without touching the database service', async () => {
    const { result } = await callMcp('tools/call', {
      name: 'consultar_resultados', arguments: { tournamentId: 'torneo-demo' },
    })
    expect(result.isError).toBe(true)
    expect(getPublicLongResults).not.toHaveBeenCalled()
  })
})
