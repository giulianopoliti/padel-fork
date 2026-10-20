import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import { buildTournamentFormatConfig } from '../tournament-format-config-builder'
import { TournamentFormatResolver } from '../tournament-format-resolver'
import { ZoneFixturePlanner } from '../zone-fixture-planner.service'
import { AdvancementPlanner } from '../advancement-planner.service'
import { isAmericanLibreTournament } from '../americano-libre-format'
import { canSwitchAmericanMultiZoneRuntime } from '../tournament-format-policy'

describe('Americano libre configuration', () => {
  it.each(['AMERICAN_MULTI_ZONE_FREE', 'AMERICAN_SINGLE_ZONE_FREE'] as const)('preserves manual configuration on reload: %s', (presetId) => {
    const config = buildTournamentFormatConfig({ presetId, singleAdvanceCount: 4, allocationMode: 'AUTO' })
    const resolved = TournamentFormatResolver.getResolvedFormat({ type: 'AMERICAN', format_config: JSON.parse(JSON.stringify(config)) }, { totalCouples: 24 })
    expect(resolved.bracketAssignment).toBe('MANUAL')
    expect(resolved.effectiveBracketMode).toBe('SINGLE')
    expect(resolved.qualificationSource).toBe('MANUAL')
    expect(resolved.effectiveAdvancementConfig).toEqual({ kind: 'SINGLE', advanceCount: 64, allocationMode: 'CUSTOM' })
    expect(isAmericanLibreTournament({ format_config: config })).toBe(true)
    expect(AdvancementPlanner.splitRankedEntries(['c1', 'c2'], config)).toEqual({ gold: [], silver: [], eliminated: [] })
    expect(AdvancementPlanner.validateAdvancementCounts(24, config)).toEqual({ isValid: true })
  })

  it('keeps the multi-zone three-match fixture and the zone-of-three exception', () => {
    const config = buildTournamentFormatConfig({ presetId: 'AMERICAN_MULTI_ZONE_FREE', matchesPerCouple: 3 })
    const plan = ZoneFixturePlanner.plan(11, config)
    expect(plan.isValid).toBe(true)
    expect(plan.zones.map((zone) => [zone.size, zone.matchesPerCouple])).toEqual([[4, 3], [4, 3], [3, 2]])
  })

  it('keeps a single zone with incomplete standings available as reference', () => {
    const plan = ZoneFixturePlanner.plan(8, getTournamentFormatPreset('AMERICAN_SINGLE_ZONE_FREE'))
    expect(plan.isValid).toBe(true)
    expect(plan.zones).toHaveLength(1)
    expect(plan.zones[0].matchesPerCouple).toBe(2)
  })

  it('does not turn existing formats into free mode or allow a runtime conversion', () => {
    const config = { ...getTournamentFormatPreset('AMERICAN_MULTI_ZONE_2'), bracketAssignment: 'MANUAL' as const }
    expect(isAmericanLibreTournament({ format_config: config })).toBe(false)
    expect(canSwitchAmericanMultiZoneRuntime('AMERICAN_MULTI_ZONE_2', 'AMERICAN_MULTI_ZONE_FREE')).toBe(false)
  })
})
