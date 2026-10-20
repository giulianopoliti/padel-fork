import "server-only"
import { NextRequest, NextResponse, after } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { isSoloPlayersEnabled } from "@/config/solo-players"

export const soloJson = (body: unknown, status = 200): NextResponse => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
export const soloAvailable = (): boolean => isSoloPlayersEnabled()
export const soloUnavailable = (): NextResponse => soloJson({ error: "Esta función todavía no está disponible." }, 404)
export const soloSameOrigin = (request: NextRequest): boolean => request.headers.get("origin") === request.nextUrl.origin
export const soloContext = async () => {
  const client = await createClient()
  const { data: { user }, error } = await client.auth.getUser()
  return { client, user: error ? null : user }
}
export const soloFailure = (error: unknown): NextResponse => {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : ""
  if (code === "42501") return soloJson({ error: "No tenés permiso para esta operación." }, 403)
  if (code === "23505") return soloJson({ error: "Ya existe una solicitud pendiente entre ustedes o alguno ya tiene pareja en el torneo." }, 409)
  if (["22023", "P0001"].includes(code)) return soloJson({ error: "La solicitud o publicación ya no admite esta operación. Actualizá la bandeja." }, 409)
  console.error("[solo-players] Request failed", { code })
  return soloJson({ error: "No pudimos completar la operación. Volvé a intentar." }, 500)
}

/** Committed requests/inbox events survive delivery failures. Cron retries them. */
export const scheduleSoloDelivery = (): void => {
  try {
    after(async () => {
      try {
        const { processSoloPlayerNotifications } = await import("./email-worker")
        await processSoloPlayerNotifications()
      } catch { console.error("[solo-players] Deferred delivery failed; events remain queued") }
    })
  } catch { console.error("[solo-players] Deferred delivery unavailable; events remain queued") }
}
