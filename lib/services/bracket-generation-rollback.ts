import { withTournamentSortValues } from '@/lib/tournaments/tournament-sort-values'
import { createClientServiceRole } from '@/utils/supabase/server'
import type { BracketKey } from '@/types/tournament-format-v2'

export interface TournamentBracketSnapshot {
  status: string
  bracket_status: string | null
  bracket_generated_at: string | null
}

export async function rollbackPlaceholderBracketGeneration(
  tournamentId: string,
  previousState: TournamentBracketSnapshot,
  options: { bracketKeys?: BracketKey[] } = {}
): Promise<void> {
  const supabase = await createClientServiceRole()
  const bracketKeys = options.bracketKeys

  let resolutionsDelete = supabase
    .from('placeholder_resolutions')
    .delete()
    .eq('tournament_id', tournamentId)

  if (bracketKeys && bracketKeys.length > 0) {
    resolutionsDelete = resolutionsDelete.in('bracket_key', bracketKeys)
  }

  const { error: resolutionsError } = await resolutionsDelete

  if (resolutionsError) {
    throw new Error(`Rollback placeholder resolutions failed: ${resolutionsError.message}`)
  }

  let hierarchyDelete = supabase
    .from('match_hierarchy')
    .delete()
    .eq('tournament_id', tournamentId)

  if (bracketKeys && bracketKeys.length > 0) {
    hierarchyDelete = hierarchyDelete.in('bracket_key', bracketKeys)
  }

  const { error: hierarchyError } = await hierarchyDelete

  if (hierarchyError) {
    throw new Error(`Rollback match hierarchy failed: ${hierarchyError.message}`)
  }

  let matchesDelete = supabase
    .from('matches')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('type', 'ELIMINATION')

  if (bracketKeys && bracketKeys.length > 0) {
    matchesDelete = matchesDelete.in('bracket_key', bracketKeys)
  }

  const { error: matchesError } = await matchesDelete

  if (matchesError) {
    throw new Error(`Rollback bracket matches failed: ${matchesError.message}`)
  }

  let seedsDelete = supabase
    .from('tournament_couple_seeds')
    .delete()
    .eq('tournament_id', tournamentId)

  if (bracketKeys && bracketKeys.length > 0) {
    seedsDelete = seedsDelete.in('bracket_key', bracketKeys)
  }

  const { error: seedsError } = await seedsDelete

  if (seedsError) {
    throw new Error(`Rollback bracket seeds failed: ${seedsError.message}`)
  }

  const { error: positionsError } = await supabase
    .from('zone_positions')
    .update({ is_definitive: false })
    .eq('tournament_id', tournamentId)

  if (positionsError) {
    throw new Error(`Rollback definitive flags failed: ${positionsError.message}`)
  }

  const { error: tournamentError } = await supabase
    .from('tournaments')
    .update(withTournamentSortValues({
      status: previousState.status,
      bracket_status: previousState.bracket_status,
      bracket_generated_at: previousState.bracket_generated_at
    }))
    .eq('id', tournamentId)

  if (tournamentError) {
    throw new Error(`Rollback tournament state failed: ${tournamentError.message}`)
  }
}
