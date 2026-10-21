export const formatFreeZoneReference = (position: number, zoneName: string): string | null => {
  if (!Number.isInteger(position) || position < 1) return null
  const zone = zoneName.trim().replace(/^zona\s+/i, '').trim()
  return zone ? `${position}°${zone}` : null
}
