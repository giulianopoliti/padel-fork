jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
import { createClient } from "@/utils/supabase/server"
import { saveSoloEmailPreference } from "../email-preference-actions"
const updateUser = jest.fn()
const getUser = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: "player" } }, error: null })
  updateUser.mockResolvedValue({ error: null })
  ;(createClient as jest.Mock).mockResolvedValue({ auth: { getUser, updateUser } })
})
it.each([true, false])("persists the authenticated player's email preference: %s", async enabled => {
  expect(await saveSoloEmailPreference(enabled)).toEqual({ success: true })
  expect(updateUser).toHaveBeenCalledWith({ data: { solo_player_emails: enabled } })
})
it("requires a verified session", async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: null })
  expect(await saveSoloEmailPreference(false)).toMatchObject({ success: false })
  expect(updateUser).not.toHaveBeenCalled()
})
it("surfaces persistence errors", async () => {
  updateUser.mockResolvedValue({ error: { message: "private server detail" } })
  expect(await saveSoloEmailPreference(false)).toEqual({ success: false, error: "No pudimos guardar tu preferencia de correos." })
})
