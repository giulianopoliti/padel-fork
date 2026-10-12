import { createRegistrationTrace } from "@/lib/tournaments/registration-log"
import { z } from "zod"
import { createClient } from "@/utils/supabase/server"
import { checkTournamentAccess } from "@/utils/tournament-permissions"
import {
  PlayerSearchRecord,
  searchPlayersGlobally,
  searchPlayersForTournament,
} from "@/lib/services/player-search-service"

const searchRequestSchema = z.object({
  scope: z.enum(["organization", "tournament"]),
  searchTerm: z.string().trim().max(120).optional().default(""),
  searchField: z.enum(["identity", "email", "phone"]).optional().default("identity"),
  page: z.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(20),
  organizationId: z.string().uuid().optional(),
  tournamentId: z.string().uuid().optional(),
  categoryFilter: z.string().trim().max(80).optional().default("all"),
  excludePlayerIds: z.array(z.string().uuid()).max(20).optional().default([]),
})

const redactPrivatePlayerFields = (player: PlayerSearchRecord): PlayerSearchRecord => ({
  id: player.id,
  first_name: player.first_name,
  last_name: player.last_name,
  dni: null,
  phone: null,
  score: player.score,
  category_name: player.category_name,
  gender: player.gender,
  profile_image_url: player.profile_image_url,
  clubes: player.clubes,
})

export async function POST(request: Request) {
  const trace = createRegistrationTrace(request.headers, "search-players")
  try {
    const parsedBody = searchRequestSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return trace.reply(
        { success: false, error: "Parámetros de búsqueda inválidos" },
        400, "search_parameters_invalid",
      )
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return trace.reply({ success: false, error: "No autenticado" }, 401, "session_unavailable", authError)
    }

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single()

    if (userError || !userData) {
      return trace.reply({ success: false, error: "Usuario no encontrado" }, 403, "permission_denied")
    }

    const params = parsedBody.data
    trace.tournament(params.tournamentId)
    trace.step("search-players")

    if (params.scope === "organization") {
      if (!params.organizationId) {
        return trace.reply({ success: false, error: "organizationId es requerido" }, 400, "search_parameters_invalid")
      }

      const { data: membership } = await supabase
        .from("organization_members")
        .select("id")
        .eq("organizacion_id", params.organizationId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle()

      if (!membership || userData.role !== "ORGANIZADOR") {
        return trace.reply({ success: false, error: "Sin permisos para esta organización" }, 403, 'organization_permission_denied')
      }

      const searchParams = {
        searchTerm: params.searchTerm,
        searchField: params.searchField,
        page: params.page,
        pageSize: params.pageSize,
        categoryFilter: params.categoryFilter,
      }
      const result = await searchPlayersGlobally(searchParams)

      return trace.reply({ success: true, ...result }, 200, "complete")
    }

    if (!params.tournamentId) {
      return trace.reply({ success: false, error: "tournamentId es requerido" }, 400, "search_parameters_invalid")
    }

    const access = await checkTournamentAccess(user.id, params.tournamentId)
    const canManageInscriptions = access.permissions.includes("manage_inscriptions")
    const isPlayerSearch = userData.role === "PLAYER"

    if (!canManageInscriptions && !isPlayerSearch && userData.role !== "ADMIN") {
      return trace.reply({ success: false, error: "Sin permisos para buscar jugadores" }, 403, 'search_permission_denied')
    }

    if (isPlayerSearch && /^\s*\d/.test(params.searchTerm)) {
      return trace.reply(
        { success: false, error: "Buscá a tu compañero por nombre o apellido" },
        400, "search_parameters_invalid",
      )
    }

    const excludedIds = new Set(params.excludePlayerIds)
    if (isPlayerSearch) {
      const { data: currentPlayer } = await supabase
        .from("players")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle()

      if (currentPlayer?.id) excludedIds.add(currentPlayer.id)
    }

    const result = await searchPlayersForTournament({
      tournamentId: params.tournamentId,
      searchTerm: params.searchTerm,
      page: params.page,
      pageSize: params.pageSize,
      excludePlayerIds: Array.from(excludedIds),
    })

    return trace.reply({
      success: true,
      ...result,
      players: isPlayerSearch
        ? result.players.map(redactPrivatePlayerFields)
        : result.players,
    }, 200, "complete")
  } catch (error) {
    return trace.reply(
      { success: false, error: "No se pudieron buscar jugadores" },
      500, "search_failed", error,
    )
  }
}
