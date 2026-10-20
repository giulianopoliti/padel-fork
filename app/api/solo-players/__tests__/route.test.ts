jest.mock("server-only", () => ({}))
jest.mock("@/lib/solo-players/http", () => ({ scheduleSoloDelivery: jest.fn() }))
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }))
jest.mock("@/lib/solo-players/server", () => ({
  ...jest.requireActual("@/lib/solo-players/server"),
  getSoloProfile: jest.fn(), loadSoloDirectory: jest.fn(),
}))
jest.mock("@/lib/services/tenant-organization.service", () => ({ getTenantOrganization: jest.fn() }))

import { getTenantOrganization } from "@/lib/services/tenant-organization.service"
import { scheduleSoloDelivery } from "@/lib/solo-players/http"
import { NextRequest } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getSoloProfile, loadSoloDirectory, projectSoloRow, DIRECTORY_COLUMNS, OWN_POST_COLUMNS } from "@/lib/solo-players/server"
import { GET, POST, PATCH } from "../route"
import { GET as GET_CONTACT } from "../contact/route"

const postId = "650e8400-e29b-41d4-a716-446655440000"
const input = { tournamentId: null, category: "9na", side: "DRIVE", hand: "RIGHT", duration: "1_WEEK", phone: "+54 9 11 2345 6789", publicPhone: false, contactAccepted: true, termsAccepted: false }
const rpc = jest.fn()
const auth = jest.fn()
const request = (body: unknown, origin = "http://localhost:3000") => new NextRequest("http://localhost:3000/api/solo-players", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) })

beforeEach(() => {
  jest.clearAllMocks()
  ;(getTenantOrganization as jest.Mock).mockResolvedValue({ id: "circuit" })
  process.env.NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW = "true"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:8011"
  auth.mockResolvedValue({ data: { user: { id: "account" } }, error: null })
  ;(createClient as jest.Mock).mockResolvedValue({ auth: { getUser: auth }, rpc })
  ;(getSoloProfile as jest.Mock).mockResolvedValue({ id: "own-player" })
  rpc.mockResolvedValue({ data: { id: postId, phone: "SECRET", dni: "SECRET", email: "SECRET" }, error: null })
})

describe("solo player API", () => {
  it("does not touch auth or database while disabled", async () => {
    process.env.NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW = "false"
    expect((await GET()).status).toBe(404)
    expect((await POST(request(input))).status).toBe(404)
    expect((await PATCH(request({ postId, status: "WITHDRAWN" }))).status).toBe(404)
    expect(createClient).not.toHaveBeenCalled()
  })
  it("does not reach a mismatched production database", async () => {
    process.env.NEXT_PUBLIC_TENANT_KEY = "padel-fv"
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://lzowflvgnspjdbvdxliy.supabase.co"
    expect((await POST(request(input))).status).toBe(404)
    expect(createClient).not.toHaveBeenCalled()
  })
  it("requires verified authentication", async () => {
    auth.mockResolvedValue({ data: { user: null }, error: null })
    expect((await GET()).status).toBe(401)
    expect((await POST(request(input))).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })
  it("rejects cross-origin writes", async () => {
    expect((await POST(request(input, "https://other.example"))).status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })
  it("derives identity in server and never inserts inscriptions or changes ranking", async () => {
    const response = await POST(request({ ...input, playerId: "victim" }))
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith("save_solo_player_post_in_organization", expect.objectContaining({ p_player_id: "own-player", p_phone: "+5491123456789", p_public_phone: false, p_duration: "1_WEEK", p_tournament_id: null }))
    expect(JSON.stringify(await response.json())).not.toMatch(/SECRET|phone|dni|email/)
  })
  it("requires terms for tournament interest", async () => {
    expect((await POST(request({ ...input, tournamentId: postId }))).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
  it.each([["padel-fv", "solo-players-tournament-v1"], ["padel-elite", "2026-08-28"]])("records server terms for %s rather than a client version", async (tenant, version) => {
    process.env.NEXT_PUBLIC_TENANT_KEY = tenant
    const response = await POST(request({ ...input, tournamentId: postId, termsAccepted: true, termsVersion: "forged" }))
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith("save_solo_player_post_in_organization", expect.objectContaining({ p_tournament_terms_version: version, p_tournament_id: postId, p_duration: null }))
  })
  it("returns a recoverable conflict for a duplicate publication", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505" } })
    expect((await POST(request(input))).status).toBe(409)
  })
  it.each([
    ["El jugador ya tiene pareja en este torneo", "Ya tenés una inscripción en pareja en este torneo."],
    ['duplicate key value violates unique constraint "solo_player_posts_open_general_key"', "Ya tenés una búsqueda general activa o pausada."],
    ['duplicate key value violates unique constraint "solo_player_posts_open_tournament_key"', "Ya tenés una búsqueda activa o pausada para este torneo."],
  ])("distinguishes the publication conflict without exposing SQL: %s", async (message, expected) => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message } })
    const response = await POST(request(input))
    expect(response.status).toBe(409)
    const result = await response.json()
    expect(result.error).toContain(expected)
    expect(result.error).not.toMatch(/duplicate key|solo_player_posts_open/)
  })
  it("delegates withdrawal to the ownership-checked RPC", async () => {
    const response = await PATCH(request({ postId, status: "WITHDRAWN" }))
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith("set_solo_player_post_status", { p_post_id: postId, p_status: "WITHDRAWN" })
  })
  it("does not leak SQL details in authorization failures", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "internal private table details" } })
    const response = await PATCH(request({ postId, status: "PAUSED" }))
    expect(response.status).toBe(403)
    expect(JSON.stringify(await response.json())).not.toContain("internal")
  })
  it("disables shared caching on directory responses", async () => {
    ;(loadSoloDirectory as jest.Mock).mockResolvedValue({ directory: [] })
    expect((await GET()).headers.get("Cache-Control")).toBe("private, no-store")
  })
  it.each([DIRECTORY_COLUMNS, OWN_POST_COLUMNS])("strips private fields at response boundary %s", columns => {
    const row = projectSoloRow({ id: postId, phone: "private", dni: "private", email: "private", date_of_birth: "private", payment_proof_path: "private" }, columns)
    expect(JSON.stringify(row)).not.toContain("private")
  })
  it("does not expose a hidden contact denied by the database", async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    const response = await GET_CONTACT(new NextRequest(`http://localhost:3000/api/solo-players/contact?postId=${postId}`))
    expect(response.status).toBe(403)
    expect(await response.json()).not.toHaveProperty("phone")
  })
  it("returns only the explicitly authorized contact", async () => {
    rpc.mockResolvedValue({ data: [{ phone: "+5491123456789", email: "private" }], error: null })
    const response = await GET_CONTACT(new NextRequest(`http://localhost:3000/api/solo-players/contact?postId=${postId}`))
    expect(await response.json()).toEqual({ phone: "+5491123456789" })
  })
})

it("queues delivery for a general search and derives its circuit on the server", async () => {
  expect((await POST(request({ ...input, organizationId: "forged" }))).status).toBe(200)
  expect(rpc).toHaveBeenCalledWith("save_solo_player_post_in_organization", expect.objectContaining({ p_organization_id: "circuit" }))
  expect(scheduleSoloDelivery).toHaveBeenCalledTimes(1)
})
