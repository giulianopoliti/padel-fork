import {
  buildAppUrl,
  detailsList,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatTimeRange,
  formatTournamentDateTime,
  renderEmailLayout,
} from "@/lib/services/email/templates"
import { sendSafely } from "@/lib/services/email/notification-utils"
import type { TournamentMessageAdapter, TournamentMessageEvent, TournamentMessageResult } from "./types"
import {
  isTournamentMessagesEnabled,
  loadCancelledInscriptionMessageData,
  loadInscriptionMessageData,
  loadLongMatchMessageData,
} from "./tournament-message-data"

const skipped = (reason: string): TournamentMessageResult => ({ success: true, skipped: true, reason })

const getLocationDetails = (clubLocation: {
  name: string | null
  address: string | null
  formattedAddress: string | null
} | null) => [
  { label: "Club", value: clubLocation?.name || null },
  { label: "Direccion", value: clubLocation?.formattedAddress || clubLocation?.address || null },
]

const renderDirectionsLink = (mapsUrl: string | null | undefined) =>
  mapsUrl
    ? `<p style="margin:18px 0 0;"><a href="${escapeHtml(mapsUrl)}" style="display:inline-block;color:#1d4ed8;text-decoration:none;font-weight:700;">Como llegar</a></p>`
    : ""

const renderLocationText = (clubLocation: {
  name: string | null
  address: string | null
  formattedAddress: string | null
  mapsUrl: string | null
} | null) => {
  if (!clubLocation) return ""

  const lines = [
    clubLocation.name ? `Club: ${clubLocation.name}` : null,
    clubLocation.formattedAddress || clubLocation.address
      ? `Direccion: ${clubLocation.formattedAddress || clubLocation.address}`
      : null,
    clubLocation.mapsUrl ? `Como llegar: ${clubLocation.mapsUrl}` : null,
  ].filter(Boolean)

  return lines.length > 0 ? `\n${lines.join("\n")}` : ""
}

const sendInscriptionSubmittedAdmin = async (event: Extract<TournamentMessageEvent, { type: "INSCRIPTION_SUBMITTED_ADMIN" }>) => {
  const data = await loadInscriptionMessageData(event.supabase, event.inscriptionId, {
    includeCurrentInscriptions: true,
  })
  if (!data) return skipped("missing inscription data")
  if (!isTournamentMessagesEnabled(data.tournament)) return skipped("messages disabled")
  if (data.adminEmails.length === 0) return skipped("no admin recipients")

  const tournamentUrl = buildAppUrl(`/tournaments/${data.tournament.id}/inscriptions`)
  const statusLabel = data.inscription.is_pending ? "Pendiente de revision" : "Confirmada"
  const tournamentStartLabel = formatTournamentDateTime(data.tournament.start_date)
  const currentInscriptionsLabel =
    typeof data.currentInscriptions === "number" ? String(data.currentInscriptions) : "A confirmar"

  return sendSafely(
    {
      to: data.adminEmails,
      subject: `Nueva inscripcion: ${data.tournament.name} - ${tournamentStartLabel} - ${currentInscriptionsLabel} inscriptos`,
      html: renderEmailLayout({
        title: "Nueva inscripcion",
        preview: `${data.participantName} - ${data.tournament.name} - ${tournamentStartLabel}`,
        body: `
          <p style="margin:0 0 14px;">Se registro una nueva inscripcion en el torneo.</p>
          ${detailsList([
            { label: "Torneo", value: data.tournament.name },
            { label: "Inicio del torneo", value: tournamentStartLabel },
            { label: "Inscriptos actuales", value: currentInscriptionsLabel },
            { label: "Pareja/Jugador", value: data.participantName },
            { label: "Formato", value: data.tournament.type },
            { label: "Categoria", value: data.tournament.category_name },
            { label: "Estado", value: statusLabel },
            { label: "Fecha de alta", value: formatDateTime(data.inscription.created_at) },
            ...getLocationDetails(data.clubLocation),
          ])}
          ${renderDirectionsLink(data.clubLocation?.mapsUrl)}
        `,
        cta: { label: "Ver inscripciones", href: tournamentUrl },
      }),
      text: `Nueva inscripcion\nTorneo: ${data.tournament.name}\nInicio del torneo: ${tournamentStartLabel}\nInscriptos actuales: ${currentInscriptionsLabel}\nPareja/Jugador: ${data.participantName}\nEstado: ${statusLabel}${renderLocationText(data.clubLocation)}\n${tournamentUrl}`,
      idempotencyKey: `message-inscription-submitted-admin-${data.inscription.id}`,
      tags: [
        { name: "type", value: "inscription_submitted_admin" },
        { name: "tenant", value: process.env.NEXT_PUBLIC_TENANT_KEY || "unknown" },
      ],
    },
    "message inscription submitted admin",
  )
}

