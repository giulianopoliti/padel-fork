// Only these sporting/profile fields may cross the public inscriptions boundary.
// An allowlist also prevents newly added private profile fields leaking via SSR.
const publicPlayerFields = [
  'id', 'first_name', 'last_name', 'score', 'category_name', 'gender',
  'preferred_side', 'preferred_hand', 'profile_image_url', 'late_withdrawal_count',
] as const

type PublicPlayerField = typeof publicPlayerFields[number]

export const sanitizeTournamentPlayer = <T extends object>(
  player: T,
  hasManagementPermission: boolean,
): T | Pick<T, Extract<keyof T, PublicPlayerField>> => {
  if (hasManagementPermission) return player

  return Object.fromEntries(
    publicPlayerFields
      .filter((field) => Object.prototype.hasOwnProperty.call(player, field))
      .map((field) => [field, player[field as keyof T]]),
  ) as Pick<T, Extract<keyof T, PublicPlayerField>>
}
