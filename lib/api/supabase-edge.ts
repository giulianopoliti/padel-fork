import { createClient } from '@/utils/supabase/client'

type PlayerSearchResponse = {
  success: boolean
  players?: any[]
  total?: number
  totalPages?: number
  currentPage?: number
  error?: string
}

async function searchPlayerDirectory(body: Record<string, unknown>): Promise<PlayerSearchResponse> {
  const response = await fetch('/api/players/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => ({
    success: false,
    error: 'El servidor devolvió una respuesta inválida',
  })) as PlayerSearchResponse

  if (!response.ok) {
    throw new Error(payload.error || 'No se pudieron buscar jugadores')
  }

  return payload
}

export async function searchPlayersOrganization(params: {
  searchTerm?: string
  page?: number
  pageSize?: number
  categoryFilter?: string
  organizationId: string
}) {
  return searchPlayerDirectory({ scope: 'organization', ...params })
}

export async function searchRankingPlayers(params: {
  searchTerm?: string
  page?: number
  pageSize?: number
  category?: string | null
  clubId?: string | null
  gender?: 'MALE' | 'FEMALE'
}) {
  const supabase = createClient()

  console.log('[searchRankingPlayers] Calling edge function with params:', params)

  // Llamar a Edge Function (pública, sin autenticación)
  const { data, error } = await supabase.functions.invoke('search-ranking-players', {
    body: params,
  })

  if (error) {
    console.error('[searchRankingPlayers] Error calling edge function:', error)
    throw error
  }

  console.log('[searchRankingPlayers] Success:', { hasData: !!data })

  return data
}

/**
 * 🔍 Buscar jugadores para inscripciones de torneos
 *
 * Edge Function que soporta:
 * - Búsqueda por nombre completo ("Giuliano Politi")
 * - Búsqueda por DNI normalizado ("12345678" encuentra "12.345.678")
 * - Normalización de acentos ("María" = "maria")
 * - Filtrado por género del torneo
 *
 * @param params - Parámetros de búsqueda
 * @param params.searchTerm - Término de búsqueda (nombre, apellido o DNI)
 * @param params.tournamentId - ID del torneo (para filtrar por género)
 * @param params.page - Número de página (default: 1)
 * @param params.pageSize - Tamaño de página (default: 50)
 * @returns Resultados de búsqueda con jugadores, total y paginación
 */
export async function searchTournamentPlayers(params: {
  searchTerm?: string
  tournamentId: string
  page?: number
  pageSize?: number
  excludePlayerIds?: string[]
}) {
  return searchPlayerDirectory({ scope: 'tournament', ...params })
}
