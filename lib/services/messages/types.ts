import type { SupabaseLike } from "@/lib/services/email/notification-utils"

export type TournamentMessageType =
  | "INSCRIPTION_SUBMITTED_ADMIN"
  | "INSCRIPTION_APPROVED_ADMIN"
  | "INSCRIPTION_PENDING_PLAYER"
  | "INSCRIPTION_APPROVED_PLAYER"
  | "INSCRIPTION_CANCELLED_ADMIN"
  | "LONG_MATCH_CONFIRMED_PLAYER"

export type TournamentMessageChannel = "email" | "whatsapp"

export type TournamentMessageEvent =
  | {
      type: "INSCRIPTION_SUBMITTED_ADMIN"
      supabase: SupabaseLike
      inscriptionId: string
    }
  | {
      type: "INSCRIPTION_APPROVED_PLAYER"
      supabase: SupabaseLike
      inscriptionId: string
    }
  | {
      type: "INSCRIPTION_APPROVED_ADMIN"
      supabase: SupabaseLike
      inscriptionId: string
    }
  | {
      type: "INSCRIPTION_PENDING_PLAYER"
      supabase: SupabaseLike
      inscriptionId: string
    }
  | {
      type: "INSCRIPTION_CANCELLED_ADMIN"
      supabase: SupabaseLike
      tournamentId: string
      inscriptionId?: string
      coupleId?: string | null
      playerId?: string | null
    }
  | {
      type: "LONG_MATCH_CONFIRMED_PLAYER"
      supabase: SupabaseLike
      matchId: string
    }

export type TournamentMessageResult =
  | { success: true; skipped?: false }
  | { success: true; skipped: true; reason: string }
  | { success: false; error: string }

export type TournamentMessageAdapter = {
  channel: TournamentMessageChannel
  send: (event: TournamentMessageEvent) => Promise<TournamentMessageResult>
}
