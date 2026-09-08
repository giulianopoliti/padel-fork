import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import { BracketQualificationAllocationService } from '@/lib/services/bracket-qualification-allocation.service'
import type {
  AdvancementConfig,
  ResolvedTournamentFormat,
  TournamentFormatConfigV2,
  TournamentFormatPresetId,
} from '@/types/tournament-format-v2'

type TournamentLike = {
  type?: string | null
  format_type?: string | null
  format_config?: unknown
}

function isAdvancementConfig(value: any): value is AdvancementConfig {
  return value && typeof value === 'object' && typeof value.kind === 'string'
}

function isTournamentFormatConfigV2(value: any): value is TournamentFormatConfigV2 {
  return (
    value &&
    typeof value === 'object' &&
    value.version === 2 &&
    typeof value.presetId === 'string' &&
    typeof value.baseType === 'string' &&
    typeof value.zoneMode === 'string' &&
    typeof value.zoneStage === 'string' &&
    typeof value.bracketMode === 'string' &&
    isAdvancementConfig(value.advancementConfig)
  )
}

function hydrateFormatConfig(value: TournamentFormatConfigV2): TournamentFormatConfigV2 {
  const preset = getTournamentFormatPreset(value.presetId)
  const isLegacyRedirect = value.presetId !== preset.presetId
  const shouldUsePresetAdvancementConfig = (
    isLegacyRedirect ||
    (
      (preset.presetId === 'AMERICAN_MULTI_ZONE_2' || preset.presetId === 'AMERICAN_MULTI_ZONE_3') &&
      value.advancementConfig?.kind !== 'PER_ZONE_TOP'
    )
  )
  const isFixedMatchCountPreset = preset.zoneStage === 'FIXED_MATCH_COUNT'
  const hasExplicitTargetMatchesPerCouple =
    typeof value.targetMatchesPerCouple === 'number' &&
    Number.isFinite(value.targetMatchesPerCouple) &&
    value.targetMatchesPerCouple > 0

  return {
    ...preset,
    ...structuredClone(value),
    presetId: preset.presetId,
    baseType: preset.baseType,
    zoneMode: preset.zoneMode,
    zoneStage: preset.zoneStage,
    targetMatchesPerCouple: isFixedMatchCountPreset
      ? (hasExplicitTargetMatchesPerCouple ? value.targetMatchesPerCouple : preset.targetMatchesPerCouple)
      : (isLegacyRedirect ? preset.targetMatchesPerCouple : value.targetMatchesPerCouple),
    bracketMode: preset.bracketMode,
    zoneRules: {
      ...preset.zoneRules,
      ...(value.zoneRules || {}),
    },
    display: {
      ...preset.display,
      ...(value.display || {}),
    },
    advancementConfig: structuredClone(
      shouldUsePresetAdvancementConfig
        ? preset.advancementConfig
        : value.advancementConfig || preset.advancementConfig
    ),
    rankingScope: isLegacyRedirect ? preset.rankingScope : value.rankingScope || preset.rankingScope,
    rankingPolicyId: isLegacyRedirect ? preset.rankingPolicyId : value.rankingPolicyId || preset.rankingPolicyId,
    qualificationSource: isLegacyRedirect ? preset.qualificationSource : value.qualificationSource || preset.qualificationSource,
    bracketSeedingStrategy: isLegacyRedirect ? preset.bracketSeedingStrategy : value.bracketSeedingStrategy || preset.bracketSeedingStrategy,
  }
}

function getLegacyPresetId(tournament: TournamentLike): TournamentFormatPresetId {
  if (tournament.type === 'LONG') {
    return 'LONG_SINGLE_ZONE_BRACKET'
  }

  if (tournament.type === 'AMERICAN_OTP' || tournament.type === 'AMERICANO') {
    return 'AMERICAN_SINGLE_ZONE_ROUND_ROBIN_CHAMPION'
  }

  if (tournament.format_type === 'AMERICAN_3') {
    return 'AMERICAN_MULTI_ZONE_3'
  }

  return 'AMERICAN_MULTI_ZONE_2'
}

export class TournamentFormatResolver {
  static getResolvedFormat(
    tournament: TournamentLike,
    options: {
      totalCouples?: number
    } = {}
  ): ResolvedTournamentFormat {
    const rawConfig = tournament.format_config
    const baseConfig = isTournamentFormatConfigV2(rawConfig)
      ? hydrateFormatConfig(rawConfig)
      : getTournamentFormatPreset(getLegacyPresetId(tournament))

    const notes: string[] = []
    let effectiveZoneStage = baseConfig.zoneStage
    let effectiveTargetMatchesPerCouple = baseConfig.targetMatchesPerCouple
    let effectiveBracketMode = baseConfig.bracketMode
    let effectiveAdvancementConfig = structuredClone(baseConfig.advancementConfig)

    const totalCouples = options.totalCouples

    if (typeof totalCouples === 'number' && totalCouples >= 0) {
      effectiveAdvancementConfig = BracketQualificationAllocationService.applyAutomaticAllocation(
        totalCouples,
        effectiveAdvancementConfig
      )
    }

    if (
      baseConfig.baseType === 'AMERICAN' &&
      baseConfig.zoneMode === 'MULTI_ZONE' &&
      baseConfig.targetMatchesPerCouple === 3
    ) {
      notes.push('MZ3 requiere 3 partidos por pareja en zonas de 4; zonas de 3 juegan 2 por pareja.')
    }

    return {
      ...baseConfig,
      effectiveZoneStage,
      effectiveTargetMatchesPerCouple,
      effectiveBracketMode,
      effectiveAdvancementConfig,
      appliedNotes: notes,
    }
  }
}
