/**
 * PLACEHOLDER RESOLUTION SERVICE V2
 * 
 * Enhanced placeholder resolution using tournament_couple_seed foreign keys.
 * Follows the new architecture with direct FK relationships between matches and seeds.
 * 
 * ARCHITECTURE:
 * 1. zone_positions.is_definitive changes to true
 * 2. Find tournament_couple_seeds by placeholder_zone_id + placeholder_position
 * 3. Update tournament_couple_seeds.couple_id (resolve placeholder)
 * 4. Propagate to matches via tournament_couple_seed FKs
 * 5. Update match status if both slots are filled
 */

import { createClient, createClientServiceRole } from '@/utils/supabase/server'

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface PlaceholderResolutionResult {
  success: boolean
  seedsResolved: number
  matchesUpdated: number
  resolutionDetails: SeedResolution[]
  errors?: string[]
}

export interface SeedResolution {
  seedId: string
  seed: number
  placeholderLabel: string
  resolvedToCoupleId: string
  zoneId: string | null
  position: number
  matchesAffected: string[]
}

export interface ZonePositionUpdate {
  zoneId: string
  position: number
  coupleId: string
  isDefinitive: boolean
}

// ============================================================================
// MAIN PLACEHOLDER RESOLUTION SERVICE V2
// ============================================================================

export class PlaceholderResolutionServiceV2 {
  /**
   * Main entry point: Resolve placeholders when zone position becomes definitive
   */
  async resolveFromZonePosition(
    tournamentId: string,
    zoneId: string,
    position: number,
    coupleId: string
  ): Promise<PlaceholderResolutionResult> {
    console.log(`🔄 [PLACEHOLDER-V2] Resolving position ${position} in zone ${zoneId} for tournament ${tournamentId}`)

    try {
      const supabase = await createClientServiceRole()
      
      // Step 1: Find placeholder seeds that reference this zone position
      const placeholderSeeds = await this.findPlaceholderSeeds(tournamentId, zoneId, position)
      
      if (placeholderSeeds.length === 0) {
        console.log(`📭 [PLACEHOLDER-V2] No placeholder seeds found for zone ${zoneId} position ${position}`)
        return {
          success: true,
          seedsResolved: 0,
          matchesUpdated: 0,
          resolutionDetails: []
        }
      }

      console.log(`🎯 [PLACEHOLDER-V2] Found ${placeholderSeeds.length} placeholder seeds to resolve`)

      const resolutions: SeedResolution[] = []

      // Step 2: Resolve each placeholder seed
      for (const seed of placeholderSeeds) {
        const resolution = await this.resolveSeed(supabase, seed, coupleId, zoneId)
        if (resolution) {
          resolutions.push(resolution)
        }
      }

      // Step 3: Propagate changes to matches using FK relationships
      let totalMatchesUpdated = 0
      for (const resolution of resolutions) {
        const matchesUpdated = await this.propagateToMatches(supabase, resolution.seedId, coupleId)
        totalMatchesUpdated += matchesUpdated
        resolution.matchesAffected = await this.getAffectedMatchIds(supabase, resolution.seedId)
      }

      console.log(`✅ [PLACEHOLDER-V2] Resolution complete: ${resolutions.length} seeds, ${totalMatchesUpdated} matches`)

      return {
        success: true,
        seedsResolved: resolutions.length,
        matchesUpdated: totalMatchesUpdated,
        resolutionDetails: resolutions
      }

    } catch (error) {
      console.error('❌ [PLACEHOLDER-V2] Resolution error:', error)
      return {
        success: false,
        seedsResolved: 0,
        matchesUpdated: 0,
        resolutionDetails: [],
        errors: [error instanceof Error ? error.message : 'Unknown error']
      }
    }
  }

