import type { SupabaseClient } from '@supabase/supabase-js'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import { POINTS_CONFIGS } from '@/lib/services/points/types/points-config.types'
import type { BracketKey } from '@/types/tournament-format-v2'

export interface CupBonus {
  enabled: boolean
  champion: number
  finalist: number
}
export type TournamentBonuses = Partial<Record<BracketKey, CupBonus>>
export interface FinalizationMatch {
  id: string
  type: string | null
  round: string | null
  bracket_key: string | null
  status: string
  winner_id: string | null
}
export interface FinalizationTournament {
  status: string
  type: string | null
  format_type: string | null
  format_config: unknown
  winner_id?: string | null
}

export const getFinalizationEligibility = (tournament: FinalizationTournament, matches: FinalizationMatch[]) => {
  const format = TournamentFormatResolver.getResolvedFormat(tournament)
  const bracketKeys: BracketKey[] = format.effectiveBracketMode === 'GOLD_SILVER'
    ? ['GOLD', 'SILVER'] : format.effectiveBracketMode === 'NONE' ? [] : ['MAIN']
  const finals = matches.filter(match => match.type === 'ELIMINATION' && match.round === 'FINAL')
  const pendingMatches = matches.filter(match => match.status !== 'FINISHED').length
  const missingBrackets = bracketKeys.filter(key => !finals.some(match => (match.bracket_key || 'MAIN') === key))
  const duplicateFinals = bracketKeys.some(key => finals.filter(match => (match.bracket_key || 'MAIN') === key).length > 1)
  const champions = bracketKeys.flatMap(bracketKey => {
    const final = finals.find(match => (match.bracket_key || 'MAIN') === bracketKey)
    return final?.status === 'FINISHED' && final.winner_id
      ? [{ bracketKey, matchId: final.id, winnerId: final.winner_id }] : []
  })
  let reason: string | null = null
  if (matches.length === 0) reason = 'Todavía no hay partidos generados.'
  else if (missingBrackets.length > 0) reason = 'Primero generá todas las llaves del torneo, incluidas sus finales.'
  else if (duplicateFinals) reason = 'Revisá la llave: debe haber una sola final por copa.'
  else if (pendingMatches > 0) reason = `Quedan ${pendingMatches} partidos sin finalizar.`
  else if (champions.length !== bracketKeys.length) reason = 'Todas las finales deben estar terminadas y tener ganador.'
  const allMatchesFinished = reason === null
  return { allMatchesFinished, canFinalize: allMatchesFinished && tournament.status === 'BRACKET_PHASE', reason, pendingMatches, bracketKeys, champions }
}

export const getTournamentBonuses = (tournament: Pick<FinalizationTournament, 'type' | 'format_config'>, keys: BracketKey[]): TournamentBonuses => {
  const defaults = POINTS_CONFIGS[tournament.type === 'LONG' ? 'LONG' : 'AMERICAN']
  const config = tournament.format_config as { bonuses?: TournamentBonuses } | null
  return Object.fromEntries(keys.map(key => [key, config?.bonuses?.[key] ?? {
    enabled: key !== 'SILVER', champion: defaults.bonusChampion, finalist: defaults.bonusFinalist,
  }]))
}

export const validateTournamentBonuses = (value: unknown, keys: BracketKey[]): value is TournamentBonuses => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const bonuses = value as TournamentBonuses
  if (Object.keys(bonuses).some(key => !keys.includes(key as BracketKey))) return false
  return keys.every(key => {
    const bonus = bonuses[key]
    return bonus && typeof bonus.enabled === 'boolean' &&
      Number.isSafeInteger(bonus.champion) && bonus.champion >= 0 && bonus.champion <= 10000 &&
      Number.isSafeInteger(bonus.finalist) && bonus.finalist >= 0 && bonus.finalist <= 10000
  })
}

export const loadTournamentFinalization = async (supabase: SupabaseClient, tournamentId: string) => {
  const { data: tournament, error: tournamentError } = await supabase.from('tournaments')
    .select('status, winner_id, type, format_type, format_config').eq('id', tournamentId).single()
  if (tournamentError || !tournament) throw new Error('No se pudo obtener el torneo.')
  const { data: matches, error: matchesError } = await supabase.from('matches')
    .select('id, type, round, bracket_key, status, winner_id').eq('tournament_id', tournamentId)
  if (matchesError) throw new Error('No se pudo verificar los partidos del torneo.')
  const eligibility = getFinalizationEligibility(tournament, matches ?? [])
  return { tournament, ...eligibility, bonuses: getTournamentBonuses(tournament, eligibility.bracketKeys) }
}
