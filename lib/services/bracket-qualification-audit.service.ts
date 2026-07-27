import { createClientServiceRole } from '@/utils/supabase/server'
import { QualificationSourceService, type QualifiedEntry } from '@/lib/services/qualification-source.service'
import type { BracketKey } from '@/types/tournament-format-v2'

export type BracketQualificationAuditIssueCode =
  | 'PREMATURELY_RESOLVED_SEED'
  | 'COUPLE_ALREADY_RESOLVED_IN_OTHER_SEED'
  | 'EXPECTED_DEFINITIVE_ENTRY_NOT_RESOLVED'
  | 'SEED_ENTRY_MISMATCH'

export interface BracketQualificationAuditIssue {
  code: BracketQualificationAuditIssueCode
  severity: 'warning' | 'error'
  message: string
  seed: number | null
  expectedLabel?: string | null
  expectedCoupleId?: string | null
  actualCoupleId?: string | null
}

export interface BracketQualificationAuditResult {
  tournamentId: string
  bracketKey: BracketKey
  issues: BracketQualificationAuditIssue[]
  expectedEntries: QualifiedEntry[]
  currentSeeds: BracketSeedSnapshot[]
  repairPlan: BracketQualificationRepairPlan
  canAutoRepair: boolean
}

export interface BracketSeedSnapshot {
  id?: string
  seed: number
  couple_id: string | null
  is_placeholder: boolean | null
  placeholder_label?: string | null
  placeholder_position?: number | null
  placeholder_zone_id?: string | null
}

export type BracketQualificationRepairMode = 'dry_run' | 'exact_repair' | 'fill_single_missing'
export type BracketQualificationRepairStatus = 'safe' | 'blocked' | 'manual_only'

export interface BracketSeedMatchSnapshot {
  id: string
  round: string | null
  order_in_round: number | null
  status: string | null
  couple1_id: string | null
  couple2_id: string | null
  tournament_couple_seed1_id: string | null
  tournament_couple_seed2_id: string | null
}

export interface BracketQualificationRepairChange {
  seed: number
  seedId?: string | null
  label: string
  expectedCoupleId: string | null
  actualCoupleId: string | null
  status: BracketQualificationRepairStatus
  reason: string
  blockingMatches: BracketSeedMatchSnapshot[]
}

export interface BracketQualificationRepairPlan {
  status: BracketQualificationRepairStatus
  canExactRepair: boolean
  canFillSingleMissing: boolean
  changes: BracketQualificationRepairChange[]
  missingCoupleIds: string[]
  freePlaceholderSeeds: number[]
  manualReasons: string[]
}

export interface BracketQualificationRepairResult {
  success: boolean
  mode: BracketQualificationRepairMode
  dryRun: boolean
  audit: BracketQualificationAuditResult
  appliedChanges: BracketQualificationRepairChange[]
  message: string
  manualOptions?: string[]
}

export class BracketQualificationAuditService {
  private static entriesAreRandomTieEquivalent(
    left: QualifiedEntry | undefined,
    right: QualifiedEntry | undefined
  ) {
    if (!left?.coupleId || !right?.coupleId) return false
    if (left.coupleId === right.coupleId) return true
    if (!left.isDefinitive || !right.isDefinitive) return false
    if (!left.tieInfo?.includes('RANDOM_TIEBREAKER')) return false
    if (!right.tieInfo?.includes('RANDOM_TIEBREAKER')) return false
    if (!left.stats || !right.stats) return false

    return left.stats.wins === right.stats.wins
      && left.stats.losses === right.stats.losses
      && left.stats.gamesFor === right.stats.gamesFor
      && left.stats.gamesAgainst === right.stats.gamesAgainst
      && left.stats.gamesDifference === right.stats.gamesDifference
      && left.stats.gamesWon === right.stats.gamesWon
      && (left.stats.totalPlayerScore || 0) === (right.stats.totalPlayerScore || 0)
  }

  private static seedMatchesExpectedOrEquivalent(
    seed: BracketSeedSnapshot,
    expected: QualifiedEntry,
    expectedEntriesByCoupleId: Map<string, QualifiedEntry>
  ) {
    if (!seed.couple_id) return false
    if (seed.couple_id === expected.coupleId && !seed.is_placeholder) return true

    const actualEntry = expectedEntriesByCoupleId.get(seed.couple_id)
    return this.entriesAreRandomTieEquivalent(expected, actualEntry)
  }

