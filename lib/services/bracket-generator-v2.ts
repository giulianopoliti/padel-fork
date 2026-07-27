/**
 * PlaceholderBracketGenerator - Generates tournament brackets with placeholder support
 * Extends the existing hybrid-serpentine algorithm to work with unknown zone positions
 */

// Generate UUID for matches (Supabase generates IDs for seeds automatically)
const randomUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
import { createClient } from '@/utils/supabase/server'
import { DefinitivePositionAnalyzer } from './definitive-position-analyzer'
import { TournamentStrategyFactory } from '@/lib/domain/strategies/strategy-factory'
import { AdvancementPlanner } from '@/lib/services/advancement-planner.service'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import { hasFormatConfigV2, shouldUseLegacyQualifying } from '@/lib/services/tournament-format-policy'
import type { BracketKey } from '@/types/tournament-format-v2'
import { DEFAULT_BRACKET_KEY } from '@/lib/services/bracket-key-policy'
import { QualificationSourceService, type QualifiedEntry } from '@/lib/services/qualification-source.service'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export interface PlaceholderSeed {
  bracket_key: BracketKey
  seed: number
  bracket_position: number
  couple_id: string | null
  placeholder_zone_id: string | null
  placeholder_position: number | null
  placeholder_label: string | null
  is_placeholder: boolean
  created_as_placeholder: boolean
}

export interface BracketMatch {
  id: string
  tournament_id: string
  bracket_key: BracketKey
  couple1_id: string | null
  couple2_id: string | null
  tournament_couple_seed1_id: string | null
  tournament_couple_seed2_id: string | null
  placeholder_couple1_label: string | null
  placeholder_couple2_label: string | null
  round: string
  order_in_round: number
  status: string
  type: string
  winner_id?: string | null
  // ✅ NEW: Add seed numbers for FK mapping
  seed1: number | null
  seed2: number | null
}

export interface MatchHierarchy {
  tournament_id: string
  bracket_key: BracketKey
  parent_match_id: string
  child_match_id: string
  parent_round: string
  child_round: string
  parent_slot: number
}

export class PlaceholderBracketGenerator {
  private supabase!: SupabaseClient
  private analyzer: DefinitivePositionAnalyzer

  constructor() {
    this.analyzer = new DefinitivePositionAnalyzer()
  }

  private async ensureSupabaseClient(): Promise<SupabaseClient> {
    if (!this.supabase) {
      this.supabase = await createClient()
    }
    return this.supabase
  }

  /**
   * Generates seeding with mix of definitive couples and placeholders
   */
  async generatePlaceholderSeeding(
    tournamentId: string,
    options: { bracketKey?: BracketKey } = {}
  ): Promise<PlaceholderSeed[]> {
    console.log(`🔍 [BRACKET-GEN-V2] Starting placeholder seeding for tournament: ${tournamentId}`)

    const bracketKey = options.bracketKey || DEFAULT_BRACKET_KEY
    const supabase = await this.ensureSupabaseClient()

    // 1. Get tournament information to determine format
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, type, format_type, format_config')
      .eq('id', tournamentId)
      .single()

    if (tournamentError || !tournament) {
      throw new Error(`Failed to fetch tournament: ${tournamentError?.message || 'Tournament not found'}`)
    }

    console.log(`🎯 [BRACKET-GEN-V2] Tournament format detected: ${tournament.type}`)

    const resolvedFormat = TournamentFormatResolver.getResolvedFormat(tournament)

    if (resolvedFormat.effectiveBracketMode === 'NONE') {
      throw new Error('Este formato define campeon directo desde la tabla. No corresponde generar una llave.')
    }

    if (resolvedFormat.effectiveBracketMode === 'GOLD_SILVER' && bracketKey === 'MAIN') {
      throw new Error('El formato Oro/Plata requiere generar por llave GOLD o SILVER.')
    }

    return this.generateSeedingFromQualifiedEntries(tournamentId, bracketKey)
  }

