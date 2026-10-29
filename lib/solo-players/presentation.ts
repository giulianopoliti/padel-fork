import type { SoloOwnPost, SoloPairState, SoloRequestEntry, SoloSearchNotificationData } from "@/types/solo-player-ui"
import type { SoloPlayerNotificationEvent, SoloPlayerRequestStatus } from "@/types/solo-players"

export const SOLO_EVENT_LABELS: Record<SoloPlayerNotificationEvent, string> = {
  PLAYER_SEARCHING: "Nuevo jugador buscando pareja",
  REQUEST_RECEIVED: "Nueva solicitud", REQUEST_SENT: "Solicitud enviada", REQUEST_ACCEPTED: "Solicitud aceptada",
  REQUEST_REJECTED: "Solicitud rechazada", REQUEST_WITHDRAWN: "Solicitud retirada", REQUEST_EXPIRED: "Solicitud vencida", REQUEST_INVALIDATED: "Solicitud sin efecto",
}

export const soloSearchNotificationContent = (search?: SoloSearchNotificationData | null): { title: string; description: string } => search ? {
  title: `${search.playerName} busca pareja · ${search.tournamentName || `Circuito ${search.organizationName || "general"}`}`,
  description: `Categoría ${search.category} · ${soloSportsLabel(search.side, search.hand)}. La búsqueda no reserva cupo.`,
} : { title: "Nuevo jugador buscando pareja", description: "La publicación ya no está disponible para tu cuenta." }
export const SOLO_REQUEST_LABELS: Record<SoloPlayerRequestStatus, string> = {
  PENDING: "Pendiente", ACCEPTED: "Aceptada", REJECTED: "Rechazada", WITHDRAWN: "Retirada", EXPIRED: "Vencida", INVALIDATED: "Sin efecto",
}

export const soloSportsLabel = (side?: string | null, hand?: string | null): string =>
  [side === "DRIVE" ? "Drive" : side === "REVES" ? "Revés" : "Lado sin definir", hand === "LEFT" ? "Zurdo" : hand === "RIGHT" ? "Diestro" : "Mano sin definir"].join(" · ")

export const soloRequestContext = (entry: Pick<SoloRequestEntry, "tournamentName" | "tournamentType" | "category">): string => {
  if (!entry.tournamentName) return `categoría ${entry.category || "sin definir"} · Sin torneo definido`
  const type = entry.tournamentType === "AMERICAN" ? "Americano" : entry.tournamentType === "LONG" ? "Largo" : ""
  const showType = type && type.toLowerCase() !== entry.tournamentName.trim().toLowerCase()
  return `torneo ${entry.tournamentName}${showType ? ` · ${type}` : ""}${entry.category ? ` · categoría ${entry.category}` : ""}`
}

export const soloNotificationTitle = (event: SoloPlayerNotificationEvent, entry?: Pick<SoloRequestEntry, "tournamentName" | "tournamentType" | "category">): string => {
  const label = event === "REQUEST_RECEIVED" ? "Nueva solicitud de pareja" : SOLO_EVENT_LABELS[event]
  return entry ? `${label} · ${soloRequestContext(entry)}` : label
}

export const soloNotificationContent = (event: SoloPlayerNotificationEvent, entry: SoloRequestEntry | undefined, userId: string): { title: string; description: string; manager: boolean } => {
  const manager = !!entry && userId !== entry.sender_user_id && userId !== entry.recipient_user_id
  if (manager && entry.tournament_id) return {
    title: `${event === "REQUEST_ACCEPTED" ? "Se ha formado una pareja" : "Novedad de pareja"} · ${entry.tournamentName || "Torneo"}`,
    description: `${entry.senderName} y ${entry.recipientName}${entry.category ? ` · categoría ${entry.category}` : ""}. ${event === "REQUEST_ACCEPTED" ? "Revisá su inscripción, los requisitos pendientes y la asignación de zona." : `Estado: ${SOLO_EVENT_LABELS[event].toLowerCase()}. Consultá el detalle en el torneo.`}`,
    manager,
  }
  return { title: soloNotificationTitle(event, entry), description: entry ? `${entry.senderName} → ${entry.recipientName}` : "Abrí el aviso para consultar el estado vigente.", manager }
}

export const getSoloPostLabel = (post: Pick<SoloOwnPost, "status" | "expires_at">, now = Date.now()): string => {
  if (post.expires_at && Date.parse(post.expires_at) <= now && ["ACTIVE", "PAUSED"].includes(post.status)) return "Vencida"
  return { ACTIVE: "Buscando pareja", PAUSED: "Pausada", WITHDRAWN: "Retirada", EXPIRED: "Vencida", MATCHED: "Pareja formada" }[post.status]
}

export const getSoloPairLabel = (pair: SoloPairState): string => {
  if (pair.isEliminated) return "Pareja eliminada"
  if (pair.occupiesSlot === false) return "Pareja sin cupo reservado"
  if (pair.pendingProof) return "Inscripción confirmada · Seña pendiente"
  return "Inscripción confirmada"
}
