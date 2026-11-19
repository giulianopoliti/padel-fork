const serverInfo = { name: 'padel-fv-piloto-fixture', version: '0.1.0' }
const protocolVersions = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26']
const capabilities = { tools: {} }

const sampleFecha = {
  dataSource: 'Datos ficticios del piloto de Padel FV',
  tournament: { id: 'torneo-demo', name: 'Torneo demo Padel FV', type: 'LONG' },
  fecha: {
    id: 'fecha-3',
    number: 3,
    round: 'ZONE',
    startDate: '2026-11-21',
    endDate: '2026-11-22',
    timeZone: 'America/Argentina/Buenos_Aires',
    matchDurationMinutes: 90,
    maxMatchesPerCouple: 1,
  },
  couples: [
    { id: 'P01', completedMatches: 1, availabilityStatus: 'CONFIRMED', slotIds: ['S01'] },
    { id: 'P02', completedMatches: 2, availabilityStatus: 'CONFIRMED', slotIds: ['S01'] },
    { id: 'P03', completedMatches: 1, availabilityStatus: 'CONFIRMED', slotIds: ['S02'] },
    { id: 'P04', completedMatches: 2, availabilityStatus: 'CONFIRMED', slotIds: ['S01'] },
    { id: 'P05', completedMatches: 2, availabilityStatus: 'CONFIRMED', slotIds: ['S03'] },
    { id: 'P06', completedMatches: 2, availabilityStatus: 'CONFIRMED', slotIds: ['S03'] },
    { id: 'P07', completedMatches: 1, availabilityStatus: 'FREE_DATE', slotIds: [] },
    { id: 'P08', completedMatches: 1, availabilityStatus: 'PENDING_REVIEW', slotIds: [] },
  ],
  availabilityWindows: [
    { id: 'S01', date: '2026-11-21', startTime: '18:00', endTime: '21:00' },
    { id: 'S02', date: '2026-11-21', startTime: '19:30', endTime: '21:00' },
    { id: 'S03', date: '2026-11-22', startTime: '16:00', endTime: '17:30' },
  ],
  blockedPairings: [
    { coupleIds: ['P01', 'P02'], reason: 'PLAYED' },
    { coupleIds: ['P05', 'P06'], reason: 'ALREADY_SCHEDULED' },
  ],
  scheduledMatches: [
    {
      coupleIds: ['P05', 'P06'],
      status: 'PENDING',
      date: '2026-11-22',
      startTime: '16:00',
      endTime: '17:30',
      club: 'Club Demo',
      court: 'Cancha 1',
    },
  ],
}

const tool = {
  name: 'consultar_fecha',
  description: 'Consulta el torneo ficticio de Padel FV y devuelve los horarios de las parejas, los cruces bloqueados y los partidos fijados de la Fecha 3. La disponibilidad de canchas se obtiene del Excel del organizador.',
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      tournamentId: { type: 'string', enum: [sampleFecha.tournament.id] },
      fechaId: { type: 'string', enum: [sampleFecha.fecha.id] },
    },
    required: ['tournamentId', 'fechaId'],
    additionalProperties: false,
  },
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

const result = (id, value) => Response.json(
  { jsonrpc: '2.0', id, result: value },
  { headers: { 'Cache-Control': 'no-store' } },
)

const rpcError = (id, code, message, status = 400) =>
  Response.json({ jsonrpc: '2.0', id, error: { code, message } }, { status })

const toolError = (id, message, authChallenge) =>
  result(id, {
    isError: true,
    content: [{ type: 'text', text: message }],
    ...(authChallenge ? { _meta: { 'mcp/www_authenticate': [authChallenge] } } : {}),
  })

const toolResult = (id, data) => result(id, {
  content: [{ type: 'text', text: JSON.stringify(data) }],
  structuredContent: data,
})

export const readDemoFecha = async (args) => {
  if (!isObject(args) || Object.keys(args).length !== 2 ||
      args.tournamentId !== sampleFecha.tournament.id || args.fechaId !== sampleFecha.fecha.id) {
    return { error: 'La única fecha ficticia disponible es fecha-3 del torneo-demo.' }
  }

  return sampleFecha
}

/**
 * @param {{ definition: { name: string, description: string, inputSchema: object, annotations: object }, run: (args: unknown, request: Request) => Promise<object> }[]} tools
 * @param {string} instructions
 */
export const createPilotMcp = (tools = [{ definition: tool, run: readDemoFecha }], instructions = 'Piloto de Padel FV de solo lectura. Las canchas disponibles se consultan en el Excel del organizador.') => ({
  async fetch(request) {
    const { pathname } = new URL(request.url)
    if (pathname === '/' && request.method === 'GET') {
      return new Response('Padel FV · Piloto de fixture\nConsulta de solo lectura para la Fecha 3 del torneo demo. Los datos son ficticios.\n')
    }
    if (pathname !== '/mcp' && pathname !== '/api/mcp') return new Response(null, { status: 404 })
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { Allow: 'POST' } })
    }

    let message
    try {
      message = await request.json()
    } catch {
      return rpcError(null, -32700, 'JSON inválido')
    }

    if (!isObject(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' ||
        (message.id !== undefined && typeof message.id !== 'string' && typeof message.id !== 'number')) {
      return rpcError(null, -32600, 'Solicitud JSON-RPC inválida')
    }

    const { id, method, params } = message
    if (id === undefined) return new Response(null, { status: 202 })

    switch (method) {
      case 'server/discover':
        return result(id, { supportedVersions: [protocolVersions[0]], serverInfo, capabilities, instructions })
      case 'initialize':
        return result(id, {
          protocolVersion: protocolVersions.includes(params?.protocolVersion) ? params.protocolVersion : protocolVersions[0],
          serverInfo,
          capabilities,
          instructions,
        })
      case 'ping':
        return result(id, {})
      case 'tools/list':
        return result(id, { tools: tools.map(({ definition }) => definition) })
      case 'tools/call': {
        if (!isObject(params)) return rpcError(id, -32602, 'Herramienta desconocida', 200)
        const selected = tools.find(({ definition }) => definition.name === params.name)
        if (!selected) return rpcError(id, -32602, 'Herramienta desconocida', 200)
        try {
          const data = await selected.run(params.arguments ?? {}, request)
          return 'error' in data ? toolError(id, String(data.error), data.authChallenge) : toolResult(id, data)
        } catch (error) {
          console.error('[mcp] Tool failed', selected.definition.name, error)
          return toolError(id, 'No se pudo consultar la información de Padel FV.')
        }
      }
      default:
        return rpcError(id, -32601, 'Método desconocido', 200)
    }
  },
})

export default createPilotMcp()
