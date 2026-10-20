import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getTenantBranding } from "@/config/tenant"
import { TPE_TERMS_VERSION } from "@/lib/tpe/terms"
import { SOLO_PLAYER_CONTACT_CONSENT_VERSION, SOLO_PLAYER_TOURNAMENT_TERMS_VERSION } from "@/types/solo-players"
import { soloRequestSchema, soloResolveSchema } from "@/lib/solo-players/validation"
import { getSoloProfile } from "@/lib/solo-players/server"
import { loadSoloRequests, SOLO_REQUEST_COLUMNS } from "@/lib/solo-players/requests"
import { soloJson, soloAvailable, soloUnavailable, soloSameOrigin, soloContext, soloFailure, scheduleSoloDelivery } from "@/lib/solo-players/http"

export const dynamic = "force-dynamic"
const paging = z.coerce.number().int().min(0).max(100_000).default(0)

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  if (!soloAvailable()) return soloUnavailable()
  const offset = paging.safeParse(request.nextUrl.searchParams.get("offset") || 0)
  if (!offset.success) return soloJson({ error: "Página inválida." }, 400)
  const requestId = request.nextUrl.searchParams.get("requestId")
  if (requestId && !z.string().uuid().safeParse(requestId).success) return soloJson({ error: "Solicitud inválida." }, 400)
  try {
    const { client, user } = await soloContext()
    if (!user) return soloJson({ error: "Iniciá sesión para ver tus solicitudes." }, 401)
    return soloJson(await loadSoloRequests(client, user.id, request.nextUrl.searchParams.get("history") === "true", offset.data, requestId || undefined))
  } catch (error) { return soloFailure(error) }
}

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  if (!soloAvailable()) return soloUnavailable()
  if (!soloSameOrigin(request)) return soloJson({ error: "Origen inválido." }, 403)
  try {
    const { client, user } = await soloContext()
    if (!user) return soloJson({ error: "Iniciá sesión para enviar una solicitud." }, 401)
    const input = soloRequestSchema.safeParse(await request.json().catch(() => null))
    if (!input.success) return soloJson({ error: input.error.issues[0]?.message || "Datos inválidos." }, 400)
    const profile = await getSoloProfile(client, user.id)
    if (!profile) return soloJson({ error: "Completá tu perfil de jugador." }, 403)
    const post = await client.from("solo_player_directory").select("id,tournament_id").eq("id", input.data.postId).maybeSingle<{ id: string; tournament_id: string | null }>()
    if (post.error) throw post.error
    if (!post.data) return soloJson({ error: "Esta publicación ya no está disponible." }, 409)
    if (post.data.tournament_id && !input.data.termsAccepted) return soloJson({ error: "Aceptá las condiciones del torneo." }, 400)
    const hasPreferences = !!input.data.side && !!input.data.hand
    const { data, error } = await client.rpc(hasPreferences ? "send_solo_player_request_with_preferences" : "send_solo_player_request", {
      p_post_id: input.data.postId, p_sender_player_id: profile.id, p_phone: input.data.phone,
      p_contact_consent_version: SOLO_PLAYER_CONTACT_CONSENT_VERSION,
      p_tournament_terms_version: post.data.tournament_id ? getTenantBranding().key === "padel-elite" ? TPE_TERMS_VERSION : SOLO_PLAYER_TOURNAMENT_TERMS_VERSION : null,
      ...(hasPreferences ? { p_preferred_side: input.data.side, p_preferred_hand: input.data.hand } : {}),
    })
    if (error) throw error
    scheduleSoloDelivery()
    return soloJson({ request: { id: data.id, status: data.status } }, 201)
  } catch (error) { return soloFailure(error) }
}

export const PATCH = async (request: NextRequest): Promise<NextResponse> => {
  if (!soloAvailable()) return soloUnavailable()
  if (!soloSameOrigin(request)) return soloJson({ error: "Origen inválido." }, 403)
  try {
    const { client, user } = await soloContext()
    if (!user) return soloJson({ error: "Iniciá sesión para responder." }, 401)
    const input = soloResolveSchema.safeParse(await request.json().catch(() => null))
    if (!input.success) return soloJson({ error: "Solicitud o acción inválidas." }, 400)
    const selected = await client.from("solo_player_request_inbox").select(SOLO_REQUEST_COLUMNS).eq("id", input.data.requestId).maybeSingle()
    if (selected.error) throw selected.error
    if (!selected.data) return soloJson({ error: "Sin permisos sobre la solicitud." }, 403)
    const current = selected.data
    if (input.data.action === "ACCEPT" && current.tournament_id) {
      if (current.recipient_user_id !== user.id) return soloJson({ error: "Sólo el destinatario puede aceptar." }, 403)
      if (!input.data.termsAccepted) return soloJson({ error: "Aceptá las condiciones del torneo." }, 400)
      const { getRegistrationService } = await import("@/lib/services/registration")
      const result = await getRegistrationService().acceptTournamentRequest(input.data.requestId, { termsAccepted: true, paymentMethod: input.data.paymentMethod })
      if (!result.success) return soloJson({ error: result.error || "No se pudo confirmar la pareja. Actualizá la solicitud." }, 409)
      scheduleSoloDelivery()
      return soloJson({ request: { id: current.id, status: "ACCEPTED" }, inscriptionId: result.inscriptionId,
        tournamentId: current.tournament_id, paymentRequired: result.paymentRequired === true, message: result.message })
    }
    const { data, error } = await client.rpc("resolve_solo_player_request", { p_request_id: input.data.requestId, p_action: input.data.action })
    if (error) throw error
    scheduleSoloDelivery()
    return soloJson({ request: { id: data.id, status: data.status } })
  } catch (error) { return soloFailure(error) }
}
