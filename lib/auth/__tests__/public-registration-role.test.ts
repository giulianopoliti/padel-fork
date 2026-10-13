import { parsePublicRegistrationRole } from "../public-registration-role"

describe("public registration role validation", () => {
  it.each(["PLAYER", "CLUB", "COACH", "ORGANIZADOR"])("preserves the supported %s registration flow", (role) => {
    expect(parsePublicRegistrationRole(role)).toBe(role)
  })

  it.each(["ADMIN", "admin", "player", "PLAYER ", "", null, undefined, { role: "PLAYER" }])(
    "rejects privileged, malformed or missing input: %p",
    (value) => {
      expect(parsePublicRegistrationRole(value)).toBeNull()
    },
  )
})
