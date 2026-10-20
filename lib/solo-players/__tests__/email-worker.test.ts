jest.mock("@/lib/solo-players/search-notifications", () => ({ loadSearchNotificationContexts: jest.fn() }))
import { loadSearchNotificationContexts } from "../search-notifications"
jest.mock("server-only", () => ({}))
jest.mock("@/utils/supabase/server", () => ({ createClientServiceRole: jest.fn() }))
jest.mock("@/lib/services/email/resend-client", () => ({ sendTransactionalEmail: jest.fn() }))
import { createClientServiceRole } from "@/utils/supabase/server"
import { sendTransactionalEmail } from "@/lib/services/email/resend-client"
import { buildSoloEmail, processSoloPlayerNotifications } from "../email-worker"

const rpc = jest.fn()
const deliver = jest.fn()
const getUserById = jest.fn()
const auth = { admin: { getUserById } }
const event = { id: "notification", recipient_user_id: "recipient", request_id: "request", event_type: "REQUEST_RECEIVED", email_claim_id: "claim" }
beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.SOLO_PLAYERS_EMAIL_DELIVERY
  getUserById.mockResolvedValue({ data: { user: { user_metadata: {} } }, error: null })
  ;(createClientServiceRole as jest.Mock).mockResolvedValue({ auth, rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) })
  deliver.mockResolvedValue({ success: true, id: "sent" })
  rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "get_solo_player_expiry_scopes" ? [{ tournament_id: null }] : name === "claim_solo_player_emails" ? [event] : name === "prepare_solo_player_email" ? { to: "recipient@example.invalid", subject: "Frozen", html: "Frozen", text: "Frozen" } : true }))
})

describe("persistent solo player delivery", () => {
  it("includes tournament and category context in the email subject and escapes HTML", () => {
    const email = buildSoloEmail({ event_type: "REQUEST_RECEIVED", request_id: "request" }, { tournamentName: "Copa <9na>", tournamentType: "AMERICAN", category: "9na" })
    expect(email.subject).toContain("Nueva solicitud de pareja · torneo Copa <9na> · Americano · categoría 9na")
    expect(email.html).toContain("Copa &lt;9na&gt;")
    expect(email.html).not.toContain("Copa <9na>")
  })
  it("does not send real emails by default in a development checkout", async () => {
    expect(await processSoloPlayerNotifications()).toMatchObject({ deferred: true, claimed: 0 })
    expect(sendTransactionalEmail).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith("claim_solo_player_emails", expect.anything())
    expect(rpc).toHaveBeenCalledWith("expire_solo_player_scope", { p_tournament_id: null })
  })
  it("uses frozen content and a stable idempotency key", async () => {
    const result = await processSoloPlayerNotifications({ deliver })
    expect(result).toMatchObject({ sent: 1, failed: 0 })
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ subject: "Frozen", idempotencyKey: "solo-notification/notification", to: "recipient@example.invalid" }))
    expect(rpc).toHaveBeenCalledWith("finish_solo_player_email", expect.objectContaining({ p_success: true, p_error: null }))
  })
  it("loads only sports context before freezing a contextual email", async () => {
    const rows: Record<string, object> = { solo_player_requests: { post_id: "post", tournament_id: "tournament" }, solo_player_posts: { category_name: "9na" }, tournaments: { name: "Copa 9na", type: "AMERICAN" } }
    ;(createClientServiceRole as jest.Mock).mockResolvedValue({ auth, rpc, from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[table], error: null }) }) }) }) })
    expect(await processSoloPlayerNotifications({ deliver })).toMatchObject({ sent: 1 })
    expect(rpc).toHaveBeenCalledWith("prepare_solo_player_email", expect.objectContaining({ p_content: expect.objectContaining({ subject: expect.stringContaining("torneo Copa 9na · Americano · categoría 9na") }) }))
  })
  it.each([
    { success: false, error: "Provider down" },
    { success: true, skipped: true, id: null, reason: "Missing configuration" },
  ])("keeps the inbox event retryable on failure or skipped delivery: %j", async response => {
    deliver.mockResolvedValue(response)
    expect(await processSoloPlayerNotifications({ deliver })).toMatchObject({ sent: 0, failed: 1 })
    expect(rpc).toHaveBeenCalledWith("finish_solo_player_email", expect.objectContaining({ p_success: false }))
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain("resolve_solo_player_request")
  })
  it("honors disabled emails without sending, retrying or marking an email as sent", async () => {
    getUserById.mockResolvedValue({ data: { user: { user_metadata: { solo_player_emails: false } } }, error: null })
    expect(await processSoloPlayerNotifications({ deliver })).toMatchObject({ sent: 0, failed: 0, skipped: 1 })
    expect(deliver).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith("prepare_solo_player_email", expect.anything())
    expect(rpc).toHaveBeenCalledWith("finish_solo_player_email", expect.objectContaining({ p_success: false, p_error: "EMAIL_DISABLED" }))
  })
  it("gives organizers the pair, tournament and management link", () => {
    const email = buildSoloEmail({ request_id: "request", event_type: "REQUEST_ACCEPTED" }, { manager: true, tournamentId: "tournament", tournamentName: "Copa", category: "9na", senderName: "Ana", recipientName: "Eva" })
    expect(email.subject).toContain("Se ha formado una pareja · Copa")
    expect(email.text).toContain("Ana y Eva")
    expect(email.text).toContain("/tournaments/tournament/inscriptions")
    expect(email.text).not.toContain("seña")
  })
  it("handles a thrown provider failure without losing the lease result", async () => {
    deliver.mockRejectedValue(new Error("network failure"))
    expect(await processSoloPlayerNotifications({ deliver })).toMatchObject({ failed: 1 })
    expect(rpc).toHaveBeenCalledWith("finish_solo_player_email", expect.objectContaining({ p_error: "DELIVERY_EXCEPTION" }))
  })
  it("does not report delivery when another worker already reclaimed its lease", async () => {
    const normal = rpc.getMockImplementation()!
    rpc.mockImplementation((name: string, ...args: unknown[]) => name === "finish_solo_player_email" ? Promise.resolve({ data: false, error: null }) : normal(name, ...args))
    expect(await processSoloPlayerNotifications({ deliver })).toMatchObject({ sent: 0, failed: 0 })
  })
  it.each(["padel-fv", "padel-elite"])("renders tenant %s without contact details or a false registration confirmation", tenant => {
    process.env.NEXT_PUBLIC_TENANT_KEY = tenant
    const email = buildSoloEmail({ request_id: "request", event_type: "REQUEST_ACCEPTED" })
    expect(email.subject).toContain(tenant === "padel-fv" ? "Padel FV" : "TPE Padel")
    expect(email.html).toContain("completá los requisitos pendientes")
    expect(email.html).not.toContain("Inscripción confirmada")
    expect(email.text).toContain("/jugadores-sueltos?vista=solicitudes&solicitud=request")
    expect(email.html).not.toContain("recipient@example.invalid")
  })
})