  /**
   * Resolve placeholders produced by a GLOBAL_STANDINGS bracket.
   * Global placeholders have no zone; placeholder_position stores the global rank.
   */
  async resolveFromGlobalPosition(
    tournamentId: string,
    globalPosition: number,
    coupleId: string
  ): Promise<PlaceholderResolutionResult> {
    console.log(`[PLACEHOLDER-V2] Resolving global position ${globalPosition} for tournament ${tournamentId}`)

    try {
      const supabase = await createClientServiceRole()
      const placeholderSeeds = await this.findGlobalPlaceholderSeeds(tournamentId, globalPosition)

      if (placeholderSeeds.length === 0) {
        console.log(`[PLACEHOLDER-V2] No global placeholder seeds found for position ${globalPosition}`)
        return {
          success: true,
          seedsResolved: 0,
          matchesUpdated: 0,
          resolutionDetails: []
        }
      }

      console.log(`[PLACEHOLDER-V2] Found ${placeholderSeeds.length} global placeholder seeds to resolve`)

      const resolutions: SeedResolution[] = []

      for (const seed of placeholderSeeds) {
        const resolution = await this.resolveSeed(supabase, seed, coupleId, null)
        if (resolution) {
          resolutions.push(resolution)
        }
      }

      let totalMatchesUpdated = 0
      for (const resolution of resolutions) {
        const matchesUpdated = await this.propagateToMatches(supabase, resolution.seedId, coupleId)
        totalMatchesUpdated += matchesUpdated
        resolution.matchesAffected = await this.getAffectedMatchIds(supabase, resolution.seedId)
      }

      console.log(`[PLACEHOLDER-V2] Global resolution complete: ${resolutions.length} seeds, ${totalMatchesUpdated} matches`)

      return {
        success: true,
        seedsResolved: resolutions.length,
        matchesUpdated: totalMatchesUpdated,
        resolutionDetails: resolutions
      }

    } catch (error) {
      console.error('[PLACEHOLDER-V2] Global resolution error:', error)
      return {
        success: false,
        seedsResolved: 0,
        matchesUpdated: 0,
        resolutionDetails: [],
        errors: [error instanceof Error ? error.message : 'Unknown error']
      }
    }
  }

  /**
   * Find placeholder seeds that reference a specific zone position
   */
  private async findPlaceholderSeeds(
    tournamentId: string, 
    zoneId: string, 
    position: number
  ): Promise<any[]> {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('tournament_couple_seeds')
      .select('id, seed, placeholder_label, placeholder_zone_id, placeholder_position, is_placeholder')
      .eq('tournament_id', tournamentId)
      .eq('placeholder_zone_id', zoneId)
      .eq('placeholder_position', position)
      .eq('is_placeholder', true)

    if (error) {
      throw new Error(`Failed to find placeholder seeds: ${error.message}`)
    }

    return data || []
  }

  private async findGlobalPlaceholderSeeds(
    tournamentId: string,
    globalPosition: number
  ): Promise<any[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('tournament_couple_seeds')
      .select('id, seed, placeholder_label, placeholder_zone_id, placeholder_position, is_placeholder')
      .eq('tournament_id', tournamentId)
      .is('placeholder_zone_id', null)
      .eq('placeholder_position', globalPosition)
      .eq('is_placeholder', true)

    if (error) {
      throw new Error(`Failed to find global placeholder seeds: ${error.message}`)
    }

    return data || []
  }

  /**
   * Resolve a single placeholder seed
   */
  private async resolveSeed(
    supabase: any,
    seed: any,
    coupleId: string,
    zoneId: string | null
  ): Promise<SeedResolution | null> {
    try {
      // Update the tournament_couple_seed to resolve the placeholder
      // IMPORTANT: Clear placeholder fields to comply with data integrity constraint
      const { error: updateError } = await supabase
        .from('tournament_couple_seeds')
        .update({
          couple_id: coupleId,
          is_placeholder: false,
          placeholder_zone_id: null,
          placeholder_position: null,
          placeholder_label: null,
          resolved_at: new Date().toISOString()
        })
        .eq('id', seed.id)

      if (updateError) {
        throw new Error(`Failed to resolve seed ${seed.id}: ${updateError.message}`)
      }

      console.log(`✅ [PLACEHOLDER-V2] Resolved seed ${seed.seed} (${seed.placeholder_label}) to couple ${coupleId}`)

      return {
        seedId: seed.id,
        seed: seed.seed,
        placeholderLabel: seed.placeholder_label,
        resolvedToCoupleId: coupleId,
        zoneId: zoneId,
        position: seed.placeholder_position,
        matchesAffected: [] // Will be populated later
      }

    } catch (error) {
      console.error(`❌ [PLACEHOLDER-V2] Failed to resolve seed ${seed.id}:`, error)
      return null
    }
  }

