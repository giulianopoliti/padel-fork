import { renderToStaticMarkup } from "react-dom/server"
import DashboardLayout from "../layout"
import DashboardPage from "../page"
import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"

jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }))
jest.mock("next/navigation", () => ({ redirect: jest.fn(() => { throw new Error("redirect") }) }))

const mockedCreateClient = jest.mocked(createClient)
const renderers = [
  { name: "page", render: () => DashboardPage() },
  { name: "layout", render: () => DashboardLayout({ children: "fallback", club: "club", player: "player", coach: "coach", organizador: "organizer-panel" }) },
]

describe.each(renderers)("Panel $name session", ({ render }) => {
  const signOut = jest.fn()

  const mockClient = (result: { data: { role: string } | null; error: { code: string; message: string } | null }, authenticated = true) => {
    const select = jest.fn((columns: string) => ({
      eq: jest.fn(() => ({
        single: jest.fn().mockResolvedValue(columns === "role" ? result : {
          data: null, error: { code: "42501", message: "permission denied for table users" },
        }),
      })),
    }))
    mockedCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: authenticated ? { id: "organizer-id" } : null } }), signOut },
      from: jest.fn(() => ({ select })),
    } as never)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => jest.restoreAllMocks())

  it("loads an organizer panel when access is restricted to public user columns", async () => {
    mockClient({ data: { role: "ORGANIZADOR" }, error: null })
    const markup = renderToStaticMarkup(await render())
    expect(markup).toContain(render === renderers[0].render ? "ORGANIZADOR" : "organizer-panel")
    expect(signOut).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it.each([
    { data: null, error: { code: "42501", message: "permission denied for table users" } },
    { data: null, error: null },
  ])("preserves the session when the user query fails or returns no row", async (result) => {
    mockClient(result)
    const markup = renderToStaticMarkup(await render())
    expect(markup).toContain("Tu sesión sigue abierta")
    expect(markup).toContain("Reintentar")
    expect(signOut).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("redirects to login when there is no authenticated user", async () => {
    mockClient({ data: null, error: null }, false)
    await expect(render()).rejects.toThrow("redirect")
    expect(redirect).toHaveBeenCalledWith("/login")
    expect(signOut).not.toHaveBeenCalled()
  })
})
