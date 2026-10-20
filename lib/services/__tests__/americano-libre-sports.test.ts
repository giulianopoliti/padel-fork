import { rankFreeZone, mutateFreeSports } from '../americano-libre-sports'
import { FreeBracketPersistenceError } from '../americano-libre-persistence'
import { freeSportsInputSchema } from '@/types/americano-libre-sports'
import { getFinalizationEligibility } from '@/lib/tournaments/finalization'
import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import type { CoupleData, MatchData } from '../zone-position/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BonusPointsCalculator } from '../points/calculators/bonus-points.calculator'
import { POINTS_CONFIGS } from '../points/types/points-config.types'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const couples: CoupleData[] = [1, 2].map((n) => ({ id: id(n), player1_id: id(n + 10), player2_id: id(n + 20),
  player1: { id: id(n + 10), first_name: 'Player', last_name: `${n}`, score: 100 },
  player2: { id: id(n + 20), first_name: 'Partner', last_name: `${n}`, score: 100 },
}))
const zoneMatch: MatchData = { id: id(99), zone_id: id(40), couple1_id: id(1), couple2_id: id(2), status: 'PENDING',
  result_couple1: null, result_couple2: null, winner_id: null }

describe('LIBRE sports and reference statistics', () => {
  it('updates PG/PP/DG with the existing American engine, retaining source data', () => {
    const ranked = rankFreeZone(couples, [zoneMatch], [{ kind: 'RESULT', matchId: zoneMatch.id, score1: 6, score2: 2 }])
    expect(ranked[0]).toMatchObject({ couple_id: id(1), position: 1, wins: 1, losses: 0, games_difference: 4, is_definitive: true })
    expect(ranked[1]).toMatchObject({ couple_id: id(2), position: 2, wins: 0, losses: 1, games_difference: -4 })
    expect(zoneMatch.status).toBe('PENDING')
  })
  it('modifies and reverses zone references without classifying couples into the bracket', () => {
    const before = { ...zoneMatch, status: 'FINISHED', winner_id: id(1), result_couple1: 6, result_couple2: 2 }
    const modified = rankFreeZone(couples, [before], [{ kind: 'RESULT', matchId: zoneMatch.id, score1: 1, score2: 6 }])
    expect(modified[0]).toMatchObject({ couple_id: id(2), wins: 1, games_difference: 5 })
    const reverted = rankFreeZone(couples, [before], [{ kind: 'CLEAR_RESULT', matchId: zoneMatch.id }])
    expect(reverted.every((couple) => couple.wins === 0 && couple.losses === 0 && couple.games_difference === 0 && !couple.is_definitive)).toBe(true)
    expect(reverted.every((couple) => !('matchId' in couple) && !('seed' in couple))).toBe(true)
  })
  it('direct entries and BYEs do not add zone wins or points', () => {
    const ranked = rankFreeZone(couples, [zoneMatch], [{ kind: 'PROCESS_BYE', matchId: id(77) }])
    expect(ranked.every((couple) => couple.wins === 0 && couple.losses === 0 && couple.points === 0)).toBe(true)
  })
  it('excludes inactive matches from closing, preserves pending zone requirements', () => {
    const tournament = { type: 'AMERICAN', format_type: null, status: 'BRACKET_PHASE', format_config: getTournamentFormatPreset('AMERICAN_MULTI_ZONE_FREE') }
    const final = { id: id(66), type: 'ELIMINATION', round: 'FINAL', bracket_key: 'MAIN', status: 'FINISHED', winner_id: id(1) }
    const inactive = { ...final, id: id(67), round: '4TOS', status: 'WAITING_OPONENT', winner_id: null, bracket_is_active: false }
    expect(getFinalizationEligibility(tournament, [inactive, final]).canFinalize).toBe(true)
    expect(getFinalizationEligibility(tournament, [inactive, final, { ...zoneMatch, type: 'ZONE', round: 'ZONE', bracket_key: null }]).canFinalize).toBe(false)
  })
  it('requires an explicit revision and forbids client supplied ranking or actor', () => {
    const valid = { expectedRevision: 2, operations: [{ kind: 'PROCESS_BYE', matchId: id(99) }] }
    expect(freeSportsInputSchema.safeParse(valid).success).toBe(true)
    expect(freeSportsInputSchema.safeParse({ operations: valid.operations }).success).toBe(false)
    expect(freeSportsInputSchema.safeParse({ ...valid, actorId: id(1) }).success).toBe(false)
    expect(freeSportsInputSchema.safeParse({ ...valid, zonePositions: [] }).success).toBe(false)
  })
  it('awards champion/finalist bonuses only after the direct entrant wins a real final', async () => {
    const directFinal = { type: 'ELIMINATION', round: 'FINAL', status: 'PENDING', winner_id: null, couple1_id: id(1), couple2_id: id(2), bracket_key: 'MAIN' }
    let coupleId = ''
    const single = jest.fn(async () => ({ data: { player1_id: `${coupleId}-player1`, player2_id: `${coupleId}-player2` }, error: null }))
    const client = { from: () => ({ select: () => ({ eq: (_: string, value: string) => { coupleId = value; return { single } } }) }) }
    const bonuses = { MAIN: { enabled: true, champion: 10, finalist: 5 } }
    const points = new Map<string, { earned: number; bonus: number }>()
    await BonusPointsCalculator.applyFinalBonuses([directFinal], points, POINTS_CONFIGS.AMERICAN, client, bonuses)
    expect(points.size).toBe(0)
    expect(single).not.toHaveBeenCalled()
    await BonusPointsCalculator.applyFinalBonuses([{ ...directFinal, status: 'FINISHED', winner_id: id(1) }], points, POINTS_CONFIGS.AMERICAN, client, bonuses)
    expect(points.get(`${id(1)}-player1`)).toEqual({ earned: 0, bonus: 10 })
    expect(points.get(`${id(2)}-player2`)).toEqual({ earned: 0, bonus: 5 })
    expect(single).toHaveBeenCalledTimes(2)
  })
  it('returns stale revision conflict from the only RPC without retrying', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: { code: '40001', message: 'La llave cambió. Recargá.' } }))
    const query = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), in: jest.fn(async () => ({ data: [], error: null })) }
    const client = { rpc, from: jest.fn(() => query) } as unknown as SupabaseClient
    await expect(mutateFreeSports(client, id(1), id(2), { expectedRevision: 0, operations: [{ kind: 'PROCESS_BYE', matchId: id(99) }] })).rejects.toMatchObject({ status: 409 })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0]).toEqual(['mutate_american_free_sports', expect.objectContaining({ p_actor_id: id(2), p_expected_revision: 0, p_zone_positions: [] })])
    expect(new FreeBracketPersistenceError('No', '42501').status).toBe(403)
  })
})
