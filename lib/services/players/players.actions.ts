'use server'

import { revalidatePath } from 'next/cache'
import { updatePlayer, softDeletePlayer, getCategories, type PlayerUpdateData } from './players.service'
import { createClient } from '@/utils/supabase/server'
import { getPlayerDetails } from './get-player-details'
import { checkPlayerOwnership } from './check-player-ownership'

/**
 * Server Action para actualizar un jugador
 */
export async function updatePlayerAction(
  playerId: string,
  updates: PlayerUpdateData
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