  private async generateSeedingFromQualifiedEntries(
    tournamentId: string,
    bracketKey: BracketKey
  ): Promise<PlaceholderSeed[]> {
    const qualifiedEntries = await QualificationSourceService.getQualifiedEntries(tournamentId, { bracketKey })

    const seeds = qualifiedEntries.map((entry, index) => (
      PlaceholderBracketGenerator.entryToSeed(entry, index + 1, bracketKey)
    ))
    const bracketSeeding = this.buildBracketSeeding(seeds.length)

    seeds.forEach((seed, index) => {
      seed.bracket_position = bracketSeeding.position_by_seed[index]
    })

    console.log(`âœ… [BRACKET-GEN-V2] Generated ${seeds.length} seeds from qualification source (${seeds.filter(seed => !seed.is_placeholder).length} definitive, ${seeds.filter(seed => seed.is_placeholder).length} placeholders)`)

    return seeds
  }

  static entryToSeed(entry: QualifiedEntry, seed: number, bracketKey: BracketKey): PlaceholderSeed {
    const isPlaceholder = !entry.isDefinitive
    const placeholderPosition = entry.zoneId === null
      ? entry.globalPosition
      : entry.localPosition

    return {
      bracket_key: bracketKey,
      seed,
      bracket_position: 0,
      couple_id: entry.isDefinitive ? entry.coupleId : null,
      placeholder_zone_id: isPlaceholder ? entry.zoneId : null,
      placeholder_position: isPlaceholder ? placeholderPosition : null,
      placeholder_label: isPlaceholder ? entry.label : null,
      is_placeholder: isPlaceholder,
      created_as_placeholder: isPlaceholder,
    }
  }

  /**
   * Generate seeding for AMERICAN format (original logic)
   */
  private async generateAmericanSeeding(
    tournamentId: string,
    bracketKey: BracketKey = DEFAULT_BRACKET_KEY
  ): Promise<PlaceholderSeed[]> {
    console.log(`🔍 [BRACKET-GEN-V2] Generating AMERICAN format seeding for tournament: ${tournamentId}`)

    // 1. Get all zones for this tournament
    const supabase = await this.ensureSupabaseClient()
    const { data: zones, error: zonesError } = await supabase
      .from('zones')
      .select('id, name, created_at')
      .eq('tournament_id', tournamentId)
      .order('created_at') // Ensure consistent zone ordering

    if (zonesError || !zones || zones.length === 0) {
      throw new Error(`Failed to fetch zones: ${zonesError?.message || 'No zones found'}`)
    }

    console.log(`📊 [BRACKET-GEN-V2] Found ${zones.length} zones`)

    // 2. 🎯 OPTIMIZACIÓN: Usar is_definitive ya calculado en DB (elimina análisis duplicado)
    console.log(`🎯 [BRACKET-GEN-V2] Using pre-calculated is_definitive from database (no duplicate analysis)`)
    
    // Get zone positions with is_definitive already calculated
    const { data: allZonePositions, error: positionsError } = await supabase
      .from('zone_positions')
      .select('zone_id, position, couple_id, is_definitive')
      .in('zone_id', zones.map(z => z.id))
      .order('zone_id, position')
    
    if (positionsError) {
      throw new Error(`Error fetching zone positions: ${positionsError.message}`)
    }
    
    // Group positions by zone for easy access
    const positionsByZone = new Map<string, any[]>()
    for (const position of allZonePositions || []) {
      if (!positionsByZone.has(position.zone_id)) {
        positionsByZone.set(position.zone_id, [])
      }
      positionsByZone.get(position.zone_id)!.push(position)
    }
    
    console.log(`📊 [BRACKET-GEN-V2] Loaded positions for ${positionsByZone.size} zones from database`)

    // 3. Generate seeds using by-zones strategy (1A, 1B, 1C, 2A, 2B, 2C...)
    const seeds: PlaceholderSeed[] = []
    let currentSeed = 1

    // Iterate through positions (1st, 2nd, 3rd, 4th)
    for (let position = 1; position <= 4; position++) {
      for (const zone of zones) {
        const zonePositions = positionsByZone.get(zone.id) || []
        const positionData = zonePositions.find(p => p.position === position)

        // ✅ FIX: Only increment seed when position data exists
        if (positionData) {
          if (positionData.is_definitive && positionData.couple_id) {
            // Definitive couple - use couple_id directly from loaded data
            console.log(`✅ [BRACKET-GEN-V2] Zone ${zone.name} position ${position}: DEFINITIVE couple ${positionData.couple_id}`)

            if (positionData.couple_id) {
              seeds.push({
                bracket_key: bracketKey,
                seed: currentSeed,
                bracket_position: 0, // Will be calculated by serpentine
                couple_id: positionData.couple_id,
                placeholder_zone_id: null,
                placeholder_position: null,
                placeholder_label: null,
                is_placeholder: false,
                created_as_placeholder: false
              })
              currentSeed++ // ✅ Only increment when seed is actually added
            }
          } else {
            // Placeholder - position not yet definitive
            const zoneLetter = this.getZoneLetter(zone.name)
            const placeholderLabel = `${position}${zoneLetter}`

            console.log(`🔄 [BRACKET-GEN-V2] Zone ${zone.name} position ${position}: PLACEHOLDER ${placeholderLabel}`)

            seeds.push({
              bracket_key: bracketKey,
              seed: currentSeed,
              bracket_position: 0, // Will be calculated by serpentine
              couple_id: null,
              placeholder_zone_id: zone.id,
              placeholder_position: position,
              placeholder_label: placeholderLabel,
              is_placeholder: true,
              created_as_placeholder: true
            })
            currentSeed++ // ✅ Only increment when seed is actually added
          }
        }
        // ✅ FIX: Removed automatic currentSeed++ that was causing seed number gaps
      }
    }

    // 4. Apply serpentine algorithm to calculate bracket positions
    const bracketSeeding = this.buildBracketSeeding(seeds.length)
    seeds.forEach((seed, index) => {
      seed.bracket_position = bracketSeeding.position_by_seed[index]
    })

    console.log(`✅ [BRACKET-GEN-V2] Generated ${seeds.length} seeds (${seeds.filter(s => !s.is_placeholder).length} definitive, ${seeds.filter(s => s.is_placeholder).length} placeholders)`)

    return seeds
  }

