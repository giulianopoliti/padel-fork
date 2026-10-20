import "server-only"
import { createClient } from "@/utils/supabase/server"

export interface PlayerResult { tournament_id: string; couple1_id: string | null; couple2_id: string | null; winner_id: string | null; status: string; type: string | null }

/** Count actual completed contests. Byes, unplayed and test rows are not matches played. */
export const summarizePlayerResults = (coupleIds: string[], matches: PlayerResult[]) => {
  const own = new Set(coupleIds), tournaments = new Set<string>()
  let wins = 0, losses = 0
  for (const match of matches) {
    if (!["COMPLETED", "FINISHED"].includes(match.status) || !match.couple1_id || !match.couple2_id || !match.winner_id || match.type?.toUpperCase() === "BYE") continue
    const first = own.has(match.couple1_id), second = own.has(match.couple2_id)
    if (first === second || ![match.couple1_id, match.couple2_id].includes(match.winner_id)) continue
    tournaments.add(match.tournament_id)
    if (own.has(match.winner_id)) wins++; else losses++
  }
  return { tournaments: tournaments.size, wins, losses }
}

export const loadPublicPlayerProfile = async (playerId: string) => {
  const client = await createClient()
  const player = await client.from("players").select("id,first_name,last_name,preferred_side,preferred_hand").eq("id", playerId)
    .maybeSingle<{ id: string; first_name: string | null; last_name: string | null; preferred_side: string | null; preferred_hand: string | null }>()
  if (player.error) throw player.error
  if (!player.data) return null
  const couples = await client.from("couples").select("id").or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`).returns<{ id: string }[]>()
  if (couples.error) throw couples.error
  const ids = (couples.data || []).map(c => c.id), matches: PlayerResult[] = []
  // Chunk IDs and paginate each query so career totals are not silently cut at 1,000 rows.
  const seen = new Set<string>()
  for (let start = 0; start < ids.length; start += 100) {
    const group = ids.slice(start, start + 100)
    for (let offset = 0; ; offset += 500) {
      const result = await client.from("matches").select("id,tournament_id,couple1_id,couple2_id,winner_id,status,type")
        .in("status", ["COMPLETED", "FINISHED"]).or("es_prueba.is.false,es_prueba.is.null").or(`couple1_id.in.(${group.join(",")}),couple2_id.in.(${group.join(",")})`)
        .order("id").range(offset, offset + 499).returns<(PlayerResult & { id: string })[]>()
      if (result.error) throw result.error
      for (const row of result.data || []) if (!seen.has(row.id)) { seen.add(row.id); matches.push(row) }
      if ((result.data?.length || 0) < 500) break
    }
  }
  return { ...player.data, ...summarizePlayerResults(ids, matches) }
}
