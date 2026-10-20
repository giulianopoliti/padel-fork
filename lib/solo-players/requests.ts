import "server-only"
import { createClient } from "@/utils/supabase/server"
import { projectSoloRow } from "./server"
import type { SoloRequestEntry, SoloRequestsData } from "@/types/solo-player-ui"

export const SOLO_REQUEST_COLUMNS = "id,post_id,tournament_id,inscription_id,sender_user_id,recipient_user_id,sender_player_id,recipient_player_id,effective_status,is_actionable,expires_at,created_at,sender_preferred_side,sender_preferred_hand"
type Client = Awaited<ReturnType<typeof createClient>>
type RequestRow = Pick<SoloRequestEntry, "id" | "post_id" | "tournament_id" | "inscription_id" | "sender_user_id" | "recipient_user_id" | "sender_player_id" | "recipient_player_id" | "effective_status" | "is_actionable" | "expires_at" | "created_at"> & { sender_preferred_side: string | null; sender_preferred_hand: string | null }

export const loadSoloRequests = async (client: Client, userId: string, history: boolean, offset: number, requestId?: string, requestIds?: string[], tournamentFilterIds?: string[]): Promise<SoloRequestsData> => {
  let query = client.from("solo_player_request_inbox").select(SOLO_REQUEST_COLUMNS)
  if (tournamentFilterIds) query = query.in("tournament_id", tournamentFilterIds)
  query = requestId ? query.eq("id", requestId) : requestIds ? query.in("id", requestIds) : history ? query.neq("effective_status", "PENDING") : query.eq("effective_status", "PENDING")
  const rows = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 50).returns<RequestRow[]>()
  if (rows.error) throw rows.error
  const requests = (rows.data || []).slice(0, 50)
  const playerIds = [...new Set(requests.flatMap(r => [r.sender_player_id, r.recipient_player_id]))]
  const tournamentIds = [...new Set(requests.flatMap(r => r.tournament_id ? [r.tournament_id] : []))]
  const [players, tournaments, posts] = await Promise.all([
    playerIds.length ? client.from("players").select("id,first_name,last_name,preferred_side,preferred_hand,category_name").in("id", playerIds).returns<{ id: string; first_name: string | null; last_name: string | null; preferred_side: string | null; preferred_hand: string | null; category_name: string | null }[]>() : { data: [], error: null },
    tournamentIds.length ? client.from("tournaments").select("id,name,type,enable_transfer_proof,allow_cash_payment").in("id", tournamentIds).returns<{ id: string; name: string; type: string; enable_transfer_proof: boolean; allow_cash_payment: boolean }[]>() : { data: [], error: null },
    requests.length ? client.from("solo_player_posts").select("id,category_name,preferred_side,preferred_hand").in("id", [...new Set(requests.map(r => r.post_id))]).returns<{ id: string; category_name: string; preferred_side: string; preferred_hand: string }[]>() : { data: [], error: null },
  ])
  if (players.error) throw players.error
  if (tournaments.error) throw tournaments.error
  if (posts.error) throw posts.error
  const names = new Map((players.data || []).map(p => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || "Jugador"]))
  const events = new Map((tournaments.data || []).map(t => [t.id, t]))
  const profiles = new Map((players.data || []).map(p => [p.id, p]))
  const publications = new Map((posts.data || []).map(p => [p.id, p]))
  return { userId, hasMore: (rows.data?.length || 0) > 50, requests: requests.map(row => {
    const tournament = events.get(row.tournament_id || "")
    const post = publications.get(row.post_id), sender = profiles.get(row.sender_player_id), recipient = profiles.get(row.recipient_player_id)
    return { ...projectSoloRow(row, SOLO_REQUEST_COLUMNS), senderName: names.get(row.sender_player_id) || "Jugador", recipientName: names.get(row.recipient_player_id) || "Jugador",
      tournamentName: tournament?.name || null, tournamentType: tournament?.type || null, category: post?.category_name || recipient?.category_name || null,
      senderSide: row.sender_preferred_side || sender?.preferred_side || null, senderHand: row.sender_preferred_hand || sender?.preferred_hand || null,
      recipientSide: post?.preferred_side || recipient?.preferred_side || null, recipientHand: post?.preferred_hand || recipient?.preferred_hand || null,
      enableTransferProof: tournament?.enable_transfer_proof === true, allowCash: tournament?.allow_cash_payment === true }
  }) }
}
