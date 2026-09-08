import { createClient } from '@/utils/supabase/server'
import {
  StandingsCalculatorService,
  type StandingEntry,
  type StandingStats,
} from '@/lib/services/standings-calculator.service'
import { TournamentFormatRulesService } from '@/lib/services/tournament-format-rules.service'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import { DefinitivePositionService, type DefinitivePositionResult } from '@/lib/services/definitive-position.service'
import { selectQualifiedEntries } from '@/lib/services/qualification-policy.service'
import type { BracketKey } from '@/types/tournament-format-v2'
import {
  filterOutDisqualifiedCouples,
  getActiveDisqualifiedCoupleIds,
} from '@/lib/services/tournament-disqualifications'
import { shouldEnforceLongBracketMatchRequirement } from '@/lib/services/tournament-operational-settings'

export interface QualifiedEntry {
  key: string
  coupleId: string | null
  currentCoupleId?: string | null
  zoneId: string | null
  localPosition: number | null
  globalPosition: number | null
  label: string
  isDefinitive: boolean
  stats?: StandingStats | null
  tieInfo?: string | null
}

interface PendingZoneMatch {
  zone_id: string | null
  couple1_id: string | null
  couple2_id: string | null
}

const getZoneLetter = (zoneName: string | null | undefined, fallbackIndex: number) => {
  const match = (zoneName || '').match(/([A-Z])$/i)
  return (match?.[1] || String.fromCharCode(65 + fallbackIndex)).toUpperCase()
}

const getExplicitZoneLetter = (zoneName: string | null | undefined) => {
  const match = (zoneName || '').match(/([A-Z])$/i)
  return match?.[1]?.toUpperCase() || null
}

const compareNullableStrings = (left?: string | null, right?: string | null) => (
  (left || '').localeCompare(right || '', undefined, { numeric: true, sensitivity: 'base' })
)

const compareZoneLetters = (
  left: { name?: string | null },
  right: { name?: string | null }
) => {
  const leftLetter = getExplicitZoneLetter(left.name)
  const rightLetter = getExplicitZoneLetter(right.name)

  if (!leftLetter || !rightLetter) {
    return 0
  }

  return leftLetter.localeCompare(rightLetter)
}

export class QualificationSourceService {
  static async getQualifiedEntries(
    tournamentId: string,
    options: { bracketKey?: BracketKey } = {}
  ): Promise<QualifiedEntry[]> {
    const bracketKey = options.bracketKey || 'MAIN'
    const supabase = await createClient()
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, type, format_type, format_config')
      .eq('id', tournamentId)
      .single()

    if (tournamentError || !tournament) {
      throw new Error(`Error loading tournament: ${tournamentError?.message || 'Tournament not found'}`)
    }

    const rules = TournamentFormatRulesService.resolve({ tournament })
    const shouldApplyAdvancementLimit = Boolean((tournament as any)?.format_config?.version === 2)
    const useCurrentLongStandings = tournament.type === 'LONG'
      ? !(await shouldEnforceLongBracketMatchRequirement(supabase, tournamentId))
      : false

    const disqualifiedCoupleIds = await getActiveDisqualifiedCoupleIds(tournamentId, supabase)

    if (rules.qualificationSource === 'GLOBAL_STANDINGS') {
      const entries = filterOutDisqualifiedCouples(
        await this.getGlobalStandingEntries(tournamentId, rules),
        disqualifiedCoupleIds
      )
      const effectiveEntries = useCurrentLongStandings
        ? this.markCurrentEntriesAsDefinitive(entries)
        : entries
      const advancementConfig = this.resolveAdvancementConfigForEligibleEntries(
        tournament,
        effectiveEntries.length,
        rules.resolvedFormat.effectiveAdvancementConfig
      )
      return shouldApplyAdvancementLimit
        ? selectQualifiedEntries(effectiveEntries, advancementConfig, bracketKey)
        : effectiveEntries
    }

    const zoneEntries = filterOutDisqualifiedCouples(
      await this.getZonePositionEntries(tournamentId),
      disqualifiedCoupleIds
    )
    const entries = rules.qualificationSource === 'HYBRID_FIRSTS_GLOBAL_REST_ZONES'
      ? await this.getHybridFirstsGlobalRestZoneEntries(tournamentId, rules, zoneEntries, disqualifiedCoupleIds)
      : zoneEntries
    const effectiveEntries = useCurrentLongStandings
      ? this.markCurrentEntriesAsDefinitive(entries)
      : entries

    const advancementConfig = this.resolveAdvancementConfigForEligibleEntries(
      tournament,
      effectiveEntries.length,
      rules.resolvedFormat.effectiveAdvancementConfig
    )
    return shouldApplyAdvancementLimit
      ? selectQualifiedEntries(effectiveEntries, advancementConfig, bracketKey)
      : effectiveEntries
  }

