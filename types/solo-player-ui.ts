import type { SoloPlayerDirectoryEntry, SoloPlayerPost, SoloPlayerSide, SoloPlayerHand, SoloPlayerDuration, SoloPlayerRequestStatus, SoloPlayerNotificationEvent } from "./solo-players"

export interface SoloTournamentOption { id: string; name: string; acceptsInterest: boolean }
export type SoloOwnPost = Pick<SoloPlayerPost, "id" | "tournament_id" | "category_name" | "preferred_side" | "preferred_hand" | "status" | "public_phone" | "expires_at">
export interface SoloPairState {
  tournament_id: string
  inscription_id: string
  pendingApproval: boolean
  pendingProof: boolean
  occupiesSlot?: boolean
  transferProofEnabled?: boolean
  formedViaSoloPlayers?: boolean
  isEliminated?: boolean
}
export interface SoloDirectoryData {
  userId: string
  profile: { id: string; category: string | null; preferred_side: SoloPlayerSide | null; preferred_hand: SoloPlayerHand | null; phone?: string | null } | null
  soloTournamentIds?: string[]
  directory: SoloPlayerDirectoryEntry[]
  ownPosts: SoloOwnPost[]
  pendingPostIds: string[]
  pairs: SoloPairState[]
  categories: string[]
  tournaments: SoloTournamentOption[]
  support: { name: string; whatsappUrl: string | null }
}
export interface SoloPostInput {
  postId?: string
  tournamentId: string | null
  category: string
  side: SoloPlayerSide
  hand: SoloPlayerHand
  duration: SoloPlayerDuration
  phone: string
  publicPhone: boolean
  contactAccepted: boolean
  termsAccepted: boolean
}

export interface SoloRequestEntry {
  id: string; post_id: string; tournament_id: string | null; inscription_id: string | null
  sender_user_id: string; recipient_user_id: string; sender_player_id: string; recipient_player_id: string
  effective_status: SoloPlayerRequestStatus; is_actionable: boolean; expires_at: string | null; created_at: string
  senderName: string; recipientName: string; tournamentName: string | null
  enableTransferProof: boolean; allowCash: boolean
  category?: string | null; tournamentType?: string | null
  senderSide?: string | null; senderHand?: string | null; recipientSide?: string | null; recipientHand?: string | null
}
export interface SoloRequestsData { userId: string; requests: SoloRequestEntry[]; hasMore: boolean }
export interface SoloNotificationEntry {
  id: string; request_id: string | null; post_id?: string | null; event_type: SoloPlayerNotificationEvent; read_at: string | null; created_at: string
  title?: string; description?: string; playerId?: string | null; playerName?: string | null
  tournamentId?: string | null
  search?: SoloSearchNotificationData | null
}
export interface SoloSearchNotificationData {
  postId: string; tournamentId: string | null; tournamentName: string | null; organizationName?: string | null; playerId: string; playerName: string
  category: string; side: SoloPlayerSide; hand: SoloPlayerHand; status: SoloPlayerPost["status"]; expiresAt: string | null
}
export interface SoloNotificationsData { notifications: SoloNotificationEntry[]; unreadCount: number; hasMore: boolean }

export interface SoloManagerTournament { id: string; name: string; type: string; enableTransferProof: boolean; allowCash: boolean }
export interface SoloManagerPair { inscriptionId: string; tournamentId: string; tournamentName: string; player1Id: string; player2Id: string; player1Name: string; player2Name: string; player1Side: string | null; player2Side: string | null; player1Hand: string | null; player2Hand: string | null; pendingApproval: boolean; pendingProof: boolean; occupiesSlot?: boolean; assigned: boolean }
export interface SoloManagerData { tournaments: SoloManagerTournament[]; pairs: SoloManagerPair[]; requests: SoloRequestEntry[]; hasMoreRequests: boolean; hasMorePairs: boolean }
