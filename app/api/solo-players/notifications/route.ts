import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { soloJson, soloAvailable, soloUnavailable, soloSameOrigin, soloContext, soloFailure } from "@/lib/solo-players/http"
import { projectSoloRow } from "@/lib/solo-players/server"
import { loadSoloRequests } from "@/lib/solo-players/requests"
import { soloNotificationContent, soloSearchNotificationContent } from "@/lib/solo-players/presentation"
import { loadSearchNotificationContexts } from "@/lib/solo-players/search-notifications"
import type { SoloNotificationEntry } from "@/types/solo-player-ui"

export const dynamic = "force-dynamic"
const COLUMNS = "id,request_id,post_id,event_type,read_at,created_at"
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  if (!soloAvailable()) return soloUnavailable()
  const offset = z.coerce.number().int().min(0).max(100_000).safeParse(request.nextUrl.searchParams.get("offset") || 0)
  if (!offset.success) return soloJson({ error: "Página inválida." }, 400)
  const notificationId = request.nextUrl.searchParams.get("notificationId")
  if (notificationId && !z.string().uuid().safeParse(notificationId).success) return soloJson({ error: "Aviso inválido." }, 400)
  try {
    const { client, user } = await soloContext()
    if (!user) return soloJson({ error: "Iniciá sesión para consultar tu bandeja." }, 401)
    let list = client.from("solo_player_notifications").select(COLUMNS).eq("recipient_user_id", user.id)
    if (notificationId) list = list.eq("id", notificationId)
    if (request.nextUrl.searchParams.get("unread") === "true") list = list.is("read_at", null)
    const [rows, count] = await Promise.all([
      list.order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset.data, offset.data + 20).returns<SoloNotificationEntry[]>(),
      client.from("solo_player_notifications").select("id", { count: "exact", head: true }).eq("recipient_user_id", user.id).is("read_at", null),
    ])
    if (rows.error) throw rows.error
    if (count.error) throw count.error
    const page = (rows.data || []).slice(0, 20)
    const requestIds = [...new Set(page.flatMap(row => row.request_id ? [row.request_id] : []))]
    const [requests, searches] = await Promise.all([
      requestIds.length ? loadSoloRequests(client, user.id, false, 0, undefined, requestIds) : Promise.resolve({ requests: [] }),
      loadSearchNotificationContexts(client, page.flatMap(row => row.post_id ? [row.post_id] : [])),
    ])
    const entries = new Map(requests.requests.map(r => [r.id, r]))
    return soloJson({ notifications: page.map(row => {
      if (row.event_type === "PLAYER_SEARCHING") {
        const search = searches.get(row.post_id || "") || null
        return { ...projectSoloRow(row, COLUMNS), ...soloSearchNotificationContent(search), search,
          tournamentId: search?.tournamentId || null, playerId: search?.playerId || null, playerName: search?.playerName || null }
      }
      const entry = entries.get(row.request_id || "")
      const otherIsSender = entry?.sender_user_id !== user.id
      const content = soloNotificationContent(row.event_type, entry, user.id)
      return { ...projectSoloRow(row, COLUMNS), title: content.title, description: content.description,
        tournamentId: entry?.tournament_id || null,
        playerId: entry ? otherIsSender ? entry.sender_player_id : entry.recipient_player_id : null,
        playerName: entry ? otherIsSender ? entry.senderName : entry.recipientName : null }
    }), unreadCount: count.count || 0, hasMore: (rows.data?.length || 0) > 20 })
  } catch (error) { return soloFailure(error) }
}
export const PATCH = async (request: NextRequest): Promise<NextResponse> => {
  if (!soloAvailable()) return soloUnavailable()
  if (!soloSameOrigin(request)) return soloJson({ error: "Origen inválido." }, 403)
  try {
    const { client, user } = await soloContext()
    if (!user) return soloJson({ error: "Iniciá sesión para marcar avisos." }, 401)
    const input = z.object({ notificationId: z.string().uuid() }).safeParse(await request.json().catch(() => null))
    if (!input.success) return soloJson({ error: "Aviso inválido." }, 400)
    const { data, error } = await client.rpc("mark_solo_player_notification_read", { p_notification_id: input.data.notificationId })
    if (error) throw error
    return soloJson({ notification: projectSoloRow(data, COLUMNS) })
  } catch (error) { return soloFailure(error) }
}
