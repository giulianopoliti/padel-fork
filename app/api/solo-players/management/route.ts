import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { soloAvailable, soloUnavailable, soloContext, soloJson, soloFailure, soloSameOrigin, scheduleSoloDelivery } from "@/lib/solo-players/http"
import { isSoloManager, loadSoloManagement } from "@/lib/solo-players/management"
import { checkTournamentPermissions } from "@/utils/tournament-permissions"

export const dynamic = "force-dynamic"
const paging = z.coerce.number().int().min(0).max(100_000)
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  if (!soloAvailable()) return soloUnavailable()
  const offset = paging.safeParse(request.nextUrl.searchParams.get("offset") || 0), pairOffset = paging.safeParse(request.nextUrl.searchParams.get("pairOffset") || 0)
  if (!offset.success || !pairOffset.success) return soloJson({ error: "Página inválida." }, 400)
  try {
    const { client, user } = await soloContext()
    if (!user) return soloJson({ error: "Iniciá sesión." }, 401)
    if (!await isSoloManager(client, user.id)) return soloJson({ error: "Acceso exclusivo para gestores." }, 403)
    return soloJson(await loadSoloManagement(client, user.id, offset.data, request.nextUrl.searchParams.get("history") === "true", pairOffset.data))
  } catch (error) { return soloFailure(error) }
}
export const POST = async (request: NextRequest): Promise<NextResponse> => {
  if (!soloAvailable()) return soloUnavailable()
  if (!soloSameOrigin(request)) return soloJson({ error: "Origen inválido." }, 403)
  try {
    const { client, user } = await soloContext()
    if (!user) return soloJson({ error: "Iniciá sesión." }, 401)
    if (!await isSoloManager(client, user.id)) return soloJson({ error: "Acceso exclusivo para gestores." }, 403)
    const input = z.object({ tournamentId: z.string().uuid(), player1Id: z.string().uuid(), player2Id: z.string().uuid(), paymentMethod: z.enum(["CASH", "TRANSFER"]).optional() })
      .refine(value => value.player1Id !== value.player2Id, "Elegí dos jugadores distintos.").safeParse(await request.json().catch(() => null))
    if (!input.success) return soloJson({ error: input.error.issues[0]?.message || "Pareja inválida." }, 400)
    if (!(await checkTournamentPermissions(user.id, input.data.tournamentId)).hasPermission) return soloJson({ error: "No tenés permisos para inscribir en este torneo." }, 403)
    const { getRegistrationService } = await import("@/lib/services/registration")
    const result = await getRegistrationService().convertIndividualToCouple({ ...input.data, isOrganizerRegistration: true })
    if (!result.success) return soloJson({ error: result.error || "No se pudo formar la pareja." }, 409)
    if (result.alreadyRegistered) return soloJson({ code: "PAIR_ALREADY_REGISTERED", error: "Esta pareja ya está inscripta en este torneo.", inscriptionId: result.inscriptionId }, 409)
    scheduleSoloDelivery()
    return soloJson({ inscriptionId: result.inscriptionId, message: result.message || "Pareja guardada. Revisá los requisitos de inscripción." })
  } catch (error) { return soloFailure(error) }
}