  /**
   * Generate seeding for LONG format (single zone, by performance)
   * Uses direct database approach for consistency with AMERICAN format
   * Considers qualifying_advancement_settings to limit couples advancing to bracket
   */
  private async generateLongSeeding(
    tournamentId: string,
    resolvedFormat?: any,
    tournament?: { format_config?: unknown; type?: string | null; format_type?: string | null },
    bracketKey: BracketKey = DEFAULT_BRACKET_KEY
  ): Promise<PlaceholderSeed[]> {
    console.log(`🔍 [BRACKET-GEN-V2] Generating LONG format seeding for tournament: ${tournamentId}`)

    const supabase = await this.ensureSupabaseClient()

    let qualifyingAdvancementEnabled = false
    let couplesAdvance: number | null = null
    const applyLegacyQualifying = shouldUseLegacyQualifying(tournament || {})
    const hasV2Config = hasFormatConfigV2(tournament || {})

    if (applyLegacyQualifying) {
      // 1. Check legacy qualifying advancement configuration
      const { data: rankingConfig, error: configError } = await supabase
        .from('tournament_ranking_config')
        .select('qualifying_advancement_settings')
        .eq('tournament_id', tournamentId)
        .eq('is_active', true)
        .single()

      if (!configError && rankingConfig?.qualifying_advancement_settings) {
        const settings = rankingConfig.qualifying_advancement_settings
        qualifyingAdvancementEnabled = settings.enabled === true
        couplesAdvance = settings.couples_advance
      }
    }

    console.log(`🎯 [BRACKET-GEN-V2] Qualifying advancement: ${qualifyingAdvancementEnabled ? `enabled (${couplesAdvance} couples)` : 'disabled'}`)

    // 2. Get the single zone for this tournament (LONG format has only one zone)
    const { data: zones, error: zonesError } = await supabase
      .from('zones')
      .select('id, name, created_at')
      .eq('tournament_id', tournamentId)
      .order('created_at')

    if (zonesError || !zones || zones.length === 0) {
      throw new Error(`Failed to fetch zones: ${zonesError?.message || 'No zones found'}`)
    }

    if (zones.length > 1) {
      console.warn(`⚠️ [BRACKET-GEN-V2] LONG format should have single zone, found ${zones.length} zones. Using first zone.`)
    }

    const zone = zones[0]
    console.log(`📊 [BRACKET-GEN-V2] Using zone: ${zone.name}`)

    // 3. Get zone positions ordered by performance
    const { data: allZonePositions, error: positionsError } = await supabase
      .from('zone_positions')
      .select('zone_id, position, couple_id, is_definitive')
      .eq('zone_id', zone.id)
      .order('position') // Order by performance ranking (1, 2, 3, 4...)

    if (positionsError) {
      throw new Error(`Error fetching zone positions: ${positionsError.message}`)
    }

    console.log(`📊 [BRACKET-GEN-V2] Found ${allZonePositions?.length || 0} total zone positions`)

    // 4. Apply advancement policy (V2 first, legacy fallback)
    let zonePositions = allZonePositions

    if (hasV2Config && resolvedFormat) {
      const validation = AdvancementPlanner.validateAdvancementCounts((allZonePositions || []).length, resolvedFormat)
      if (!validation.isValid) {
        throw new Error(validation.error)
      }

      zonePositions = AdvancementPlanner.selectBracketEntries(allZonePositions || [], resolvedFormat, bracketKey, {
        totalCouples: (allZonePositions || []).length,
      })
    } else if (qualifyingAdvancementEnabled && couplesAdvance) {
      zonePositions = (allZonePositions || []).slice(0, couplesAdvance)
    }

    const totalAdvancing = zonePositions?.length || 0
    console.log(`🎯 [BRACKET-GEN-V2] Couples advancing to bracket: ${totalAdvancing}${qualifyingAdvancementEnabled ? ` (limited from ${allZonePositions?.length || 0})` : ''}`)

    // 5. Generate seeds using by-performance strategy (1, 2, 3, 4...)
    const seeds: PlaceholderSeed[] = []
    let currentSeed = 1

    // For LONG format, iterate through positions in order (no zone letter)
    for (const positionData of zonePositions || []) {
      if (positionData.is_definitive && positionData.couple_id) {
        // Definitive couple - use couple_id directly
        console.log(`✅ [BRACKET-GEN-V2] Position ${positionData.position}: DEFINITIVE couple ${positionData.couple_id}`)

        seeds.push({
          bracket_key: bracketKey,
          seed: currentSeed,
          bracket_position: 0, // Will be calculated by serpentine
          couple_id: positionData.couple_id,
          placeholder_zone_id: null,
          placeholder_position: null,
          placeholder_label: null,
          is_placeholder: false,
          created_as_placeholder: false
        })
      } else {
        // Placeholder - position not yet definitive
        const placeholderLabel = positionData.position.toString() // "1", "2", "3" (no zone letter)

        console.log(`🔄 [BRACKET-GEN-V2] Position ${positionData.position}: PLACEHOLDER ${placeholderLabel}`)

        seeds.push({
          bracket_key: bracketKey,
          seed: currentSeed,
          bracket_position: 0, // Will be calculated by serpentine
          couple_id: null,
          placeholder_zone_id: zone.id,
          placeholder_position: positionData.position,
          placeholder_label: placeholderLabel,
          is_placeholder: true,
          created_as_placeholder: true
        })
      }

      currentSeed++
    }

    // 4. Apply serpentine algorithm to calculate bracket positions
    const bracketSeeding = this.buildBracketSeeding(seeds.length)
    seeds.forEach((seed, index) => {
      seed.bracket_position = bracketSeeding.position_by_seed[index]
    })

    console.log(`✅ [BRACKET-GEN-V2] Generated ${seeds.length} seeds for LONG format (${seeds.filter(s => !s.is_placeholder).length} definitive, ${seeds.filter(s => s.is_placeholder).length} placeholders)`)

    return seeds
  }

