import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { FreeBracketPersistenceError } from './americano-libre-persistence'

export const resetFreeTournament = async (
  client: SupabaseClient, tournamentId: string, actorId: string, target: 'ZONE_PHASE' | 'NOT_STARTED',
): Promise<void> => {
  const { data: state, error: readError } = await client.from('american_free_brackets').select('revision').eq('tournament_id', tournamentId).maybeSingle()
  if (readError) throw new FreeBracketPersistenceError(readError.message, readError.code)
  const { data, error } = await client.rpc('reset_american_free_tournament', {
    p_tournament_id: tournamentId, p_actor_id: actorId, p_target: target, p_expected_revision: state?.revision ?? null,
  })
  if (error) throw new FreeBracketPersistenceError(error.message, error.code)
  z.object({ success: z.literal(true), status: z.literal(target) }).parse(data)
}
