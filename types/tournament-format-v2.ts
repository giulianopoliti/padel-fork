export type BaseTournamentType = 'AMERICAN' | 'LONG'

export type OperationalTournamentFormatPresetId =
  | 'AMERICAN_MULTI_ZONE_2'
  | 'AMERICAN_MULTI_ZONE_3'
  | 'AMERICAN_MULTI_ZONE_GLOBAL_2'
  | 'AMERICAN_MULTI_ZONE_GLOBAL_3'
  | 'AMERICAN_MULTI_ZONE_HYBRID_2'
  | 'AMERICAN_MULTI_ZONE_HYBRID_3'
  | 'AMERICAN_SINGLE_ZONE_ROUND_ROBIN_CHAMPION'
  | 'AMERICAN_SINGLE_ZONE_GLOBAL_2'
  | 'AMERICAN_SINGLE_ZONE_GLOBAL_3'
  | 'AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_2'
  | 'AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_3'
  | 'LONG_SINGLE_ZONE_BRACKET'
  | 'LONG_SINGLE_ZONE_GOLD_SILVER'

export type LegacyTournamentFormatPresetId =
  | 'AMERICAN_MULTI_ZONE_GLOBAL_STANDINGS'
  | 'AMERICAN_SINGLE_ZONE_2_BRACKET'
  | 'AMERICAN_SINGLE_ZONE_3_BRACKET'
  | 'AMERICAN_SINGLE_ZONE_ROUND_ROBIN_GOLD_SILVER'
  | 'LONG_SINGLE_ZONE_CHAMPION'

export type TournamentFormatPresetId =
  | OperationalTournamentFormatPresetId
  | LegacyTournamentFormatPresetId

export type ZoneMode = 'MULTI_ZONE' | 'SINGLE_ZONE'
export type ZoneStage = 'FIXED_MATCH_COUNT' | 'ROUND_ROBIN'
export type BracketMode = 'NONE' | 'SINGLE' | 'GOLD_SILVER'
export type BracketKey = 'MAIN' | 'GOLD' | 'SILVER'
export type RankingScope = 'PER_ZONE' | 'GLOBAL'
export type RankingPolicyId = 'STANDARD_PADEL'
export type QualificationSource = 'ZONE_POSITIONS' | 'GLOBAL_STANDINGS' | 'HYBRID_FIRSTS_GLOBAL_REST_ZONES'
export type BracketSeedingStrategy = 'SERPENTINE_BY_ZONE' | 'GLOBAL_RANKING' | 'HYBRID_FIRSTS_GLOBAL_REST_ZONES'
export type CouplesPerZone = 2 | 3 | 'ALL'

export interface PerZoneTopAdvancementConfig {
  kind: 'PER_ZONE_TOP'
  couplesPerZone: CouplesPerZone
}

export interface SingleBracketAdvancementConfig {
  kind: 'SINGLE'
  advanceCount: number
  allocationMode?: 'AUTO' | 'CUSTOM'
}

export interface GoldSilverAdvancementConfig {
  kind: 'GOLD_SILVER'
  goldCount: number
  silverCount: number
  eliminatedCount: number
  allocationMode?: 'AUTO' | 'CUSTOM'
}

export interface NoBracketAdvancementConfig {
  kind: 'NONE'
}

export type AdvancementConfig =
  | PerZoneTopAdvancementConfig
  | SingleBracketAdvancementConfig
  | GoldSilverAdvancementConfig
  | NoBracketAdvancementConfig

export interface TournamentFormatZoneRules {
  minSize: number
  maxSize: number
  idealSize: number
  allowedSizes: number[]
}

export interface TournamentFormatConfigV2 {
  version: 2
  presetId: TournamentFormatPresetId
  baseType: BaseTournamentType
  zoneMode: ZoneMode
  zoneStage: ZoneStage
  targetMatchesPerCouple: number | null
  bracketMode: BracketMode
  advancementConfig: AdvancementConfig
  rankingScope: RankingScope
  rankingPolicyId: RankingPolicyId
  qualificationSource: QualificationSource
  bracketSeedingStrategy: BracketSeedingStrategy
  zoneRules: TournamentFormatZoneRules
  display: {
    name: string
    description: string
  }
}

export interface ResolvedTournamentFormat extends TournamentFormatConfigV2 {
  effectiveZoneStage: ZoneStage
  effectiveTargetMatchesPerCouple: number | null
  effectiveBracketMode: BracketMode
  effectiveAdvancementConfig: AdvancementConfig
  appliedNotes: string[]
}

export interface PlannedZone {
  index: number
  name: string
  size: number
  stage: ZoneStage
  matchesPerCouple: number
  notes: string[]
}

export interface ZoneFixturePlan {
  zoneMode: ZoneMode
  totalCouples: number
  zones: PlannedZone[]
  notes: string[]
  isValid: boolean
  errors: string[]
}

export interface AdvancementResult<T = string> {
  gold: T[]
  silver: T[]
  eliminated: T[]
  championCoupleId?: T
}