  private static resolveAdvancementConfigForEligibleEntries(
    tournament: { type?: string | null; format_type?: string | null; format_config?: unknown },
    eligibleCouplesCount: number,
    fallback: ReturnType<typeof TournamentFormatRulesService.resolve>['resolvedFormat']['effectiveAdvancementConfig']
  ) {
    return TournamentFormatResolver.getResolvedFormat(tournament, {
      totalCouples: eligibleCouplesCount,
    }).effectiveAdvancementConfig || fallback
  }

  private static markCurrentEntriesAsDefinitive(entries: QualifiedEntry[]): QualifiedEntry[] {
    return entries.map((entry) => {
      const coupleId = entry.currentCoupleId || entry.coupleId

      return {
        ...entry,
        coupleId,
        currentCoupleId: coupleId,
        isDefinitive: Boolean(coupleId),
      }
    })
  }

  private static async getZonePositionEntries(tournamentId: string): Promise<QualifiedEntry[]> {
    const supabase = await createClient()
    const { data: zones, error: zonesError } = await supabase
      .from('zones')
      .select('id, name, created_at')
      .eq('tournament_id', tournamentId)
      .order('created_at')

    if (zonesError) {
      throw new Error(`Error loading zones: ${zonesError.message}`)
    }

    const zoneIds = (zones || []).map((zone) => zone.id)
    if (zoneIds.length === 0) return []

    const { data: positions, error: positionsError } = await supabase
      .from('zone_positions')
      .select('zone_id, position, couple_id, is_definitive, wins, losses, games_for, games_against, games_difference, player_score_total')
      .in('zone_id', zoneIds)
      .order('position')

    if (positionsError) {
      throw new Error(`Error loading zone positions: ${positionsError.message}`)
    }

    return this.buildZonePositionEntries(zones || [], positions || [])
  }

  static buildZonePositionEntries(
    zones: Array<{ id: string; name?: string | null; created_at?: string | null }>,
    positions: Array<{
      zone_id: string
      position: number
      couple_id: string | null
      is_definitive: boolean | null
      wins?: number | null
      losses?: number | null
      games_for?: number | null
      games_against?: number | null
      games_difference?: number | null
      player_score_total?: number | null
    }>
  ): QualifiedEntry[] {
    const sortedZones = this.sortZonesForBracket(zones)
    const zoneIndex = new Map(sortedZones.map((zone, index) => [zone.id, { ...zone, index }]))
    const maxPosition = Math.max(0, ...positions.map((position) => position.position || 0))
    const entries: QualifiedEntry[] = []

    for (let localPosition = 1; localPosition <= maxPosition; localPosition++) {
      for (const zone of sortedZones) {
        const position = positions.find((item) => (
          item.zone_id === zone.id && item.position === localPosition
        ))
        if (!position) continue

        const zoneInfo = zoneIndex.get(zone.id)
        const letter = getZoneLetter(zone.name, zoneInfo?.index || 0)
        const label = `${localPosition}${letter}`

        entries.push({
          key: `zone:${zone.id}:${localPosition}`,
          coupleId: position.is_definitive ? position.couple_id : null,
          currentCoupleId: position.couple_id,
          zoneId: zone.id,
          localPosition,
          globalPosition: null,
          label,
          isDefinitive: Boolean(position.is_definitive && position.couple_id),
          stats: position.couple_id
            ? {
                wins: position.wins || 0,
                losses: position.losses || 0,
                gamesFor: position.games_for || 0,
                gamesAgainst: position.games_against || 0,
                gamesDifference: position.games_difference || 0,
                gamesWon: position.games_for || 0,
                totalPlayerScore: position.player_score_total || 0,
              }
            : null,
        })
      }
    }

    return entries
  }

  static sortZonesForBracket<T extends { id: string; name?: string | null; created_at?: string | null }>(
    zones: T[]
  ): T[] {
    const originalIndex = new Map(zones.map((zone, index) => [zone.id, index]))

    return [...zones].sort((left, right) => {
      const byLetter = compareZoneLetters(left, right)
      if (byLetter !== 0) return byLetter

      const byName = compareNullableStrings(left.name, right.name)
      if (byName !== 0) return byName

      const byCreatedAt = compareNullableStrings(left.created_at, right.created_at)
      if (byCreatedAt !== 0) return byCreatedAt

      const byId = left.id.localeCompare(right.id)
      if (byId !== 0) return byId

      return (originalIndex.get(left.id) || 0) - (originalIndex.get(right.id) || 0)
    })
  }

