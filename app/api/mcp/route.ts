import { z } from 'zod'
import { getCategories, getClubsForFilter, getTournamentsOptimized } from '@/app/api/tournaments'
import { getTenantBranding } from '@/config/tenant'
import { getOrganizerOAuth } from '@/lib/mcp/organizer-auth'
import { organizerTools } from '@/lib/mcp/organizer-tools'
import { organizerInstructions } from '@/lib/mcp/organizer-instructions'
import { getPublicLongResults, type PublicLongCouple, type PublicLongFechaSelector } from '@/lib/services/public-long-results.service'
import { getPublicTournamentHref } from '@/lib/tournaments/public-tournament-url'
import { createPilotMcp, readDemoFecha } from '@/scripts/match-scheduling-mcp-pilot.mjs'

const publicOrigin = 'https://www.padelfv.com'
const pageSize = 10
const resultPageSize = 25
const searchText = z.string().trim().min(1).max(100)
const statusValues = ['active', 'past', 'all'] as const
const searchSchema = z.object({
  nombre: searchText.optional(),
  sede: searchText.optional(),
  categoria: searchText.optional(),
  estado: z.enum(statusValues).default('all'),
  pagina: z.number().int().min(1).max(100).default(1),
}).strict()
const resultsInput = z.object({
  tournamentId: z.string().uuid(),
  pagina: z.number().int().min(1).max(100).default(1),
  fechaId: z.string().uuid().optional(),
  fechaNumero: z.number().int().min(1).max(2_147_483_647).optional(),
}).strict()
const resultsSchema = resultsInput.refine(input => !(input.fechaId && input.fechaNumero))
const dateSchema = resultsInput.refine(input => Boolean(input.fechaId) !== Boolean(input.fechaNumero))
const demoDateSchema = z.object({
  tournamentId: z.literal('torneo-demo'),
  fechaId: z.literal('fecha-3'),
}).strict()

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
const pageField = { type: 'integer', minimum: 1, maximum: 100, default: 1 }
const textField = { type: 'string', minLength: 1, maxLength: 100 }
const fechaFields = {
  fechaId: { type: 'string', description: 'ID de la fecha. Usalo si no indicás fechaNumero.' },
  fechaNumero: { type: 'integer', minimum: 1, maximum: 2_147_483_647, description: 'Número de jornada dentro de la liga, por ejemplo 3.' },
}

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim()

const searchTournaments = async (input: unknown) => {
  const parsed = searchSchema.safeParse(input)
  if (!parsed.success) return { error: 'Usá nombre, sede, categoría, estado y página válidos.' }
  const { nombre, sede, categoria, estado, pagina } = parsed.data
  const [clubs, categories] = await Promise.all([
    sede ? getClubsForFilter() : [],
    categoria ? getCategories() : [],
  ])
  const matchingClubs = sede ? clubs.filter((club: { name: string }) => normalize(club.name).includes(normalize(sede))) : []
  const exactClub = sede ? matchingClubs.find((club: { name: string }) => normalize(club.name) === normalize(sede)) : undefined
  const club = exactClub ?? (matchingClubs.length === 1 ? matchingClubs[0] : undefined)
  if (sede && !club) {
    return {
      torneos: [],
      sedesCoincidentes: matchingClubs.map((candidate: { name: string }) => candidate.name),
      mensaje: matchingClubs.length ? 'Indicá una de las sedes encontradas.' : 'No se encontró esa sede.',
    }
  }
  const categoryName = categoria
    ? categories.find((candidate) => normalize(candidate.name) === normalize(categoria))?.name ?? categoria
    : undefined
  const statuses = estado === 'all' ? ['active', 'past'] as const : [estado]
  const pages = await Promise.all(statuses.map(status => getTournamentsOptimized({
    status,
    page: pagina,
    limit: pageSize,
    filters: {
      type: 'LONG',
      clubId: club?.id,
      visibleVenueOnly: Boolean(club),
      categoryName,
      search: nombre,
    },
  })))

  return {
    pagina,
    hayMas: pages.some(page => page.totalPages > pagina),
    torneos: pages.flatMap(page => page.tournaments.map(tournament => ({
      tournamentId: tournament.id,
      nombre: tournament.name,
      categoria: tournament.category,
      sede: tournament.club?.name ?? null,
      estado: tournament.status,
      fechaInicio: tournament.startDate,
      url: new URL(getPublicTournamentHref({ id: tournament.id, seoSlug: tournament.seoSlug }), publicOrigin).href,
    }))),
  }
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

const readResults = async (input: unknown) => {
  const parsed = resultsSchema.safeParse(input)
  return parsed.success
    ? readResultsPage(parsed.data)
    : { error: 'Usá el tournamentId obtenido con buscar_torneos y, si querés filtrar, fechaNumero o fechaId.' }
}

const readDate = async (input: unknown) => {
  const demo = demoDateSchema.safeParse(input)
  if (demo.success) return readDemoFecha(demo.data)

  const parsed = dateSchema.safeParse(input)
  return parsed.success
    ? readResultsPage(parsed.data)
    : { error: 'Indicá el tournamentId real y la fecha con fechaNumero o fechaId, uno de los dos.' }
}

const publicTools = [
  {
    definition: {
      name: 'consultar_fecha',
      description: 'Consulta los resultados públicos de una jornada de una liga LONG de Padel FV. Usá el tournamentId de buscar_torneos y fechaNumero (por ejemplo 3) o fechaId. Devuelve la fecha, día, horario y cancha registrados de cada partido finalizado cuando constan.',
      inputSchema: {
        type: 'object',
        properties: { tournamentId: { type: 'string' }, ...fechaFields, pagina: pageField },
        required: ['tournamentId'],
        additionalProperties: false,
      },
      annotations: readOnly,
    },
    run: readDate,
  },
  {
    definition: {
      name: 'buscar_torneos',
      description: 'Busca ligas LONG públicas de Padel FV por nombre, sede o categoría (por ejemplo 4ta). Devuelve el ID y enlace para consultar resultados. Incluye ligas activas y finalizadas por defecto.',
      inputSchema: {
        type: 'object',
        properties: {
          nombre: textField,
          sede: textField,
          categoria: textField,
          estado: { type: 'string', enum: statusValues, default: 'all' },
          pagina: pageField,
        },
        additionalProperties: false,
      },
      annotations: readOnly,
    },
    run: searchTournaments,
  },
  {
    definition: {
      name: 'consultar_resultados',
      description: 'Lee los resultados publicados de una liga LONG de Padel FV, con día, horario, cancha y número de fecha cuando constan. Usá el tournamentId de buscar_torneos y opcionalmente fechaNumero o fechaId.',
      inputSchema: {
        type: 'object',
        properties: { tournamentId: { type: 'string', format: 'uuid' }, ...fechaFields, pagina: pageField },
        required: ['tournamentId'],
        additionalProperties: false,
      },
      annotations: readOnly,
    },
    run: readResults,
  },
]
const publicDefinitions = publicTools.map(tool => ({
  ...tool,
  definition: {
    ...tool.definition,
    securitySchemes: [{ type: 'noauth' }],
    _meta: { securitySchemes: [{ type: 'noauth' }] },
  },
}))
const publicMcp = createPilotMcp(publicDefinitions)
const organizerMcp = createPilotMcp([...publicDefinitions, ...organizerTools], organizerInstructions)

const handleMcp = (request: Request) => getTenantBranding().key === 'padel-fv'
  ? (getOrganizerOAuth() ? organizerMcp : publicMcp).fetch(request)
  : new Response(null, { status: 404 })

export { handleMcp as GET, handleMcp as POST }
