import {
  getDefaultPublicTournamentListStatus,
  getPublicTournamentListPath,
  getPublicTournamentListTabs,
} from "@/lib/tournaments/public-tournament-list-routes"

describe("public tournament list routes", () => {
  it("keeps FV's root list focused on all active tournaments", () => {
    expect(getDefaultPublicTournamentListStatus("padel-fv")).toBe("active")
    expect(getPublicTournamentListPath("padel-fv", "active")).toBe("/torneos")
    expect(getPublicTournamentListTabs("padel-fv")).toEqual(["active", "past"])
  })

  it("keeps TPE's root list focused on upcoming tournaments", () => {
    expect(getDefaultPublicTournamentListStatus("padel-elite")).toBe("upcoming")
    expect(getPublicTournamentListPath("padel-elite", "upcoming")).toBe("/torneos")
    expect(getPublicTournamentListTabs("padel-elite")).toEqual(["upcoming", "in-progress", "past"])
  })

  it("uses the Spanish status routes for dedicated public views", () => {
    expect(getPublicTournamentListPath("padel-fv", "upcoming")).toBe("/torneos/proximos")
    expect(getPublicTournamentListPath("padel-elite", "in-progress")).toBe("/torneos/en-curso")
    expect(getPublicTournamentListPath("padel-elite", "past")).toBe("/torneos/finalizados")
  })
})
