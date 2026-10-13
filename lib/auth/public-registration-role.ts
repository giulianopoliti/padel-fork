const PUBLIC_REGISTRATION_ROLES = ["PLAYER", "CLUB", "COACH", "ORGANIZADOR"] as const

export type PublicRegistrationRole = (typeof PUBLIC_REGISTRATION_ROLES)[number]

export const parsePublicRegistrationRole = (value: unknown): PublicRegistrationRole | null => {
  if (typeof value !== "string") return null

  return PUBLIC_REGISTRATION_ROLES.find((role) => role === value) ?? null
}
