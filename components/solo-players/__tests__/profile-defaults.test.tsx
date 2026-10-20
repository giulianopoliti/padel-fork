import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SoloPostForm } from "../solo-post-form"
import { getTournamentSoloState } from "../tournament-solo-status"
import type { SoloDirectoryData, SoloOwnPost } from "@/types/solo-player-ui"

const data: SoloDirectoryData = { userId: "user", profile: { id: "player", category: "9na", preferred_side: "REVES", preferred_hand: "LEFT", phone: "+5491123456789" }, directory: [], ownPosts: [], pendingPostIds: [], pairs: [], categories: ["9na"], tournaments: [{ id: "tournament", name: "Copa", acceptsInterest: true }], support: { name: "Club", whatsappUrl: null } }
const post: SoloOwnPost = { id: "post", tournament_id: "tournament", category_name: "9na", preferred_side: "REVES", preferred_hand: "LEFT", status: "ACTIVE", public_phone: false, expires_at: null }
describe("profile defaults and solo tournament state", () => {
  it("preloads editable sports and contact data and names the tournament selector clearly", () => {
    const html = renderToStaticMarkup(<SoloPostForm data={data} onSaved={jest.fn()} onCancel={jest.fn()} />)
    expect(html).toContain('value="+5491123456789"')
    expect(html).toContain('value="REVES" selected=""')
    expect(html).toContain('value="LEFT" selected=""')
    expect(html).toContain("Torneo para el que buscás pareja")
    expect(html).not.toContain("Acepto recibir")
  })
  it("shows active interest even without a competitive inscription", () => {
    expect(getTournamentSoloState({ ...data, ownPosts: [post] }, "tournament")).toBe("searching")
  })
  it("also recognizes a legacy individual inscription", () => {
    expect(getTournamentSoloState({ ...data, soloTournamentIds: ["tournament"] }, "tournament")).toBe("searching")
  })
  it("distinguishes paused and expired posts", () => {
    expect(getTournamentSoloState({ ...data, ownPosts: [{ ...post, status: "PAUSED" }] }, "tournament")).toBe("paused")
    expect(getTournamentSoloState({ ...data, ownPosts: [{ ...post, expires_at: "2020-01-01" }] }, "tournament")).toBeNull()
  })
  it("stops showing a search as soon as a complete pair exists", () => {
    expect(getTournamentSoloState({ ...data, ownPosts: [post], pairs: [{ tournament_id: "tournament", inscription_id: "inscription", pendingApproval: true, pendingProof: true }] }, "tournament")).toBeNull()
  })
})
