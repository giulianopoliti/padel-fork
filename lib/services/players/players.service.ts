import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { normalizePlayerDni } from '@/lib/utils/player-dni'
import { isPlayerGender, type PlayerGender } from '@/lib/utils/player-gender'

export interface PlayerData {
  id: string
  first_name: string
  last_name: string
  dni: string | null
  dni_is_temporary?: boolean | null
  phone: string | null
  score: number | null
  profile_image_url: string | null
  category_name: string | null
  gender: string | null
  user_id?: string | null
  email?: string | null
  users?: { email: string | null } | Array<{ email: string | null }> | null
}

export interface PlayerUpdateData {
  first_name?: string
  last_name?: string
  dni?: string | null
  phone?: string
  category_name?: string
  gender?: PlayerGender
}

/**
 * Obtiene todos los jugadores de una organización (para initial load)
 */
export async function getTenantPlayers(
  page: number = 1,
  pageSize: number = 20
) {
  const supabase = await createClient()

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await supabase
    .from('players')
    .select('id, first_name, last_name, dni, dni_is_temporary, phone, score, profile_image_url, category_name, gender, user_id, users!players_user_id_fkey(email)', { count: 'exact' })
    .eq('es_prueba', false)
    .order('score', { ascending: false, nullsFirst: false })
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })
    .range(from, to)

  if (error) {
    console.error('Error fetching players:', error)
    return { players: [], total: 0, error: error.message }
  }

  const players = (data || []).map((player) => ({
    ...player,
    users: Array.isArray(player.users) ? player.users[0] : player.users
  }))

  return {
    players,
    total: count || 0,
    totalPages: Math.ceil((count || 0) / pageSize),
    currentPage: page
  }
}

export async function getOrganizationPlayers(
  _organizationId: string,
  page: number = 1,
  pageSize: number = 20
) {
  return getTenantPlayers(page, pageSize)
}

/**
 * Actualiza los datos de un jugador
 * Si cambia la categoría, ajusta automáticamente el score al lower_range
 */
export async function updatePlayer(
  playerId: string,
  updates: PlayerUpdateData
) {
  const { first_name, last_name, phone, category_name, gender } = updates
  if (gender !== undefined && !isPlayerGender(gender)) {
    return { success: false, error: 'Seleccioná un sexo válido para el jugador' }
  }

  const supabase = await createClient()

  // 1. Verificar que el jugador pertenece a la organización
  const { data: player, error: fetchError } = await supabase
    .from('players')
    .select('category_name, score')
    .eq('id', playerId)
    .eq('es_prueba', false)
    .single()

  if (fetchError || !player) {
    return { success: false, error: 'Jugador no encontrado' }
  }

  // 2. Si cambia la categoría, obtener el nuevo score
  const finalUpdates: PlayerUpdateData & { dni_is_temporary?: boolean; score?: number } = {
    first_name,
    last_name,
    phone,
    category_name,
    ...(gender !== undefined && { gender }),
  }

  if (updates.dni !== undefined) {
    const normalizedDni = normalizePlayerDni(updates.dni)
    finalUpdates.dni = normalizedDni.dni
    finalUpdates.dni_is_temporary = normalizedDni.dniIsTemporary

    if (normalizedDni.dni) {
      const { data: existingPlayer, error: dniError } = await supabase
        .from('players')
        .select('id')
        .eq('dni', normalizedDni.dni)
        .eq('es_prueba', false)
        .neq('id', playerId)
        .maybeSingle()

      if (dniError) {
        return { success: false, error: 'Error validando DNI del jugador' }
      }

      if (existingPlayer) {
        return { success: false, error: 'Ya existe un jugador con ese DNI' }
      }
    }
  }

  if (updates.category_name && updates.category_name !== player.category_name) {
    const { data: category, error: categoryError } = await supabase
      .from('categories')
      .select('lower_range')
      .eq('name', updates.category_name)
      .single()

    if (categoryError || !category) {
      return { success: false, error: 'Categoría no encontrada' }
    }

    finalUpdates.score = category.lower_range
  }

  // 3. Realizar el update
  const { data: updatedPlayer, error: updateError } = await supabase
    .from('players')
    .update(finalUpdates)
    .eq('id', playerId)
    .select('id, first_name, last_name, dni, dni_is_temporary, phone, score, profile_image_url, category_name, gender, user_id, users!players_user_id_fkey(email)')
    .single()

  if (updateError) {
    console.error('Error updating player:', updateError)
    return { success: false, error: updateError.message }
  }

  return {
    success: true,
    player: updatedPlayer,
    scoreChanged: !!finalUpdates.score
  }
}