const sendInscriptionApprovedPlayer = async (event: Extract<TournamentMessageEvent, { type: "INSCRIPTION_APPROVED_PLAYER" }>) => {
  const data = await loadInscriptionMessageData(event.supabase, event.inscriptionId)
  if (!data) return skipped("missing inscription data")
  if (!isTournamentMessagesEnabled(data.tournament)) return skipped("messages disabled")
  if (data.inscription.is_pending) return skipped("inscription still pending")
  if (data.playerEmails.length === 0) return skipped("no player recipients")

  const tournamentUrl = buildAppUrl(`/tournaments/${data.tournament.id}`)
  const title = "Inscripcion confirmada"

  return sendSafely(
    {
      to: data.playerEmails,
      subject: `${title}: ${data.tournament.name}`,
      html: renderEmailLayout({
        title,
        preview: `${escapeHtml(data.tournament.name)} - Confirmada`,
        body: `
          <p style="margin:0 0 14px;">Hola,</p>
          <p style="margin:0 0 14px;">Tu inscripcion quedo confirmada correctamente.</p>
          ${detailsList([
            { label: "Torneo", value: data.tournament.name },
            { label: "Pareja/Jugador", value: data.participantName },
            { label: "Formato", value: data.tournament.type },
            { label: "Categoria", value: data.tournament.category_name },
            { label: "Inicio", value: formatTournamentDateTime(data.tournament.start_date) },
            { label: "Estado", value: "Confirmada" },
            ...getLocationDetails(data.clubLocation),
          ])}
          ${renderDirectionsLink(data.clubLocation?.mapsUrl)}
        `,
        cta: { label: "Ver torneo", href: tournamentUrl },
      }),
      text: `${title}\nTorneo: ${data.tournament.name}\nPareja/Jugador: ${data.participantName}\nEstado: Confirmada${renderLocationText(data.clubLocation)}\n${tournamentUrl}`,
      idempotencyKey: `message-inscription-approved-player-${data.inscription.id}`,
      tags: [
        { name: "type", value: "inscription_approved_player" },
        { name: "tenant", value: process.env.NEXT_PUBLIC_TENANT_KEY || "unknown" },
      ],
    },
    "message inscription approved player",
  )
}

const sendInscriptionCancelledAdmin = async (event: Extract<TournamentMessageEvent, { type: "INSCRIPTION_CANCELLED_ADMIN" }>) => {
  const data = await loadCancelledInscriptionMessageData({
    fallbackSupabase: event.supabase,
    tournamentId: event.tournamentId,
    inscriptionId: event.inscriptionId,
    coupleId: event.coupleId,
    playerId: event.playerId,
  })
  if (!data) return skipped("missing cancellation data")
  if (!isTournamentMessagesEnabled(data.tournament)) return skipped("messages disabled")
  if (data.adminEmails.length === 0) return skipped("no admin recipients")

  const tournamentUrl = buildAppUrl(`/tournaments/${data.tournament.id}/inscriptions`)

  return sendSafely(
    {
      to: data.adminEmails,
      subject: `Inscripcion cancelada: ${data.tournament.name}`,
      html: renderEmailLayout({
        title: "Inscripcion cancelada",
        preview: `${data.participantName} - ${data.tournament.name}`,
        body: `
          <p style="margin:0 0 14px;">Se cancelo o elimino una inscripcion del torneo.</p>
          ${detailsList([
            { label: "Torneo", value: data.tournament.name },
            { label: "Pareja/Jugador", value: data.participantName },
            { label: "Formato", value: data.tournament.type },
            { label: "Categoria", value: data.tournament.category_name },
            ...getLocationDetails(data.clubLocation),
          ])}
          ${renderDirectionsLink(data.clubLocation?.mapsUrl)}
        `,
        cta: { label: "Ver inscripciones", href: tournamentUrl },
      }),
      text: `Inscripcion cancelada\nTorneo: ${data.tournament.name}\nPareja/Jugador: ${data.participantName}${renderLocationText(data.clubLocation)}\n${tournamentUrl}`,
      idempotencyKey: `message-inscription-cancelled-admin-${data.tournament.id}-${event.inscriptionId || event.coupleId || event.playerId || Date.now()}`,
      tags: [
        { name: "type", value: "inscription_cancelled_admin" },
        { name: "tenant", value: process.env.NEXT_PUBLIC_TENANT_KEY || "unknown" },
      ],
    },
    "message inscription cancelled admin",
  )
}

