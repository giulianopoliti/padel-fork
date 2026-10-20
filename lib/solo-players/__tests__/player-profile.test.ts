jest.mock("server-only", () => ({}))
import { summarizePlayerResults, type PlayerResult } from "../player-profile"
import { soloNotificationTitle, soloSportsLabel } from "../presentation"

const match = (overrides: Partial<PlayerResult>): PlayerResult => ({ tournament_id: "t1", couple1_id: "own", couple2_id: "other", winner_id: "own", status: "COMPLETED", type: null, ...overrides })
describe("public sports profile and notification context", () => {
  it("counts played tournaments once, includes historical final results and ignores byes/unplayed matches", () => {
    const result = summarizePlayerResults(["own"], [match({}), match({ winner_id: "other", status: "FINISHED" }), match({ tournament_id: "t2" }), match({ status: "BYE" }), match({ couple2_id: null }), match({ status: "PENDING" }), match({ type: "BYE" }), match({ winner_id: "invalid" })])
    expect(result).toEqual({ tournaments: 2, wins: 2, losses: 1 })
  })
  it("does not count matches between two of the same player's couples", () => {
    expect(summarizePlayerResults(["own", "other"], [match({})])).toEqual({ tournaments: 0, wins: 0, losses: 0 })
  })
  it("describes the category when a general request has no tournament", () => {
    expect(soloNotificationTitle("REQUEST_RECEIVED", { tournamentName: null, category: "9na" })).toBe("Nueva solicitud de pareja · categoría 9na · Sin torneo definido")
    expect(soloSportsLabel("REVES", "LEFT")).toBe("Revés · Zurdo")
  })
})
