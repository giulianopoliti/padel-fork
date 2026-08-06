import { NextRequest } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { checkTournamentAccess } from "@/utils/tournament-permissions"

const normalizeNote = (value: unknown) =>
  typeof value === "string" ? value.trim().slice(0, 500) : ""

const normalizePlayerIds = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)))
}

const getSingleRelation = <T,>(relation: T | T[] | null | undefined): T | null => {
  if (!relation) return null
  return Array.isArray(relation) ? relation[0] ?? null : relation
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const tournamentId = resolvedParams.id
    const body = await request.json()
    const playerIds = normalizePlayerIds(body.playerIds)
    const note = normalizeNote(body.note)

    if (playerIds.length === 0) {
      return Response.json({ error: "Selecciona al menos un jugador" }, { status: 400 })
    }

    if (!note) {
      return Response.json({ error: "La nota es requerida" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: "No autenticado" }, { status: 401 })
    }

    const access = await checkTournamentAccess(user.id, tournamentId)
    if (access.accessLevel !== "FULL_MANAGEMENT") {
      return Response.json({ error: "No tienes permisos para marcar historial en este torneo" }, { status: 403 })
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id, club_id, organization_id")
      .eq("id", tournamentId)
      .single()

    if (tournamentError || !tournament) {
      return Response.json({ error: "Torneo no encontrado" }, { status: 404 })
    }

    const { data: inscriptions, error: inscriptionsError } = await supabase
      .from("inscriptions")
      .select(`
        player_id,
        couples:couple_id (
          player1_id,
          player2_id
        )
      `)
      .eq("tournament_id", tournamentId)

    if (inscriptionsError) {
      console.error("[player-history-marks] Error checking tournament players:", inscriptionsError)
      return Response.json({ error: "No se pudieron validar los jugadores del torneo" }, { status: 500 })
    }

    const tournamentPlayerIds = new Set<string>()
    for (const inscription of inscriptions || []) {
      if (inscription.player_id) {
        tournamentPlayerIds.add(inscription.player_id)
      }

      const couple = getSingleRelation(inscription.couples)
      if (couple?.player1_id) {
        tournamentPlayerIds.add(couple.player1_id)
      }
      if (couple?.player2_id) {
        tournamentPlayerIds.add(couple.player2_id)
      }
    }

    const invalidPlayerIds = playerIds.filter((playerId) => !tournamentPlayerIds.has(playerId))
    if (invalidPlayerIds.length > 0) {
      return Response.json(
        { error: "Solo se puede marcar historial de jugadores inscriptos en este torneo" },
        { status: 400 }
      )
    }

    const records = playerIds.map((playerId) => ({
      player_id: playerId,
      tournament_id: tournamentId,
      organization_id: tournament.organization_id ?? null,
      club_id: tournament.club_id ?? null,
      mark_type: "YELLOW",
      note,
      created_by: user.id,
    }))

    const { data, error } = await (supabase as any)
      .from("player_history_marks")
      .insert(records)
      .select("id")

    if (error) {
      console.error("[player-history-marks] Error creating marks:", error)
      return Response.json({ error: "No se pudo guardar la marca de historial" }, { status: 500 })
    }

    return Response.json({
      success: true,
      created: data?.length ?? records.length,
    })
  } catch (error) {
    console.error("[player-history-marks] Unexpected error:", error)
    return Response.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