  /**
   * Creates bracket matches with placeholder label support and automatic BYE handling
   */
  async generateBracketMatches(
    seeds: PlaceholderSeed[],
    tournamentId: string,
    bracketKey: BracketKey = DEFAULT_BRACKET_KEY,
    options: { draftPlayableMatches?: boolean } = {}
  ): Promise<BracketMatch[]> {
    console.log(`🎯 [BRACKET-GEN-V2] Generating bracket matches for ${seeds.length} seeds`)

    const matches: BracketMatch[] = []
    
    // Get full bracket seeding with BYEs
    const bracketSeeding = this.buildBracketSeeding(seeds.length)
    const { P, order } = bracketSeeding

    // Create rounds structure
    const rounds = this.generateRoundsStructure(P)
    
    for (const round of rounds) {
      for (let i = 0; i < round.matchCount; i++) {
        // Generate unique UUID for each match
        const matchId = randomUUID()
        
        // For first round, assign based on bracket order (includes BYEs)
        if (round.name === rounds[0].name) {
          const pos1 = i * 2 + 1 // Position 1, 3, 5...
          const pos2 = i * 2 + 2 // Position 2, 4, 6...
          
          const seed1 = order[pos1 - 1] // Convert to 0-indexed
          const seed2 = order[pos2 - 1]
          
          // Get actual seed data or handle BYE
          const seedData1 = seed1 === 'BYE' ? null : (typeof seed1 === 'number' ? seeds[seed1 - 1] : null)
          const seedData2 = seed2 === 'BYE' ? null : (typeof seed2 === 'number' ? seeds[seed2 - 1] : null)

          const match: BracketMatch = {
            id: matchId,
            tournament_id: tournamentId,
            bracket_key: bracketKey,
            couple1_id: seedData1?.couple_id || null,
            couple2_id: seedData2?.couple_id || null,
            tournament_couple_seed1_id: null, // Will be populated after seeds are inserted
            tournament_couple_seed2_id: null, // Will be populated after seeds are inserted
            placeholder_couple1_label: seedData1?.is_placeholder ? seedData1.placeholder_label : null,
            placeholder_couple2_label: seedData2?.is_placeholder ? seedData2.placeholder_label : null,
            round: round.name,
            order_in_round: i + 1,
            status: this.determineMatchStatusWithByes(seedData1, seedData2, seed1, seed2, options),
            type: 'ELIMINATION',
            // ✅ NEW: Store seed numbers for FK mapping
            seed1: seed1 === 'BYE' ? null : (typeof seed1 === 'number' ? seed1 : null),
            seed2: seed2 === 'BYE' ? null : (typeof seed2 === 'number' ? seed2 : null)
          }

          matches.push(match)
        } else {
          // Later rounds start empty - will be filled by hierarchy
          matches.push({
            id: matchId,
            tournament_id: tournamentId,
            bracket_key: bracketKey,
            couple1_id: null,
            couple2_id: null,
            tournament_couple_seed1_id: null,
            tournament_couple_seed2_id: null,
            placeholder_couple1_label: null,
            placeholder_couple2_label: null,
            round: round.name,
            order_in_round: i + 1,
            status: 'WAITING_OPONENT',
            type: 'ELIMINATION',
            // ✅ NEW: Later rounds don't have initial seeds
            seed1: null,
            seed2: null
          })
        }
      }
    }

    console.log(`✅ [BRACKET-GEN-V2] Generated ${matches.length} matches across ${rounds.length} rounds`)
    return matches
  }

