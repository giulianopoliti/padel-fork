import "server-only"

import { createClient } from "@/utils/supabase/server"
import type { SoloPlayerPost } from "@/types/solo-players"
import type { SoloSearchNotificationData } from "@/types/solo-player-ui"

type Client = Pick<Awaited<ReturnType<typeof createClient>>, "from">
type Post = Pick<SoloPlayerPost, "id" | "tournament_id" | "player_id" | "category_name" | "preferred_side" | "preferred_hand" | "status" | "expires_at"> & { organization_id: string | null }

/** The caller supplies its RLS client (or the trusted email worker client). No contact data. */
export const loadSearchNotificationContexts = async (client: Client, postIds: string[]): Promise<Map<string, SoloSearchNotificationData>> => {
  const contexts = new Map<string, SoloSearchNotificationData>()
  if (!postIds.length) return contexts
  const posts = await client.from("solo_player_posts").select("id,tournament_id,organization_id,player_id,category_name,preferred_side,preferred_hand,status,expires_at").in("id", [...new Set(postIds)]).returns<Post[]>()
  if (posts.error) throw posts.error
  const rows = posts.data || []
  if (!rows.length) return contexts
  const [players, tournaments, organizations] = await Promise.all([
    client.from("players").select("id,first_name,last_name").in("id", [...new Set(rows.map(post => post.player_id))]).returns<{ id: string; first_name: string | null; last_name: string | null }[]>(),
    client.from("tournaments").select("id,name").in("id", [...new Set(rows.flatMap(post => post.tournament_id ? [post.tournament_id] : []))]).returns<{ id: string; name: string }[]>(),
    client.from("organizaciones").select("id,name").in("id", [...new Set(rows.flatMap(post => post.organization_id ? [post.organization_id] : []))]).returns<{ id: string; name: string }[]>(),
  ])
  if (players.error) throw players.error
  if (tournaments.error) throw tournaments.error
  if (organizations.error) throw organizations.error
  for (const post of rows) {
    const player = players.data?.find(row => row.id === post.player_id)
    const tournament = tournaments.data?.find(row => row.id === post.tournament_id)
    if (!player || (post.tournament_id && !tournament)) continue
    contexts.set(post.id, { postId: post.id, tournamentId: post.tournament_id, tournamentName: tournament?.name || null, organizationName: organizations.data?.find(row => row.id === post.organization_id)?.name || null,
      playerId: post.player_id, playerName: [player.first_name, player.last_name].filter(Boolean).join(" ") || "Jugador",
      category: post.category_name, side: post.preferred_side, hand: post.preferred_hand, status: post.status, expiresAt: post.expires_at })
  }
  return contexts
}
