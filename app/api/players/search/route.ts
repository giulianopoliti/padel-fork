import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/utils/supabase/server"
import { checkTournamentAccess } from "@/utils/tournament-permissions"
import {
  PlayerSearchRecord,
  searchPlayersByOrganization,
  searchPlayersGlobally,
  searchPlayersForTournament,
} from "@/lib/services/player-search-service"

const searchRequestSchema = z.object({
  scope: z.enum(["organization", "tournament"]),
  searchTerm: z.string().trim().max(120).optional().default(""),
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
  try {
    const parsedBody = searchRequestSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, error: "Parámetros de búsqueda inválidos" },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 })
    }

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 403 })
    }

    const params = parsedBody.data

    if (params.scope === "organization") {
      if (!params.organizationId) {
        return NextResponse.json({ success: false, error: "organizationId es requerido" }, { status: 400 })
      }

      const { data: membership } = await supabase
        .from("organization_members")
        .select("id")
        .eq("organizacion_id", params.organizationId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle()

      if (!membership || userData.role !== "ORGANIZADOR") {
        return NextResponse.json({ success: false, error: "Sin permisos para esta organización" }, { status: 403 })
      }

      const searchParams = {
        searchTerm: params.searchTerm,
        page: params.page,
        pageSize: params.pageSize,
        categoryFilter: params.categoryFilter,
      }
      const result = params.searchTerm.trim()
        ? await searchPlayersGlobally(searchParams)
        : await searchPlayersByOrganization({
          ...searchParams,
          organizationId: params.organizationId,
        })

      return NextResponse.json({ success: true, ...result })
    }

    if (!params.tournamentId) {
      return NextResponse.json({ success: false, error: "tournamentId es requerido" }, { status: 400 })
    }

    const access = await checkTournamentAccess(user.id, params.tournamentId)
    const canManageInscriptions = access.permissions.includes("manage_inscriptions")
    const isPlayerSearch = userData.role === "PLAYER"

    if (!canManageInscriptions && !isPlayerSearch && userData.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Sin permisos para buscar jugadores" }, { status: 403 })
    }

    if (isPlayerSearch && /^\s*\d/.test(params.searchTerm)) {
      return NextResponse.json(
        { success: false, error: "Buscá a tu compañero por nombre o apellido" },
        { status: 400 },
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

    return NextResponse.json({
      success: true,
      ...result,
      players: isPlayerSearch
        ? result.players.map(redactPrivatePlayerFields)
        : result.players,
    })
  } catch (error) {
    console.error("[players/search] Unexpected error:", error)
    return NextResponse.json(
      { success: false, error: "No se pudieron buscar jugadores" },
      { status: 500 },
    )
  }
}