  /**
   * Creates match hierarchy relationships
   */
  async createMatchHierarchy(
    matches: BracketMatch[],
    tournamentId: string,
    bracketKey: BracketKey = DEFAULT_BRACKET_KEY
  ): Promise<MatchHierarchy[]> {
    console.log(`🔗 [BRACKET-GEN-V2] Creating match hierarchy`)

    const hierarchy: MatchHierarchy[] = []
    const matchesByRound = new Map<string, BracketMatch[]>()

    // Group matches by round
    matches.forEach(match => {
      if (!matchesByRound.has(match.round)) {
        matchesByRound.set(match.round, [])
      }
      matchesByRound.get(match.round)!.push(match)
    })

    // Determine the actual round order based on the matches present
    const presentRounds = Array.from(matchesByRound.keys())
    const allRoundNames = ['32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']
    const roundOrder = allRoundNames.filter(round => presentRounds.includes(round))
    
    console.log(`🔗 [BRACKET-GEN-V2] Creating hierarchy for rounds: ${roundOrder.join(' → ')}`)
    
    // Create parent-child relationships between consecutive rounds
    for (let i = 0; i < roundOrder.length - 1; i++) {
      const childRound = roundOrder[i]
      const parentRound = roundOrder[i + 1]
      
      const childMatches = matchesByRound.get(childRound) || []
      const parentMatches = matchesByRound.get(parentRound) || []

      // Each pair of child matches feeds into one parent match
      for (let j = 0; j < parentMatches.length; j++) {
        const parentMatch = parentMatches[j]
        const child1 = childMatches[j * 2]
        const child2 = childMatches[j * 2 + 1]

        if (child1) {
          hierarchy.push({
            tournament_id: tournamentId,
            bracket_key: bracketKey,
            parent_match_id: parentMatch.id,
            child_match_id: child1.id,
            parent_round: parentRound,
            child_round: childRound,
            parent_slot: 1
          })
        }

        if (child2) {
          hierarchy.push({
            tournament_id: tournamentId,
            bracket_key: bracketKey,
            parent_match_id: parentMatch.id,
            child_match_id: child2.id,
            parent_round: parentRound,
            child_round: childRound,
            parent_slot: 2
          })
        }
      }
    }

    console.log(`✅ [BRACKET-GEN-V2] Created ${hierarchy.length} hierarchy relationships`)
    return hierarchy
  }


