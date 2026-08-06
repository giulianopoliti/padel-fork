'use server'

import { revalidatePath } from 'next/cache'
import { updatePlayer, softDeletePlayer, getCategories } from './players.service'
import { createClient } from '@/utils/supabase/server'
import { getPlayerDetails } from './get-player-details'
import { checkPlayerOwnership } from './check-player-ownership'

export interface PlayerOrganizationTournamentHistoryItem {
  inscriptionId: string
  coupleId: string
  tournamentId: string
  tournamentName: string
  tournamentType: string | null
  tournamentStatus: string | null
  categoryName: string | null
  startDate: string | null
  endDate: string | null
  inscriptionCreatedAt: string | null
}

/**
 * Server Action para actualizar un jugador
 */
export async function updatePlayerAction(
  playerId: string,
  updates: {
    first_name?: string
    last_name?: string
    dni?: string | null
    phone?: string
    category_name?: string
  }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'No autenticado' }
    }

    // Obtener organizationId del usuario
    const { data: orgMember, error: orgError } = await supabase
      .from('organization_members')
      .select('organizacion_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (orgError || !orgMember) {
      return { success: false, error: 'Sin organización asignada' }
    }

    // Actualizar jugador dentro del tenant actual. La membresia activa ya valida
    // que el usuario puede gestionar jugadores de esta base Supabase.
    const result = await updatePlayer(playerId, updates)

    if (result.success) {
      // Revalidar páginas que muestran jugadores
      revalidatePath('/my-players')
      revalidatePath('/panel')
      revalidatePath('/panel-cpa')
    }

    return result
  } catch (error) {
    console.error('Error in updatePlayerAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al actualizar jugador'
    }
  }
}

/**
 * Server Action para eliminar definitivamente un jugador cuando no tiene registros asociados
 */
export async function deletePlayerAction(playerId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'No autenticado' }
    }

    // Obtener organizationId del usuario
    const { data: orgMember, error: orgError } = await supabase
      .from('organization_members')
      .select('organizacion_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (orgError || !orgMember) {
      return { success: false, error: 'Sin organización asignada' }
    }

    // Soft-delete jugador dentro del tenant actual. La membresia activa ya valida
    // que el usuario puede gestionar jugadores de esta base Supabase.
    const result = await softDeletePlayer(playerId)

    if (result.success) {
      // Revalidar páginas
      revalidatePath('/my-players')
      revalidatePath('/panel')
      revalidatePath('/panel-cpa')
    }

    return result
  } catch (error) {
    console.error('Error in deletePlayerAction:', error)
    const message = error instanceof Error && error.message
      ? error.message
      : 'No se pudo eliminar el jugador. Contacta al administrador.'

    return {
      success: false,
      error: message
    }
  }
}

/**
 * Server Action para obtener categorías (usado en dialogs)
 */
export async function getCategoriesAction() {
  try {
    const categories = await getCategories()
    return { success: true, categories }
  } catch (error) {
    console.error('Error in getCategoriesAction:', error)
    return {
      success: false,
      error: 'Error al cargar categorías',
      categories: []
    }
  }
}

/**
 * Server Action para obtener detalles completos de un jugador
 * incluyendo email y permisos de edición en el contexto de un torneo
 */
export async function getPlayerDetailsAction(playerId: string, tournamentId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return {
        success: false,
        error: 'No autenticado',
        player: null,
        canEdit: false,
        canView: false,
        isOwner: false
      }
    }

    // Obtener detalles del jugador
    const playerResult = await getPlayerDetails(playerId)

    if (!playerResult.success || !playerResult.player) {
      return {
        success: false,
        error: playerResult.error || 'Jugador no encontrado',
        player: null,
        canEdit: false,
        canView: false,
        isOwner: false
      }
    }

    // Verificar permisos de edición en contexto del torneo
    const ownershipResult = await checkPlayerOwnership(playerId, user.id, tournamentId)

    return {
      success: true,
      player: playerResult.player,
      canEdit: ownershipResult.canEdit,
      canView: ownershipResult.canView,
      isOwner: ownershipResult.isOwner,
      userRole: ownershipResult.userRole
    }
  } catch (error) {
    console.error('Error in getPlayerDetailsAction:', error)
    return {
      success: false,
      error: 'Error al obtener detalles del jugador',
      player: null,
      canEdit: false,
      canView: false,
      isOwner: false
    }
  }
}

