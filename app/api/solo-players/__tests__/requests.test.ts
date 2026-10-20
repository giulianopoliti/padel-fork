jest.mock("server-only", () => ({}))
jest.mock("next/server", () => ({ ...jest.requireActual("next/server"), after: jest.fn() }))
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }))
jest.mock("@/lib/solo-players/server", () => ({ getSoloProfile: jest.fn() }))
jest.mock("@/lib/solo-players/requests", () => ({ SOLO_REQUEST_COLUMNS: "id", loadSoloRequests: jest.fn() }))
jest.mock("@/lib/services/registration", () => ({ getRegistrationService: () => ({ acceptTournamentRequest: accept }) }))

import { NextRequest, after } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getSoloProfile } from "@/lib/solo-players/server"
import { loadSoloRequests } from "@/lib/solo-players/requests"
import { GET, POST, PATCH } from "../requests/route"
const id = "650e8400-e29b-41d4-a716-446655440000"
const rpc = jest.fn(), accept = jest.fn(), auth = jest.fn()
let selected: Record<string, unknown> | null
const req = (body?: unknown, origin = "http://localhost:3043") => new NextRequest("http://localhost:3043/api/solo-players/requests", { method: body ? "POST" : "GET", headers: { origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW = "true"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:8011"
  process.env.NEXT_PUBLIC_TENANT_KEY = "padel-fv"
  selected = { id, tournament_id: null, recipient_user_id: "account", effective_status: "PENDING" }
  auth.mockResolvedValue({ data: { user: { id: "account" } }, error: null })
  rpc.mockResolvedValue({ data: { id, status: "PENDING", phone: "PRIVATE" }, error: null })
  const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn(async () => ({ data: selected, error: null })) }
  ;(createClient as jest.Mock).mockResolvedValue({ auth: { getUser: auth }, rpc, from: () => chain })
  ;(getSoloProfile as jest.Mock).mockResolvedValue({ id: "own-profile" })
  ;(loadSoloRequests as jest.Mock).mockResolvedValue({ requests: [], userId: "account" })
  accept.mockResolvedValue({ success: true, inscriptionId: "registration", paymentRequired: true, inscription: { payment_method: "TRANSFER", payment_proof_path: null } })
})
const input = { postId: id, phone: "+5491123456789", contactAccepted: true, termsAccepted: false }
describe("request actions", () => {
  it("blocks access to an unrelated production project", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://unrelated.supabase.co"
    expect((await POST(req(input))).status).toBe(404)
    expect(createClient).not.toHaveBeenCalled()
  })
  it("requires authentication and same-origin requests", async () => {
    expect((await POST(req(input, "https://attacker.invalid"))).status).toBe(403)
    auth.mockResolvedValue({ data: { user: null }, error: null })
    expect((await POST(req(input))).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })
  it("uses session identity and normalized phone for a general request", async () => {
    const response = await POST(req({ ...input, senderPlayerId: "victim" }))
    expect(response.status).toBe(201)
    expect(rpc).toHaveBeenCalledWith("send_solo_player_request", expect.objectContaining({ p_sender_player_id: "own-profile", p_tournament_terms_version: null }))
    expect(await response.json()).toEqual({ request: { id, status: "PENDING" } })
    expect(after).toHaveBeenCalled()
  })
  it("saves the form's game preferences atomically without editing the profile", async () => {
    expect((await POST(req({ ...input, side: "REVES", hand: "LEFT" }))).status).toBe(201)
    expect(rpc).toHaveBeenCalledWith("send_solo_player_request_with_preferences", expect.objectContaining({ p_sender_player_id: "own-profile", p_preferred_side: "REVES", p_preferred_hand: "LEFT" }))
  })
  it("rejects partially supplied game preferences", async () => {
    expect((await POST(req({ ...input, side: "REVES" }))).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
  it("requires current tournament terms when sending", async () => {
    selected = { id, tournament_id: id }
    expect((await POST(req(input))).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
  it("does not pretend an expired general request was accepted", async () => {
    rpc.mockResolvedValue({ data: { id, status: "EXPIRED" }, error: null })
    const response = await PATCH(req({ requestId: id, action: "ACCEPT" }))
    expect(await response.json()).toEqual({ request: { id, status: "EXPIRED" } })
    expect(accept).not.toHaveBeenCalled()
  })
  it("routes competitive acceptance through the atomic registration service and returns payment continuation", async () => {
    selected = { id, tournament_id: id, recipient_user_id: "account" }
    const response = await PATCH(req({ requestId: id, action: "ACCEPT", termsAccepted: true, paymentMethod: "TRANSFER" }))
    expect(accept).toHaveBeenCalledWith(id, { termsAccepted: true, paymentMethod: "TRANSFER" })
    expect(await response.json()).toMatchObject({ inscriptionId: "registration", paymentRequired: true, request: { status: "ACCEPTED" } })
    expect(rpc).not.toHaveBeenCalled()
  })
  it("does not let the sender impersonate the recipient", async () => {
    selected = { id, tournament_id: id, recipient_user_id: "other" }
    expect((await PATCH(req({ requestId: id, action: "ACCEPT", termsAccepted: true }))).status).toBe(403)
    expect(accept).not.toHaveBeenCalled()
  })
  it("reports full capacity without claiming a pair was created", async () => {
    selected = { id, tournament_id: id, recipient_user_id: "account" }
    accept.mockResolvedValue({ success: false, error: "Cupos llenos" })
    const response = await PATCH(req({ requestId: id, action: "ACCEPT", termsAccepted: true }))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: "Cupos llenos" })
    expect(after).not.toHaveBeenCalled()
  })
  it.each(["REJECT", "WITHDRAW", "INVALIDATE"])("delegates %s to the role-checked RPC", async action => {
    await PATCH(req({ requestId: id, action }))
    expect(rpc).toHaveBeenCalledWith("resolve_solo_player_request", { p_request_id: id, p_action: action })
  })
  it("lists effective statuses so expired entries are excluded from active requests", async () => {
    expect((await GET(req())).status).toBe(200)
    expect(loadSoloRequests).toHaveBeenCalledWith(expect.anything(), "account", false, 0, undefined)
  })
})
