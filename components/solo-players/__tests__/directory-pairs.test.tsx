jest.mock("@/contexts/user-context", () => ({ useUser: () => ({ user: { id: "user" }, authState: "ready" }) }))
jest.mock("../use-solo-directory", () => ({ useSoloDirectory: jest.fn() }))

import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SoloDirectory } from "../solo-directory"
import { useSoloDirectory } from "../use-solo-directory"
import type { SoloDirectoryData, SoloPairState } from "@/types/solo-player-ui"

const pair = (overrides: Partial<SoloPairState> = {}): SoloPairState => ({
  tournament_id: "solo", inscription_id: "solo-inscription", pendingApproval: false, pendingProof: false,
  formedViaSoloPlayers: true, isEliminated: false, ...overrides,
})
const data: SoloDirectoryData = {
  userId: "user", profile: { id: "player", category: "9na", preferred_side: "DRIVE", preferred_hand: "RIGHT" },
  directory: [], ownPosts: [], pendingPostIds: [], pairs: [], categories: ["9na"], support: { name: "FV", whatsappUrl: null },
  tournaments: ["solo", "regular", "eliminated"].map(id => ({ id, name: id, acceptsInterest: true })),
}
const renderDirectory = (pairs: SoloPairState[], tournamentId?: string): string => {
  ;(useSoloDirectory as jest.Mock).mockReturnValue({ data: { ...data, pairs }, reload: jest.fn() })
  return renderToStaticMarkup(<SoloDirectory tournamentId={tournamentId} />)
}

describe("own pairs in the solo player directory", () => {
  it("shows only active pairs formed through an accepted solo request", () => {
    const html = renderDirectory([
      pair(),
      pair({ tournament_id: "regular", inscription_id: "regular-inscription", formedViaSoloPlayers: false }),
      pair({ tournament_id: "eliminated", inscription_id: "eliminated-inscription", isEliminated: true }),
    ])
    expect(html).toContain('href="/tournaments/solo"')
    expect(html).not.toContain('href="/tournaments/regular"')
    expect(html).not.toContain('href="/tournaments/eliminated"')
    expect(html.match(/Inscripción confirmada/g)).toHaveLength(1)
  })

  it("keeps tournament filtering and pending requirements for solo pairs", () => {
    const html = renderDirectory([pair({ pendingApproval: true, pendingProof: true }), pair({ tournament_id: "regular", inscription_id: "other-solo" })], "solo")
    expect(html).toContain("Pareja pendiente de aprobación y comprobante")
    expect(html).not.toContain('href="/tournaments/regular"')
  })

  it("keeps publication disabled for a regular inscription even though its card is hidden", () => {
    const html = renderDirectory([pair({ tournament_id: "regular", formedViaSoloPlayers: false })], "regular")
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Publicar mi búsqueda<\/button>/)
    expect(html).not.toContain('href="/tournaments/regular"')
  })
})
