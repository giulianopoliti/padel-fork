import "server-only"
import { randomUUID } from "node:crypto"
import { createClientServiceRole } from "@/utils/supabase/server"
import { getTenantBranding } from "@/config/tenant"
import { buildAppUrl, escapeHtml, renderEmailLayout, type EmailTemplate } from "@/lib/services/email/templates"
import { sendTransactionalEmail, type SendEmailResult } from "@/lib/services/email/resend-client"
import type { SoloPlayerNotification } from "@/types/solo-players"
import { soloNotificationTitle, soloSearchNotificationContent } from "./presentation"
import type { SoloRequestEntry, SoloSearchNotificationData } from "@/types/solo-player-ui"
import { receivesSoloEmails } from "./email-preference"
import { loadSearchNotificationContexts } from "./search-notifications"
import { isSoloPlayersProductionBackend } from "@/config/solo-players"

type EmailLease = SoloPlayerNotification & { email_claim_id: string }
type FrozenEmail = EmailTemplate & { to: string }
type Delivery = (email: Parameters<typeof sendTransactionalEmail>[0]) => Promise<SendEmailResult>

type EmailContext = Pick<SoloRequestEntry, "tournamentName" | "tournamentType" | "category"> & { manager?: boolean; tournamentId?: string | null; senderName?: string; recipientName?: string; search?: SoloSearchNotificationData }
export const buildSoloEmail = (notification: Pick<SoloPlayerNotification, "event_type" | "request_id">, context?: EmailContext): EmailTemplate => {
  const brand = getTenantBranding().shortName
  const searchEvent = notification.event_type === "PLAYER_SEARCHING"
  const searchContent = soloSearchNotificationContent(context?.search)
  const title = searchEvent ? searchContent.title : context?.manager && context.tournamentName
    ? `${notification.event_type === "REQUEST_ACCEPTED" ? "Se ha formado una pareja" : "Novedad de pareja"} · ${context.tournamentName}`
    : soloNotificationTitle(notification.event_type, context)
  const url = buildAppUrl(searchEvent ? `/jugadores-sueltos${context?.search?.tournamentId ? `?torneo=${context.search.tournamentId}` : ""}` : context?.manager && context.tournamentId ? `/tournaments/${context.tournamentId}/inscriptions` : `/jugadores-sueltos?vista=solicitudes&solicitud=${notification.request_id}`)
  // No phone, recipient email, payment data, or false registration confirmation.
  const description = searchEvent ? `${searchContent.description} Podés revisar su perfil y ayudar a formar una pareja.` : context?.manager
    ? `${context.senderName || "Un jugador"} y ${context.recipientName || "otro jugador"}${context.category ? ` · categoría ${context.category}` : ""}. ${notification.event_type === "REQUEST_ACCEPTED" ? "Formaron pareja para tu torneo. Revisá su inscripción, los requisitos pendientes y la asignación de zona." : "Hay una actualización en una solicitud de tu torneo. Consultá el detalle de la pareja."}`
    : notification.event_type === "REQUEST_ACCEPTED"
    ? "La solicitud fue aceptada. Si es una búsqueda general, ya pueden consultar el contacto compartido. Si es de un torneo, revisá la inscripción y completá los requisitos pendientes."
    : notification.event_type === "REQUEST_RECEIVED"
      ? "Hay una nueva solicitud relacionada con una búsqueda de pareja. Revisala en la bandeja para ver los jugadores, su estado vigente y las acciones disponibles. Enviar una solicitud no reserva cupo."
      : "Registramos una actualización de tu solicitud de pareja. Consultá su estado vigente y los detalles en la bandeja. Una solicitud vencida o sin efecto no permite aceptar; esto no cancela una inscripción ya creada."
  return { subject: `${title} · ${brand}`, text: `${title}\n${description}\n${url}`,
    html: renderEmailLayout({ title, preview: `${title} · ${brand}`, body: `<p>${escapeHtml(description)}</p>`,
      cta: { label: searchEvent ? "Ver jugadores sueltos" : context?.manager ? "Gestionar inscripción" : "Ver solicitud", href: url }, footer: "Podés configurar los correos de búsqueda de pareja en Editar perfil." }) }
}

