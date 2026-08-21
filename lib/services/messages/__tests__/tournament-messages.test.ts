import { sendTransactionalEmail } from "@/lib/services/email/resend-client"
import { sendTournamentMessage } from "@/lib/services/messages"

jest.mock("@/lib/services/email/resend-client", () => ({
  sendTransactionalEmail: jest.fn(async () => ({ success: true, id: "email-id" })),
}))

const makeSupabase = (tables: Record<string, any[]>) => ({
  from(table: string) {
    let rows = tables[table] || []

    const query: any = {
      select() {
        return query
      },
      eq(column: string, value: any) {
        rows = rows.filter((row) => row[column] === value)
        return query
      },
      in(column: string, values: any[]) {
        rows = rows.filter((row) => values.includes(row[column]))
        return query
      },
      maybeSingle: async () => ({ data: rows[0] || null, error: null }),
      single: async () => ({ data: rows[0] || null, error: rows[0] ? null : { message: "not found" } }),
      then(resolve: any) {
        return Promise.resolve({ data: rows, error: null }).then(resolve)
      },
    }

    return query
  },
})

const baseTables = (overrides: Record<string, any[]> = {}) => ({
  tournaments: [
    {
      id: "tournament-1",
      name: "Americano Test",
      type: "AMERICAN",
      category_name: "Suma 7",
      start_date: "2026-07-01T19:30:00-03:00",
      end_date: null,
      club_id: "club-1",
      organization_id: null,
      organizador_id: null,
      messages_enabled: true,
    },
  ],
  inscriptions: [
    {
      id: "inscription-1",
      tournament_id: "tournament-1",
      couple_id: "couple-1",
      player_id: "player-1",
      is_pending: false,
      created_at: "2026-06-25T12:00:00Z",
    },
  ],
  couples: [{ id: "couple-1", player1_id: "player-1", player2_id: "player-2" }],
  players: [
    { id: "player-1", first_name: "Ana", last_name: "Uno", users: { email: "ana@example.com" } },
    { id: "player-2", first_name: "Beto", last_name: "Dos", users: { email: "beto@example.com" } },
  ],
  clubes: [{ id: "club-1", email: "organizer@example.com", user_id: null }],
  organizaciones: [],
  organization_members: [],
  users: [],
  matches: [],
  fecha_matches: [],
  ...overrides,
})

describe("sendTournamentMessage", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    process.env.EMAIL_REPLY_TO = "tenant@example.com"
  })

  it("does not send when tournament messages are disabled", async () => {
    const supabase = makeSupabase(
      baseTables({
        tournaments: [{ ...baseTables().tournaments[0], messages_enabled: false }],
      }),
    )

    await sendTournamentMessage({
      type: "INSCRIPTION_APPROVED_PLAYER",
      supabase,
      inscriptionId: "inscription-1",
    })

    expect(sendTransactionalEmail).not.toHaveBeenCalled()
  })

  it("sends player confirmation when inscription is approved", async () => {
    const supabase = makeSupabase(baseTables())

    await sendTournamentMessage({
      type: "INSCRIPTION_APPROVED_PLAYER",
      supabase,
      inscriptionId: "inscription-1",
    })

    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["ana@example.com", "beto@example.com"],
        tags: expect.arrayContaining([{ name: "type", value: "inscription_approved_player" }]),
      }),
    )
  })

  it("deduplicates organizer and tenant recipients for admin messages", async () => {
    const supabase = makeSupabase(
      baseTables({
        clubes: [{ id: "club-1", email: "tenant@example.com", user_id: null }],
        inscriptions: [
          ...baseTables().inscriptions,
          {
            id: "inscription-2",
            tournament_id: "tournament-1",
            couple_id: "couple-2",
            player_id: null,
            is_pending: false,
            created_at: "2026-06-25T12:15:00Z",
            es_prueba: false,
          },
          {
            id: "test-inscription",
            tournament_id: "tournament-1",
            couple_id: "couple-test",
            player_id: null,
            is_pending: false,
            created_at: "2026-06-25T12:30:00Z",
            es_prueba: true,
          },
        ],
      }),
    )

    await sendTournamentMessage({
      type: "INSCRIPTION_SUBMITTED_ADMIN",
      supabase,
      inscriptionId: "inscription-1",
    })

    const firstCall = (sendTransactionalEmail as jest.Mock).mock.calls[0]?.[0]
    expect(firstCall.to).toEqual(["tenant@example.com", "eventosdeportivosfv@gmail.com"])
    expect(firstCall.to.filter((email: string) => email === "tenant@example.com")).toHaveLength(1)
    expect(firstCall.subject).toContain("Nueva inscripcion: Americano Test")
    expect(firstCall.subject).toContain("2 inscriptos")
    expect(firstCall.html).toContain("Inicio del torneo")
    expect(firstCall.html).toContain("Inscriptos actuales")
    expect(firstCall.text).toContain("Inscriptos actuales: 2")
  })

  it("does not send LONG match messages while match is draft", async () => {
    const supabase = makeSupabase(
      baseTables({
        tournaments: [{ ...baseTables().tournaments[0], type: "LONG" }],
        matches: [
          {
            id: "match-1",
            tournament_id: "tournament-1",
            couple1_id: "couple-1",
            couple2_id: null,
            status: "DRAFT",
          },
        ],
      }),
    )

    await sendTournamentMessage({
      type: "LONG_MATCH_CONFIRMED_PLAYER",
      supabase,
      matchId: "match-1",
    })

    expect(sendTransactionalEmail).not.toHaveBeenCalled()
  })
})
