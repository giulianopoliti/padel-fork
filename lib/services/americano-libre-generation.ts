import { createClientServiceRole } from '@/utils/supabase/server'
import { isAmericanLibreTournament } from './americano-libre-format'
import { buildFreeBracket } from './americano-libre-generator'
import { createFreeBracket, FreeBracketPersistenceError } from './americano-libre-persistence'
import { getPersistedBracketArtifacts } from './bracket-generation-validation'
import type { FreeBracketSnapshot } from '@/types/americano-libre'

export const generateFreeBracket = async (tournamentId: string, actorId: string, requestedCount: number): Promise<FreeBracketSnapshot> => {
  const structure = buildFreeBracket(requestedCount)
  const client = await createClientServiceRole()
  const { data: tournament, error } = await client.from('tournaments')
    .select('type, format_type, format_config, status, bracket_status, bracket_generated_at')
    .eq('id', tournamentId).single()
  if (error || !tournament) throw new FreeBracketPersistenceError('No se encontró el torneo')
  if (!isAmericanLibreTournament(tournament)) throw new FreeBracketPersistenceError('El torneo no es Americano libre')
  if (tournament.status !== 'ZONE_PHASE') throw new FreeBracketPersistenceError('La generación requiere fase de zonas', '40001')
  if (tournament.bracket_generated_at || ['BRACKET_GENERATED', 'BRACKET_ACTIVE'].includes(tournament.bracket_status)) {
    throw new FreeBracketPersistenceError('Ya existe una llave generada', '40001')
  }
  const artifacts = await getPersistedBracketArtifacts(tournamentId)
  if (artifacts.exists) throw new FreeBracketPersistenceError('Ya existe una llave o artefactos previos', '40001')
  // The RPC revalidates permissions, phase, zones and artifacts under the tournament
  // lock. It commits structure + phase together. No qualification or BYE writes.
  try {
    return await createFreeBracket(client, tournamentId, actorId, structure)
  } catch (error) {
    // A concurrent generator can change the phase after our read. Phase one's
    // RPC rejects it under lock with 22023; expose the same conflict as above.
    if (error instanceof FreeBracketPersistenceError && error.code === '22023' && error.message === 'La generación requiere fase de zonas') {
      throw new FreeBracketPersistenceError('La llave cambió. Recargá para ver la estructura guardada.', '40001')
    }
    throw error
  }
}
