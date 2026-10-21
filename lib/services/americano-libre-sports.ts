import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { freeBracketSnapshotSchema, type FreeBracketSnapshot } from '@/types/americano-libre'
import { freeSportsInputSchema, type FreeSportsInput, type FreeSportOperation } from '@/types/americano-libre-sports'
import { FreeBracketPersistenceError } from './americano-libre-persistence'
import { ZoneStatsCalculator } from './zone-position/zone-stats-calculator'
import { ZoneRankingEngine } from './zone-position/zone-ranking-engine'
import type { CoupleData, MatchData } from './zone-position/types'

const playerSchema = z.object({ id: z.string().uuid(), first_name: z.string().nullish().transform((value) => value ?? ''),
  last_name: z.string().nullish().transform((value) => value ?? ''), score: z.number().nullish().transform((value) => value ?? 0) })
const coupleSchema = z.object({ id: z.string().uuid(), player1_id: z.string().uuid(), player2_id: z.string().uuid(), player1: playerSchema, player2: playerSchema })
const zoneMatchSchema = z.object({ id: z.string().uuid(), zone_id: z.string().uuid(), couple1_id: z.string().uuid().nullable().transform((value) => value ?? ''), couple2_id: z.string().uuid().nullable().transform((value) => value ?? ''),
  winner_id: z.string().uuid().nullable(), status: z.string(), result_couple1: z.coerce.number().nullable(), result_couple2: z.coerce.number().nullable() })

// Reuse the existing American statistics and tiebreak rules. This is computed
// on the server; callers cannot send zone positions through the HTTP contract.
export const rankFreeZone = (couples: CoupleData[], matches: MatchData[], operations: FreeSportOperation[]) => {
  const projected = matches.map((match) => {
    let current = { ...match }
    for (const op of operations) {
      if (op.matchId !== match.id) continue
      if (op.kind === 'RESULT') current = { ...current, status: 'FINISHED', result_couple1: op.score1, result_couple2: op.score2,
        winner_id: op.score1 > op.score2 ? match.couple1_id : match.couple2_id }
      if (op.kind === 'CLEAR_RESULT') current = { ...current, status: 'PENDING', result_couple1: null, result_couple2: null, winner_id: null }
    }
    return current
  })
  const calculator = new ZoneStatsCalculator()
  const ranked = new ZoneRankingEngine().rankCouplesByAllCriteria(calculator.calculateAllCoupleStats(couples, projected), calculator.createHeadToHeadMatrix(couples, projected))
  const definitive = projected.length > 0 && projected.every((match) => match.status === 'FINISHED') && ranked.every((couple) => couple.matchesPlayed === couples.length - 1)
  return ranked.map((couple) => ({ couple_id: couple.coupleId, position: couple.position, wins: couple.matchesWon, losses: couple.matchesLost,
    games_for: couple.gamesWon, games_against: couple.gamesLost, games_difference: couple.gamesDifference, points: couple.setsDifference,
    player_score_total: couple.totalPlayerScore, tie_info: couple.positionTieInfo, is_definitive: definitive }))
}

export const mutateFreeSports = async (client: SupabaseClient, tournamentId: string, actorId: string, input: FreeSportsInput): Promise<FreeBracketSnapshot> => {
  const parsed = freeSportsInputSchema.parse(input)
  const directBye = parsed.operations.find(op => op.kind === 'ASSIGN_AND_PROCESS_BYE')
  if (directBye) {
    if (parsed.operations.length !== 1) throw new Error('Procesá cada pase libre por separado.')
    const { data, error } = await client.rpc('process_american_free_bye', {
      p_tournament_id: tournamentId, p_actor_id: actorId, p_expected_revision: parsed.expectedRevision, p_match_id: directBye.matchId,
    })
    if (error) throw new FreeBracketPersistenceError(error.message, error.code)
    return freeBracketSnapshotSchema.parse(data)
  }
  const { data: matches, error } = await client.from('matches').select('id, zone_id').eq('tournament_id', tournamentId)
    .in('id', parsed.operations.filter((op) => op.kind === 'RESULT' || op.kind === 'CLEAR_RESULT').map((op) => op.matchId))
  if (error) throw new Error(error.message)
  const zoneIds = [...new Set((matches ?? []).flatMap((match) => match.zone_id ? [String(match.zone_id)] : []))]
  const positions = []
  for (const zoneId of zoneIds) {
    const [membership, results] = await Promise.all([
      client.from('zone_positions').select('couple:couples!zone_positions_couple_id_fkey(id,player1_id,player2_id,player1:players!couples_player1_id_fkey(id,first_name,last_name,score),player2:players!couples_player2_id_fkey(id,first_name,last_name,score))').eq('zone_id', zoneId),
      client.from('matches').select('id,zone_id,couple1_id,couple2_id,winner_id,status,result_couple1,result_couple2').eq('tournament_id', tournamentId).eq('zone_id', zoneId),
    ])
    if (membership.error || results.error) throw new Error(membership.error?.message || results.error?.message)
    const couples = z.array(z.object({ couple: coupleSchema })).parse(membership.data).map((row) => row.couple)
    const zoneMatches = z.array(zoneMatchSchema).parse(results.data)
    positions.push(...rankFreeZone(couples, zoneMatches, parsed.operations).map((position) => ({ ...position, zone_id: zoneId })))
  }
  const { data, error: mutationError } = await client.rpc('mutate_american_free_sports', {
    p_tournament_id: tournamentId, p_actor_id: actorId, p_expected_revision: parsed.expectedRevision,
    p_operations: parsed.operations, p_zone_positions: positions,
  })
  if (mutationError) throw new FreeBracketPersistenceError(mutationError.message, mutationError.code)
  return freeBracketSnapshotSchema.parse(data)
}
