import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import { BracketQualificationAllocationService } from '@/lib/services/bracket-qualification-allocation.service'
import { AdvancementPlanner } from '@/lib/services/advancement-planner.service'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import { resolveZoneFixtureRequirements } from '@/lib/services/zone-fixture-requirements.service'
import { selectQualifiedEntries } from '@/lib/services/qualification-policy.service'

describe('single-zone American global format', () => {
  test.each([
    ['AMERICAN_SINGLE_ZONE_GLOBAL_2', 2, 'SINGLE'],
    ['AMERICAN_SINGLE_ZONE_GLOBAL_3', 3, 'SINGLE'],
    ['AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_2', 2, 'GOLD_SILVER'],
    ['AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_3', 3, 'GOLD_SILVER'],
  ] as const)('resolves %s', (presetId, targetMatches, bracketMode) => {
    const resolved = TournamentFormatResolver.getResolvedFormat({ format_config: getTournamentFormatPreset(presetId) }, { totalCouples: 9 })
    expect(resolved.zoneMode).toBe('SINGLE_ZONE')
    expect(resolved.rankingScope).toBe('GLOBAL')
    expect(resolved.targetMatchesPerCouple).toBe(targetMatches)
    expect(resolved.bracketMode).toBe(bracketMode)
  })

  test.each([3, 4, 5, 8, 9, 16, 31])('uses the full eligible population for SINGLE AUTO with %i couples', (totalCouples) => {
    expect(BracketQualificationAllocationService.getDefaultAllocation(totalCouples, 'SINGLE')).toEqual({
      kind: 'SINGLE',
      advanceCount: totalCouples,
      allocationMode: 'AUTO',
    })
  })

  test.each([4, 5, 8, 9, 16, 31])('splits GOLD/SILVER AUTO without overlap for %i couples', (totalCouples) => {
    const allocation = BracketQualificationAllocationService.getDefaultAllocation(totalCouples, 'GOLD_SILVER')
    const entries = Array.from({ length: totalCouples }, (_, index) => ({
      id: `couple-${index + 1}`,
      localPosition: null,
      zoneId: null,
    }))
    const gold = selectQualifiedEntries(entries, allocation, 'GOLD')
    const silver = selectQualifiedEntries(entries, allocation, 'SILVER')

    expect(gold).toHaveLength(Math.floor(totalCouples / 2))
    expect(silver).toHaveLength(Math.ceil(totalCouples / 2))
    expect(new Set([...gold, ...silver].map((entry) => entry.id)).size).toBe(totalCouples)
  })

  test('only materializes AUTO when the eligible population is known', () => {
    const preset = getTournamentFormatPreset('AMERICAN_SINGLE_ZONE_GLOBAL_2')
    const unresolved = TournamentFormatResolver.getResolvedFormat({ format_config: preset })
    const resolved = TournamentFormatResolver.getResolvedFormat({ format_config: preset }, { totalCouples: 8 })

    expect(unresolved.effectiveAdvancementConfig).toMatchObject({ advanceCount: 64, allocationMode: 'AUTO' })
    expect(resolved.effectiveAdvancementConfig).toMatchObject({ advanceCount: 8, allocationMode: 'AUTO' })
  })

  test('validates custom allocations', () => {
    expect(BracketQualificationAllocationService.validateAllocation(10, { kind: 'SINGLE', advanceCount: 8, allocationMode: 'CUSTOM' }).isValid).toBe(true)
    expect(BracketQualificationAllocationService.validateAllocation(10, { kind: 'GOLD_SILVER', goldCount: 4, silverCount: 4, eliminatedCount: 2, allocationMode: 'CUSTOM' }).isValid).toBe(true)
    expect(BracketQualificationAllocationService.validateAllocation(10, { kind: 'GOLD_SILVER', goldCount: 8, silverCount: 4, eliminatedCount: -2 }).isValid).toBe(false)
    expect(BracketQualificationAllocationService.validateAllocation(10, { kind: 'GOLD_SILVER', goldCount: 4, silverCount: 4, eliminatedCount: 0, allocationMode: 'CUSTOM' }).isValid).toBe(false)
    expect(BracketQualificationAllocationService.normalizeAllocation(10, { kind: 'GOLD_SILVER', goldCount: 4, silverCount: 4, eliminatedCount: 0 })).toEqual({
      kind: 'GOLD_SILVER',
      goldCount: 4,
      silverCount: 4,
      eliminatedCount: 2,
      allocationMode: 'CUSTOM',
    })
  })

  test('allows a direct final with two qualified single-zone couples', () => {
    const config = getTournamentFormatPreset('AMERICAN_SINGLE_ZONE_GLOBAL_2')
    config.advancementConfig = { kind: 'SINGLE', advanceCount: 2, allocationMode: 'CUSTOM' }

    expect(AdvancementPlanner.validateAdvancementCounts(3, config)).toEqual({ isValid: true })
  })

  test('applies the odd three-match exception without duplicate opponents', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const pairs = [['a','b'], ['a','c'], ['a','d'], ['b','c'], ['b','e'], ['c','f'], ['d','e'], ['d','g'], ['e','f'], ['f','g']]
    const result = resolveZoneFixtureRequirements({ coupleIds: ids, targetMatchesPerCouple: 3, zoneMode: 'SINGLE_ZONE', baseType: 'AMERICAN', matches: pairs.map(([couple1_id, couple2_id]) => ({ couple1_id, couple2_id })) })
    expect(result.expectedTotalMatches).toBe(10)
    expect(result.oddThreeMatchExceptionApplied).toBe(true)
    expect(result.isComplete).toBe(true)
  })

  test.each([5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31])(
    'accepts a complete three-match fixture with %i odd couples',
    (coupleCount) => {
      const ids = Array.from({ length: coupleCount }, (_, index) => `couple-${index}`)
      const pairs = ids.map((coupleId, index) => [coupleId, ids[(index + 1) % coupleCount]])
      const offset = (coupleCount - 1) / 2
      for (let index = 0; index < offset; index += 1) {
        pairs.push([ids[index], ids[index + offset]])
      }

      const result = resolveZoneFixtureRequirements({
        coupleIds: ids,
        targetMatchesPerCouple: 3,
        zoneMode: 'SINGLE_ZONE',
        baseType: 'AMERICAN',
        matches: pairs.map(([couple1_id, couple2_id]) => ({ couple1_id, couple2_id })),
      })

      expect(result.isComplete).toBe(true)
      expect(result.incompleteCouples).toEqual([])
      expect(result.overLimitCouples).toEqual([])
      expect(result.duplicateMatches).toEqual([])
    }
  )

  test('keeps completed matches against a disqualified couple as active fixture credit', () => {
    const result = resolveZoneFixtureRequirements({
      coupleIds: ['a', 'b', 'c'],
      targetMatchesPerCouple: 2,
      zoneMode: 'SINGLE_ZONE',
      baseType: 'AMERICAN',
      disqualifiedCoupleIds: ['d'],
      matches: [
        { couple1_id: 'a', couple2_id: 'b' },
        { couple1_id: 'b', couple2_id: 'c' },
        { couple1_id: 'a', couple2_id: 'd', status: 'FINISHED' },
        { couple1_id: 'c', couple2_id: 'd', status: 'FINISHED' },
      ],
    })

    expect(result.isComplete).toBe(true)
    expect(result.incompleteCouples).toEqual([])
    expect(result.duplicateMatches).toEqual([])
  })

  test('reports every remaining deficit after applying the single odd exception once', () => {
    const result = resolveZoneFixtureRequirements({
      coupleIds: ['a', 'b', 'c', 'd', 'e'],
      targetMatchesPerCouple: 3,
      zoneMode: 'SINGLE_ZONE',
      baseType: 'AMERICAN',
      matches: [
        { couple1_id: 'a', couple2_id: 'b' },
        { couple1_id: 'a', couple2_id: 'c' },
        { couple1_id: 'b', couple2_id: 'd' },
        { couple1_id: 'c', couple2_id: 'd' },
        { couple1_id: 'c', couple2_id: 'e' },
        { couple1_id: 'd', couple2_id: 'e' },
      ],
    })

    expect(result.isComplete).toBe(false)
    expect(result.incompleteCouples).toEqual([
      { coupleId: 'b', matchCount: 2, missingMatches: 1 },
      { coupleId: 'e', matchCount: 2, missingMatches: 1 },
    ])
  })

  test('does not require the odd underplayed couple after historical DQ credits satisfy every active quota', () => {
    const result = resolveZoneFixtureRequirements({
      coupleIds: ['a', 'b', 'c', 'd', 'e'],
      targetMatchesPerCouple: 3,
      zoneMode: 'SINGLE_ZONE',
      baseType: 'AMERICAN',
      disqualifiedCoupleIds: ['dq'],
      matches: [
        { couple1_id: 'a', couple2_id: 'b' },
        { couple1_id: 'b', couple2_id: 'c' },
        { couple1_id: 'c', couple2_id: 'd' },
        { couple1_id: 'd', couple2_id: 'e' },
        { couple1_id: 'e', couple2_id: 'a' },
        { couple1_id: 'a', couple2_id: 'dq', status: 'FINISHED' },
        { couple1_id: 'b', couple2_id: 'dq', status: 'FINISHED' },
        { couple1_id: 'c', couple2_id: 'dq', status: 'FINISHED' },
        { couple1_id: 'd', couple2_id: 'dq', status: 'FINISHED' },
        { couple1_id: 'e', couple2_id: 'dq', status: 'FINISHED' },
      ],
    })

    expect(result.incompleteCouples).toEqual([])
    expect(result.overLimitCouples).toEqual([])
    expect(result.isComplete).toBe(true)
  })

  test.each([4, 5, 8, 9, 16, 31])('accepts a complete two-match cycle with %i couples', (coupleCount) => {
    const ids = Array.from({ length: coupleCount }, (_, index) => `couple-${index}`)
    const matches = ids.map((coupleId, index) => ({
      couple1_id: coupleId,
      couple2_id: ids[(index + 1) % coupleCount],
    }))

    const result = resolveZoneFixtureRequirements({
      coupleIds: ids,
      targetMatchesPerCouple: 2,
      zoneMode: 'SINGLE_ZONE',
      baseType: 'AMERICAN',
      matches,
    })

    expect(result).toMatchObject({
      expectedTotalMatches: coupleCount,
      incompleteCouples: [],
      overLimitCouples: [],
      duplicateMatches: [],
      isComplete: true,
    })
  })

  it('rejects duplicate opponents and per-couple excesses', () => {
    const result = resolveZoneFixtureRequirements({
      coupleIds: ['a', 'b', 'c', 'd'],
      targetMatchesPerCouple: 2,
      zoneMode: 'SINGLE_ZONE',
      baseType: 'AMERICAN',
      matches: [
        { couple1_id: 'a', couple2_id: 'b' },
        { couple1_id: 'b', couple2_id: 'a' },
        { couple1_id: 'a', couple2_id: 'c' },
        { couple1_id: 'c', couple2_id: 'd' },
        { couple1_id: 'd', couple2_id: 'b' },
      ],
    })

    expect(result.duplicateMatches).toEqual([{ couple1Id: 'a', couple2Id: 'b' }])
    expect(result.overLimitCouples).toEqual([
      { coupleId: 'a', matchCount: 3, limit: 2 },
      { coupleId: 'b', matchCount: 3, limit: 2 },
    ])
    expect(result.isComplete).toBe(false)
  })
})