  static buildGlobalStandingEntries(
    standingsEntries: StandingEntry[],
    definitiveResult: DefinitivePositionResult
  ): QualifiedEntry[] {
    const definitiveByCouple = new Map<string, boolean>()
    for (const zoneResult of definitiveResult.zoneResults) {
      for (const analysis of zoneResult.analysis) {
        definitiveByCouple.set(analysis.coupleId, analysis.isDefinitive)
      }
    }

    return standingsEntries.map((entry) => {
      const position = entry.globalPosition || 0
      const isDefinitive = Boolean(definitiveByCouple.get(entry.coupleId))

      return {
        key: `global:${position}`,
        coupleId: isDefinitive ? entry.coupleId : null,
        zoneId: null,
        localPosition: null,
        globalPosition: position,
        label: `#${position} general`,
        isDefinitive,
        stats: entry.stats,
        tieInfo: entry.tieInfo,
      }
    })
  }

  static buildHybridFirstsGlobalRestZoneEntries(
    zoneEntries: QualifiedEntry[],
    globalStandingsEntries: StandingEntry[],
    pendingZoneMatches: PendingZoneMatch[] = []
  ): QualifiedEntry[] {
    const firstEntries = zoneEntries.filter((entry) => entry.localPosition === 1)
    const restEntries = zoneEntries.filter((entry) => (entry.localPosition || 0) > 1)
    const firstCount = firstEntries.length

    if (firstCount === 0) {
      return restEntries
    }

    const allFirstsDefinitive = firstEntries.every((entry) => entry.isDefinitive && entry.coupleId)
    const firstCoupleIds = new Set(
      firstEntries
        .map((entry) => entry.coupleId)
        .filter((coupleId): coupleId is string => Boolean(coupleId))
    )

    const firstSeeds: QualifiedEntry[] = allFirstsDefinitive
      ? globalStandingsEntries
          .filter((entry) => firstCoupleIds.has(entry.coupleId))
          .slice(0, firstCount)
          .map((entry, index) => ({
            key: `hybrid:first:${index + 1}`,
            coupleId: entry.coupleId,
            zoneId: null,
            localPosition: 1,
            globalPosition: index + 1,
            label: `#${index + 1} primeros`,
            isDefinitive: true,
            stats: entry.stats,
          }))
      : this.buildPartialHybridFirstSeeds(firstEntries, zoneEntries, globalStandingsEntries, pendingZoneMatches)

    return [...firstSeeds, ...restEntries]
  }

  private static buildPartialHybridFirstSeeds(
    firstEntries: QualifiedEntry[],
    zoneEntries: QualifiedEntry[],
    globalStandingsEntries: StandingEntry[],
    pendingZoneMatches: PendingZoneMatch[]
  ): QualifiedEntry[] {
    const firstCount = firstEntries.length
    const firstCoupleIds = new Set(
      firstEntries
        .map((entry) => entry.currentCoupleId || entry.coupleId)
        .filter((coupleId): coupleId is string => Boolean(coupleId))
    )
    const rankedFirsts = globalStandingsEntries.filter((entry) => firstCoupleIds.has(entry.coupleId))
    const resolvedByGlobalPosition = new Map<number, StandingEntry>()
    const lockedCoupleIds = new Set<string>()

    rankedFirsts.slice(0, firstCount).some((candidate, index) => {
      const globalPosition = index + 1
      const candidateZoneEntry = firstEntries.find((entry) => (
        (entry.currentCoupleId || entry.coupleId) === candidate.coupleId
      ))

      const isDefinitive = Boolean(
        candidateZoneEntry?.isDefinitive &&
        this.isHybridGlobalSlotDefinitive(
          candidate,
          candidateZoneEntry,
          zoneEntries,
          pendingZoneMatches,
          lockedCoupleIds
        )
      )

      if (!isDefinitive) {
        return true
      }

      resolvedByGlobalPosition.set(globalPosition, candidate)
      lockedCoupleIds.add(candidate.coupleId)
      return false
    })

    return Array.from({ length: firstCount }, (_, index) => {
      const globalPosition = index + 1
      const resolvedEntry = resolvedByGlobalPosition.get(globalPosition)

      return {
        key: `hybrid:first:${globalPosition}`,
        coupleId: resolvedEntry?.coupleId || null,
        currentCoupleId: resolvedEntry?.coupleId || null,
        zoneId: null,
        localPosition: 1,
        globalPosition,
        label: `#${globalPosition} primeros`,
        isDefinitive: Boolean(resolvedEntry),
        stats: resolvedEntry?.stats || null,
      }
    })
  }

