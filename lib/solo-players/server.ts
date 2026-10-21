import "server-only"

import { createClient } from "@/utils/supabase/server"
import { getTenantBranding } from "@/config/tenant"
import { getTenantOrganization } from "@/lib/services/tenant-organization.service"
import { getOrganizationWhatsappUrl } from "./validation"
import { isInscriptionProofPending } from "@/lib/tournaments/inscription-requirements"
import type { SoloPlayerDirectoryEntry, SoloPlayerPost } from "@/types/solo-players"
import type { SoloDirectoryData, SoloOwnPost } from "@/types/solo-player-ui"

export const DIRECTORY_COLUMNS = "id,owner_user_id,player_id,tournament_id,category_name,preferred_side,preferred_hand,public_phone,expires_at,created_at,first_name,last_name,profile_image_url,is_actionable"
export const OWN_POST_COLUMNS = "id,tournament_id,category_name,preferred_side,preferred_hand,status,public_phone,expires_at"

// Keep an allowlist at the response boundary as well as in database selects.
export const projectSoloRow = <T extends object>(row: T, columns: string): T =>
  Object.fromEntries(columns.split(",").map(key => [key, row[key as keyof T]])) as T

type Client = Awaited<ReturnType<typeof createClient>>
type TournamentRow = { id: string; name: string; status: string; is_draft: boolean | null; enable_public_inscriptions: boolean | null;
  registration_locked: boolean | null; registration_locked_by_capacity: boolean | null; created_at: string; bracket_status: string | null; enable_transfer_proof?: boolean | null }
type Profile = NonNullable<SoloDirectoryData["profile"]>

export const acceptsSoloInterest = (t: TournamentRow): boolean =>
  !t.is_draft && t.enable_public_inscriptions === true && !(t.registration_locked && !t.registration_locked_by_capacity)
  && ["NOT_STARTED", "PAIRING", "ZONE_REGISTRATION", "ZONE_PHASE"].includes(t.status)
  && (Date.parse(t.created_at) >= Date.parse("2025-07-01T00:00:00Z") || t.status === "ZONE_PHASE" || !["BRACKET_GENERATED", "BRACKET_ACTIVE"].includes(t.bracket_status || ""))

export const getSoloProfile = async (client: Client, userId: string): Promise<Profile | null> => {
  const result = await client.from("players").select("id,category:category_name,preferred_side,preferred_hand,phone").eq("user_id", userId).maybeSingle<Profile>()
  if (result.error) throw result.error
  return result.data ? projectSoloRow(result.data, "id,category,preferred_side,preferred_hand,phone") : null
}

export const loadSoloDirectory = async (client: Client, userId: string): Promise<SoloDirectoryData> => {
  const results = await Promise.all([
    client.from("solo_player_directory").select(DIRECTORY_COLUMNS).order("created_at", { ascending: false }).returns<SoloPlayerDirectoryEntry[]>(),
    client.from("solo_player_posts").select(OWN_POST_COLUMNS).eq("owner_user_id", userId).order("created_at", { ascending: false }).returns<SoloOwnPost[]>(),
    client.from("solo_player_request_inbox").select("post_id").eq("effective_status", "PENDING")
      .or(`sender_user_id.eq.${userId},recipient_user_id.eq.${userId}`).returns<{ post_id: string }[]>(),
    client.from("categories").select("name").order("name").returns<{ name: string }[]>(),
    client.from("tournaments").select("id,name,status,is_draft,enable_public_inscriptions,registration_locked,registration_locked_by_capacity,created_at,bracket_status,enable_transfer_proof")
      .eq("is_draft", false).order("created_at", { ascending: false }).returns<TournamentRow[]>(),
    getSoloProfile(client, userId),
    getTenantOrganization(),
  ])
  const [directory, posts, requests, categories, tournaments, profile, organization] = results
  for (const result of [directory, posts, requests, categories, tournaments]) if (result.error) throw result.error

  let whatsappUrl: string | null = null
  if (organization) {
    const support = await client.from("organizaciones").select("phone").eq("id", organization.id).eq("is_active", true).maybeSingle<{ phone: string | null }>()
    if (support.error) throw support.error
    whatsappUrl = getOrganizationWhatsappUrl(support.data?.phone)
  }

  const pairs: SoloDirectoryData["pairs"] = []
  const soloTournamentIds: string[] = []
  if (profile) {
    const [couples, individualInscriptions] = await Promise.all([
      client.from("couples").select("id,player2_id").or(`player1_id.eq.${profile.id},player2_id.eq.${profile.id}`).returns<{ id: string; player2_id: string | null }[]>(),
      client.from("inscriptions").select("tournament_id").eq("player_id", profile.id).is("couple_id", null).eq("es_prueba", false).eq("is_eliminated", false).returns<{ tournament_id: string }[]>(),
    ])
    if (couples.error) throw couples.error
    if (individualInscriptions.error) throw individualInscriptions.error
    soloTournamentIds.push(...(individualInscriptions.data || []).map(i => i.tournament_id))
    if (couples.data?.length) {
      const inscriptions = await client.from("inscriptions").select("id,couple_id,tournament_id,is_pending,is_eliminated,payment_method,payment_proof_path,tournaments(enable_transfer_proof),solo_player_requests(status)")
        .in("couple_id", couples.data.map(couple => couple.id)).eq("es_prueba", false)
        .returns<{ id: string; couple_id: string; tournament_id: string; is_pending: boolean; is_eliminated: boolean | null; payment_method: string | null; payment_proof_path: string | null;
          solo_player_requests: { status: string }[];
          tournaments: { enable_transfer_proof: boolean | null } | { enable_transfer_proof: boolean | null }[] | null }[]>()
      if (inscriptions.error) throw inscriptions.error
      const completeCouples = new Set(couples.data.filter(c => c.player2_id).map(c => c.id))
      pairs.push(...(inscriptions.data || []).flatMap(i => {
        if (!completeCouples.has(i.couple_id)) {
          if (!i.is_eliminated) soloTournamentIds.push(i.tournament_id)
          return []
        }
        const tournament = Array.isArray(i.tournaments) ? i.tournaments[0] : i.tournaments
        return [{ tournament_id: i.tournament_id, inscription_id: i.id, pendingApproval: i.is_pending === true,
          formedViaSoloPlayers: i.solo_player_requests.some(request => request.status === "ACCEPTED"),
          isEliminated: i.is_eliminated === true,
          transferProofEnabled: tournament?.enable_transfer_proof === true,
          pendingProof: isInscriptionProofPending(i, tournament?.enable_transfer_proof) }]
      }))
    }
  }
  return {
    userId, profile, soloTournamentIds,
    directory: (directory.data || []).map(row => projectSoloRow(row, DIRECTORY_COLUMNS)),
    ownPosts: (posts.data || []).map(row => projectSoloRow(row, OWN_POST_COLUMNS)),
    pendingPostIds: [...new Set((requests.data || []).map(row => row.post_id))], pairs,
    categories: (categories.data || []).map(row => row.name),
    tournaments: (tournaments.data || []).map(t => ({ id: t.id, name: t.name, acceptsInterest: acceptsSoloInterest(t) })),
    support: { name: organization?.name || getTenantBranding().shortName, whatsappUrl },
  }
}

export const sanitizeSavedPost = (post: SoloPlayerPost): SoloOwnPost => projectSoloRow(post, OWN_POST_COLUMNS)
