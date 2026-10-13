import { register } from "../actions"
import { createClient, createClientServiceRole } from "@/utils/supabase/server"

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(),
  createClientServiceRole: jest.fn(),
}))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))

describe("public registration authority", () => {
  beforeEach(() => jest.clearAllMocks())

  it.each(["ADMIN", "admin", "PLAYER ", "UNKNOWN"])(
    "rejects %s before creating an Auth user or database client",
    async (role) => {
      const form = new FormData()
      form.set("email", "registration-test@example.invalid")
      form.set("password", "test-password")
      form.set("role", role)

      const result = await register(form)

      expect(result).toEqual({ success: false, error: "Rol de registro no permitido." })
      expect(createClient).not.toHaveBeenCalled()
      expect(createClientServiceRole).not.toHaveBeenCalled()
    },
  )
})
