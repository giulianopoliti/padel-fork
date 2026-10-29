import { createClientServiceRole } from '@/utils/supabase/server'
import { assertRegistrationExclusionsReviewed } from '@/lib/services/registration/registration-readiness'
import type {
  BracketMatch,
  MatchHierarchy,
  PlaceholderSeed
} from '@/lib/services/bracket-generator-v2'
import type { BracketKey } from '@/types/tournament-format-v2'
import { DEFAULT_BRACKET_KEY } from '@/lib/services/bracket-key-policy'

type PersistedBracketMatch = BracketMatch & {
  winner_id?: string | null
}

export async function savePlaceholderBracketToDatabase(
  tournamentId: string,
  seeds: PlaceholderSeed[],
  matches: BracketMatch[],
  hierarchy: MatchHierarchy[],
  options: { replaceExisting?: boolean } = {}
): Promise<{ savedMatches: PersistedBracketMatch[] }> {
  await assertRegistrationExclusionsReviewed(tournamentId)
  const supabase = await createClientServiceRole()
  const bracketKey: BracketKey =
    seeds[0]?.bracket_key || matches[0]?.bracket_key || hierarchy[0]?.bracket_key || DEFAULT_BRACKET_KEY
  const replaceExisting = options.replaceExisting ?? true

  if (replaceExisting) {
    await supabase.from('placeholder_resolutions').delete().eq('tournament_id', tournamentId)
    await supabase.from('tournament_couple_seeds').delete().eq('tournament_id', tournamentId)
    await supabase.from('matches').delete().eq('tournament_id', tournamentId).eq('type', 'ELIMINATION')
    await supabase.from('match_hierarchy').delete().eq('tournament_id', tournamentId)
  } else {
    await supabase
      .from('placeholder_resolutions')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('bracket_key', bracketKey)
    await supabase
      .from('tournament_couple_seeds')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('bracket_key', bracketKey)
    await supabase
      .from('matches')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('type', 'ELIMINATION')
      .eq('bracket_key', bracketKey)
    await supabase
      .from('match_hierarchy')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('bracket_key', bracketKey)
  }

  const seedsData = seeds.map(seed => ({
    tournament_id: tournamentId,
    bracket_key: seed.bracket_key || bracketKey,
    seed: seed.seed,
    bracket_position: seed.bracket_position,
    couple_id: seed.couple_id,
    is_placeholder: seed.is_placeholder || false,
    placeholder_zone_id: seed.placeholder_zone_id,
    placeholder_position: seed.placeholder_position,
    placeholder_label: seed.placeholder_label,
    created_as_placeholder: seed.created_as_placeholder || false
  }))

  const { data: insertedSeeds, error: seedsError } = await supabase
    .from('tournament_couple_seeds')
    .insert(seedsData)
    .select('id, seed, bracket_key')

  if (seedsError) {
    throw new Error(`Error al insertar seeds: ${seedsError.message}`)
  }

  const seedIdMapping = new Map<number, string>()
  insertedSeeds?.forEach(seedRow => {
    seedIdMapping.set(seedRow.seed, seedRow.id)
  })

  const matchesData = matches.map(match => ({
    id: match.id,
    tournament_id: tournamentId,
    bracket_key: match.bracket_key || bracketKey,
    couple1_id: match.couple1_id,
    couple2_id: match.couple2_id,
    placeholder_couple1_label: match.placeholder_couple1_label,
    placeholder_couple2_label: match.placeholder_couple2_label,
    round: match.round,
    order_in_round: match.order_in_round,
    status: match.status,
    type: match.type,
    tournament_couple_seed1_id: match.seed1 ? seedIdMapping.get(match.seed1) || null : null,
    tournament_couple_seed2_id: match.seed2 ? seedIdMapping.get(match.seed2) || null : null
  }))

  const { error: matchesError } = await supabase.from('matches').insert(matchesData)
  if (matchesError) {
    throw new Error(`Error al insertar matches: ${matchesError.message}`)
  }

  if (hierarchy.length > 0) {
    const { error: hierarchyError } = await supabase.from('match_hierarchy').insert(hierarchy)
    if (hierarchyError) {
      throw new Error(`Error al insertar jerarquía: ${hierarchyError.message}`)
    }
  }

  const { data: savedMatches, error: savedMatchesError } = await supabase
    .from('matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('type', 'ELIMINATION')
    .eq('bracket_key', bracketKey)
    .order('round, order_in_round')

  if (savedMatchesError || !savedMatches) {
    throw new Error(`Error reading saved matches: ${savedMatchesError?.message || 'No matches found'}`)
  }

  return {
    savedMatches: savedMatches as PersistedBracketMatch[]
  }
}

export async function savePlaceholderSeedingToDatabase(
  tournamentId: string,
  seeds: PlaceholderSeed[],
  options: { replaceExisting?: boolean } = {}
): Promise<{ savedSeeds: Array<{ id: string; seed: number; bracket_position: number | null; couple_id: string | null; bracket_key: BracketKey }> }> {
  await assertRegistrationExclusionsReviewed(tournamentId)
  const supabase = await createClientServiceRole()
  const bracketKey: BracketKey = seeds[0]?.bracket_key || DEFAULT_BRACKET_KEY
  const replaceExisting = options.replaceExisting ?? true

  if (replaceExisting) {
    await supabase.from('tournament_couple_seeds').delete().eq('tournament_id', tournamentId)
  } else {
    await supabase
      .from('tournament_couple_seeds')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('bracket_key', bracketKey)
  }

  const seedsData = seeds.map(seed => ({
    tournament_id: tournamentId,
    bracket_key: seed.bracket_key || bracketKey,
    seed: seed.seed,
    bracket_position: seed.bracket_position,
    couple_id: seed.couple_id,
    is_placeholder: seed.is_placeholder || false,
    placeholder_zone_id: seed.placeholder_zone_id,
    placeholder_position: seed.placeholder_position,
    placeholder_label: seed.placeholder_label,
    created_as_placeholder: seed.created_as_placeholder || false
  }))

  const { data: savedSeeds, error } = await supabase
    .from('tournament_couple_seeds')
    .insert(seedsData)
    .select('id, seed, bracket_position, couple_id, bracket_key')
    .order('seed', { ascending: true })

  if (error || !savedSeeds) {
    throw new Error(`Error al guardar seeding canónico: ${error?.message || 'No seeds returned'}`)
  }

  return { savedSeeds }
}

export async function updateProcessedPlaceholderMatches(
  matches: PersistedBracketMatch[]
): Promise<void> {
  const supabase = await createClientServiceRole()

  for (const match of matches) {
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        status: match.status,
        winner_id: match.winner_id ?? null,
        tournament_couple_seed1_id: match.tournament_couple_seed1_id,
        tournament_couple_seed2_id: match.tournament_couple_seed2_id,
        couple1_id: match.couple1_id,
        couple2_id: match.couple2_id
      })
      .eq('id', match.id)

    if (updateError) {
      throw new Error(`Error updating processed match ${match.id}: ${updateError.message}`)
    }
  }
}
