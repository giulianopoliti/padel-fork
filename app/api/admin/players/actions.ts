"use server"

import { supabaseAdmin, verifyAdmin } from "@/lib/supabase-admin"
import { revalidatePath } from "next/cache"
import { normalizePlayerDni } from "@/lib/utils/player-dni"

const normalizePlayerJoinData = (players: any[] | null | undefined) =>
  (players || []).map((player) => ({
    ...player,
    users: Array.isArray(player.users) ? player.users[0] : player.users,
    clubes: Array.isArray(player.clubes) ? player.clubes[0] : player.clubes,
  }))

/**
 * Actualizar datos completos de un jugador
 */
export async function updatePlayer(
  id: string,
  data: {
    first_name?: string
    last_name?: string
    dni?: string | null
    phone?: string | null
    date_of_birth?: string | null
    address?: string | null
    gender?: string
    instagram_handle?: string | null
    score?: number
    category_name?: string | null
    preferred_hand?: string | null
    preferred_side?: string | null
    racket?: string | null
    user_id?: string | null
    club_id?: string | null
    status?: string
    description?: string | null
  }
) {
  try {
    await verifyAdmin()

    // Validaciones básicas
    if (data.first_name !== undefined && !data.first_name.trim()) {
      return { success: false, error: "El nombre es requerido" }
    }

    if (data.last_name !== undefined && !data.last_name.trim()) {
      return { success: false, error: "El apellido es requerido" }
    }

    if (data.score !== undefined && data.score < 0) {
      return { success: false, error: "El puntaje debe ser positivo" }
    }

    // Validar DNI único si se está cambiando
    const normalizedData = { ...data }

    if (data.category_name !== undefined) {
      const { data: currentPlayer, error: playerError } = await supabaseAdmin.from('players')
        .select('category_name').eq('id', id).single()
      if (playerError || !currentPlayer) return { success: false, error: 'Jugador no encontrado' }
      if (currentPlayer.category_name !== data.category_name) normalizedData.score = 0
    }

    if (data.dni !== undefined) {
      const normalizedDni = normalizePlayerDni(data.dni)
      normalizedData.dni = normalizedDni.dni
      ;(normalizedData as any).dni_is_temporary = normalizedDni.dniIsTemporary
    }

    if (normalizedData.dni !== undefined && normalizedData.dni) {
      const { data: existingPlayer, error: dniError } = await supabaseAdmin
        .from("players")
        .select("id")
        .eq("dni", normalizedData.dni)
        .neq("id", id)
        .maybeSingle()

      if (dniError) throw dniError

      if (existingPlayer) {
        return { success: false, error: "Ya existe un jugador con ese DNI" }
      }
    }

    // Validar user_id único si se está cambiando
    if (data.user_id !== undefined && data.user_id) {
      const { data: existingPlayer, error: userIdError } = await supabaseAdmin
        .from("players")
        .select("id")
        .eq("user_id", data.user_id)
        .neq("id", id)
        .maybeSingle()

      if (userIdError) throw userIdError

      if (existingPlayer) {
        return {
          success: false,
          error: "Este usuario ya está vinculado a otro jugador"
        }
      }
    }

    const { error } = await supabaseAdmin
      .from("players")
      .update(normalizedData)
      .eq("id", id)

    if (error) throw error

    revalidatePath("/admin/players")
    return { success: true, error: null }
  } catch (error: any) {
    console.error("[Admin] Error updating player:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Vincular un jugador con un usuario
 */
export async function linkPlayerToUser(playerId: string, userId: string) {
  try {
    await verifyAdmin()

    // Verificar que el user_id no esté ya vinculado
    const { data: existingPlayer, error: checkError } = await supabaseAdmin
      .from("players")
      .select("id, first_name, last_name")
      .eq("user_id", userId)
      .maybeSingle()

    if (checkError) throw checkError

    if (existingPlayer) {
      return {
        success: false,
        error: `Usuario ya vinculado a ${existingPlayer.first_name} ${existingPlayer.last_name}`
      }
    }

    // Vincular
    const { error: linkError } = await supabaseAdmin
      .from("players")
      .update({ user_id: userId })
      .eq("id", playerId)

    if (linkError) throw linkError

    revalidatePath("/admin/players")
    return { success: true, error: null }
  } catch (error: any) {
    console.error("[Admin] Error linking player to user:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Desvincular un jugador de su usuario
 */
export async function unlinkPlayer(playerId: string) {
  try {
    await verifyAdmin()

    const { error } = await supabaseAdmin
      .from("players")
      .update({ user_id: null })
      .eq("id", playerId)

    if (error) throw error

    revalidatePath("/admin/players")
    return { success: true, error: null }
  } catch (error: any) {
    console.error("[Admin] Error unlinking player:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Buscar usuarios por email para vincular
 */
export async function searchUsers(query: string) {
  try {
    await verifyAdmin()

    if (!query || query.length < 2) {
      return { data: [], error: null }
    }

    const { data: users, error } = await supabaseAdmin
      .from("users")
      .select("id, email, role")
      .ilike("email", `%${query}%`)
      .limit(10)

    if (error) throw error

    // Para cada usuario, verificar si ya está vinculado a un jugador
    const usersWithLinkStatus = await Promise.all(
      (users || []).map(async (user) => {
        const { data: player } = await supabaseAdmin
          .from("players")
          .select("id, first_name, last_name")
          .eq("user_id", user.id)
          .maybeSingle()

        return {
          ...user,
          isLinked: !!player,
          linkedPlayerName: player
            ? `${player.first_name} ${player.last_name}`
            : null
        }
      })
    )

    return { data: usersWithLinkStatus, error: null }
  } catch (error: any) {
    console.error("[Admin] Error searching users:", error)
    return { data: [], error: error.message }
  }
}

/**
 * Obtener todas las categorías disponibles
 */
export async function getCategories() {
  try {
    await verifyAdmin()

    const { data: categories, error } = await supabaseAdmin
      .from("categories")
      .select("name, level, initial_score")
      .order("level", { ascending: true })

    if (error) throw error

    return { data: categories, error: null }
  } catch (error: any) {
    console.error("[Admin] Error fetching categories:", error)
    return { data: [], error: error.message }
  }
}

/**
 * Interfaz para filtros de búsqueda de jugadores
 */
export interface SearchPlayersFilters {
  searchTerm?: string
  onlyWithoutEmail?: boolean
  onlyWithoutDNI?: boolean
  onlyWithoutPhone?: boolean
  onlyTestPlayers?: boolean
  categories?: string[]
  status?: string
  gender?: string
  clubId?: string
  minScore?: number
  maxScore?: number
  dateFrom?: string
  dateTo?: string
}

/**
 * Buscar jugadores con paginación y filtros avanzados
 * Busca por nombre, apellido, DNI o email + filtros adicionales
 */
export async function searchPlayers(
  filters: SearchPlayersFilters = {},
  page: number = 1,
  pageSize: number = 50
) {
  try {
    await verifyAdmin()

    const offset = (page - 1) * pageSize

    // Construir query base
    let query = supabaseAdmin.from("players").select(
      `
        id,
        first_name,
        last_name,
        dni,
        phone,
        score,
        category_name,
        gender,
        status,
        created_at,
        user_id,
        users!players_user_id_fkey(email)
      `,
      { count: "exact" }
    )

    // Aplicar filtro de búsqueda por texto
    if (filters.searchTerm && filters.searchTerm.trim()) {
      const searchPattern = `%${filters.searchTerm.trim()}%`

      // Query para obtener jugadores con búsqueda
      const { data: players, error: playersError } = await supabaseAdmin.rpc(
        "search_players_admin",
        {
          search_pattern: searchPattern,
          limit_count: pageSize,
          offset_count: offset
        }
      )

      if (playersError) {
        // Si la función RPC no existe, usar query builder como fallback
        console.warn("[Admin] RPC function not found, using fallback query")

        const { data: playersData, error: fallbackError } = await supabaseAdmin
          .from("players")
          .select(`
            id,
            first_name,
            last_name,
            dni,
            phone,
            score,
            category_name,
            gender,
            status,
            created_at,
            user_id,
            users!players_user_id_fkey(email)
          `)
          .or(
            `first_name.ilike.%${filters.searchTerm}%,last_name.ilike.%${filters.searchTerm}%,dni.ilike.%${filters.searchTerm}%`
          )
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1)

        if (fallbackError) throw fallbackError

        // Count total con búsqueda
        const { count, error: countError } = await supabaseAdmin
          .from("players")
          .select("*", { count: "exact", head: true })
          .or(
            `first_name.ilike.%${filters.searchTerm}%,last_name.ilike.%${filters.searchTerm}%,dni.ilike.%${filters.searchTerm}%`
          )

        if (countError) throw countError

        return {
          data: normalizePlayerJoinData(playersData),
          totalCount: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize),
          currentPage: page,
          error: null
        }
      }

      // Count total con búsqueda usando RPC
      const { data: countData, error: countError } = await supabaseAdmin.rpc(
        "count_players_admin",
        {
          search_pattern: searchPattern
        }
      )

      if (countError) {
        // Fallback count
        const { count } = await supabaseAdmin
          .from("players")
          .select("*", { count: "exact", head: true })
          .or(
            `first_name.ilike.%${filters.searchTerm}%,last_name.ilike.%${filters.searchTerm}%,dni.ilike.%${filters.searchTerm}%`
          )

        return {
          data: normalizePlayerJoinData(players),
          totalCount: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize),
          currentPage: page,
          error: null
        }
      }

      const totalCount = countData || 0

      return {
        data: normalizePlayerJoinData(players),
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        currentPage: page,
        error: null
      }
    }

    // Sin término de búsqueda, traer todos ordenados por created_at DESC
    const { data: players, error: playersError } = await supabaseAdmin
      .from("players")
      .select(`
        id,
        first_name,
        last_name,
        dni,
        phone,
        score,
        category_name,
        gender,
        status,
        created_at,
        user_id,
        users!players_user_id_fkey(email)
      `)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (playersError) throw playersError

    // Count total sin búsqueda
    const { count, error: countError } = await supabaseAdmin
      .from("players")
      .select("*", { count: "exact", head: true })

    if (countError) throw countError

    return {
      data: normalizePlayerJoinData(players),
      totalCount: count || 0,
      totalPages: Math.ceil((count || 0) / pageSize),
      currentPage: page,
      error: null
    }
  } catch (error: any) {
    console.error("[Admin] Error searching players:", error)
    return {
      data: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: page,
      error: error.message
    }
  }
}

/**
 * Filtros para exportación de jugadores
 */
export interface ExportPlayersFilters {
  searchTerm?: string
  onlyWithoutEmail?: boolean
  onlyWithoutDNI?: boolean
  onlyWithoutPhone?: boolean
  onlyTestPlayers?: boolean
  categories?: string[]
  status?: string
  gender?: string
  clubId?: string
  minScore?: number
  maxScore?: number
  dateFrom?: string
  dateTo?: string
}

/**
 * Exportar jugadores con filtros avanzados
 * Retorna TODOS los jugadores que cumplen los filtros (sin paginación)
 */
export async function exportPlayersAction(filters: ExportPlayersFilters = {}) {
  try {
    await verifyAdmin()

    console.log("[Admin Export] Starting player export with filters:", filters)

    // Construir query base
    let query = supabaseAdmin.from("players").select(`
      id,
      first_name,
      last_name,
      dni,
      phone,
      score,
      category_name,
      gender,
      status,
      date_of_birth,
      address,
      instagram_handle,
      preferred_hand,
      preferred_side,
      racket,
      created_at,
      profile_image_url,
      es_prueba,
      user_id,
      club_id,
      users!players_user_id_fkey(email),
      clubes(name)
    `)

    // Aplicar filtro de búsqueda por texto
    if (filters.searchTerm && filters.searchTerm.trim()) {
      const searchPattern = `%${filters.searchTerm.trim()}%`
      query = query.or(
        `first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},dni.ilike.${searchPattern}`
      )
    }

    // Filtro: solo sin email
    if (filters.onlyWithoutEmail) {
      query = query.is("user_id", null)
    }

    // Filtro: solo sin DNI
    if (filters.onlyWithoutDNI) {
      query = query.is("dni", null)
    }

    // Filtro: solo sin teléfono
    if (filters.onlyWithoutPhone) {
      query = query.is("phone", null)
    }

    // Filtro: solo jugadores de prueba
    if (filters.onlyTestPlayers) {
      query = query.eq("es_prueba", true)
    }

    // Filtro: categorías
    if (filters.categories && filters.categories.length > 0) {
      query = query.in("category_name", filters.categories)
    }

    // Filtro: estado
    if (filters.status && filters.status !== "all") {
      query = query.eq("status", filters.status)
    }

    // Filtro: género
    if (filters.gender && filters.gender !== "all") {
      query = query.eq("gender", filters.gender)
    }

    // Filtro: club
    if (filters.clubId && filters.clubId !== "all") {
      query = query.eq("club_id", filters.clubId)
    }

    // Filtro: rango de puntaje
    if (filters.minScore !== undefined && filters.minScore !== null) {
      query = query.gte("score", filters.minScore)
    }
    if (filters.maxScore !== undefined && filters.maxScore !== null) {
      query = query.lte("score", filters.maxScore)
    }

    // Filtro: rango de fechas
    if (filters.dateFrom) {
      query = query.gte("created_at", filters.dateFrom)
    }
    if (filters.dateTo) {
      // Agregar 1 día para incluir todo el día seleccionado
      const endDate = new Date(filters.dateTo)
      endDate.setDate(endDate.getDate() + 1)
      query = query.lt("created_at", endDate.toISOString())
    }

    // Ordenar por fecha de creación descendente
    query = query.order("created_at", { ascending: false })

    // Ejecutar query
    const { data: players, error } = await query

    if (error) {
      console.error("[Admin Export] Error fetching players:", error)
      throw error
    }

    console.log("[Admin Export] Found", players?.length || 0, "players to export")

    // Mapear datos al formato de exportación
    const exportData = (players || []).map((player) => {
      const user = Array.isArray(player.users) ? player.users[0] : player.users
      const club = Array.isArray(player.clubes) ? player.clubes[0] : player.clubes

      return {
        id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        dni: player.dni,
        email: user?.email || null,
        phone: player.phone,
        score: player.score,
        category_name: player.category_name,
        gender: player.gender,
        status: player.status,
        date_of_birth: player.date_of_birth,
        address: player.address,
        instagram_handle: player.instagram_handle,
        preferred_hand: player.preferred_hand,
        preferred_side: player.preferred_side,
        racket: player.racket,
        club_name: club?.name || null,
        es_prueba: player.es_prueba || false,
        created_at: player.created_at,
        profile_image_url: player.profile_image_url
      }
    })

    return {
      success: true,
      data: exportData,
      count: exportData.length,
      error: null
    }
  } catch (error: any) {
    console.error("[Admin Export] Error exporting players:", error)
    return {
      success: false,
      data: [],
      count: 0,
      error: error.message
    }
  }
}

/**
 * Buscar jugadores con TODOS los filtros avanzados + paginación
 * Esta función reemplaza a searchPlayers cuando se usan filtros avanzados
 */
export async function searchPlayersAdvanced(
  filters: ExportPlayersFilters = {},
  page: number = 1,
  pageSize: number = 50
) {
  try {
    await verifyAdmin()

    const offset = (page - 1) * pageSize

    // Construir query base con count
    let query = supabaseAdmin.from("players").select(
      `
        id,
        first_name,
        last_name,
        dni,
        phone,
        score,
        category_name,
        gender,
        status,
        created_at,
        user_id,
        users!players_user_id_fkey(email)
      `,
      { count: "exact" }
    )

    // Aplicar filtro de búsqueda por texto
    if (filters.searchTerm && filters.searchTerm.trim()) {
      const searchPattern = `%${filters.searchTerm.trim()}%`
      query = query.or(
        `first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},dni.ilike.${searchPattern}`
      )
    }

    // Filtro: solo sin email
    if (filters.onlyWithoutEmail) {
      query = query.is("user_id", null)
    }

    // Filtro: solo sin DNI
    if (filters.onlyWithoutDNI) {
      query = query.is("dni", null)
    }

    // Filtro: solo sin teléfono
    if (filters.onlyWithoutPhone) {
      query = query.is("phone", null)
    }

    // Filtro: solo jugadores de prueba
    if (filters.onlyTestPlayers) {
      query = query.eq("es_prueba", true)
    }

    // Filtro: categorías
    if (filters.categories && filters.categories.length > 0) {
      query = query.in("category_name", filters.categories)
    }

    // Filtro: estado
    if (filters.status && filters.status !== "all") {
      query = query.eq("status", filters.status)
    }

    // Filtro: género
    if (filters.gender && filters.gender !== "all") {
      query = query.eq("gender", filters.gender)
    }

    // Filtro: club
    if (filters.clubId && filters.clubId !== "all") {
      query = query.eq("club_id", filters.clubId)
    }

    // Filtro: rango de puntaje
    if (filters.minScore !== undefined && filters.minScore !== null) {
      query = query.gte("score", filters.minScore)
    }
    if (filters.maxScore !== undefined && filters.maxScore !== null) {
      query = query.lte("score", filters.maxScore)
    }

    // Filtro: rango de fechas
    if (filters.dateFrom) {
      query = query.gte("created_at", filters.dateFrom)
    }
    if (filters.dateTo) {
      const endDate = new Date(filters.dateTo)
      endDate.setDate(endDate.getDate() + 1)
      query = query.lt("created_at", endDate.toISOString())
    }

    // Ordenar y paginar
    query = query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1)

    // Ejecutar query
    const { data: players, error, count } = await query

    if (error) {
      console.error("[Admin] Error in searchPlayersAdvanced:", error)
      throw error
    }

    return {
      data: normalizePlayerJoinData(players),
      totalCount: count || 0,
      totalPages: Math.ceil((count || 0) / pageSize),
      currentPage: page,
      error: null
    }
  } catch (error: any) {
    console.error("[Admin] Error searching players advanced:", error)
    return {
      data: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: page,
      error: error.message
    }
  }
}
