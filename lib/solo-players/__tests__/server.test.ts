jest.mock("server-only", () => ({}))
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }))
jest.mock("@/lib/services/tenant-organization.service", () => ({ getTenantOrganization: jest.fn().mockResolvedValue(null) }))

import { loadSoloDirectory } from "../server"

const inscription = (overrides: Record<string, unknown> = {}) => ({
  id: "solo", couple_id: "complete", tournament_id: "tournament", is_pending: false, is_eliminated: false,
  payment_method: "TRANSFER", payment_proof_path: null, tournaments: { enable_transfer_proof: true },
  solo_player_requests: [{ status: "ACCEPTED" }], ...overrides,
})

it("attributes solo pairs to their inscription's accepted request and preserves all registration blockers", async () => {
  const rows: Record<string, unknown> = {
    solo_player_directory: [], solo_player_posts: [], solo_player_request_inbox: [], categories: [], tournaments: [],
    players: { id: "player", category: "9na", preferred_side: "DRIVE", preferred_hand: "RIGHT", phone: null },
    couples: [{ id: "complete", player2_id: "partner" }, { id: "incomplete", player2_id: null }],
  }
  const paired = [
    inscription(), inscription({ id: "regular", tournament_id: "regular-tournament", solo_player_requests: [] }),
    inscription({ id: "pending", solo_player_requests: [{ status: "PENDING" }] }),
    inscription({ id: "eliminated", is_eliminated: true }),
    inscription({ id: "incomplete", couple_id: "incomplete", tournament_id: "individual" }),
    inscription({ id: "incomplete-eliminated", couple_id: "incomplete", tournament_id: "eliminated-individual", is_eliminated: true }),
  ]
  let inscriptionQuery = 0
  const client = { from: jest.fn((table: string) => {
    const result = { data: table === "inscriptions" ? (++inscriptionQuery === 1 ? [{ tournament_id: "individual-row" }] : paired) : rows[table], error: null }
    const query: Record<string, jest.Mock> = {}
    for (const method of ["select", "order", "eq", "or", "in", "is"]) query[method] = jest.fn(() => query)
    for (const method of ["returns", "maybeSingle"]) query[method] = jest.fn().mockResolvedValue(result)
    return query
  }) }
  const data = await loadSoloDirectory(client as unknown as Parameters<typeof loadSoloDirectory>[0], "user")
  expect(data.pairs.map(pair => [pair.inscription_id, pair.formedViaSoloPlayers, pair.isEliminated])).toEqual([
    ["solo", true, false], ["regular", false, false], ["pending", false, false], ["eliminated", true, true],
  ])
  expect(data.soloTournamentIds).toEqual(["individual-row", "individual"])
  expect(data.pairs[0]).toMatchObject({ pendingApproval: false, pendingProof: true })
  expect(JSON.stringify(data.pairs)).not.toMatch(/payment_proof_path|payment_method|solo_player_requests/)
})
