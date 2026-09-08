import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'

type TournamentLike = {
  type?: string | null
  format_type?: string | null
  format_config?: unknown
}

export const RUNTIME_AMERICAN_MULTI_ZONE_PRESET_IDS = [
  'AMERICAN_MULTI_ZONE_2',
  'AMERICAN_MULTI_ZONE_3',
  'AMERICAN_MULTI_ZONE_GLOBAL_2',
  'AMERICAN_MULTI_ZONE_GLOBAL_3',
  'AMERICAN_MULTI_ZONE_HYBRID_2',
  'AMERICAN_MULTI_ZONE_HYBRID_3',
] as const

export const RUNTIME_AMERICAN_SINGLE_ZONE_PRESET_IDS = [
  'AMERICAN_SINGLE_ZONE_GLOBAL_2',
  'AMERICAN_SINGLE_ZONE_GLOBAL_3',
  'AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_2',
  'AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_3',
] as const

export function isRuntimeAmericanMultiZonePreset(presetId?: string | null): boolean {
  return Boolean(
    presetId &&
    RUNTIME_AMERICAN_MULTI_ZONE_PRESET_IDS.includes(
      presetId as (typeof RUNTIME_AMERICAN_MULTI_ZONE_PRESET_IDS)[number]
    )
  )
}

export function isRuntimeAmericanSingleZonePreset(presetId?: string | null): boolean {
  return Boolean(
    presetId &&
    RUNTIME_AMERICAN_SINGLE_ZONE_PRESET_IDS.includes(
      presetId as (typeof RUNTIME_AMERICAN_SINGLE_ZONE_PRESET_IDS)[number]
    )
  )
}

export function canSwitchAmericanMultiZoneRuntime(
  currentPresetId?: string | null,
  nextPresetId?: string | null
): boolean {
  return (
    isRuntimeAmericanMultiZonePreset(currentPresetId) &&
    isRuntimeAmericanMultiZonePreset(nextPresetId)
  )
}

export function canSwitchAmericanSingleZoneRuntime(
  currentPresetId?: string | null,
  nextPresetId?: string | null
): boolean {
  return (
    isRuntimeAmericanSingleZonePreset(currentPresetId) &&
    isRuntimeAmericanSingleZonePreset(nextPresetId)
  )
}

export function hasSameAmericanZoneTopology(
  currentPresetId?: string | null,
  nextPresetId?: string | null
): boolean {
  return (
    (isRuntimeAmericanMultiZonePreset(currentPresetId) && isRuntimeAmericanMultiZonePreset(nextPresetId)) ||
    (isRuntimeAmericanSingleZonePreset(currentPresetId) && isRuntimeAmericanSingleZonePreset(nextPresetId))
  )
}

export function isFormatStatusAllowedForRuntimeSwitch(status?: string | null): boolean {
  return status === 'NOT_STARTED' || status === 'ZONE_PHASE'
}

export function hasFormatConfigV2(tournament: TournamentLike): boolean {
  return Boolean((tournament as any)?.format_config?.version === 2)
}

export function shouldUseLegacyQualifying(tournament: TournamentLike): boolean {
  return !hasFormatConfigV2(tournament)
}

export function shouldWrapLegacyEndpointsWithCanonicalFlow(
  tournament: TournamentLike
): boolean {
  if (!hasFormatConfigV2(tournament)) {
    return false
  }

  const resolved = TournamentFormatResolver.getResolvedFormat(tournament)
  return (
    resolved.presetId === 'AMERICAN_MULTI_ZONE_2' ||
    resolved.presetId === 'AMERICAN_MULTI_ZONE_3' ||
    resolved.presetId === 'AMERICAN_MULTI_ZONE_GLOBAL_2' ||
    resolved.presetId === 'AMERICAN_MULTI_ZONE_GLOBAL_3' ||
    resolved.presetId === 'AMERICAN_MULTI_ZONE_HYBRID_2' ||
    resolved.presetId === 'AMERICAN_MULTI_ZONE_HYBRID_3' ||
    isRuntimeAmericanSingleZonePreset(resolved.presetId) ||
    resolved.presetId === 'LONG_SINGLE_ZONE_BRACKET' ||
    resolved.presetId === 'LONG_SINGLE_ZONE_GOLD_SILVER'
  )
}