export async function getPlayerOrganizationTournamentHistoryAction(
  playerId: string,
  tournamentId: string
): Promise<{
  success: boolean
  history: PlayerOrganizationTournamentHistoryItem[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, history: [], error: 'No autenticado' }
    }

    const ownershipResult = await checkPlayerOwnership(playerId, user.id, tournamentId)

    if (!ownershipResult.canView) {
      return {
        success: false,
        history: [],
        error: ownershipResult.error || 'Sin permisos para ver el historial del jugador'
      }
    }

    const { data: currentTournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, organization_id, club_id')
      .eq('id', tournamentId)
      .single()

    if (tournamentError || !currentTournament) {
      return { success: false, history: [], error: 'Torneo no encontrado' }
    }

    const { data: couples, error: couplesError } = await supabase
      .from('couples')
      .select('id')
      .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)

    if (couplesError) {
      console.error('Error fetching player couples history:', couplesError)
      return { success: false, history: [], error: 'No se pudo obtener el historial de parejas' }
    }

    const coupleIds = (couples || []).map((couple: any) => couple.id).filter(Boolean)

    if (coupleIds.length === 0) {
      return { success: true, history: [] }
    }

    const { data: inscriptions, error: inscriptionsError } = await supabase
      .from('inscriptions')
      .select(`
        id,
        couple_id,
        tournament_id,
        created_at,
        tournaments (
          id,
          name,
          type,
          status,
          category_name,
          start_date,
          end_date,
          organization_id,
          club_id
        )
      `)
      .in('couple_id', coupleIds)

    if (inscriptionsError) {
      console.error('Error fetching player inscriptions history:', inscriptionsError)
      return { success: false, history: [], error: 'No se pudo obtener el historial de inscripciones' }
    }

    const historyByTournament = new Map<string, PlayerOrganizationTournamentHistoryItem>()

    for (const inscription of inscriptions || []) {
      const tournament = Array.isArray((inscription as any).tournaments)
        ? (inscription as any).tournaments[0]
        : (inscription as any).tournaments

      if (!tournament?.id) continue

      const belongsToSameOrganization = currentTournament.organization_id
        ? tournament.organization_id === currentTournament.organization_id
        : tournament.club_id === currentTournament.club_id

      if (!belongsToSameOrganization) continue

      const item: PlayerOrganizationTournamentHistoryItem = {
        inscriptionId: String(inscription.id),
        coupleId: String(inscription.couple_id),
        tournamentId: String(tournament.id),
        tournamentName: tournament.name || 'Torneo sin nombre',
        tournamentType: tournament.type || null,
        tournamentStatus: tournament.status || null,
        categoryName: tournament.category_name || null,
        startDate: tournament.start_date ? new Date(tournament.start_date).toISOString() : null,
        endDate: tournament.end_date ? new Date(tournament.end_date).toISOString() : null,
        inscriptionCreatedAt: inscription.created_at ? new Date(inscription.created_at).toISOString() : null
      }

      const existing = historyByTournament.get(item.tournamentId)
      const existingDate = existing?.startDate || existing?.inscriptionCreatedAt || ''
      const itemDate = item.startDate || item.inscriptionCreatedAt || ''

      if (!existing || itemDate > existingDate) {
        historyByTournament.set(item.tournamentId, item)
      }
    }

    const history = Array.from(historyByTournament.values()).sort((a, b) => {
      const dateA = a.startDate || a.inscriptionCreatedAt || ''
      const dateB = b.startDate || b.inscriptionCreatedAt || ''
      return dateB.localeCompare(dateA)
    })

    return { success: true, history }
  } catch (error) {
    console.error('Error in getPlayerOrganizationTournamentHistoryAction:', error)
    return {
      success: false,
      history: [],
      error: 'Error al obtener el historial del jugador'
    }
  }
}
