export const distributionLabels = {
  INDIVIDUAL: 'Sin compartir',
  COMPLETE: 'Sin diferencias',
  MISSING_SLOTS: 'Faltan franjas compartidas',
  LOCAL_CHANGES: 'Cambios en el torneo',
  SHARED_CHANGES: 'Cambios en la fecha compartida',
  UNLINKED: 'Desvinculado o eliminado',
} as const

export const roundLabels: Record<string, string> = {
  ZONE: 'Zonas', '32VOS': '32avos', '16VOS': '16avos', '8VOS': 'Octavos', '4TOS': 'Cuartos',
  SEMIFINAL: 'Semifinal', FINAL: 'Final',
}

export const cupLabels: Record<string, string> = { MAIN: 'Principal', GOLD: 'Copa Oro', SILVER: 'Copa Plata' }

export const formatDay = (day: string): string => day.split('-').reverse().join('/')

export const formatPeriod = (start: string | null, end: string | null): string => {
  if (start && end) return start === end ? formatDay(start) : `${formatDay(start)} al ${formatDay(end)}`
  if (start) return `Desde el ${formatDay(start)}`
  if (end) return `Hasta el ${formatDay(end)}`
  return 'Sin período'
}

export const tournamentSchedulePath = (tournamentId: string, fechaId?: string): string =>
  `/tournaments/${tournamentId}/schedules${fechaId ? `?fecha_id=${fechaId}` : ''}`

export const safeWorkspaceBack = (value: unknown): string =>
  typeof value === 'string' && (value === '/schedules' || value.startsWith('/schedules?')) ? value : '/schedules'