  /**
   * Propagate resolved seed to matches using FK relationships
   */
  private async propagateToMatches(
    supabase: any,
    seedId: string,
    coupleId: string
  ): Promise<number> {
    let matchesUpdated = 0

    try {
      // Update matches where this seed is in slot 1
      const { data: slot1Matches, error: slot1Error } = await supabase
        .from('matches')
        .update({
          couple1_id: coupleId,
          placeholder_couple1_label: null
        })
        .eq('tournament_couple_seed1_id', seedId)
        .select('id')

      if (slot1Error) throw slot1Error
      const slot1Count = slot1Matches?.length || 0
      matchesUpdated += slot1Count

      // Update matches where this seed is in slot 2
      const { data: slot2Matches, error: slot2Error } = await supabase
        .from('matches')
        .update({
          couple2_id: coupleId,
          placeholder_couple2_label: null
        })
        .eq('tournament_couple_seed2_id', seedId)
        .select('id')

      if (slot2Error) throw slot2Error
      const slot2Count = slot2Matches?.length || 0
      matchesUpdated += slot2Count

      // Update status for matches that are now ready
      const allUpdatedMatchIds = [
        ...(slot1Matches || []).map((m: { id: string }) => m.id),
        ...(slot2Matches || []).map((m: { id: string }) => m.id)
      ]

      for (const matchId of allUpdatedMatchIds) {
        await this.updateMatchStatusIfReady(supabase, matchId)
      }

      console.log(`🔄 [PLACEHOLDER-V2] Updated ${matchesUpdated} matches for seed ${seedId}`)

      return matchesUpdated

    } catch (error) {
      console.error(`❌ [PLACEHOLDER-V2] Failed to propagate seed ${seedId} to matches:`, error)
      return 0
    }
  }

  /**
   * Get IDs of matches affected by a seed resolution
   */
  private async getAffectedMatchIds(supabase: any, seedId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('matches')
        .select('id')
        .or(`tournament_couple_seed1_id.eq.${seedId},tournament_couple_seed2_id.eq.${seedId}`)

      if (error) throw error

      return (data || []).map((match: any) => match.id)

    } catch (error) {
      console.error(`❌ [PLACEHOLDER-V2] Failed to get affected matches for seed ${seedId}:`, error)
      return []
    }
  }

  /**
   * Check if a match is ready to play (both slots filled)
   */
  private async updateMatchStatusIfReady(supabase: any, matchId: string): Promise<boolean> {
    try {
      const { data: match, error } = await supabase
        .from('matches')
        .select('couple1_id, couple2_id, status')
        .eq('id', matchId)
        .single()

      if (error) throw error

      // If both slots are filled and match is waiting, mark as PENDING.
      // DRAFT is preserved so organizers can keep a hidden bracket hidden.
      if (
        match.couple1_id &&
        match.couple2_id &&
        match.status !== 'DRAFT' &&
        match.status !== 'PENDING'
      ) {
        const { error: updateError } = await supabase
          .from('matches')
          .update({ status: 'PENDING' })
          .eq('id', matchId)

        if (updateError) throw updateError

        console.log(`✅ [PLACEHOLDER-V2] Match ${matchId} is ready to play (status: PENDING)`)
        return true
      }

      return false

    } catch (error) {
      console.error(`❌ [PLACEHOLDER-V2] Failed to update match status for ${matchId}:`, error)
      return false
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let _placeholderResolverV2: PlaceholderResolutionServiceV2 | null = null

export function getPlaceholderResolverV2(): PlaceholderResolutionServiceV2 {
  if (!_placeholderResolverV2) {
    _placeholderResolverV2 = new PlaceholderResolutionServiceV2()
  }
  return _placeholderResolverV2
}