const loadEmailContext = async (admin: Awaited<ReturnType<typeof createClientServiceRole>>, requestId: string, recipientUserId: string): Promise<EmailContext | undefined> => {
  const request = await admin.from("solo_player_requests").select("post_id,tournament_id,sender_user_id,recipient_user_id,sender_player_id,recipient_player_id").eq("id", requestId).maybeSingle<{ post_id: string; tournament_id: string | null; sender_user_id: string; recipient_user_id: string; sender_player_id: string; recipient_player_id: string }>()
  if (request.error) throw request.error
  if (!request.data) return undefined
  const [post, tournament] = await Promise.all([
    admin.from("solo_player_posts").select("category_name").eq("id", request.data.post_id).maybeSingle<{ category_name: string }>(),
    request.data.tournament_id ? admin.from("tournaments").select("name,type").eq("id", request.data.tournament_id).maybeSingle<{ name: string; type: string }>() : { data: null, error: null },
  ])
  if (post.error) throw post.error
  if (tournament.error) throw tournament.error
  const manager = !!request.data.sender_user_id && !!request.data.recipient_user_id && recipientUserId !== request.data.sender_user_id && recipientUserId !== request.data.recipient_user_id
  let senderName: string | undefined, recipientName: string | undefined
  if (manager) {
    const players = await admin.from("players").select("id,first_name,last_name").in("id", [request.data.sender_player_id, request.data.recipient_player_id]).returns<{ id: string; first_name: string | null; last_name: string | null }[]>()
    if (players.error) throw players.error
    const names = new Map((players.data || []).map(p => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || "Jugador"]))
    senderName = names.get(request.data.sender_player_id); recipientName = names.get(request.data.recipient_player_id)
  }
  return { category: post.data?.category_name || null, tournamentName: tournament.data?.name || null, tournamentType: tournament.data?.type || null, tournamentId: request.data.tournament_id, manager, senderName, recipientName }
}

/** One shared sweep. Scope transactions preserve tournament -> social lock order. */
export const processSoloPlayerNotifications = async (options: { deliver?: Delivery; limit?: number } = {}) => {
  const admin = await createClientServiceRole()
  const scopes = await admin.rpc("get_solo_player_expiry_scopes")
  if (scopes.error) throw scopes.error
  for (const scope of (scopes.data || []) as { tournament_id: string | null }[]) {
    const expired = await admin.rpc("expire_solo_player_scope", { p_tournament_id: scope.tournament_id })
    if (expired.error) throw expired.error
  }
  // Production uses the configured tenant sender. Local and preview builds stay opt-in.
  const productionDelivery = process.env.NODE_ENV === "production" && isSoloPlayersProductionBackend()
    && (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production")
    && process.env.SOLO_PLAYERS_EMAIL_DELIVERY !== "disabled"
  if (!options.deliver && process.env.SOLO_PLAYERS_EMAIL_DELIVERY !== "resend" && !productionDelivery) return { claimed: 0, sent: 0, failed: 0, deferred: true }
  const claimId = randomUUID()
  const claimed = await admin.rpc("claim_solo_player_emails", { p_claim_id: claimId, p_limit: options.limit ?? 10 })
  if (claimed.error) throw claimed.error
  const leases = (claimed.data || []) as EmailLease[]
  const counts = { claimed: leases.length, sent: 0, failed: 0, skipped: 0, deferred: false }
  // Bound concurrency to avoid flooding provider quotas. Leases outlive this batch.
  let index = 0
  const deliver = options.deliver || sendTransactionalEmail
  const run = async (): Promise<void> => {
    while (index < leases.length) {
      const notification = leases[index++]
      let sent = false
      let failure = "DELIVERY_FAILED"
      try {
        const recipient = await admin.auth.admin.getUserById(notification.recipient_user_id)
        if (recipient.error) throw recipient.error
        if (!receivesSoloEmails(recipient.data.user?.user_metadata)) {
          const skipped = await admin.rpc("finish_solo_player_email", { p_notification_id: notification.id, p_claim_id: claimId, p_success: false, p_error: "EMAIL_DISABLED" })
          if (skipped.error) throw skipped.error
          if (skipped.data === true) counts.skipped++
          continue
        }
        let context: EmailContext | undefined
        if (notification.event_type === "PLAYER_SEARCHING") {
          const searches = await loadSearchNotificationContexts(admin, notification.post_id ? [notification.post_id] : [])
          const search = searches.get(notification.post_id || "")
          if (!search) throw new Error("Search unavailable")
          context = { search, manager: true, tournamentName: search.tournamentName, tournamentId: search.tournamentId, category: search.category }
        } else if (notification.request_id) {
          context = await loadEmailContext(admin, notification.request_id, notification.recipient_user_id)
        }
        const prepared = await admin.rpc("prepare_solo_player_email", { p_notification_id: notification.id, p_claim_id: claimId,
          p_tenant: getTenantBranding().key, p_content: buildSoloEmail(notification, context) })
        if (prepared.error) throw prepared.error
        const email = prepared.data as FrozenEmail
        const result = await deliver({ ...email, idempotencyKey: `solo-notification/${notification.id}`, signal: AbortSignal.timeout(10_000) })
        sent = result.success && !result.skipped
        if (result.success && result.skipped) failure = "EMAIL_NOT_CONFIGURED_OR_DISABLED"
      } catch { failure = "DELIVERY_EXCEPTION" }
      const finished = await admin.rpc("finish_solo_player_email", { p_notification_id: notification.id, p_claim_id: claimId, p_success: sent, p_error: sent ? null : failure })
      if (finished.error) throw finished.error
      // A stale worker must not overwrite a reclaimed lease or report it as delivered.
      if (finished.data === true) { if (sent) counts.sent++; else counts.failed++ }
    }
  }
  const results = await Promise.allSettled([run(), run()])
  const rejected = results.find(result => result.status === "rejected")
  if (rejected?.status === "rejected") throw rejected.reason
  return counts
}
