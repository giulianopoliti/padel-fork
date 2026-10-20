jest.mock("server-only", () => ({}))
jest.mock("@/lib/solo-players/http", () => ({ ...jest.requireActual("@/lib/solo-players/http"), scheduleSoloDelivery: jest.fn() }))
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }))
jest.mock("@/lib/solo-players/management", () => ({ isSoloManager: jest.fn(), loadSoloManagement: jest.fn() }))
jest.mock("@/utils/tournament-permissions", () => ({ checkTournamentPermissions: jest.fn() }))
jest.mock("@/lib/services/registration", () => ({ getRegistrationService: () => ({ convertIndividualToCouple: confirmPair }) }))
import { NextRequest } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { isSoloManager, loadSoloManagement } from "@/lib/solo-players/management"
import { checkTournamentPermissions } from "@/utils/tournament-permissions"
import { GET, POST } from "../management/route"

const confirmPair = jest.fn()
const input = { tournamentId: "650e8400-e29b-41d4-a716-446655440000", player1Id: "650e8400-e29b-41d4-a716-446655440001", player2Id: "650e8400-e29b-41d4-a716-446655440002", paymentMethod: "TRANSFER" }
const request = (body?: unknown) => new NextRequest("http://localhost:3043/api/solo-players/management", { method: body ? "POST" : "GET", headers: { origin: "http://localhost:3043", "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW = "true"; process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:8011"
  ;(createClient as jest.Mock).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "manager" } } }) } })
  ;(isSoloManager as jest.Mock).mockResolvedValue(true)
  ;(checkTournamentPermissions as jest.Mock).mockResolvedValue({ hasPermission: true })
  ;(loadSoloManagement as jest.Mock).mockResolvedValue({ tournaments: [], pairs: [], requests: [] })
  confirmPair.mockResolvedValue({ success: true, inscriptionId: "inscription", message: "Comprobante pendiente" })
})
describe("organizer workspace", () => {
  it("denies a player before returning management data or invoking registration", async () => {
    ;(isSoloManager as jest.Mock).mockResolvedValue(false)
    expect((await GET(request())).status).toBe(403)
    expect((await POST(request(input))).status).toBe(403)
    expect(loadSoloManagement).not.toHaveBeenCalled(); expect(confirmPair).not.toHaveBeenCalled()
  })
  it("rechecks permission for the destination tournament", async () => {
    ;(checkTournamentPermissions as jest.Mock).mockResolvedValue({ hasPermission: false })
    expect((await POST(request(input))).status).toBe(403)
    expect(confirmPair).not.toHaveBeenCalled()
  })
  it("uses the existing atomic service and keeps transfer requirements", async () => {
    const response = await POST(request({ ...input, termsAccepted: true, allowBlockedPlayerOverride: true }))
    expect(response.status).toBe(200)
    expect(confirmPair).toHaveBeenCalledWith({ ...input, isOrganizerRegistration: true })
    expect(await response.json()).toMatchObject({ inscriptionId: "inscription", message: "Comprobante pendiente" })
  })
  it("returns the transactional capacity error and does not claim success", async () => {
    confirmPair.mockResolvedValue({ success: false, error: "Cupos llenos. Modificá el límite de inscriptos para emparejarlos" })
    const response = await POST(request(input))
    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain("Cupos llenos")
  })
  it("rejects pairing a player with themself", async () => {
    expect((await POST(request({ ...input, player2Id: input.player1Id }))).status).toBe(400)
    expect(confirmPair).not.toHaveBeenCalled()
  })
  it("never reaches a remote database when preview is enabled", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    expect((await POST(request(input))).status).toBe(404)
    expect(createClient).not.toHaveBeenCalled()
  })
})

it("warns about an existing pair rather than claiming a new registration", async () => {
  confirmPair.mockResolvedValue({ success: true, alreadyRegistered: true, inscriptionId: "existing" })
  const response = await POST(request(input))
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: "PAIR_ALREADY_REGISTERED", inscriptionId: "existing", error: "Esta pareja ya está inscripta en este torneo." })
})
