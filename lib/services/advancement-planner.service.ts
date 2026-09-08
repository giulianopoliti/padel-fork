import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import { selectQualifiedEntries } from '@/lib/services/qualification-policy.service'
import { BracketQualificationAllocationService } from '@/lib/services/bracket-qualification-allocation.service'
import type {
  AdvancementResult,
  BracketKey,
  GoldSilverAdvancementConfig,
  ResolvedTournamentFormat,
  TournamentFormatConfigV2,
} from '@/types/tournament-format-v2'

export class AdvancementPlanner {
  static validateAdvancementCounts(
    totalCouples: number,
    config: TournamentFormatConfigV2
  ): { isValid: boolean; error?: string } {
    const resolved = TournamentFormatResolver.getResolvedFormat({ format_config: config }, { totalCouples })
    const allocationValidation = BracketQualificationAllocationService.validateAllocation(
      totalCouples,
      resolved.effectiveAdvancementConfig
    )
    if (!allocationValidation.isValid) return { isValid: false, error: allocationValidation.errors[0] }

    if (resolved.effectiveBracketMode === 'GOLD_SILVER') {
      const goldSilverConfig = resolved.effectiveAdvancementConfig as GoldSilverAdvancementConfig
      const sum = goldSilverConfig.goldCount + goldSilverConfig.silverCount + goldSilverConfig.eliminatedCount
      if (sum !== totalCouples) {
        return {
          isValid: false,
          error: `La suma Oro + Plata + Eliminadas debe ser ${totalCouples}. Recibido: ${sum}.`,
        }
      }
    }

    if (resolved.effectiveBracketMode === 'SINGLE' && resolved.effectiveAdvancementConfig.kind === 'SINGLE') {
      if (resolved.effectiveAdvancementConfig.advanceCount < 2) {
        return {
          isValid: false,
          error: 'La llave unica necesita al menos 2 parejas clasificadas.',
        }
      }
    }

    if (resolved.effectiveBracketMode === 'SINGLE' && resolved.effectiveAdvancementConfig.kind === 'PER_ZONE_TOP') {
      const couplesPerZone = resolved.effectiveAdvancementConfig.couplesPerZone
      if (couplesPerZone !== 2 && couplesPerZone !== 3 && couplesPerZone !== 'ALL') {
        return {
          isValid: false,
          error: 'La llave por zonas solo admite 2, 3 o todas las parejas por zona.',
        }
      }
    }

    return { isValid: true }
  }

  static splitRankedEntries<T>(
    rankedEntries: T[],
    config: TournamentFormatConfigV2,
    options: { totalCouples?: number } = {}
  ): AdvancementResult<T> {
    const totalCouples = options.totalCouples ?? rankedEntries.length
    const resolved = TournamentFormatResolver.getResolvedFormat({ format_config: config }, { totalCouples })

    if (resolved.effectiveBracketMode === 'NONE') {
      return {
        gold: [],
        silver: [],
        eliminated: rankedEntries.slice(1),
        championCoupleId: rankedEntries[0],
      }
    }

    if (resolved.effectiveBracketMode === 'SINGLE' && resolved.effectiveAdvancementConfig.kind === 'PER_ZONE_TOP') {
      return {
        gold: selectQualifiedEntries(
          rankedEntries as Array<T & { localPosition: number | null; zoneId: string | null }>,
          resolved.effectiveAdvancementConfig,
          'MAIN'
        ) as T[],
        silver: [],
        eliminated: [],
      }
    }

    if (resolved.effectiveBracketMode === 'SINGLE' && resolved.effectiveAdvancementConfig.kind === 'SINGLE') {
      const advanceCount = resolved.effectiveAdvancementConfig.advanceCount

      return {
        gold: rankedEntries.slice(0, advanceCount),
        silver: [],
        eliminated: rankedEntries.slice(advanceCount),
      }
    }

    const goldSilverConfig = resolved.effectiveAdvancementConfig as GoldSilverAdvancementConfig

    return {
      gold: rankedEntries.slice(0, goldSilverConfig.goldCount),
      silver: rankedEntries.slice(goldSilverConfig.goldCount, goldSilverConfig.goldCount + goldSilverConfig.silverCount),
      eliminated: rankedEntries.slice(goldSilverConfig.goldCount + goldSilverConfig.silverCount),
    }
  }

  static selectBracketEntries<T>(
    rankedEntries: T[],
    config: TournamentFormatConfigV2,
    bracketKey: BracketKey = 'MAIN',
    options: { totalCouples?: number } = {}
  ): T[] {
    const groups = this.splitRankedEntries(rankedEntries, config, options)
    if (bracketKey === 'GOLD' || bracketKey === 'MAIN') {
      return groups.gold
    }
    return groups.silver
  }

  static getBracketLabel(bracketKey: BracketKey): string {
    switch (bracketKey) {
      case 'GOLD':
        return 'Copa de Oro'
      case 'SILVER':
        return 'Copa de Plata'
      default:
        return 'Llave Principal'
    }
  }
}