  /**
   * Populate tournament_couple_seed FKs in matches after seeds are inserted
   */
  populateMatchSeedReferences(matches: BracketMatch[], seeds: PlaceholderSeed[], insertedSeeds: any[]): BracketMatch[] {
    console.log(`🔗 [BRACKET-GEN-V2] Populating seed references for ${matches.length} matches`)
    
    // Create mapping: seed number -> database ID
    const seedIdMap = new Map<number, string>()
    insertedSeeds.forEach(dbSeed => {
      seedIdMap.set(dbSeed.seed, dbSeed.id)
    })
    
    console.log(`📊 [BRACKET-GEN-V2] Created seed mapping for ${seedIdMap.size} seeds`)
    
    // Update matches with seed references
    return matches.map(match => {
      // Find the original seeds that would have been used for this match
      const seed1Number = this.getSeedNumberFromMatch(match, 1, seeds)
      const seed2Number = this.getSeedNumberFromMatch(match, 2, seeds)
      
      return {
        ...match,
        tournament_couple_seed1_id: seed1Number ? seedIdMap.get(seed1Number) || null : null,
        tournament_couple_seed2_id: seed2Number ? seedIdMap.get(seed2Number) || null : null
      }
    })
  }
  
  /**
   * Helper to get seed number from match based on placeholder labels or couple IDs
   */
  private getSeedNumberFromMatch(match: BracketMatch, slot: 1 | 2, seeds: PlaceholderSeed[]): number | null {
    const placeholderLabel = slot === 1 ? match.placeholder_couple1_label : match.placeholder_couple2_label
    const coupleId = slot === 1 ? match.couple1_id : match.couple2_id
    
    // Find seed by placeholder label first
    if (placeholderLabel) {
      const seed = seeds.find(s => s.placeholder_label === placeholderLabel)
      if (seed) return seed.seed
    }
    
    // Fall back to finding by couple_id for definitive seeds
    if (coupleId) {
      const seed = seeds.find(s => s.couple_id === coupleId && !s.is_placeholder)
      if (seed) return seed.seed
    }
    
    return null
  }

