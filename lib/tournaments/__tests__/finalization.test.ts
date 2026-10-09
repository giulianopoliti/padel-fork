import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import { getFinalizationEligibility, validateTournamentBonuses, getTournamentBonuses } from '../finalization'
import type { FinalizationMatch, FinalizationTournament } from '../finalization'
import { BonusPointsCalculator } from '@/lib/services/points/calculators/bonus-points.calculator'
import { POINTS_CONFIGS } from '@/lib/services/points/types/points-config.types'

const tournament = (type: 'AMERICAN' | 'LONG' = 'AMERICAN'): FinalizationTournament => ({
  type, status: 'BRACKET_PHASE', format_type: null,
  format_config: getTournamentFormatPreset(type === 'LONG' ? 'LONG_SINGLE_ZONE_GOLD_SILVER' : 'AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_2'),
})
const final = (key: string, status = 'FINISHED'): FinalizationMatch => ({
  id: key, type: 'ELIMINATION', round: 'FINAL', bracket_key: key, status,
  winner_id: status === 'FINISHED' ? `${key}-winner` : null,
})
const zone: FinalizationMatch = { id: 'zone', type: 'ZONE', round: 'ZONE', bracket_key: 'MAIN', status: 'FINISHED', winner_id: 'zone-winner' }

describe.each(['AMERICAN', 'LONG'] as const)('Manual finalization for %s', type => {
  it('blocks empty tournaments and completed zones without brackets', () => {
    expect(getFinalizationEligibility(tournament(type), []).canFinalize).toBe(false)
    expect(getFinalizationEligibility(tournament(type), [zone]).canFinalize).toBe(false)
  })
  it('requires both cups, including their finals', () => {
    expect(getFinalizationEligibility(tournament(type), [zone, final('GOLD')]).canFinalize).toBe(false)
  })
  it('blocks duplicate finals instead of selecting an arbitrary champion', () => {
    expect(getFinalizationEligibility(tournament(type), [final('GOLD'), final('GOLD'), final('SILVER')]).canFinalize).toBe(false)
  })
  it.each(['PENDING', 'WAITING_OPONENT', 'IN_PROGRESS', 'DRAFT'])('blocks unfinished matches: %s', status => {
    const state = getFinalizationEligibility(tournament(type), [zone, final('GOLD'), final('SILVER', status)])
    expect(state.canFinalize).toBe(false)
    expect(state.pendingMatches).toBe(1)
  })
  it('requires finished zones even if both finals ended', () => {
    expect(getFinalizationEligibility(tournament(type), [{ ...zone, status: 'PENDING' }, final('GOLD'), final('SILVER')]).canFinalize).toBe(false)
  })
  it('requires winners in completed finals', () => {
    expect(getFinalizationEligibility(tournament(type), [final('GOLD'), { ...final('SILVER'), winner_id: null }]).canFinalize).toBe(false)
  })
  it('enables manual closing and returns both champions only when everything finished', () => {
    const state = getFinalizationEligibility(tournament(type), [zone, final('SILVER'), final('GOLD')])
    expect(state.canFinalize).toBe(true)
    expect(state.champions.map(champion => champion.bracketKey)).toEqual(['GOLD', 'SILVER'])
    expect(tournament(type).status).toBe('BRACKET_PHASE')
  })
  it('does not close an already finalized tournament again', () => {
    expect(getFinalizationEligibility({ ...tournament(type), status: 'FINISHED_POINTS_PENDING' }, [final('GOLD'), final('SILVER')]).canFinalize).toBe(false)
  })
})

describe('Cup bonuses', () => {
  const both = { GOLD: { enabled: true, champion: 100, finalist: 20 }, SILVER: { enabled: true, champion: 50, finalist: 5 } }
  it('accepts disabled cups and zero points, rejects invalid points and unknown keys', () => {
    expect(validateTournamentBonuses(both, ['GOLD', 'SILVER'])).toBe(true)
    expect(validateTournamentBonuses({ ...both, SILVER: { enabled: false, champion: 0, finalist: 0 } }, ['GOLD', 'SILVER'])).toBe(true)
    for (const champion of [-1, 0.5, NaN, Infinity, 10001, '20']) {
      expect(validateTournamentBonuses({ ...both, GOLD: { ...both.GOLD, champion } }, ['GOLD', 'SILVER'])).toBe(false)
    }
    expect(validateTournamentBonuses({ GOLD: both.GOLD }, ['GOLD', 'SILVER'])).toBe(false)
    expect(validateTournamentBonuses({ ...both, MAIN: both.GOLD }, ['GOLD', 'SILVER'])).toBe(false)
  })
  it('preserves selected configuration and supplies defaults per tournament type', () => {
    expect(getTournamentBonuses({ type: 'LONG', format_config: null }, ['GOLD', 'SILVER']).GOLD?.champion).toBe(60)
    expect(getTournamentBonuses({ type: 'AMERICAN', format_config: { bonuses: both } }, ['GOLD', 'SILVER'])).toEqual(both)
  })
  it.each(['BOTH', 'GOLD', 'SILVER', 'NONE'])('applies only selected cup bonuses: %s, independent of match order', async selection => {
    const bonuses = {
      GOLD: { ...both.GOLD, enabled: selection === 'BOTH' || selection === 'GOLD' },
      SILVER: { ...both.SILVER, enabled: selection === 'BOTH' || selection === 'SILVER' },
    }
    const single = jest.fn(async () => ({ data: { player1_id: currentId, player2_id: null }, error: null }))
    let currentId = ''
    const supabase = { from: jest.fn(() => ({ select: () => ({ eq: (_: string, id: string) => { currentId = id; return { single } } }) })) }
    const matches = ['SILVER', 'GOLD'].map(key => ({ ...final(key), couple1_id: `${key}-winner`, couple2_id: `${key}-loser` }))
    const points = new Map<string, { earned: number; bonus: number }>()
    await BonusPointsCalculator.applyFinalBonuses(matches, points, POINTS_CONFIGS.AMERICAN, supabase, bonuses)
    expect(points.get('GOLD-winner')?.bonus ?? 0).toBe(bonuses.GOLD.enabled ? 100 : 0)
    expect(points.get('GOLD-loser')?.bonus ?? 0).toBe(bonuses.GOLD.enabled ? 20 : 0)
    expect(points.get('SILVER-winner')?.bonus ?? 0).toBe(bonuses.SILVER.enabled ? 50 : 0)
    expect(points.get('SILVER-loser')?.bonus ?? 0).toBe(bonuses.SILVER.enabled ? 5 : 0)
  })
})