/**
 * Elimina definitivamente un jugador solo si no tiene cuenta ni registros asociados.
 */
export async function softDeletePlayer(playerId: string) {
  // 1. Verificar permisos
  const { data: player, error: fetchError } = await supabaseAdmin
    .from('players')
    .select('id, user_id')
    .eq('id', playerId)
    .eq('es_prueba', false)
    .single()

  if (fetchError || !player) {
    return { success: false, error: 'Jugador no encontrado' }
  }

  if (player.user_id) {
    return {
      success: false,
      error: 'No se pudo eliminar el jugador porque tiene una cuenta vinculada. Contacta al administrador.'
    }
  }

  const coupleIds = await getPlayerCoupleIds(playerId)
  const hasInscriptions = await hasPlayerInscriptions(playerId, coupleIds)

  if (hasInscriptions) {
    return {
      success: false,
      error: 'No se pudo eliminar el jugador porque tiene inscripciones asociadas. Contacta al administrador.'
    }
  }

  const hasPlayedMatches = await hasPlayerPlayedMatches(coupleIds)

  if (hasPlayedMatches) {
    return {
      success: false,
      error: 'No se pudo eliminar el jugador porque tiene partidos jugados. Contacta al administrador.'
    }
  }

  await cleanupPlayerReferences(playerId, coupleIds)

  // 2. Hard delete
  const { error: deleteError } = await supabaseAdmin
    .from('players')
    .delete()
    .eq('id', playerId)

  if (deleteError) {
    console.error('Error deleting player:', deleteError)
    return {
      success: false,
      error: 'No se pudo eliminar el jugador. Contacta al administrador.'
    }
  }

  return { success: true }
}

const getPlayerCoupleIds = async (playerId: string) => {
  const { data, error } = await supabaseAdmin
    .from('couples')
    .select('id')
    .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)

  if (error) {
    console.error('Error fetching player couples:', error)
    throw error
  }

  return (data || []).map((couple) => couple.id)
}