  static async auditTournament(
    tournamentId: string,
    options: { bracketKey?: BracketKey } = {}
  ): Promise<BracketQualificationAuditResult> {
    const bracketKey = options.bracketKey || 'MAIN'
    const supabase = await createClientServiceRole()
    const expectedEntries = await QualificationSourceService.getQualifiedEntries(tournamentId, { bracketKey })

    const { data: seeds, error: seedsError } = await supabase
      .from('tournament_couple_seeds')
      .select('id, seed, couple_id, is_placeholder, placeholder_label, placeholder_position, placeholder_zone_id')
      .eq('tournament_id', tournamentId)
      .eq('bracket_key', bracketKey)
      .order('seed')

    if (seedsError) {
      throw new Error(`Error loading bracket seeds: ${seedsError.message}`)
    }

    const currentSeeds = seeds || []
    const issues = this.auditSeeds(expectedEntries, currentSeeds)
    const repairPlan = await this.buildRepairPlan(tournamentId, expectedEntries, currentSeeds, { bracketKey })

    return {
      tournamentId,
      bracketKey,
      issues,
      expectedEntries,
      currentSeeds,
      repairPlan,
      canAutoRepair: repairPlan.canExactRepair,
    }
  }

  static auditSeeds(
    expectedEntries: QualifiedEntry[],
    seeds: BracketSeedSnapshot[]
  ): BracketQualificationAuditIssue[] {
    const issues: BracketQualificationAuditIssue[] = []
    const resolvedSeedByCouple = new Map<string, number>()
    const expectedEntriesByCoupleId = new Map(
      expectedEntries
        .filter((entry) => entry.coupleId)
        .map((entry) => [entry.coupleId!, entry])
    )

    for (const seed of seeds) {
      if (seed.couple_id) {
        if (resolvedSeedByCouple.has(seed.couple_id)) {
          issues.push({
            code: 'COUPLE_ALREADY_RESOLVED_IN_OTHER_SEED',
            severity: 'error',
            message: `La pareja ya esta resuelta en otro seed (${resolvedSeedByCouple.get(seed.couple_id)}).`,
            seed: seed.seed,
            actualCoupleId: seed.couple_id,
          })
        } else {
          resolvedSeedByCouple.set(seed.couple_id, seed.seed)
        }
      }
    }

    for (const seed of seeds) {
      const expected = expectedEntries[seed.seed - 1]
      if (!expected) {
        issues.push({
          code: 'SEED_ENTRY_MISMATCH',
          severity: 'warning',
          message: `No hay entrada esperada para el seed ${seed.seed}.`,
          seed: seed.seed,
          actualCoupleId: seed.couple_id,
        })
        continue
      }

      if (!expected.isDefinitive && seed.couple_id) {
        issues.push({
          code: 'PREMATURELY_RESOLVED_SEED',
          severity: 'warning',
          message: `El seed ${seed.seed} esta resuelto, pero ${expected.label} todavia no es definitivo.`,
          seed: seed.seed,
          expectedLabel: expected.label,
          actualCoupleId: seed.couple_id,
        })
      }

      if (expected.isDefinitive && expected.coupleId && seed.is_placeholder) {
        const existingSeed = resolvedSeedByCouple.get(expected.coupleId)
        issues.push({
          code: existingSeed ? 'COUPLE_ALREADY_RESOLVED_IN_OTHER_SEED' : 'EXPECTED_DEFINITIVE_ENTRY_NOT_RESOLVED',
          severity: existingSeed ? 'error' : 'warning',
          message: existingSeed
            ? `La pareja esperada para ${expected.label} ya esta resuelta en el seed ${existingSeed}.`
            : `La entrada ${expected.label} ya es definitiva, pero el seed sigue como placeholder.`,
          seed: seed.seed,
          expectedLabel: expected.label,
          expectedCoupleId: expected.coupleId,
        })
      }

      if (
        expected.isDefinitive &&
        expected.coupleId &&
        seed.couple_id &&
        seed.couple_id !== expected.coupleId &&
        !this.seedMatchesExpectedOrEquivalent(seed, expected, expectedEntriesByCoupleId)
      ) {
        issues.push({
          code: 'SEED_ENTRY_MISMATCH',
          severity: 'error',
          message: `El seed ${seed.seed} tiene una pareja distinta a la esperada para ${expected.label}.`,
          seed: seed.seed,
          expectedLabel: expected.label,
          expectedCoupleId: expected.coupleId,
          actualCoupleId: seed.couple_id,
        })
      }
    }

    return issues
  }

