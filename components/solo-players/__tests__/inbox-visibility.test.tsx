jest.mock("@/components/tournament/inscription-payment-dialog", () => ({ usePaymentDialog: () => jest.fn() }))
jest.mock("@/contexts/user-context", () => ({ useUser: () => ({ user: { id: "recipient" } }) }))
jest.mock("swr", () => ({ useSWRConfig: () => ({ mutate: jest.fn() }), __esModule: true, default: jest.fn() }))
jest.mock("../use-solo-inbox", () => ({ useSoloResource: jest.fn(), isSoloCacheKey: jest.fn() }))
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SoloRequestCard } from "../request-inbox"
import { SoloNotificationBell } from "../notification-bell"
import { useSoloResource } from "../use-solo-inbox"
import type { SoloRequestEntry } from "@/types/solo-player-ui"

const entry: SoloRequestEntry = { id: "request", post_id: "post", tournament_id: null, inscription_id: null, sender_user_id: "sender", recipient_user_id: "recipient", sender_player_id: "s", recipient_player_id: "r", effective_status: "PENDING", is_actionable: true, created_at: "2026-10-16T12:00:00Z", expires_at: null, senderName: "Sender", recipientName: "Recipient", tournamentName: null, enableTransferProof: false, allowCash: false }
const card = (userId: string, overrides: Partial<SoloRequestEntry> = {}) => renderToStaticMarkup(<SoloRequestCard entry={{ ...entry, ...overrides }} userId={userId} onResolved={jest.fn()} />)
describe("inbox privacy and action boundaries", () => {
  it("offers acceptance/rejection only to the recipient", () => {
    expect(card("recipient")).toContain("Aceptar contacto")
    expect(card("recipient")).toContain("Rechazar")
    expect(card("sender")).not.toContain("Aceptar contacto")
    expect(card("sender")).toContain("Retirar solicitud")
  })
  it("shows a single acceptance action, profile and tournament on the tournament request", () => {
    const html = card("recipient", { tournament_id: "tournament", tournamentName: "Copa" })
    expect(html.match(/>Aceptar pareja<\/button>/g)).toHaveLength(1)
    expect(html).toContain("Ver perfil de Sender")
    expect(html).toContain('href="/players/s"')
    expect(html).toContain('href="/tournaments/tournament"')
    expect(html).not.toMatch(/Revisar y aceptar|Aceptar y formar|seña|transfieran/)
  })
  it("does not reveal accepted contacts or acceptance controls to the organizer", () => {
    const html = card("manager", { effective_status: "ACCEPTED" })
    expect(html).not.toContain("Ver contacto compartido")
    expect(html).not.toContain("Aceptar")
  })
  it("shows a contact action only after acceptance and never embeds the phone in the list", () => {
    expect(card("recipient")).not.toContain("Ver contacto compartido")
    expect(card("recipient", { effective_status: "ACCEPTED" })).toContain("Ver contacto compartido")
  })
  it("expired requests have no accept/reject actions", () => {
    const html = card("recipient", { effective_status: "EXPIRED", is_actionable: false })
    expect(html).toContain("Vencida")
    expect(html).not.toContain("Aceptar contacto")
  })
  it("does not transfer the request deadline to an accepted registration", () => {
    expect(card("recipient", { effective_status: "ACCEPTED", tournament_id: "tournament", inscription_id: "inscription", expires_at: "2026-10-17T12:00:00Z" })).not.toContain("Solicitud vence")
  })
  it.each([1, 31, 120])("announces %s unread events and caps only the visual badge", unreadCount => {
    ;(useSoloResource as jest.Mock).mockReturnValue({ data: { unreadCount } })
    const html = renderToStaticMarkup(<SoloNotificationBell />)
    expect(html).toContain(`${unreadCount} sin leer`)
    if (unreadCount > 99) expect(html).toContain("99+")
  })
})
