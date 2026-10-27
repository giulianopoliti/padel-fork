import { NextRequest, NextResponse } from 'next/server'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { PointsReviewError } from '@/lib/services/points/services/points-review.engine'
import { throwPointsDatabaseError } from '@/lib/services/points/services/points-review.service'

interface TournamentPlayer {
  id: string
  first_name: string
  last_name: string
  score: number
  category_name: string
  club_name?: string
}

interface RecategorizePlayersResponse {
  success: boolean
  players?: TournamentPlayer[]
  categories?: { name: string; lower_range: number; upper_range: number | null }[]
  error?: string
}

/**
 * GET: Obtener players del torneo para recategorización
 * Solo accesible por el club owner del torneo
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<RecategorizePlayersResponse>> {
  
  const { id: tournamentId } = await params
  
  try {
    const supabase = await createClient()
    
    // Verificar autenticación
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'No autorizado - Usuario no encontrado'
      }, { status: 401 })
    }

    // Verificar permisos usando la función centralizada
    const permissionCheck = await checkTournamentPermissions(user.id, tournamentId)

    if (!permissionCheck.hasPermission) {
      return NextResponse.json({
        success: false,
        error: permissionCheck.reason || 'No autorizado - No tienes permisos para acceder a este torneo'
      }, { status: 403 })
    }

    // CORREGIDO: Obtener TODOS los jugadores del torneo via couples
    // Obtener todas las parejas inscritas primero
    const { data: inscriptions, error: inscriptionsError } = await supabase
      .from('inscriptions')
      .select(`
        couples!inner (
          id,
          player1_id,
          player2_id
        )
      `)
      .eq('tournament_id', tournamentId)
      .eq('es_prueba', false)
      .eq('couples.es_prueba', false)
    
    if (inscriptionsError) {
      console.error('Error fetching tournament inscriptions:', inscriptionsError)
      return NextResponse.json({
        success: false,
        error: 'Error al obtener las inscripciones del torneo'
      }, { status: 500 })
    }
    
    // Recopilar todos los IDs de jugadores únicos
    const playerIds = new Set()
    for (const inscription of inscriptions || []) {
      const couple = inscription.couples as any
      if (couple.player1_id) playerIds.add(couple.player1_id)
      if (couple.player2_id) playerIds.add(couple.player2_id)
    }
    
    // Obtener información de todos los jugadores únicos
    const { data: playersData, error: playersError } = await supabase
      .from('players')
      .select(`
        id,
        first_name,
        last_name,
        score,
        category_name,
        club_id,
        clubes (
          name
        )
      `)
      .in('id', Array.from(playerIds))
      .eq('es_prueba', false)
    
    if (playersError) {
      console.error('Error fetching tournament players:', playersError)
      return NextResponse.json({
        success: false,
        error: 'Error al obtener los jugadores del torneo'
      }, { status: 500 })
    }
    
    // Formatear para mantener compatibilidad con el resto del código
    const players = playersData?.map(player => ({
      player_id: player.id,
      players: player
    })) || []

    // Obtener todas las categorías disponibles
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('name, lower_range, upper_range')
      .order('lower_range', { ascending: true })

    if (categoriesError) {
      console.error('Error fetching categories:', categoriesError)
      return NextResponse.json({
        success: false,
        error: 'Error al obtener las categorías'
      }, { status: 500 })
    }

    // Formatear datos de players
    const formattedPlayers: TournamentPlayer[] = players?.map((inscription: any) => ({
      id: inscription.players.id,
      first_name: inscription.players.first_name || '',
      last_name: inscription.players.last_name || '',
      score: Number(inscription.players.score) || 0,
      category_name: inscription.players.category_name || '',
      club_name: inscription.players.clubes?.name || 'Sin Club'
    })) || []

    // Remover duplicados (un player puede estar en múltiples inscriptions si es parte de varias parejas)
    const uniquePlayers = formattedPlayers.filter((player, index, self) => 
      index === self.findIndex(p => p.id === player.id)
    )

    // Ordenar por apellido y nombre
    uniquePlayers.sort((a, b) => {
      const lastNameComparison = a.last_name.localeCompare(b.last_name)
      if (lastNameComparison !== 0) return lastNameComparison
      return a.first_name.localeCompare(b.first_name)
    })

    return NextResponse.json({
      success: true,
      players: uniquePlayers,
      categories: categories || []
    })

  } catch (error) {
    console.error('Error in recategorize-players endpoint:', error)
    return NextResponse.json({
      success: false,
      error: 'Error interno del servidor'
    }, { status: 500 })
  }
}

/**
 * POST: Actualizar categorías de players
 * Body: { updates: Array<{playerId: string, newCategory: string}> }
 */
const changesSchema = z.object({ updates: z.array(z.object({
  playerId: z.string().uuid(), newCategory: z.string().min(1).max(60),
  expectedScore: z.number().int(), expectedCategory: z.string().nullable(),
}).strict()).min(1).max(512) }).strict()

export const POST = async (request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
    const permission = await checkTournamentPermissions(user.id, id)
    if (!permission.hasPermission) return NextResponse.json({ success: false, error: permission.reason }, { status: 403 })
    const body = changesSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) return NextResponse.json({ success: false, error: 'Actualizá la lista y revisá los cambios enviados.' }, { status: 400 })
    const service = await createClientServiceRole()
    const { data, error: saveError } = await service.rpc('recategorize_tournament_players', { p_tournament_id: id, p_actor_id: user.id, p_updates: body.data.updates })
    if (saveError) throwPointsDatabaseError(saveError)
    for (const path of [`/tournaments/${id}`, '/ranking', '/my-players', '/profile']) revalidatePath(path)
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof PointsReviewError) return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    console.error('[Manual categories]', error)
    return NextResponse.json({ success: false, error: 'No se pudieron guardar las categorías.' }, { status: 500 })
  }
}