  static buildRepairPlanFromSnapshots(params: {
    expectedEntries: QualifiedEntry[]
    seeds: BracketSeedSnapshot[]
    matches: BracketSeedMatchSnapshot[]
  }): BracketQualificationRepairPlan {
    const matchesBySeedId = new Map<string, BracketSeedMatchSnapshot[]>()
    for (const match of params.matches) {
      if (match.tournament_couple_seed1_id) {
        const matches = matchesBySeedId.get(match.tournament_couple_seed1_id) || []
        matches.push(match)
        matchesBySeedId.set(match.tournament_couple_seed1_id, matches)
      }
      if (match.tournament_couple_seed2_id) {
        const matches = matchesBySeedId.get(match.tournament_couple_seed2_id) || []
        matches.push(match)
        matchesBySeedId.set(match.tournament_couple_seed2_id, matches)
      }
    }

    const expectedCoupleIds = new Set(
      params.expectedEntries
        .filter((entry) => entry.isDefinitive && entry.coupleId)
        .map((entry) => entry.coupleId!)
    )
    const resolvedCoupleIds = new Set(
      params.seeds
        .map((seed) => seed.couple_id)
        .filter((coupleId): coupleId is string => Boolean(coupleId))
    )
    const missingCoupleIds = Array.from(expectedCoupleIds)
      .filter((coupleId) => !resolvedCoupleIds.has(coupleId))
    const freePlaceholderSeeds = params.seeds
      .filter((seed) => seed.is_placeholder && !seed.couple_id)
      .map((seed) => seed.seed)

    const changes: BracketQualificationRepairChange[] = []
    const manualReasons: string[] = []
    const expectedEntriesByCoupleId = new Map(
      params.expectedEntries
        .filter((entry) => entry.coupleId)
        .map((entry) => [entry.coupleId!, entry])
    )

    for (const seed of params.seeds) {
      const expected = params.expectedEntries[seed.seed - 1]
      if (!expected) {
        manualReasons.push(`No hay entrada esperada para el seed ${seed.seed}.`)
        continue
      }

      if (!expected.isDefinitive || !expected.coupleId) {
        if (seed.couple_id) {
          changes.push({
            seed: seed.seed,
            seedId: seed.id || null,
            label: expected.label,
            expectedCoupleId: null,
            actualCoupleId: seed.couple_id,
            status: 'manual_only',
            reason: `${expected.label} todavia no es definitivo.`,
            blockingMatches: [],
          })
        }
        continue
      }

      if (this.seedMatchesExpectedOrEquivalent(seed, expected, expectedEntriesByCoupleId)) continue

      const seedMatches = seed.id ? matchesBySeedId.get(seed.id) || [] : []
      const blockingMatches = seedMatches.filter((match) => (
        match.status === 'IN_PROGRESS' || match.status === 'FINISHED'
      ))
      const hasAdvancedDependency = seedMatches.some((match) => (
        match.round !== '8VOS' && match.status !== 'PENDING' && match.status !== 'WAITING_OPONENT'
      ))
      const status: BracketQualificationRepairStatus = blockingMatches.length > 0
        ? 'blocked'
        : hasAdvancedDependency
          ? 'manual_only'
          : 'safe'

      changes.push({
        seed: seed.seed,
        seedId: seed.id || null,
        label: expected.label,
        expectedCoupleId: expected.coupleId,
        actualCoupleId: seed.couple_id,
        status,
        reason: status === 'safe'
          ? `Seed ${seed.seed} puede repararse segun ${expected.label}.`
          : `Seed ${seed.seed} esta vinculado a partidos que no se pueden reescribir automaticamente.`,
        blockingMatches,
      })
    }

    const exactChanges = changes.filter((change) => change.expectedCoupleId)
    const status: BracketQualificationRepairStatus = changes.some((change) => change.status === 'blocked')
      ? 'blocked'
      : changes.some((change) => change.status === 'manual_only')
        ? 'manual_only'
        : 'safe'
    const singleFreePlaceholderSeed = freePlaceholderSeeds.length === 1 ? freePlaceholderSeeds[0] : null
    const freePlaceholderChange = singleFreePlaceholderSeed === null
      ? null
      : changes.find((change) => change.seed === singleFreePlaceholderSeed)

    return {
      status,
      canExactRepair: exactChanges.length > 0
        && exactChanges.length === changes.length
        && changes.every((change) => change.status === 'safe')
        && manualReasons.length === 0,
      canFillSingleMissing: missingCoupleIds.length === 1
        && freePlaceholderSeeds.length === 1
        && (!freePlaceholderChange || freePlaceholderChange.status === 'safe'),
      changes,
      missingCoupleIds,
      freePlaceholderSeeds,
      manualReasons,
    }
  }

