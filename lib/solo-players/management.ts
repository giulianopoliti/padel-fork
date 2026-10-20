import "server-only"
import { createClient } from "@/utils/supabase/server"
import { checkTournamentPermissions } from "@/utils/tournament-permissions"
import { loadSoloRequests } from "./requests"
import { isInscriptionProofPending } from "@/lib/tournaments/inscription-requirements"
import type { SoloManagerData } from "@/types/solo-player-ui"

type Client = Awaited<ReturnType<typeof createClient>>
export const isSoloManager = async (client: Client, userId: string): Promise<boolean> => {
  const role = await client.from("users").select("role").eq("id", userId).maybeSingle<{ role: string }>()
  if (role.error) throw role.error
  return ["ADMIN", "CLUB", "ORGANIZADOR"].includes(role.data?.role || "")
}

export const loadSoloManagement = async (client: Client, userId: string, offset: number, history: boolean, pairOffset: number): Promise<SoloManagerData> => {
  // Existing centralized permission checks also support organization members.
  const tournaments: { id: string; name: string; type: string; enable_transfer_proof: boolean; allow_cash_payment: boolean }[] = []
  for (let page = 0; ; page += 100) {
    const rows = await client.from("tournaments").select("id,name,type,enable_transfer_proof,allow_cash_payment").order("id").range(page, page + 99)
      .returns<{ id: string; name: string; type: string; enable_transfer_proof: boolean; allow_cash_payment: boolean }[]>()
    if (rows.error) throw rows.error
    for (let start = 0; start < (rows.data?.length || 0); start += 5) {
      const group = rows.data!.slice(start, start + 5)
      const checks = await Promise.all(group.map(t => checkTournamentPermissions(userId, t.id)))
      group.forEach((t, i) => { if (checks[i].hasPermission) tournaments.push(t) })
    }
    if ((rows.data?.length || 0) < 100) break
  }
  if (!tournaments.length) return { tournaments: [], pairs: [], requests: [], hasMoreRequests: false, hasMorePairs: false }
  const ids = tournaments.map(t => t.id)
  const [inbox, inscriptions] = await Promise.all([
    loadSoloRequests(client, userId, history, offset, undefined, undefined, ids),
    client.from("inscriptions").select("id,tournament_id,couple_id,is_pending,payment_method,payment_proof_path,solo_player_requests!inner(id)").in("tournament_id", ids).eq("solo_player_requests.status", "ACCEPTED").eq("es_prueba", false).order("created_at", { ascending: false }).order("id").range(pairOffset, pairOffset + 50)
      .returns<{ id: string; tournament_id: string; couple_id: string; is_pending: boolean; payment_method: string | null; payment_proof_path: string | null }[]>(),
  ])
  if (inscriptions.error) throw inscriptions.error
  const rows = (inscriptions.data || []).slice(0, 50), coupleIds = [...new Set(rows.map(i => i.couple_id))]
  const couples = coupleIds.length ? await client.from("couples").select("id,player1_id,player2_id").in("id", coupleIds).returns<{ id: string; player1_id: string; player2_id: string | null }[]>() : { data: [], error: null }
  if (couples.error) throw couples.error
  const playerIds = [...new Set((couples.data || []).flatMap(c => [c.player1_id, c.player2_id].filter((id): id is string => !!id)))]
  const [players, zonePositions, zoneCouples] = await Promise.all([
    playerIds.length ? client.from("players").select("id,first_name,last_name,preferred_side,preferred_hand").in("id", playerIds).returns<{ id: string; first_name: string | null; last_name: string | null; preferred_side: string | null; preferred_hand: string | null }[]>() : { data: [], error: null },
    coupleIds.length ? client.from("zone_positions").select("couple_id,zone_id,zones!inner(tournament_id)").in("couple_id", coupleIds).in("zones.tournament_id", ids) : { data: [], error: null },
    coupleIds.length ? client.from("zone_couples").select("couple_id,zone_id,zones!inner(tournament_id)").in("couple_id", coupleIds).in("zones.tournament_id", ids) : { data: [], error: null },
  ])
  for (const result of [players, zonePositions, zoneCouples]) if (result.error) throw result.error
  const profiles = new Map((players.data || []).map(p => [p.id, p])), pairs = new Map((couples.data || []).map(c => [c.id, c]))
  const assignments = new Set([...zonePositions.data || [], ...zoneCouples.data || []].map(row => {
    const zone = Array.isArray(row.zones) ? row.zones[0] : row.zones
    return `${row.couple_id}:${zone?.tournament_id}`
  }))
  const name = (id: string): string => { const p = profiles.get(id); return [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Jugador" }
  return { tournaments: tournaments.map(t => ({ id: t.id, name: t.name, type: t.type, enableTransferProof: !!t.enable_transfer_proof, allowCash: !!t.allow_cash_payment })),
    requests: inbox.requests, hasMoreRequests: inbox.hasMore, hasMorePairs: (inscriptions.data?.length || 0) > 50,
    pairs: rows.flatMap(i => {
      const c = pairs.get(i.couple_id)
      if (!c?.player2_id) return []
      const first = profiles.get(c.player1_id), second = profiles.get(c.player2_id)
      return [{ inscriptionId: i.id, tournamentId: i.tournament_id, tournamentName: tournaments.find(t => t.id === i.tournament_id)?.name || "Torneo",
        player1Id: c.player1_id, player2Id: c.player2_id, player1Name: name(c.player1_id), player2Name: name(c.player2_id),
        player1Side: first?.preferred_side || null, player1Hand: first?.preferred_hand || null, player2Side: second?.preferred_side || null, player2Hand: second?.preferred_hand || null,
        pendingApproval: i.is_pending, pendingProof: isInscriptionProofPending(i, tournaments.find(t => t.id === i.tournament_id)?.enable_transfer_proof), assigned: assignments.has(`${i.couple_id}:${i.tournament_id}`) }]
    }) }
}
