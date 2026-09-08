import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import { AdvancementPlanner } from '@/lib/services/advancement-planner.service'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import { ZoneFixturePlanner } from '@/lib/services/zone-fixture-planner.service'

describe('Tournament format v2', () => {
  it('maps legacy american tournaments to multi-zone 2 matches', () => {
    const resolved = TournamentFormatResolver.getResolvedFormat({ type: 'AMERICAN' })

    expect(resolved.presetId).toBe('AMERICAN_MULTI_ZONE_2')
    expect(resolved.zoneMode).toBe('MULTI_ZONE')
  })

  it('keeps american single-zone as round-robin champion', () => {
    const resolved = TournamentFormatResolver.getResolvedFormat(
      { format_config: getTournamentFormatPreset('AMERICAN_SINGLE_ZONE_ROUND_ROBIN_CHAMPION') },
      { totalCouples: 5 }
    )

    expect(resolved.effectiveZoneStage).toBe('ROUND_ROBIN')
    expect(resolved.effectiveBracketMode).toBe('NONE')
    expect(resolved.effectiveAdvancementConfig.kind).toBe('NONE')
  })

  it('plans american multi-zone 3-match tournaments with 3 and 4-couple zones only', () => {
    const plan = ZoneFixturePlanner.plan(11, getTournamentFormatPreset('AMERICAN_MULTI_ZONE_3'))

    expect(plan.isValid).toBe(true)
    expect(plan.zones.map((zone) => zone.size)).toEqual([4, 4, 3])
    expect(plan.zones[0].matchesPerCouple).toBe(3)
    expect(plan.zones[2].matchesPerCouple).toBe(2)
  })

  it('normalizes old american multi-zone SINGLE configs to per-zone ALL', () => {
    const legacyConfig = {
      ...getTournamentFormatPreset('AMERICAN_MULTI_ZONE_2'),
      advancementConfig: { kind: 'SINGLE' as const, advanceCount: 8 },
    }

    const resolved = TournamentFormatResolver.getResolvedFormat({
      type: 'AMERICAN',
      format_config: legacyConfig,
    })

    expect(resolved.effectiveAdvancementConfig).toEqual({
      kind: 'PER_ZONE_TOP',
      couplesPerZone: 'ALL',
    })
  })

  it('resolves LONG_SINGLE_ZONE_BRACKET to 3 matches per couple by default', () => {
    const resolved = TournamentFormatResolver.getResolvedFormat(
      { type: 'LONG', format_config: getTournamentFormatPreset('LONG_SINGLE_ZONE_BRACKET') },
      { totalCouples: 10 }
    )

    expect(resolved.effectiveZoneStage).toBe('FIXED_MATCH_COUNT')
    expect(resolved.effectiveTargetMatchesPerCouple).toBe(3)
  })

  it('normalizes stale LONG_SINGLE_ZONE_BRACKET round-robin configs to the current fixed match preset', () => {
    const staleConfig = {
      ...getTournamentFormatPreset('LONG_SINGLE_ZONE_BRACKET'),
      zoneStage: 'ROUND_ROBIN' as const,
      targetMatchesPerCouple: null,
      display: {
        name: 'Long zona unica + llave',
        description: 'Zona unica todos contra todos y luego llave unica.',
      },
    }

    const resolved = TournamentFormatResolver.getResolvedFormat(
      { type: 'LONG', format_config: staleConfig },
      { totalCouples: 10 }
    )

    expect(resolved.effectiveZoneStage).toBe('FIXED_MATCH_COUNT')
    expect(resolved.effectiveTargetMatchesPerCouple).toBe(3)
  })

  it('keeps explicit LONG_SINGLE_ZONE_BRACKET matches per couple overrides', () => {
    const customConfig = {
      ...getTournamentFormatPreset('LONG_SINGLE_ZONE_BRACKET'),
      targetMatchesPerCouple: 4,
    }

    const resolved = TournamentFormatResolver.getResolvedFormat(
      { type: 'LONG', format_config: customConfig },
      { totalCouples: 10 }
    )

    expect(resolved.effectiveZoneStage).toBe('FIXED_MATCH_COUNT')
    expect(resolved.effectiveTargetMatchesPerCouple).toBe(4)
  })

  it('normalizes stale LONG_SINGLE_ZONE_GOLD_SILVER round-robin configs to the current fixed match preset', () => {
    const staleConfig = {
      ...getTournamentFormatPreset('LONG_SINGLE_ZONE_GOLD_SILVER'),
      zoneStage: 'ROUND_ROBIN' as const,
      targetMatchesPerCouple: null,
      display: {
        name: 'Long zona unica (Oro y Plata)',
        description: 'Todos contra todos y luego Copa de Oro y Copa de Plata.',
      },
    }

    const resolved = TournamentFormatResolver.getResolvedFormat(
      { type: 'LONG', format_config: staleConfig },
      { totalCouples: 10 }
    )

    expect(resolved.effectiveZoneStage).toBe('FIXED_MATCH_COUNT')
    expect(resolved.effectiveTargetMatchesPerCouple).toBe(3)
    expect(resolved.effectiveBracketMode).toBe('GOLD_SILVER')
  })

  it('derives eliminated couples instead of trusting a stale persisted value', () => {
    const config = getTournamentFormatPreset('LONG_SINGLE_ZONE_GOLD_SILVER')
    if (config.advancementConfig.kind === 'GOLD_SILVER') {
      config.advancementConfig.goldCount = 4
      config.advancementConfig.silverCount = 4
      config.advancementConfig.eliminatedCount = 1
    }

    const validation = AdvancementPlanner.validateAdvancementCounts(10, config)

    expect(validation.isValid).toBe(true)
    const resolved = TournamentFormatResolver.getResolvedFormat(
      { type: 'LONG', format_config: config },
      { totalCouples: 10 }
    )
    expect(resolved.effectiveAdvancementConfig).toMatchObject({ eliminatedCount: 2 })
  })

  it('splits gold, silver and eliminated couples from ranking order', () => {
    const config = getTournamentFormatPreset('LONG_SINGLE_ZONE_GOLD_SILVER')
    if (config.advancementConfig.kind === 'GOLD_SILVER') {
      config.advancementConfig.goldCount = 4
      config.advancementConfig.silverCount = 4
      config.advancementConfig.eliminatedCount = 2
    }

    const ranking = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
    const result = AdvancementPlanner.splitRankedEntries(ranking, config, { totalCouples: ranking.length })

    expect(result.gold).toEqual(['A', 'B', 'C', 'D'])
    expect(result.silver).toEqual(['E', 'F', 'G', 'H'])
    expect(result.eliminated).toEqual(['I', 'J'])
  })
})

