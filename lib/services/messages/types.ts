import type { SupabaseLike } from "@/lib/services/email/notification-utils"

export type TournamentMessageType =
  | "INSCRIPTION_SUBMITTED_ADMIN"
  | "INSCRIPTION_APPROVED_PLAYER"
  | "INSCRIPTION_CANCELLED_ADMIN"
  | "LONG_MATCH_CONFIRMED_PLAYER"
  | "REGISTRATION_ATTENTION_ADMIN"

export type TournamentMessageChannel = "email" | "whatsapp"

type MessageEvent =
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
  | {
      type: 'REGISTRATION_ATTENTION_ADMIN'
      supabase: SupabaseLike
      tournamentId: string
      inscriptionId?: string
      kind: 'CAPACITY_FULL' | 'PROOF_WITHOUT_SLOT'
    }

export type TournamentMessageEvent = MessageEvent & { delivery?: { eventId: string; attempt: number } }

export type TournamentMessageResult =
  | { success: true; skipped?: false }
  | { success: true; skipped: true; reason: string }
  | { success: false; error: string }

export type TournamentMessageAdapter = {
  channel: TournamentMessageChannel
  send: (event: TournamentMessageEvent) => Promise<TournamentMessageResult>
}
