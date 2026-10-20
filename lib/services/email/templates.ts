export type EmailTemplate = {
  subject: string
  html: string
  text: string
}

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")

export const formatPlayerName = (player: { first_name?: string | null; last_name?: string | null } | null) =>
  [player?.first_name, player?.last_name].filter(Boolean).join(" ").trim() || "Jugador"

export const formatCoupleName = (
  player1: { first_name?: string | null; last_name?: string | null } | null,
  player2: { first_name?: string | null; last_name?: string | null } | null,
) => `${formatPlayerName(player1)} / ${formatPlayerName(player2)}`

const ARGENTINA_TIMEZONE = "America/Argentina/Buenos_Aires"

export const formatDate = (value: string | null | undefined) => {
  if (!value) return "A confirmar"

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date)
}

export const formatTournamentDateTime = (value: string | null | undefined) => {
  if (!value) return "A confirmar"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ARGENTINA_TIMEZONE,
  }).format(date)
}

export const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "A confirmar"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ARGENTINA_TIMEZONE,
  }).format(date)
}

export const formatTimeRange = (start: string | null | undefined, end: string | null | undefined) => {
  if (!start && !end) return "A confirmar"
  if (start && end) return `${start.slice(0, 5)} a ${end.slice(0, 5)}`
  return (start || end || "").slice(0, 5)
}

export const buildAppUrl = (path: string) => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000"
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, "")
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${normalizedSiteUrl}${normalizedPath}`
}

export const renderEmailLayout = ({
  title,
  preview,
  body,
  cta,
  footer,
}: {
  title: string
  preview: string
  body: string
  cta?: { label: string; href: string }
  footer?: string
}) => {
  const safeTitle = escapeHtml(title)
  const safePreview = escapeHtml(preview)

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;background:#f6f7fb;color:#111827;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;">${safePreview}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background:#0a1224;color:#ffffff;padding:28px 32px;">
                <p style="margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b8d7ff;">${escapeHtml(process.env.NEXT_PUBLIC_TENANT_KEY || "padel")}</p>
                <h1 style="margin:0;font-size:26px;line-height:1.2;">${safeTitle}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;font-size:16px;line-height:1.6;color:#1f2937;">
                ${body}
                ${
                  cta
                    ? `<p style="margin:28px 0 0;"><a href="${escapeHtml(cta.href)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">${escapeHtml(cta.label)}</a></p>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f9fafb;color:#6b7280;font-size:13px;line-height:1.5;">
                ${escapeHtml(footer || "Recibis este email porque participas en un torneo gestionado desde la plataforma.")}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export const detailsList = (items: Array<{ label: string; value: string | number | null | undefined }>) => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
    ${items
      .map(
        (item) => `
          <tr>
            <td style="width:38%;padding:12px 14px;background:#f9fafb;color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.label)}</td>
            <td style="padding:12px 14px;color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;font-weight:600;">${escapeHtml(item.value || "A confirmar")}</td>
          </tr>
        `,
      )
      .join("")}
  </table>
`

export { escapeHtml }
