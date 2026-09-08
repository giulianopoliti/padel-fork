import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import {
  canSwitchAmericanMultiZoneRuntime,
  canSwitchAmericanSingleZoneRuntime,
  hasFormatConfigV2,
  hasSameAmericanZoneTopology,
  isFormatStatusAllowedForRuntimeSwitch,
  isRuntimeAmericanMultiZonePreset,
  isRuntimeAmericanSingleZonePreset,
  shouldUseLegacyQualifying,
  shouldWrapLegacyEndpointsWithCanonicalFlow,
} from '@/lib/services/tournament-format-policy'

describe('tournament-format-policy', () => {
  it('treats v2 format configs as non-legacy for qualifying settings', () => {
    expect(hasFormatConfigV2({
      type: 'AMERICAN',
      format_config: getTournamentFormatPreset('AMERICAN_MULTI_ZONE_2'),
    })).toBe(true)
    expect(shouldUseLegacyQualifying({ type: 'LONG', format_config: null })).toBe(true)
  })

  it('wraps supported v2 presets with the canonical bracket flow', () => {
    expect(shouldWrapLegacyEndpointsWithCanonicalFlow({
      type: 'AMERICAN',
      format_config: getTournamentFormatPreset('AMERICAN_MULTI_ZONE_GLOBAL_2'),
    })).toBe(true)
    expect(shouldWrapLegacyEndpointsWithCanonicalFlow({
      type: 'LONG',
      format_config: getTournamentFormatPreset('LONG_SINGLE_ZONE_BRACKET'),
    })).toBe(true)
    expect(shouldWrapLegacyEndpointsWithCanonicalFlow({ type: 'AMERICAN', format_config: null })).toBe(false)
  })

  it('allows runtime switches only in NOT_STARTED and ZONE_PHASE', () => {
    expect(isFormatStatusAllowedForRuntimeSwitch('NOT_STARTED')).toBe(true)
    expect(isFormatStatusAllowedForRuntimeSwitch('ZONE_PHASE')).toBe(true)
    expect(isFormatStatusAllowedForRuntimeSwitch('BRACKET_PHASE')).toBe(false)
  })

  it('recognizes every operational multizone preset and rejects legacy singlezone ids', () => {
    for (const presetId of [
      'AMERICAN_MULTI_ZONE_2',
      'AMERICAN_MULTI_ZONE_3',
      'AMERICAN_MULTI_ZONE_GLOBAL_2',
      'AMERICAN_MULTI_ZONE_GLOBAL_3',
      'AMERICAN_MULTI_ZONE_HYBRID_2',
      'AMERICAN_MULTI_ZONE_HYBRID_3',
    ]) {
      expect(isRuntimeAmericanMultiZonePreset(presetId)).toBe(true)
    }
    expect(isRuntimeAmericanMultiZonePreset('AMERICAN_SINGLE_ZONE_2_BRACKET')).toBe(false)
  })
})

describe('American runtime format topology policy', () => {
  const singleMain = 'AMERICAN_SINGLE_ZONE_GLOBAL_2'
  const singleCups = 'AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_3'
  const multi = 'AMERICAN_MULTI_ZONE_GLOBAL_2'

  test('keeps single-zone presets out of the multizone classifier', () => {
    expect(isRuntimeAmericanSingleZonePreset(singleMain)).toBe(true)
    expect(isRuntimeAmericanMultiZonePreset(singleMain)).toBe(false)
  })

  test('allows changes within a topology and distinguishes topology changes', () => {
    expect(canSwitchAmericanSingleZoneRuntime(singleMain, singleCups)).toBe(true)
    expect(canSwitchAmericanMultiZoneRuntime(multi, 'AMERICAN_MULTI_ZONE_GLOBAL_3')).toBe(true)
    expect(hasSameAmericanZoneTopology(singleMain, singleCups)).toBe(true)
    expect(hasSameAmericanZoneTopology(singleMain, multi)).toBe(false)
  })
})
