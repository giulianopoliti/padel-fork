import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createFreeBracketSchema, freeBracketSnapshotSchema, saveFreeBracketSchema,
  type CreateFreeBracketInput, type FreeBracketSnapshot, type SaveFreeBracketInput,
} from '@/types/americano-libre'

export class FreeBracketPersistenceError extends Error {
  readonly status: number
  constructor(message: string, readonly code?: string) {
    super(message)
    this.name = 'FreeBracketPersistenceError'
    this.status = code === '40001' ? 409 : code === '42501' ? 403 : 400
  }
}

// Server callers obtain actorId from auth.getUser() and check tournament access.
// The RPC independently validates ownership. Never pass browser-supplied actors.
const persistFreeBracket = async (
  client: Pick<SupabaseClient, 'rpc'>, name: string, args: Record<string, unknown>,
): Promise<FreeBracketSnapshot> => {
  const { data, error } = await client.rpc(name, args)
  if (error) throw new FreeBracketPersistenceError(error.message, error.code)
  return freeBracketSnapshotSchema.parse(data)
}

export const createFreeBracket = async (
  client: Pick<SupabaseClient, 'rpc'>, tournamentId: string, actorId: string, input: CreateFreeBracketInput,
): Promise<FreeBracketSnapshot> => {
  const parsed = createFreeBracketSchema.parse(input)
  return persistFreeBracket(client, 'create_american_free_bracket', {
    p_tournament_id: tournamentId, p_actor_id: actorId, p_requested_count: parsed.requestedCount,
    p_matches: parsed.matches, p_hierarchy: parsed.hierarchy,
  })
}

export const saveFreeBracket = async (
  client: Pick<SupabaseClient, 'rpc'>, tournamentId: string, actorId: string, input: SaveFreeBracketInput,
): Promise<FreeBracketSnapshot> => {
  const parsed = saveFreeBracketSchema.parse(input)
  return persistFreeBracket(client, 'save_american_free_bracket', {
    p_tournament_id: tournamentId, p_actor_id: actorId,
    p_expected_revision: parsed.expectedRevision, p_layout: parsed.layout,
  })
}
