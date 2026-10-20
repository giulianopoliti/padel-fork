type SendEmailInput = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  idempotencyKey?: string
  tags?: Array<{ name: string; value: string }>
  signal?: AbortSignal
}

export type SendEmailResult =
  | { success: true; id: string | null; skipped?: false }
  | { success: true; id: null; skipped: true; reason: string }
  | { success: false; error: string }

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails"

const isEmailEnabled = () => process.env.EMAIL_ENABLED !== "false"

const normalizeRecipients = (to: string | string[]) => {
  const recipients = Array.isArray(to) ? to : [to]
  return recipients
    .map((recipient) => recipient.trim())
    .filter((recipient, index, self) => recipient.includes("@") && self.indexOf(recipient) === index)
}

export const sendTransactionalEmail = async (input: SendEmailInput): Promise<SendEmailResult> => {
  if (!isEmailEnabled()) {
    return { success: true, id: null, skipped: true, reason: "EMAIL_ENABLED=false" }
  }

  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.EMAIL_FROM?.trim()
  const replyTo = process.env.EMAIL_REPLY_TO?.trim()
  const recipients = normalizeRecipients(input.to)

  if (!apiKey || !from) {
    return { success: true, id: null, skipped: true, reason: "Missing RESEND_API_KEY or EMAIL_FROM" }
  }

  if (recipients.length === 0) {
    return { success: true, id: null, skipped: true, reason: "No email recipients" }
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    }

    if (input.idempotencyKey) {
      headers["Idempotency-Key"] = input.idempotencyKey
    }

    const response = await fetch(RESEND_EMAIL_ENDPOINT, {
      method: "POST",
      signal: input.signal,
      headers,
      body: JSON.stringify({
        from,
        to: recipients,
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: replyTo || undefined,
        tags: input.tags,
      }),
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      const message = payload?.message || payload?.error || `Resend responded with ${response.status}`
      return { success: false, error: message }
    }

    return { success: true, id: payload?.id || null }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected email error",
    }
  }
}
