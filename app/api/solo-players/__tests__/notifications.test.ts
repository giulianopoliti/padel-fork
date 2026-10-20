jest.mock("server-only", () => ({}))
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }))
jest.mock("@/lib/solo-players/email-worker", () => ({ processSoloPlayerNotifications: jest.fn() }))
jest.mock("@/lib/solo-players/requests", () => ({ loadSoloRequests: jest.fn() }))
import { NextRequest } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { GET, PATCH } from "../notifications/route"
import { GET as CRON } from "@/app/api/cron/solo-players/route"
import { processSoloPlayerNotifications } from "@/lib/solo-players/email-worker"
import { loadSoloRequests } from "@/lib/solo-players/requests"

const id = "650e8400-e29b-41d4-a716-446655440000"
const rpc = jest.fn(), eq = jest.fn(), auth = jest.fn()
const request = (body?: unknown) => new NextRequest("http://localhost:3043/api/solo-players/notifications", { method: body ? "PATCH" : "GET", headers: { origin: "http://localhost:3043", "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW = "true"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:8011"
  process.env.CRON_SECRET = "local-test-secret"
  auth.mockResolvedValue({ data: { user: { id: "own-account" } }, error: null })
  eq.mockReturnThis()
  const row = { id, request_id: id, event_type: "REQUEST_RECEIVED", read_at: null, created_at: "2026-10-16T00:00:00Z", email_claim_id: "PRIVATE", email_last_error: "PRIVATE" }
  const from = () => ({ select: jest.fn().mockReturnThis(), eq, is: jest.fn(async () => ({ count: 31, error: null })), order: jest.fn().mockReturnThis(), range: jest.fn().mockReturnThis(), returns: jest.fn(async () => ({ data: [row], error: null })) })
  ;(createClient as jest.Mock).mockResolvedValue({ auth: { getUser: auth }, from, rpc })
  rpc.mockResolvedValue({ data: { ...row, read_at: "2026-10-16T01:00:00Z" }, error: null })
  ;(processSoloPlayerNotifications as jest.Mock).mockResolvedValue({ sent: 0, deferred: true })
  ;(loadSoloRequests as jest.Mock).mockResolvedValue({ requests: [{ id, sender_user_id: "sender", sender_player_id: "sender-player", recipient_player_id: "recipient-player", senderName: "María", recipientName: "Ana", tournamentName: "Copa 9na", tournamentType: "AMERICAN", category: "9na" }] })
})
describe("notification inbox and shared sweep", () => {
  it("counts all own unread notifications rather than the page length", async () => {
    const response = await GET(request())
    const data = await response.json()
    expect(data.unreadCount).toBe(31)
    expect(data.notifications).toHaveLength(1)
    expect(data.notifications[0].title).toContain("Nueva solicitud de pareja · torneo Copa 9na · Americano · categoría 9na")
    expect(data.notifications[0].playerId).toBe("sender-player")
    expect(eq).toHaveBeenCalledWith("recipient_user_id", "own-account")
    expect(JSON.stringify(data)).not.toContain("PRIVATE")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  })
  it("marks only through the ownership-checked RPC and strips email internals", async () => {
    const response = await PATCH(request({ notificationId: id }))
    expect(rpc).toHaveBeenCalledWith("mark_solo_player_notification_read", { p_notification_id: id })
    expect(JSON.stringify(await response.json())).not.toContain("PRIVATE")
  })
  it("denies marking someone else's notification", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } })
    expect((await PATCH(request({ notificationId: id }))).status).toBe(403)
  })
  it("does not query without a verified user", async () => {
    auth.mockResolvedValue({ data: { user: null }, error: null })
    expect((await GET(request())).status).toBe(401)
    expect(eq).not.toHaveBeenCalled()
  })
  it("requires a configured cron secret and exact bearer authentication", async () => {
    expect((await CRON(new NextRequest("http://localhost:3043/api/cron/solo-players"))).status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await CRON(new NextRequest("http://localhost:3043/api/cron/solo-players", { headers: { authorization: "Bearer undefined" } }))).status).toBe(401)
    expect(processSoloPlayerNotifications).not.toHaveBeenCalled()
  })
  it("skips a disabled release before touching the worker", async () => {
    process.env.NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW = "false"
    const response = await CRON(new NextRequest("http://localhost:3043/api/cron/solo-players", { headers: { authorization: "Bearer local-test-secret" } }))
    expect(await response.json()).toMatchObject({ skipped: true })
    expect(processSoloPlayerNotifications).not.toHaveBeenCalled()
  })
  it("runs one sweep for cleanup and delivery", async () => {
    const response = await CRON(new NextRequest("http://localhost:3043/api/cron/solo-players", { headers: { authorization: "Bearer local-test-secret" } }))
    expect(response.status).toBe(200)
    expect(processSoloPlayerNotifications).toHaveBeenCalledTimes(1)
  })
})
