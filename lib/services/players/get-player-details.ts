import { createClient } from '@/utils/supabase/server'
import type { EliteTitle } from '@/lib/services/points/services/elite-title-history'

export interface PlayerDetails {
  id: string
  first_name: string
  last_name: string
  dni: string | null
  dni_is_temporary?: boolean | null
  phone: string | null
  score: number | null
  profile_image_url: string | null
  category_name: string | null
  user_email: string | null
  elite_titles?: EliteTitle[]
}

interface PlayerDetailsResult {
  success: boolean
  player?: PlayerDetails
  error?: string
}

/**
 * Obtiene los detalles completos de un jugador, incluyendo su email
 * mediante LEFT JOIN con la tabla users (puede no tener usuario asociado)
 *
 * @param playerId - ID del jugador
 * @returns PlayerDetailsResult con los datos del jugador
 */
export async function getPlayerDetails(
  playerId: string
): Promise<PlayerDetailsResult> {
  try {
    const supabase = await createClient()

    // Query con LEFT JOIN para obtener el email del usuario (si existe)
    // Usamos LEFT JOIN (sin !inner) para que no falle si no hay usuario asociado
    const { data, error } = await supabase
      .from('players')
      .select(`
        id,
        first_name,
        last_name,
        dni,
        dni_is_temporary,
        phone,
        score,
        profile_image_url,
        category_name,
        users (
          email
        )
      `)
      .eq('id', playerId)
      .single()

    if (error) {
      console.error('Error fetching player details:', error)
      return {
        success: false,
        error: 'No se pudo obtener la información del jugador'
      }
    }

    if (!data) {
      return {
        success: false,
        error: 'Jugador no encontrado'
      }
    }

    // Transformar la estructura de datos
    // El email puede ser null si el jugador no tiene usuario asociado
    const users = (data as any).users

    const player: PlayerDetails = {
      id: data.id,
      first_name: data.first_name,
      last_name: data.last_name,
      dni: data.dni,
      dni_is_temporary: data.dni_is_temporary,
      phone: data.phone,
      score: data.score,
      profile_image_url: data.profile_image_url,
      category_name: data.category_name,
      user_email: users ? (Array.isArray(users) ? users[0]?.email : users?.email) : null
    }

    return {
      success: true,
      player
    }
  } catch (error) {
    console.error('Error in getPlayerDetails:', error)
    return {
      success: false,
      error: 'Error al obtener los detalles del jugador'
    }
  }
}
