import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { soloAvailable, soloJson } from "@/lib/solo-players/http"
import { processSoloPlayerNotifications } from "@/lib/solo-players/email-worker"

export const dynamic = "force-dynamic"
export const maxDuration = 120
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const secret = process.env.CRON_SECRET
  const actual = Buffer.from(request.headers.get("authorization") || "")
  const expected = Buffer.from(`Bearer ${secret}`)
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return soloJson({ error: "No autorizado." }, 401)
  if (!soloAvailable()) return soloJson({ skipped: true, reason: "Feature not released" })
  try { return soloJson(await processSoloPlayerNotifications()) }
  catch { console.error("[solo-players] Scheduled sweep failed"); return soloJson({ error: "La tarea no se completó; los avisos permanecen guardados." }, 503) }
}