it.each(["tournament", null])("delivers the search event with the right link: %s", async tournamentId => {
  const search = { postId: "post", tournamentId, tournamentName: tournamentId ? "Copa" : null, organizationName: "Circuito prueba", playerId: "player", playerName: "Ana", category: "9na", side: "DRIVE" as const, hand: "RIGHT" as const, status: "ACTIVE" as const, expiresAt: null }
  ;(loadSearchNotificationContexts as jest.Mock).mockResolvedValue(new Map([["post", search]]))
  const normal = rpc.getMockImplementation()!
  rpc.mockImplementation((name: string, ...args: unknown[]) => name === "claim_solo_player_emails" ? Promise.resolve({ data: [{ ...event, request_id: null, post_id: "post", event_type: "PLAYER_SEARCHING" }], error: null }) : normal(name, ...args))
  expect(await processSoloPlayerNotifications({ deliver })).toMatchObject({ sent: 1, failed: 0 })
  const content = rpc.mock.calls.find(([name]) => name === "prepare_solo_player_email")![1].p_content
  expect(content.subject).toContain("Ana busca pareja")
  expect(content.text).toContain(tournamentId ? "/jugadores-sueltos?torneo=tournament" : "/jugadores-sueltos")
  expect(content.text).not.toMatch(/solicitud=null|torneo=null/)
  expect(deliver).toHaveBeenCalledTimes(1)
})

it.each(["padel-fv", "padel-elite"])("uses the configured provider by default on production %s", async tenant => {
  const previous = { ...process.env }
  try {
    Object.assign(process.env, { NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_TENANT_KEY: tenant,
      NEXT_PUBLIC_SUPABASE_URL: `https://${tenant === "padel-fv" ? "bfmaqrythlwbfjuqumom" : "lzowflvgnspjdbvdxliy"}.supabase.co` })
    ;(sendTransactionalEmail as jest.Mock).mockResolvedValue({ success: true, id: "sent" })
    expect(await processSoloPlayerNotifications()).toMatchObject({ sent: 1, failed: 0 })
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1)
  } finally { process.env = previous }
})

it.each(["preview", "disabled"])("does not send automatically when delivery is %s", async mode => {
  const previous = { ...process.env }
  try {
    Object.assign(process.env, { NODE_ENV: "production", VERCEL_ENV: mode === "preview" ? "preview" : "production",
      NEXT_PUBLIC_TENANT_KEY: "padel-fv", NEXT_PUBLIC_SUPABASE_URL: "https://bfmaqrythlwbfjuqumom.supabase.co" })
    if (mode === "disabled") process.env.SOLO_PLAYERS_EMAIL_DELIVERY = "disabled"
    expect(await processSoloPlayerNotifications()).toMatchObject({ deferred: true, claimed: 0 })
    expect(sendTransactionalEmail).not.toHaveBeenCalled()
  } finally { process.env = previous }
})
