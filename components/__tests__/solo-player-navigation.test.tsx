jest.mock("react", () => ({
  ...jest.requireActual("react"), useMemo: (factory: () => unknown) => factory(),
  useState: (initial: unknown) => [initial, jest.fn()], useEffect: jest.fn(),
}))
jest.mock("@/contexts/user-context", () => ({ useUser: jest.fn() }))
jest.mock("@/components/navbar-client", () => ({ __esModule: true, default: jest.fn(() => null) }))
jest.mock("@/components/skeleton-navbar", () => ({ __esModule: true, default: jest.fn(() => null) }))

import React from "react"
import { useUser } from "@/contexts/user-context"
import NavbarClient from "@/components/navbar-client"
import { getLinksForRole } from "@/config/permissions"

describe.each(["padel-fv", "padel-elite"])("solo player navigation for %s", tenant => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_TENANT_KEY = tenant
    process.env.NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW = "true"
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:8011"
  })
  it.each(["guest", "PLAYER", "CLUB", "COACH", "ADMIN", "ORGANIZADOR"])("provides the shared desktop/mobile links for %s", role => {
    ;(useUser as jest.Mock).mockReturnValue({ user: role === "guest" ? null : { id: "user" }, userDetails: { role }, authState: role === "guest" ? "guest" : "ready", loading: false, authLoading: false })
    // Navbar's public links are created when imported, like a Next client bundle.
    jest.isolateModules(() => {
      const Navbar = require("@/components/navbar").default
      const view = Navbar()
      const child = React.Children.toArray(view.props.children).find(element => React.isValidElement(element) && element.type === NavbarClient) as React.ReactElement<{ mainLinks: { path: string; label: string }[] }>
      expect(child.props.mainLinks).toContainEqual(expect.objectContaining({ path: "/jugadores-sueltos", label: "Jugadores sueltos" }))
    })
  })
  it("keeps the new access hidden by default", () => {
    delete process.env.NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW
    expect(getLinksForRole("PLAYER").some(link => link.path === "/jugadores-sueltos")).toBe(false)
  })
})