  /**
   * Processes BYE matches and propagates winners ONE ROUND only
   * Uses tournament_couple_seed FK references for detection and propagation
   */
  async processBracketByes(
    matches: BracketMatch[],
    hierarchy: MatchHierarchy[],
    options: { draftPlayableMatches?: boolean } = {}
  ): Promise<void> {
    console.log(`🔄 [BRACKET-GEN-V2] Processing BYEs by tournament_couple_seed FK references - ONE ROUND only`)
    
    // Create hierarchy lookup map
    const childToParentMap = new Map<string, MatchHierarchy>()
    hierarchy.forEach(h => childToParentMap.set(h.child_match_id, h))
    
    // Detect BYEs by tournament_couple_seed FK nulls
    const byeMatches = matches.filter(m => this.isByeBySeedReference(m))
    console.log(`🎯 [BRACKET-GEN-V2] Found ${byeMatches.length} BYEs to process`)
    
    const supabase = await this.ensureSupabaseClient()
    
    for (const byeMatch of byeMatches) {
      // Get the winning seed ID (the one that is NOT null)
      const winningSeedId = byeMatch.tournament_couple_seed1_id || byeMatch.tournament_couple_seed2_id
      if (!winningSeedId) continue
      
      console.log(`✅ [BRACKET-GEN-V2] Processing BYE match ${byeMatch.id} - winning seed: ${winningSeedId}`)
      
      // Get seed data to determine if it has real couple or is placeholder
      const { data: seedData } = await supabase
        .from('tournament_couple_seeds')
        .select('couple_id, is_placeholder, placeholder_label')
        .eq('id', winningSeedId)
        .single()
      
      if (!seedData) continue
      
      // Mark BYE as finished
      byeMatch.status = 'FINISHED'
      
      // Set winner_id based on seed type
      if (seedData.couple_id) {
        // Real couple - set winner_id immediately
        byeMatch.winner_id = seedData.couple_id
        console.log(`✅ [BRACKET-GEN-V2] BYE resolved with real couple: ${seedData.couple_id}`)
      } else {
        // Placeholder - winner_id will be set later when placeholder resolves
        byeMatch.winner_id = null
        console.log(`🔄 [BRACKET-GEN-V2] BYE with placeholder: ${seedData.placeholder_label} - winner_id pending resolution`)
      }
      
      // Propagate winning seed to parent match (ONE ROUND only)
      const parentHierarchy = childToParentMap.get(byeMatch.id)
      if (parentHierarchy) {
        const parentMatch = matches.find(m => m.id === parentHierarchy.parent_match_id)
        if (parentMatch) {
          // Get winner couple_id from the BYE match
          const winnerCoupleId = byeMatch.winner_id
          
          // Assign winning seed AND couple_id to correct parent slot
          if (parentHierarchy.parent_slot === 1) {
            parentMatch.tournament_couple_seed1_id = winningSeedId
            // Only propagate couple_id if it's not a placeholder (winner_id not null)
            if (winnerCoupleId) {
              parentMatch.couple1_id = winnerCoupleId
            }
          } else if (parentHierarchy.parent_slot === 2) {
            parentMatch.tournament_couple_seed2_id = winningSeedId
            // Only propagate couple_id if it's not a placeholder (winner_id not null)
            if (winnerCoupleId) {
              parentMatch.couple2_id = winnerCoupleId
            }
          }
          
          console.log(`📤 [BRACKET-GEN-V2] Propagated seed ${winningSeedId} to parent ${parentMatch.id} slot ${parentHierarchy.parent_slot}`)
          if (winnerCoupleId) {
            console.log(`📤 [BRACKET-GEN-V2] Propagated couple ${winnerCoupleId} to parent ${parentMatch.id} slot ${parentHierarchy.parent_slot}`)
          } else {
            console.log(`🔄 [BRACKET-GEN-V2] Couple propagation skipped (placeholder BYE) for parent ${parentMatch.id} slot ${parentHierarchy.parent_slot}`)
          }

          // ✅ CRITICAL FIX: Update parent match status to PENDING if both couples are now present
          if (parentMatch.couple1_id && parentMatch.couple2_id) {
            parentMatch.status = options.draftPlayableMatches ? 'DRAFT' : 'PENDING'
            console.log(`✅ [BRACKET-GEN-V2] Parent match ${parentMatch.id} now complete - status updated: WAITING_OPONENT → ${parentMatch.status}`)
          }
        }
      }
    }
    
    console.log(`✅ [BRACKET-GEN-V2] BYE propagation completed - processed ${byeMatches.length} matches`)
    // NO RECURSION - stops here to prevent cascades
  }

  /**
   * Detects BYE matches by checking tournament_couple_seed FK references
   * BYE = exactly one of tournament_couple_seed1_id OR tournament_couple_seed2_id is null
   */
  private isByeBySeedReference(match: BracketMatch): boolean {
    const hasOnlySeed1 = Boolean(match.tournament_couple_seed1_id && !match.tournament_couple_seed2_id)
    const hasOnlySeed2 = Boolean(!match.tournament_couple_seed1_id && match.tournament_couple_seed2_id)
    
    return hasOnlySeed1 || hasOnlySeed2
  }

