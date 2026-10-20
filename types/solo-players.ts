/** Solo player contracts. database.types.ts is currently the repository's `any` fallback. */
export const SOLO_PLAYER_CONTACT_CONSENT_VERSION = 'solo-players-contact-v1' as const
export const SOLO_PLAYER_TOURNAMENT_TERMS_VERSION = 'solo-players-tournament-v1' as const

export type SoloPlayerPostStatus = 'ACTIVE' | 'PAUSED' | 'WITHDRAWN' | 'EXPIRED' | 'MATCHED'
export type SoloPlayerRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED' | 'INVALIDATED'
export type SoloPlayerRequestAction = 'ACCEPT' | 'REJECT' | 'WITHDRAW' | 'INVALIDATE'
export type SoloPlayerDuration = '1_DAY' | '1_WEEK' | '2_WEEKS' | '1_MONTH'
export type SoloPlayerSide = 'DRIVE' | 'REVES'
export type SoloPlayerHand = 'RIGHT' | 'LEFT'
export type SoloPlayerNotificationEvent = 'REQUEST_RECEIVED' | 'REQUEST_SENT' | 'REQUEST_ACCEPTED'
  | 'REQUEST_REJECTED' | 'REQUEST_WITHDRAWN' | 'REQUEST_EXPIRED' | 'REQUEST_INVALIDATED' | 'PLAYER_SEARCHING'

