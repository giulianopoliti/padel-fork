import { z } from 'zod'
import { getTenantBranding } from '@/config/tenant'
import { getOrganizerOAuth } from '@/lib/mcp/organizer-auth'
import { authenticatedOrganizerTool, organizerTool, organizerTools } from '@/lib/mcp/organizer-tools'
import { organizerInstructions } from '@/lib/mcp/organizer-instructions'
import { searchOrganizerTournaments, searchSchema } from '@/lib/mcp/organizer-search'
import { getPublicLongResults, type PublicLongCouple, type PublicLongFechaSelector } from '@/lib/services/public-long-results.service'
import { createPilotMcp } from '@/scripts/match-scheduling-mcp-pilot.mjs'

const publicOrigin = 'https://www.padelfv.com'
const resultPageSize = 25
const resultsInput = z.object({
  tournamentId: z.string().uuid(),
  pagina: z.number().int().min(1).max(100).default(1),
  fechaId: z.string().uuid().optional(),
  fechaNumero: z.number().int().min(1).max(2_147_483_647).optional(),
}).strict()
const resultsSchema = resultsInput.refine(input => !(input.fechaId && input.fechaNumero))
const dateSchema = resultsInput.refine(input => Boolean(input.fechaId) !== Boolean(input.fechaNumero))
const pageField = { type: 'integer', minimum: 1, maximum: 100, default: 1 }
const textField = { type: 'string', minLength: 1, maxLength: 100 }
const fechaProperties = {
  tournamentId: { type: 'string', format: 'uuid' },
  fechaId: { type: 'string', format: 'uuid', description: 'ID de la fecha. Usalo si no indicás fechaNumero.' },
  fechaNumero: { type: 'integer', minimum: 1, maximum: 2_147_483_647, description: 'Número de jornada dentro de la liga.' },
  pagina: pageField,
}

const coupleSummary = (couple: PublicLongCouple | undefined) => couple
  ? {
      id: couple.id,
      jugadores: [couple.player1, couple.player2].flatMap(player => {
        const name = [player?.firstName, player?.lastName].filter(Boolean).join(' ')
        return name ? [name] : []
      }),
    }
  : null

const readResultsPage = async ({ tournamentId, pagina, fechaId, fechaNumero }: z.infer<typeof resultsInput>) => {
  const fecha: PublicLongFechaSelector | undefined = fechaId
    ? { id: fechaId }
    : fechaNumero ? { number: fechaNumero } : undefined
  const results = await getPublicLongResults(tournamentId, {
    activeMatchesOnly: true,
    includeCompletedSchedule: true,
    ...(fecha ? { fecha } : {}),
  })
  if (!results) return { error: 'No se pudo consultar la matriz pública de esa liga.' }
  if (fecha && !results.fecha) return { error: 'No se encontró esa fecha en la liga indicada.' }

  const matches = results.matches.filter(match =>
    (match.status === 'FINISHED' || match.status === 'COMPLETED') && match.couple1Id && match.couple2Id
  )
  const offset = (pagina - 1) * resultPageSize
  return {
    torneo: results.tournament,
    url: `${publicOrigin}/tournaments/${tournamentId}/resultados`,
    zonaHoraria: 'America/Argentina/Buenos_Aires',
    ...(results.fecha ? { fecha: { id: results.fecha.id, numero: results.fecha.number } } : {}),
    pagina,
    total: matches.length,
    hayMas: matches.length > offset + resultPageSize,
    partidos: matches.slice(offset, offset + resultPageSize).map(match => ({
      id: match.id,
      ronda: match.round,
      fechaId: match.schedule?.fecha?.id ?? null,
      fechaNumero: match.schedule?.fecha?.number ?? null,
      dia: match.schedule?.date ?? null,
      horaInicio: match.schedule?.startTime?.slice(0, 5) ?? null,
      horaFin: match.schedule?.endTime?.slice(0, 5) ?? null,
      cancha: match.schedule?.court ?? null,
      pareja1: coupleSummary(match.lineup1 ?? results.couples[match.couple1Id!]),
      pareja2: coupleSummary(match.lineup2 ?? results.couples[match.couple2Id!]),
      ganadoraId: match.winnerId,
      marcador: [match.resultCouple1, match.resultCouple2],
      sets: match.sets.map(set => [set.couple1Games, set.couple2Games]),
    })),
  }
}

const tools = [
  organizerTool(
    'consultar_fecha',
    'Consulta resultados publicados y horarios registrados de partidos finalizados de una fecha LONG que podés gestionar. Requiere OAuth. Usá el tournamentId de buscar_torneos y fechaNumero o fechaId. Para franjas del organizador y disponibilidad de jugadores usá consultar_horarios_fecha y consultar_disponibilidad_fecha.',
    fechaProperties,
    dateSchema,
    (_supabase, input) => readResultsPage(input),
  ),
  authenticatedOrganizerTool(
    'buscar_torneos',
    'Busca ligas LONG que la cuenta conectada puede gestionar en Padel FV, por nombre, sede o categoría (por ejemplo 4ta). Requiere OAuth. Incluye borradores y torneos finalizados. Devuelve el ID real para consultar fechas, horarios, disponibilidades e historial.',
    {
      nombre: textField, sede: textField, categoria: textField,
      estado: { type: 'string', enum: ['active', 'past', 'all'], default: 'all' },
      pagina: pageField,
    },
    searchSchema,
    searchOrganizerTournaments,
  ),
  organizerTool(
    'consultar_resultados',
    'Consulta resultados publicados de una liga LONG que podés gestionar en Padel FV. Requiere OAuth. Incluye día, horario y cancha registrados. Usá el tournamentId de buscar_torneos y opcionalmente fechaNumero o fechaId.',
    fechaProperties,
    resultsSchema,
    (_supabase, input) => readResultsPage(input),
  ),
  ...organizerTools,
]
const organizerMcp = createPilotMcp(tools, organizerInstructions)

const handleMcp = (request: Request) => {
  if (getTenantBranding().key !== 'padel-fv') return new Response(null, { status: 404 })
  if (!getOrganizerOAuth()) {
    return Response.json({ error: 'El acceso de Padel FV — Organizadores todavía no está configurado.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    })
  }
  return organizerMcp.fetch(request)
}

export { handleMcp as GET, handleMcp as POST }