const hasPlayerInscriptions = async (playerId: string, coupleIds: string[]) => {
  const { count: playerInscriptions, error: playerInscriptionsError } = await supabaseAdmin
    .from('inscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('player_id', playerId)
    .or('es_prueba.is.false,es_prueba.is.null')

  if (playerInscriptionsError) {
    console.error('Error checking player inscriptions:', playerInscriptionsError)
    throw playerInscriptionsError
  }

  if ((playerInscriptions || 0) > 0) {
    return true
  }

  if (coupleIds.length === 0) {
    return false
  }

  const { count, error } = await supabaseAdmin
    .from('inscriptions')
    .select('*', { count: 'exact', head: true })
    .in('couple_id', coupleIds)
    .or('es_prueba.is.false,es_prueba.is.null')

  if (error) {
    console.error('Error checking player couple inscriptions:', error)
    throw error
  }

  return (count || 0) > 0
}

const hasPlayerPlayedMatches = async (coupleIds: string[]) => {
  if (coupleIds.length === 0) {
    return false
  }

  const matchCoupleFilter = buildOrInFilter([
    ['couple1_id', coupleIds],
    ['couple2_id', coupleIds],
  ])

  const { data, error } = await supabaseAdmin
    .from('matches')
    .select('id, status, result_couple1, result_couple2')
    .or('es_prueba.is.false,es_prueba.is.null')
    .or(matchCoupleFilter)

  if (error) {
    console.error('Error checking player played matches:', error)
    throw error
  }

  return (data || []).some((match) => {
    const status = String(match.status || '').toUpperCase()
    const hasResult = [match.result_couple1, match.result_couple2].some((result) => (
      typeof result === 'string' && result.trim() !== ''
    ))

    return hasResult || ['FINISHED', 'COMPLETED'].includes(status)
  })
}

const cleanupPlayerReferences = async (playerId: string, coupleIds: string[]) => {
  const matchIds = await getUnplayedMatchIdsForCouples(coupleIds)

  await deleteByColumn('dni_conflicts', 'existing_player_id', playerId)
  await deleteByColumn('dni_conflicts', 'new_player_id', playerId)
  await deleteByColumn('player_identity_transfers', 'source_player_id', playerId)
  await deleteByColumn('player_identity_transfers', 'target_player_id', playerId)
  await deleteByColumn('player_recategorizations', 'player_id', playerId)
  await deleteByColumn('player_user_account_resets', 'player_id', playerId)
  await deleteByColumn('reviews', 'player_id', playerId)
  await deleteByColumn('tournament_couple_disqualifications', 'player1_id', playerId)
  await deleteByColumn('tournament_couple_disqualifications', 'player2_id', playerId)

  if (coupleIds.length === 0) {
    return
  }

  if (matchIds.length > 0) {
    await deleteByColumnIn('match_hierarchy', 'parent_match_id', matchIds)
    await deleteByColumnIn('match_hierarchy', 'child_match_id', matchIds)
    await deleteByColumnIn('bracket_operations_log', 'source_match_id', matchIds)
    await deleteByColumnIn('bracket_operations_log', 'target_match_id', matchIds)
    await deleteByColumnIn('match_results_history', 'match_id', matchIds)
  }

  await deleteByColumnIn('bracket_operations_log', 'source_couple_id', coupleIds)
  await deleteByColumnIn('bracket_operations_log', 'target_couple_id', coupleIds)
  await deleteByColumnIn('match_results_history', 'previous_winner_id', coupleIds)
  await deleteByColumnIn('match_results_history', 'new_winner_id', coupleIds)
  await deleteByColumnIn('placeholder_resolutions', 'resolved_couple_id', coupleIds)
  await deleteByColumnIn('set_matches', 'winner_couple_id', coupleIds)
  await updateByColumnIn('tournaments', 'winner_id', coupleIds, { winner_id: null })
  await deleteByColumnIn('zone_positions', 'couple_id', coupleIds)

  if (matchIds.length > 0) {
    await deleteByColumnIn('matches', 'id', matchIds)
  }

  await deleteByColumnIn('couples', 'id', coupleIds)
}

const getUnplayedMatchIdsForCouples = async (coupleIds: string[]) => {
  if (coupleIds.length === 0) {
    return []
  }

  const matchCoupleFilter = buildOrInFilter([
    ['couple1_id', coupleIds],
    ['couple2_id', coupleIds],
    ['winner_id', coupleIds],
  ])

  const { data, error } = await supabaseAdmin
    .from('matches')
    .select('id, status, result_couple1, result_couple2')
    .or(matchCoupleFilter)

  if (error) {
    console.error('Error fetching unplayed player matches:', error)
    throw error
  }

  return (data || [])
    .filter((match) => {
      const status = String(match.status || '').toUpperCase()
      const hasResult = [match.result_couple1, match.result_couple2].some((result) => (
        typeof result === 'string' && result.trim() !== ''
      ))

      return !hasResult && !['FINISHED', 'COMPLETED'].includes(status)
    })
    .map((match) => match.id)
}

const buildOrInFilter = (filters: Array<[string, string[]]>) => {
  return filters
    .filter(([, values]) => values.length > 0)
    .map(([column, values]) => `${column}.in.(${values.join(',')})`)
    .join(',')
}

const deleteByColumn = async (table: string, column: string, value: string) => {
  const { error } = await (supabaseAdmin as any)
    .from(table)
    .delete()
    .eq(column, value)

  if (error) {
    console.error(`Error deleting ${table}.${column} references:`, error)
    throw error
  }
}

const deleteByColumnIn = async (table: string, column: string, values: string[]) => {
  if (values.length === 0) {
    return
  }

  const { error } = await (supabaseAdmin as any)
    .from(table)
    .delete()
    .in(column, values)

  if (error) {
    console.error(`Error deleting ${table}.${column} references:`, error)
    throw error
  }
}

const updateByColumnIn = async (
  table: string,
  column: string,
  values: string[],
  updates: Record<string, unknown>
) => {
  if (values.length === 0) {
    return
  }

  const { error } = await (supabaseAdmin as any)
    .from(table)
    .update(updates)
    .in(column, values)

  if (error) {
    console.error(`Error updating ${table}.${column} references:`, error)
    throw error
  }
}

/**
 * Obtiene las categorías disponibles para el selector
 */
export async function getCategories() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('categories')
    .select('name, lower_range, upper_range')
    .order('lower_range', { ascending: false })

  if (error) {
    console.error('Error fetching categories:', error)
    return []
  }

  return data || []
}
