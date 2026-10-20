import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'

export const isAmericanLibreTournament = (tournament: {
  type?: string | null
  format_type?: string | null
  format_config?: unknown
}): boolean => {
  const format = TournamentFormatResolver.getResolvedFormat(tournament)
  return format.baseType === 'AMERICAN' && format.bracketAssignment === 'MANUAL'
}

export const AMERICAN_LIBRE_GENERATION_PENDING = 'La llave de Americano libre requiere generación por cantidad y asignación manual.'