const sendLongMatchConfirmedPlayer = async (event: Extract<TournamentMessageEvent, { type: "LONG_MATCH_CONFIRMED_PLAYER" }>) => {
  const data = await loadLongMatchMessageData(event.supabase, event.matchId)
  if (!data) return skipped("missing match data")
  if (!isTournamentMessagesEnabled(data.tournament)) return skipped("messages disabled")
  if (data.tournament.type !== "LONG") return skipped("not a LONG tournament")
  if (data.match.status === "DRAFT") return skipped("match is draft")
  if (!data.fechaMatch.scheduled_date || !data.fechaMatch.scheduled_start_time) return skipped("schedule incomplete")
  if (data.playerEmails.length === 0) return skipped("no player recipients")

  const title = "Nuevo partido programado"
  const tournamentUrl = buildAppUrl(`/tournaments/${data.tournament.id}/match-scheduling`)
  const scheduleSummary = `${formatDate(data.fechaMatch.scheduled_date)} - ${formatTimeRange(
    data.fechaMatch.scheduled_start_time,
    data.fechaMatch.scheduled_end_time,
  )}`

  return sendSafely(
    {
      to: data.playerEmails,
      subject: `${title}: ${data.tournament.name}`,
      html: renderEmailLayout({
        title,
        preview: `${data.tournament.name} - ${scheduleSummary}`,
        body: `
          <p style="margin:0 0 14px;">Hola,</p>
          <p style="margin:0 0 14px;">Se programo un nuevo partido para tu torneo.</p>
          ${detailsList([
            { label: "Torneo", value: data.tournament.name },
            { label: "Partido", value: data.matchSummary },
            { label: "Fecha", value: formatDate(data.fechaMatch.scheduled_date) },
            { label: "Horario", value: formatTimeRange(data.fechaMatch.scheduled_start_time, data.fechaMatch.scheduled_end_time) },
            { label: "Cancha", value: data.fechaMatch.court_assignment },
            { label: "Categoria", value: data.tournament.category_name },
            ...getLocationDetails(data.clubLocation),
          ])}
          ${renderDirectionsLink(data.clubLocation?.mapsUrl)}
        `,
        cta: { label: "Ver partido", href: tournamentUrl },
      }),
      text: `${title}\nTorneo: ${data.tournament.name}\nPartido: ${data.matchSummary}\nFecha: ${scheduleSummary}${renderLocationText(data.clubLocation)}\n${tournamentUrl}`,
      idempotencyKey: `message-long-match-confirmed-player-${data.match.id}-${data.fechaMatch.scheduled_date}-${data.fechaMatch.scheduled_start_time}`,
      tags: [
        { name: "type", value: "long_match_confirmed_player" },
        { name: "tenant", value: process.env.NEXT_PUBLIC_TENANT_KEY || "unknown" },
      ],
    },
    "message long match confirmed player",
  )
}

export const emailMessageAdapter: TournamentMessageAdapter = {
  channel: "email",
  send: async (event) => {
    switch (event.type) {
      case "INSCRIPTION_SUBMITTED_ADMIN":
        return sendInscriptionSubmittedAdmin(event)
      case "INSCRIPTION_APPROVED_PLAYER":
        return sendInscriptionApprovedPlayer(event)
      case "INSCRIPTION_CANCELLED_ADMIN":
        return sendInscriptionCancelledAdmin(event)
      case "LONG_MATCH_CONFIRMED_PLAYER":
        return sendLongMatchConfirmedPlayer(event)
      default:
        return skipped("unsupported event")
    }
  },
}
