import type { SupabaseClient } from '@supabase/supabase-js'
import { createClientServiceRole } from '@/utils/supabase/server'
import { mutateFreeSports } from './americano-libre-sports'
import { FreeBracketPersistenceError } from './americano-libre-persistence'

// Called only after authentication, tournament authorization and participant validation.
// A zone result changes its standings, never the manually assigned bracket entries.
export const saveFreeZoneResult = async (
  client: SupabaseClient, tournamentId: string, actorId: string, matchId: string, score1: number, score2: number,
): Promise<Record<string, unknown> | null> => {
  const { data: state, error } = await client.from('american_free_brackets').select('revision').eq('tournament_id', tournamentId).maybeSingle()
  if (error) throw new FreeBracketPersistenceError(error.message, error.code)
  if (!state) return null
  const admin = await createClientServiceRole()
  await mutateFreeSports(admin, tournamentId, actorId, {
    expectedRevision: state.revision, operations: [{ kind: 'RESULT', matchId, score1, score2 }],
  })
  // The transaction has committed. Return the values saved rather than running
  // a second standings writer or reporting a failed write if a follow-up read fails.
  return { id: matchId, tournament_id: tournamentId, status: 'FINISHED', result_couple1: score1, result_couple2: score2 }
}
