import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { isSoloPlayersEnabled } from "@/config/solo-players"
import { getTenantBranding } from "@/config/tenant"
import { TPE_TERMS_VERSION } from "@/lib/tpe/terms"
import { SOLO_PLAYER_CONTACT_CONSENT_VERSION, SOLO_PLAYER_TOURNAMENT_TERMS_VERSION, type SaveSoloPlayerPostArgs, type SoloPlayerPost } from "@/types/solo-players"
import { soloPostSchema, soloStatusSchema } from "@/lib/solo-players/validation"
import { getSoloProfile, loadSoloDirectory, sanitizeSavedPost } from "@/lib/solo-players/server"
import { getTenantOrganization } from "@/lib/services/tenant-organization.service"
import { scheduleSoloDelivery } from "@/lib/solo-players/http"

export const dynamic = "force-dynamic"
const json = (body: unknown, status = 200): NextResponse => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
const unavailable = (): NextResponse => json({ error: "Esta función todavía no está disponible." }, 404)
const isAvailable = (): boolean => isSoloPlayersEnabled()

const getContext = async () => {
  const client = await createClient()
  const { data: { user }, error } = await client.auth.getUser()
  return { client, user: error ? null : user }
}

const failure = (error: unknown): NextResponse => {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : ""
  if (code === "23505") {
    const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : ""
    if (message === "El jugador ya tiene pareja en este torneo") return json({ error: "Ya tenés una inscripción en pareja en este torneo. Podés publicar una búsqueda general o para otro torneo." }, 409)
    if (message.includes('"solo_player_posts_open_general_key"')) return json({ error: "Ya tenés una búsqueda general activa o pausada. Podés editarla desde Mis publicaciones." }, 409)
    if (message.includes('"solo_player_posts_open_tournament_key"')) return json({ error: "Ya tenés una búsqueda activa o pausada para este torneo. Podés editarla desde Mis publicaciones." }, 409)
    return json({ error: "La publicación entra en conflicto con un registro existente. Actualizá el listado y revisá Mis publicaciones." }, 409)
  }
  if (code === "42501") return json({ error: "No tenés permiso para esta operación." }, 403)
  if (["22023", "P0001"].includes(code)) return json({ error: "La publicación o el torneo ya no admite esta operación. Actualizá el listado y revisá los datos." }, 409)
  console.error("[solo-players] Operation failed", { code })
  return json({ error: "No pudimos completar la operación. Volvé a intentar." }, 500)
}

export const GET = async (): Promise<NextResponse> => {
  if (!isAvailable()) return unavailable()
  try {
    const { client, user } = await getContext()
    if (!user) return json({ error: "Iniciá sesión para ver jugadores sueltos." }, 401)
    return json(await loadSoloDirectory(client, user.id))
  } catch (error) { return failure(error) }
}

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  if (!isAvailable()) return unavailable()
  if (request.headers.get("origin") !== request.nextUrl.origin) return json({ error: "Origen inválido." }, 403)
  try {
    const { client, user } = await getContext()
    if (!user) return json({ error: "Iniciá sesión para publicar." }, 401)
    const parsed = soloPostSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || "Datos inválidos." }, 400)
    const profile = await getSoloProfile(client, user.id)
    if (!profile) return json({ error: "Completá tu perfil de jugador para publicar." }, 403)
    const input = parsed.data
    const args: SaveSoloPlayerPostArgs = {
      p_player_id: profile.id, p_category_name: input.category, p_preferred_side: input.side, p_preferred_hand: input.hand,
      p_phone: input.phone, p_public_phone: input.publicPhone, p_contact_consent_version: SOLO_PLAYER_CONTACT_CONSENT_VERSION,
      p_post_id: input.postId || null,
      ...(input.tournamentId ? { p_tournament_id: input.tournamentId, p_duration: null,
        p_tournament_terms_version: getTenantBranding().key === "padel-elite" ? TPE_TERMS_VERSION : SOLO_PLAYER_TOURNAMENT_TERMS_VERSION }
        : { p_tournament_id: null, p_duration: input.duration, p_tournament_terms_version: null }),
    }
    const organization = await getTenantOrganization()
    if (!organization) return json({ error: "No pudimos identificar el circuito. Volvé a intentar." }, 503)
    const { data, error } = await client.rpc("save_solo_player_post_in_organization", { ...args, p_organization_id: organization.id })
    if (error) throw error
    if (!input.postId) scheduleSoloDelivery()
    return json({ post: sanitizeSavedPost(data as SoloPlayerPost) })
  } catch (error) { return failure(error) }
}

export const PATCH = async (request: NextRequest): Promise<NextResponse> => {
  if (!isAvailable()) return unavailable()
  if (request.headers.get("origin") !== request.nextUrl.origin) return json({ error: "Origen inválido." }, 403)
  try {
    const { client, user } = await getContext()
    if (!user) return json({ error: "Iniciá sesión para gestionar tu publicación." }, 401)
    const parsed = soloStatusSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return json({ error: "Estado o publicación inválidos." }, 400)
    const { data, error } = await client.rpc("set_solo_player_post_status", { p_post_id: parsed.data.postId, p_status: parsed.data.status })
    if (error) throw error
    if (parsed.data.status === "WITHDRAWN") scheduleSoloDelivery()
    return json({ post: sanitizeSavedPost(data as SoloPlayerPost) })
  } catch (error) { return failure(error) }
}