export interface SoloPlayerPost {
  id: string
  owner_user_id: string
  player_id: string
  tournament_id: string | null
  category_name: string
  preferred_side: SoloPlayerSide
  preferred_hand: SoloPlayerHand
  status: SoloPlayerPostStatus
  public_phone: boolean
  contact_consent_version: typeof SOLO_PLAYER_CONTACT_CONSENT_VERSION
  contact_consented_at: string
  tournament_terms_version: string | null
  tournament_terms_accepted_at: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface SoloPlayerRequest {
  id: string
  post_id: string
  sender_user_id: string
  recipient_user_id: string
  sender_player_id: string
  recipient_player_id: string
  tournament_id: string | null
  status: SoloPlayerRequestStatus
  /** Only AMERICAN has its own deadline. General inherits post.expires_at; LONG inherits tournament closure. */
  expires_at: string | null
  contact_consent_version: typeof SOLO_PLAYER_CONTACT_CONSENT_VERSION
  contact_consented_at: string
  tournament_terms_version: string | null
  tournament_terms_accepted_at: string | null
  resolved_by: string | null
  resolved_at: string | null
  inscription_id: string | null
  created_at: string
}

export interface SoloPlayerRequestInboxEntry extends SoloPlayerRequest {
  effective_status: SoloPlayerRequestStatus
  /** Publication availability; competitive acceptance uses the atomic server service. */
  is_actionable: boolean
}

export interface SoloPlayerDirectoryEntry extends Pick<SoloPlayerPost,
  'id' | 'owner_user_id' | 'player_id' | 'tournament_id' | 'category_name' | 'preferred_side' | 'preferred_hand'
  | 'public_phone' | 'expires_at' | 'created_at'> {
  first_name: string | null
  last_name: string | null
  profile_image_url: string | null
  /** Full tournaments remain visible, with actions disabled until capacity is available. */
  is_actionable: boolean
}

export interface SoloPlayerNotification {
  id: string
  recipient_user_id: string
  request_id: string | null
  post_id?: string | null
  event_type: SoloPlayerNotificationEvent
  read_at: string | null
  email_status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'SKIPPED'
  email_attempts: number
  email_next_attempt_at: string
  email_sent_at: string | null
  /** Added by phase 4. Never needed in a browser notification DTO. */
  email_claim_id?: string | null
  email_last_error?: string | null
  created_at: string
}

/** Returned only through get_solo_player_contact, never by directory/inbox joins. */
export interface SoloPlayerContact {
  user_id: string
  phone: string
}

export interface LegacySoloPlayer {
  player_id: string
  user_id: string | null
  first_name: string | null
  last_name: string | null
  inscription_ids: string[]
  already_in_couple: boolean
}

interface SaveSoloPlayerPostBase {
  p_player_id: string
  p_category_name: string
  p_preferred_side: SoloPlayerSide
  p_preferred_hand: SoloPlayerHand
  /** International E.164. Use libphonenumber-js validation at the server boundary. */
  p_phone: string
  p_public_phone: boolean
  p_contact_consent_version: typeof SOLO_PLAYER_CONTACT_CONSENT_VERSION
  p_post_id?: string | null
}

export type SaveSoloPlayerPostArgs = SaveSoloPlayerPostBase & ({
  p_tournament_id?: null
  p_duration: SoloPlayerDuration
  p_tournament_terms_version?: null
} | {
  p_tournament_id: string
  p_duration?: null
  /** Server must validate the current tenant's terms before calling the RPC. */
  p_tournament_terms_version: string
})

export interface SendSoloPlayerRequestArgs {
  p_post_id: string
  p_sender_player_id: string
  p_phone: string
  p_contact_consent_version: typeof SOLO_PLAYER_CONTACT_CONSENT_VERSION
  p_tournament_terms_version?: string | null
}

/** Useful for typed repository wrappers without replacing the global generated schema. */
export interface SoloPlayerRpcContracts {
  claim_solo_player_emails: { Args: { p_claim_id: string; p_limit?: number }; Returns: SoloPlayerNotification[] }
  prepare_solo_player_email: {
    Args: { p_notification_id: string; p_claim_id: string; p_tenant: 'padel-fv' | 'padel-elite'; p_content: { subject: string; html: string; text: string } }
    Returns: { to: string; subject: string; html: string; text: string }
  }
  finish_solo_player_email: { Args: { p_notification_id: string; p_claim_id: string; p_success: boolean; p_error?: string | null }; Returns: boolean }
  get_solo_player_expiry_scopes: { Args: Record<string, never>; Returns: { tournament_id: string | null }[] }
  expire_solo_player_scope: { Args: { p_tournament_id?: string | null }; Returns: undefined }
  /** Trusted server only. Never expose actor/tenant parameters to a browser RPC. */
  confirm_tournament_pair: {
    Args: {
      p_tournament_id: string; p_player1_id: string; p_player2_id: string; p_actor_id: string
      p_tenant: 'padel-fv' | 'padel-elite'; p_request_id?: string | null
      p_payment_method?: 'CASH' | 'TRANSFER' | null; p_terms_accepted?: boolean
      p_allow_blocked_override?: boolean; p_organizer?: boolean
    }
    Returns: {
      inscription: { id: string; couple_id: string; tournament_id: string; is_pending: boolean;
        created_at: string; payment_method: 'CASH' | 'TRANSFER' | null; payment_proof_path: string | null }
      created: boolean; request_status?: 'ACCEPTED' | null
    }
  }
  save_solo_player_post: { Args: SaveSoloPlayerPostArgs; Returns: SoloPlayerPost }
  set_solo_player_post_status: {
    Args: { p_post_id: string; p_status: 'ACTIVE' | 'PAUSED' | 'WITHDRAWN' }
    Returns: SoloPlayerPost
  }
  send_solo_player_request: { Args: SendSoloPlayerRequestArgs; Returns: SoloPlayerRequest }
  resolve_solo_player_request: {
    Args: { p_request_id: string; p_action: SoloPlayerRequestAction }
    Returns: SoloPlayerRequest
  }
  get_solo_player_contact: {
    Args: { p_post_id: string; p_request_id?: null } | { p_post_id?: null; p_request_id: string }
    Returns: SoloPlayerContact[]
  }
  mark_solo_player_notification_read: { Args: { p_notification_id: string }; Returns: SoloPlayerNotification }
  get_legacy_solo_players: { Args: { p_tournament_id: string }; Returns: LegacySoloPlayer[] }
}