  static async buildRepairPlan(
    tournamentId: string,
    expectedEntries: QualifiedEntry[],
    seeds: BracketSeedSnapshot[],
    options: { bracketKey?: BracketKey } = {}
  ): Promise<BracketQualificationRepairPlan> {
    const bracketKey = options.bracketKey || 'MAIN'
    const supabase = await createClientServiceRole()
    const seedIds = seeds
      .map((seed) => seed.id)
      .filter((seedId): seedId is string => Boolean(seedId))

    if (seedIds.length === 0) {
      return this.buildRepairPlanFromSnapshots({ expectedEntries, seeds, matches: [] })
    }

    const { data: matches, error } = await supabase
      .from('matches')
      .select('id, round, order_in_round, status, couple1_id, couple2_id, tournament_couple_seed1_id, tournament_couple_seed2_id')
      .eq('tournament_id', tournamentId)
      .eq('type', 'ELIMINATION')
      .eq('bracket_key', bracketKey)
      .or(`tournament_couple_seed1_id.in.(${seedIds.join(',')}),tournament_couple_seed2_id.in.(${seedIds.join(',')})`)

    if (error) {
      throw new Error(`Error loading bracket seed matches: ${error.message}`)
    }

    return this.buildRepairPlanFromSnapshots({
      expectedEntries,
      seeds,
      matches: matches || [],
    })
  }

