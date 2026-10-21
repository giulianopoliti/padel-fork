export const getFreeZoneProgress = (wins: number, losses: number, zoneSize: number, target: number | null = 2): {
  played: number; required: number; complete: boolean
} => {
  const available = Math.max(0, zoneSize - 1)
  const required = target === null ? available : Math.min(Math.max(0, target), available)
  const played = wins + losses
  return { played, required, complete: required > 0 && played >= required }
}
