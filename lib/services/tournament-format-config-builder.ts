import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import type {
  CouplesPerZone,
  GoldSilverAdvancementConfig,
  PerZoneTopAdvancementConfig,
  SingleBracketAdvancementConfig,
  TournamentFormatConfigV2,
  TournamentFormatPresetId,
} from '@/types/tournament-format-v2'

export type TournamentFormatBuilderInput = {
  presetId: TournamentFormatPresetId
  couplesPerZone?: CouplesPerZone | null
  singleAdvanceCount?: number | null
  matchesPerCouple?: number | null
  goldCount?: number | null
  silverCount?: number | null
  eliminatedCount?: number | null
  allocationMode?: 'AUTO' | 'CUSTOM' | null
}

export function buildTournamentFormatConfig(
  input: TournamentFormatBuilderInput
): TournamentFormatConfigV2 {
  const config = getTournamentFormatPreset(input.presetId)

  if (typeof input.matchesPerCouple === 'number' && input.matchesPerCouple > 0) {
    config.targetMatchesPerCouple = input.matchesPerCouple
  }

  if (config.advancementConfig.kind === 'PER_ZONE_TOP') {
    const couplesPerZone = input.couplesPerZone ?? config.advancementConfig.couplesPerZone
    ;(config.advancementConfig as PerZoneTopAdvancementConfig).couplesPerZone = couplesPerZone
  }

  if (config.advancementConfig.kind === 'SINGLE') {
    const nextAdvanceCount = input.singleAdvanceCount ?? config.advancementConfig.advanceCount
    ;(config.advancementConfig as SingleBracketAdvancementConfig).advanceCount = nextAdvanceCount
    ;(config.advancementConfig as SingleBracketAdvancementConfig).allocationMode = input.allocationMode ?? config.advancementConfig.allocationMode
  }

  if (config.advancementConfig.kind === 'GOLD_SILVER') {
    const goldSilverConfig = config.advancementConfig as GoldSilverAdvancementConfig
    goldSilverConfig.goldCount = input.goldCount ?? goldSilverConfig.goldCount
    goldSilverConfig.silverCount = input.silverCount ?? goldSilverConfig.silverCount
    goldSilverConfig.eliminatedCount = input.eliminatedCount ?? goldSilverConfig.eliminatedCount
    goldSilverConfig.allocationMode = input.allocationMode ?? goldSilverConfig.allocationMode
  }

  return config
}

