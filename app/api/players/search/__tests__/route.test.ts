jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => body,
    }),
  },
}))
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }))
jest.mock("@/utils/tournament-permissions", () => ({ checkTournamentAccess: jest.fn() }))
jest.mock("@/lib/services/player-search-service", () => ({
  searchPlayersGlobally: jest.fn(),
  searchPlayersForTournament: jest.fn(),
}))

import { POST } from "../route"
import { createClient } from "@/utils/supabase/server"
import { searchPlayersGlobally } from "@/lib/services/player-search-service"

const organizationId = "11111111-1111-4111-8111-111111111111"

describe("organizer player directory", () => {
  const membershipQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    membershipQuery.maybeSingle.mockResolvedValue({ data: { id: "member" } })
    ;(createClient as jest.Mock).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "organizer" } } }) },
      from: (table: string) => table === "organization_members"
        ? membershipQuery
        : {
          select: () => ({ eq: () => ({ single: async () => ({ data: { role: "ORGANIZADOR" } }) }) }),
        },
    })
    ;(searchPlayersGlobally as jest.Mock).mockResolvedValue({ players: [], total: 0 })
  })

  it.each([
    { searchTerm: "", categoryFilter: "all" },
    { searchTerm: "", categoryFilter: "7ma", page: 2 },
    { searchTerm: "jugador@example.com", searchField: "email" },
    { searchTerm: "+54 (11) 1234-5678", searchField: "phone" },
  ])("queries the whole tenant for %j", async (filters) => {
    const response = await POST(new Request("http://localhost/api/players/search", {
      method: "POST",
      body: JSON.stringify({ scope: "organization", organizationId, ...filters }),
    }))

    expect(response.status).toBe(200)
    expect(searchPlayersGlobally).toHaveBeenCalledWith(expect.objectContaining(filters))
  })

  it("requires active organizer membership before reading the global directory", async () => {
    membershipQuery.maybeSingle.mockResolvedValue({ data: null })
    const response = await POST(new Request("http://localhost/api/players/search", {
      method: "POST",
      body: JSON.stringify({ scope: "organization", organizationId, searchField: "email" }),
    }))

    expect(response.status).toBe(403)
    expect(searchPlayersGlobally).not.toHaveBeenCalled()
  })
})