  private static isHybridGlobalSlotDefinitive(
    candidate: StandingEntry,
    candidateZoneEntry: QualifiedEntry,
    zoneEntries: QualifiedEntry[],
    pendingZoneMatches: PendingZoneMatch[],
    lockedCoupleIds: Set<string>
  ): boolean {
    if (!candidateZoneEntry.zoneId || !candidateZoneEntry.isDefinitive) {
      return false
    }

    const candidateRank = candidate.stats
    const zoneOrder = new Map(
      zoneEntries
        .filter((entry) => entry.localPosition === 1 && entry.zoneId)
        .map((entry, index) => [entry.zoneId, index])
    )
    const candidateZoneOrder = zoneOrder.get(candidateZoneEntry.zoneId) ?? Number.MAX_SAFE_INTEGER

    return zoneEntries.every((entry) => {
      const coupleId = entry.currentCoupleId || entry.coupleId
      if (
        !coupleId ||
        coupleId === candidate.coupleId ||
        lockedCoupleIds.has(coupleId) ||
        entry.zoneId === candidateZoneEntry.zoneId ||
        !entry.stats
      ) {
        return true
      }

      const remainingMatches = pendingZoneMatches.filter((match) => (
        match.zone_id === entry.zoneId &&
        (match.couple1_id === coupleId || match.couple2_id === coupleId)
      )).length
      const maxRank = {
        wins: entry.stats.wins + remainingMatches,
        gamesDifference: entry.stats.gamesDifference + (remainingMatches * 6),
        gamesFor: entry.stats.gamesFor + (remainingMatches * 6),
        totalPlayerScore: entry.stats.totalPlayerScore || 0,
      }
      const challengerZoneOrder = entry.zoneId
        ? zoneOrder.get(entry.zoneId) ?? Number.MAX_SAFE_INTEGER
        : Number.MAX_SAFE_INTEGER

      return this.compareRankCeiling(
        candidateRank,
        maxRank,
        candidateZoneOrder,
        challengerZoneOrder,
        candidate.coupleId,
        coupleId
      ) > 0
    })
  }

  private static deterministicTieBreakerScore(value: string): number {
    return value.split('').reduce((hash, char) => (
      ((hash << 5) - hash + char.charCodeAt(0)) | 0
    ), 0)
  }

  private static compareRankCeiling(
    leader: Pick<StandingStats, 'wins' | 'gamesDifference' | 'gamesFor' | 'totalPlayerScore'>,
    challenger: Pick<StandingStats, 'wins' | 'gamesDifference' | 'gamesFor' | 'totalPlayerScore'>,
    leaderZoneOrder: number,
    challengerZoneOrder: number,
    leaderCoupleId: string,
    challengerCoupleId: string
  ): number {
    if (leader.wins !== challenger.wins) return leader.wins - challenger.wins
    if (leader.gamesDifference !== challenger.gamesDifference) return leader.gamesDifference - challenger.gamesDifference
    if (leader.gamesFor !== challenger.gamesFor) return leader.gamesFor - challenger.gamesFor
    if ((leader.totalPlayerScore || 0) !== (challenger.totalPlayerScore || 0)) {
      return (leader.totalPlayerScore || 0) - (challenger.totalPlayerScore || 0)
    }
    if (leaderZoneOrder !== challengerZoneOrder) return challengerZoneOrder - leaderZoneOrder

    return this.deterministicTieBreakerScore(leaderCoupleId) - this.deterministicTieBreakerScore(challengerCoupleId)
  }

  private static async getHybridFirstsGlobalRestZoneEntries(
    tournamentId: string,
    rules: ReturnType<typeof TournamentFormatRulesService.resolve>,
    zoneEntries: QualifiedEntry[],
    disqualifiedCoupleIds: Set<string>
  ): Promise<QualifiedEntry[]> {
    const globalStandings = await StandingsCalculatorService.calculate({
      tournamentId,
      scope: 'GLOBAL',
      rankingPolicyId: rules.rankingPolicyId,
    })

    const activeGlobalEntries = globalStandings.entries.filter(
      (entry) => !disqualifiedCoupleIds.has(entry.coupleId)
    )

    const pendingZoneMatches = await this.getPendingZoneMatches(tournamentId)

    return this.buildHybridFirstsGlobalRestZoneEntries(zoneEntries, activeGlobalEntries, pendingZoneMatches)
  }

  private static async getPendingZoneMatches(tournamentId: string): Promise<PendingZoneMatch[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('matches')
      .select('zone_id, couple1_id, couple2_id')
      .eq('tournament_id', tournamentId)
      .eq('type', 'ZONE')
      .neq('status', 'FINISHED')

    if (error) {
      throw new Error(`Error loading pending zone matches: ${error.message}`)
    }

    return data || []
  }

  private static async getGlobalStandingEntries(
    tournamentId: string,
    rules: ReturnType<typeof TournamentFormatRulesService.resolve>
  ): Promise<QualifiedEntry[]> {
    const [standings, definitives] = await Promise.all([
      StandingsCalculatorService.calculate({
        tournamentId,
        scope: 'GLOBAL',
        rankingPolicyId: rules.rankingPolicyId,
      }),
      DefinitivePositionService.analyzeTournament(tournamentId),
    ])

    return this.buildGlobalStandingEntries(standings.entries, definitives)
  }

}