  /**
   * Hybrid-serpentine algorithm with BYE support (adapted from original)
   * Returns full bracket seeding with BYEs automatically placed
   */
  private buildBracketSeeding(N: number): { P: number, order: (number | 'BYE')[], position_by_seed: number[] } {
    if (N <= 0) {
      return {
        P: 0,
        order: [],
        position_by_seed: []
      }
    }

    // Calculate P = next power of 2 >= N
    let P = 1
    while (P < N) {
      P *= 2
    }

    let order: number[] = []
    
    if (P === 1) {
      order = [1]
    } else {
      // Base case: P >= 2
      order = [1, 2]
      
      // Iterative duplication (serpentine algorithm)
      while (order.length < P) {
        const m = order.length
        const Nnew = 2 * m
        const b: number[] = []
        
        // Process consecutive pairs
        for (let i = 0; i < m; i += 2) {
          const x = order[i]
          const y = order[i + 1]
          
          // Serpentine pattern: [x, Nnew+1-x, Nnew+1-y, y]
          b.push(x, Nnew + 1 - x, Nnew + 1 - y, y)
        }
        
        order = b
      }
    }

    // Mark BYEs (seeds > N)
    const orderWithByes: (number | 'BYE')[] = order.map(seed => seed > N ? 'BYE' : seed)

    // Build position_by_seed
    const position_by_seed: number[] = new Array(N + 1) // 1-indexed
    for (let pos = 1; pos <= P; pos++) {
      const seed = orderWithByes[pos - 1]
      if (seed !== 'BYE' && typeof seed === 'number') {
        position_by_seed[seed] = pos
      }
    }

    return {
      P,
      order: orderWithByes,
      position_by_seed: position_by_seed.slice(1) // Remove index 0 to make it 0-indexed in output
    }
  }

  /**
   * Helper functions
   */
  private getZoneLetter(zoneName: string | null): string {
    if (!zoneName) return 'X'
    
    const match = zoneName.match(/zona\s*([a-zA-Z])/i)
    return match ? match[1].toUpperCase() : 'X'
  }

  private determineMatchStatus(seed1: PlaceholderSeed | null, seed2: PlaceholderSeed | null): string {
    // Both couples are definitive
    if (seed1?.couple_id && seed2?.couple_id) {
      return 'PENDING'
    }
    
    // At least one is placeholder or missing
    if (!seed1?.couple_id || !seed2?.couple_id) {
      return 'WAITING_OPONENT'
    }

    return 'WAITING_OPONENT'
  }

  private determineMatchStatusWithByes(
    seedData1: PlaceholderSeed | null, 
    seedData2: PlaceholderSeed | null,
    seed1: number | 'BYE',
    seed2: number | 'BYE',
    options: { draftPlayableMatches?: boolean } = {}
  ): string {
    // Handle BYE cases
    if (seed1 === 'BYE' || seed2 === 'BYE') {
      return 'BYE'
    }
    
    // Both couples are definitive
    if (seedData1?.couple_id && seedData2?.couple_id) {
      return options.draftPlayableMatches ? 'DRAFT' : 'PENDING'
    }
    
    // At least one is placeholder or missing
    return 'WAITING_OPONENT'
  }

  private generateRoundsStructure(bracketSize: number) {
    const rounds = []
    let currentSize = bracketSize
    
    // Calculate how many rounds we need
    const totalRounds = Math.ceil(Math.log2(bracketSize))
    
    // Determine correct starting round based on bracket size
    const allRoundNames = ['32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']
    const startingRoundIndex = Math.max(0, allRoundNames.length - totalRounds)
    const roundNames = allRoundNames.slice(startingRoundIndex)
    
    console.log(`🎯 [BRACKET-GEN-V2] Bracket size: ${bracketSize}, Total rounds: ${totalRounds}, Starting from: ${roundNames[0]}`)
    
    let roundIndex = 0
    while (currentSize >= 2) {
      if (currentSize / 2 >= 1) {
        const roundName = roundNames[roundIndex] || `ROUND_${roundIndex}`
        rounds.push({
          name: roundName,
          matchCount: currentSize / 2
        })
        console.log(`🔄 [BRACKET-GEN-V2] Created round: ${roundName} with ${currentSize / 2} matches`)
      }
      currentSize = currentSize / 2
      roundIndex++
    }

    return rounds
  }
}