  static async repairTournament(
    tournamentId: string,
    options: { bracketKey?: BracketKey; mode: BracketQualificationRepairMode }
  ): Promise<BracketQualificationRepairResult> {
    const bracketKey = options.bracketKey || 'MAIN'
    const mode = options.mode
    const audit = await this.auditTournament(tournamentId, { bracketKey })
    const dryRun = mode === 'dry_run'

    if (dryRun) {
      return {
        success: true,
        mode,
        dryRun: true,
        audit,
        appliedChanges: [],
        message: 'Preview de reparacion generado.',
      }
    }

    if (mode === 'fill_single_missing') {
      return this.fillSingleMissing(tournamentId, audit, { bracketKey })
    }

    if (mode !== 'exact_repair') {
      throw new Error(`Unsupported repair mode: ${mode}`)
    }

    if (!audit.repairPlan.canExactRepair) {
      return {
        success: false,
        mode,
        dryRun: false,
        audit,
        appliedChanges: [],
        message: 'La reparacion exacta esta bloqueada por partidos iniciados/finalizados o cambios manuales.',
        manualOptions: [
          'Revisar el diagnostico y corregir manualmente los seeds afectados.',
          'Volver a zonas y regenerar la llave si todavia no se jugaron eliminatorios relevantes.',
          'Resolver por decision administrativa solo si el organizador acepta el impacto en los partidos ya creados.',
        ],
      }
    }

    const changes = audit.repairPlan.changes.filter((change) => change.expectedCoupleId)
    const supabase = await createClientServiceRole()
    const seedIds = changes
      .map((change) => change.seedId)
      .filter((seedId): seedId is string => Boolean(seedId))

    if (seedIds.length === 0) {
      return {
        success: false,
        mode,
        dryRun: false,
        audit,
        appliedChanges: [],
        message: 'No hay seeds reparables.',
      }
    }

    const { error: clearError } = await supabase
      .from('tournament_couple_seeds')
      .update({
        couple_id: null,
        is_placeholder: true,
        resolved_at: null,
      })
      .in('id', seedIds)

    if (clearError) {
      throw new Error(`Error clearing affected seeds: ${clearError.message}`)
    }

    for (const change of changes) {
      const expected = audit.expectedEntries[change.seed - 1]
      const { error: seedError } = await supabase
        .from('tournament_couple_seeds')
        .update({
          couple_id: change.expectedCoupleId,
          is_placeholder: false,
          placeholder_zone_id: null,
          placeholder_position: null,
          placeholder_label: null,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', change.seedId)

      if (seedError) {
        throw new Error(`Error repairing seed ${change.seed}: ${seedError.message}`)
      }

      await this.updateMatchesForSeed(tournamentId, change.seedId!, change.expectedCoupleId!, expected.label, { bracketKey })
    }

    const refreshedAudit = await this.auditTournament(tournamentId, { bracketKey })
    return {
      success: refreshedAudit.issues.length === 0,
      mode,
      dryRun: false,
      audit: refreshedAudit,
      appliedChanges: changes,
      message: refreshedAudit.issues.length === 0
        ? 'Llave reparada segun el ranking actual.'
        : 'La reparacion se aplico, pero la auditoria todavia reporta diferencias.',
    }
  }

  private static async fillSingleMissing(
    tournamentId: string,
    audit: BracketQualificationAuditResult,
    options: { bracketKey: BracketKey }
  ): Promise<BracketQualificationRepairResult> {
    if (!audit.repairPlan.canFillSingleMissing) {
      return {
        success: false,
        mode: 'fill_single_missing',
        dryRun: false,
        audit,
        appliedChanges: [],
        message: 'La reparacion de emergencia requiere exactamente una pareja faltante y un placeholder libre.',
        manualOptions: [
          'Usar reparacion exacta si todos los partidos afectados siguen pendientes.',
          'Revisar manualmente la llave si el placeholder libre ya esta vinculado a un partido iniciado o terminado.',
        ],
      }
    }

    const missingCoupleId = audit.repairPlan.missingCoupleIds[0]
    const freeSeedNumber = audit.repairPlan.freePlaceholderSeeds[0]
    const seed = audit.currentSeeds.find((item) => item.seed === freeSeedNumber)
    if (!seed?.id) {
      throw new Error('No se encontro el seed placeholder libre.')
    }

    const supabase = await createClientServiceRole()
    const { error: seedError } = await supabase
      .from('tournament_couple_seeds')
      .update({
        couple_id: missingCoupleId,
        is_placeholder: false,
        placeholder_zone_id: null,
        placeholder_position: null,
        placeholder_label: null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', seed.id)

    if (seedError) {
      throw new Error(`Error filling missing seed: ${seedError.message}`)
    }

    await this.updateMatchesForSeed(tournamentId, seed.id, missingCoupleId, `Seed ${freeSeedNumber}`, options)
    const refreshedAudit = await this.auditTournament(tournamentId, { bracketKey: options.bracketKey })

    return {
      success: true,
      mode: 'fill_single_missing',
      dryRun: false,
      audit: refreshedAudit,
      appliedChanges: [{
        seed: freeSeedNumber,
        seedId: seed.id,
        label: `Seed ${freeSeedNumber}`,
        expectedCoupleId: missingCoupleId,
        actualCoupleId: null,
        status: 'safe',
        reason: 'Pareja faltante insertada en el unico placeholder libre.',
        blockingMatches: [],
      }],
      message: 'Pareja faltante insertada en el unico placeholder libre.',
    }
  }

  private static async updateMatchesForSeed(
    tournamentId: string,
    seedId: string,
    coupleId: string,
    label: string,
    options: { bracketKey: BracketKey }
  ) {
    const supabase = await createClientServiceRole()
    const { data: matches, error } = await supabase
      .from('matches')
      .select('id, status, couple1_id, couple2_id, tournament_couple_seed1_id, tournament_couple_seed2_id')
      .eq('tournament_id', tournamentId)
      .eq('type', 'ELIMINATION')
      .eq('bracket_key', options.bracketKey)
      .or(`tournament_couple_seed1_id.eq.${seedId},tournament_couple_seed2_id.eq.${seedId}`)

    if (error) {
      throw new Error(`Error loading matches for seed ${label}: ${error.message}`)
    }

    for (const match of matches || []) {
      if (match.status === 'IN_PROGRESS' || match.status === 'FINISHED') {
        throw new Error(`Seed ${label} is linked to a locked match (${match.id}).`)
      }

      const updateData: Record<string, string | null> = {}
      if (match.tournament_couple_seed1_id === seedId) {
        updateData.couple1_id = coupleId
        updateData.placeholder_couple1_label = null
      }
      if (match.tournament_couple_seed2_id === seedId) {
        updateData.couple2_id = coupleId
        updateData.placeholder_couple2_label = null
      }

      const newCouple1 = match.tournament_couple_seed1_id === seedId ? coupleId : match.couple1_id
      const newCouple2 = match.tournament_couple_seed2_id === seedId ? coupleId : match.couple2_id
      if (newCouple1 && newCouple2) {
        updateData.status = match.status === 'DRAFT' ? 'DRAFT' : 'PENDING'
        updateData.winner_id = null
      }

      const { error: updateError } = await supabase
        .from('matches')
        .update(updateData)
        .eq('id', match.id)

      if (updateError) {
        throw new Error(`Error updating match ${match.id}: ${updateError.message}`)
      }
    }
  }
}
