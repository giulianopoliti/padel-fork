/**
 * IncrementalPlaceholderUpdater - Actualización incremental de placeholders
 * Resuelve posiciones definitivas de zona sin regenerar todo el bracket
 * Integra CorrectedDefinitiveAnalyzer para análisis con backtracking
 */

import { createClient } from '@/utils/supabase/server'
import { CorrectedDefinitiveAnalyzer } from './corrected-definitive-analyzer'
import { getPlaceholderResolverV2 } from './placeholder-resolution-v2'
import { QualificationSourceService } from './qualification-source.service'
import { TournamentFormatRulesService } from './tournament-format-rules.service'

export class IncrementalPlaceholderUpdater {
  
  /**
   * Analiza zona con backtracking y resuelve posiciones definitivas
   */
  async analyzeZoneAndResolveDefinitives(
    tournamentId: string, 
    zoneId: string
  ): Promise<{ resolved: number; definitive: number }> {
    console.log(`🔄 [INCREMENTAL-UPDATER] Starting zone analysis with backtracking for zone ${zoneId}`)
    
    // PASO 1: Usar CorrectedDefinitiveAnalyzer con backtracking real
    const analyzer = new CorrectedDefinitiveAnalyzer()
    const [zoneResult] = await analyzer.analyzeZone(tournamentId, zoneId)
    
    console.log(`🧠 [INCREMENTAL-UPDATER] Zone analysis completed: ${zoneResult.definitivePositions}/${zoneResult.totalCouples} definitive positions`)
    console.log(`🎯 [INCREMENTAL-UPDATER] Analysis methods used: ${zoneResult.analysis.map(a => a.analysisMethod).join(', ')}`)
    
    let resolvedCount = 0
    
    const resolutionScope = await this.getPlaceholderResolutionScope(tournamentId)

    // PASO 2: Resolver placeholders segun el scope de clasificacion.
    if (resolutionScope === 'GLOBAL_STANDINGS') {
      resolvedCount = await this.resolveGlobalDefinitivePositions(tournamentId)
    } else if (resolutionScope === 'HYBRID_FIRSTS_GLOBAL_REST_ZONES') {
      resolvedCount = await this.resolveHybridDefinitivePositions(tournamentId, zoneId)
    } else if (zoneResult.definitivePositions > 0) {
      resolvedCount = await this.resolveZoneDefinitivePositions(tournamentId, zoneId)
    } else {
      console.log(`📭 [INCREMENTAL-UPDATER] No definitive positions found for zone ${zoneId} after backtracking analysis`)
    }
    
    // PASO 3: Log completion (no flag needed since duplicate logic was removed)
    
    return {
      resolved: resolvedCount,
      definitive: zoneResult.definitivePositions
    }
  }

  private async getPlaceholderResolutionScope(
    tournamentId: string
  ): Promise<'ZONE_POSITIONS' | 'GLOBAL_STANDINGS' | 'HYBRID_FIRSTS_GLOBAL_REST_ZONES'> {
    const supabase = await createClient()

    const { data: tournament, error } = await supabase
      .from('tournaments')
      .select('type, format_type, format_config')
      .eq('id', tournamentId)
      .single()

    if (error || !tournament) {
      console.error(`[INCREMENTAL-UPDATER] Error loading tournament format: ${error?.message || 'Tournament not found'}`)
      return 'ZONE_POSITIONS'
    }

    const rules = TournamentFormatRulesService.resolve({ tournament })
    return rules.qualificationSource
  }

  private async resolveGlobalDefinitivePositions(tournamentId: string): Promise<number> {
    console.log(`[INCREMENTAL-UPDATER] Resolving definitive global standings for tournament ${tournamentId}`)

    const entries = await QualificationSourceService.getQualifiedEntries(tournamentId)
    const placeholderResolver = getPlaceholderResolverV2()
    let totalResolved = 0

    for (const entry of entries) {
      if (!entry.isDefinitive || !entry.coupleId || !entry.globalPosition) {
        continue
      }

      const result = await placeholderResolver.resolveFromGlobalPosition(
        tournamentId,
        entry.globalPosition,
        entry.coupleId
      )

      if (!result.success) {
        throw new Error(
          `Failed to resolve global position ${entry.globalPosition}: ${result.errors?.join(', ') || 'unknown error'}`
        )
      }

      totalResolved += result.seedsResolved
    }

    console.log(`[INCREMENTAL-UPDATER] Completed global placeholder resolution: ${totalResolved} seeds resolved`)
    return totalResolved
  }

  private async resolveHybridDefinitivePositions(tournamentId: string, zoneId: string): Promise<number> {
    const globalResolved = await this.resolveGlobalDefinitivePositions(tournamentId)
    const zoneResolved = await this.resolveZoneDefinitivePositions(tournamentId, zoneId)

    return globalResolved + zoneResolved
  }
  
  /**
   * Resuelve posiciones definitivas de una zona específica (después del análisis con backtracking)
   */
  private async resolveZoneDefinitivePositions(
    tournamentId: string, 
    zoneId: string
  ): Promise<number> {
    console.log(`🔄 [INCREMENTAL-UPDATER] Resolving definitive positions for zone ${zoneId}`)
    
    const supabase = await createClient()
    
    // 1. OBTENER posiciones definitivas (ya analizadas con backtracking)
    const { data: definitivePositions, error: positionsError } = await supabase
      .from('zone_positions')
      .select('zone_id, position, couple_id')
      .eq('tournament_id', tournamentId)
      .eq('zone_id', zoneId)
      .eq('is_definitive', true)
    
    if (positionsError) {
      console.error(`❌ [INCREMENTAL-UPDATER] Error fetching definitive positions:`, positionsError)
      throw new Error(`Failed to fetch definitive positions: ${positionsError.message}`)
    }
    
    if (!definitivePositions?.length) {
      console.log(`📭 [INCREMENTAL-UPDATER] No definitive positions found for zone ${zoneId}`)
      return 0
    }
    
    console.log(`🎯 [INCREMENTAL-UPDATER] Found ${definitivePositions.length} definitive positions to resolve`)
    
    // 2. PROCESAR cada posición definitiva
    let totalResolved = 0
    for (const position of definitivePositions) {
      if (position.position === 1) {
        continue
      }

      try {
        const resolved = await this.updatePlaceholderSeed(
          tournamentId,
          position.zone_id,
          position.position, 
          position.couple_id
        )
        if (resolved) totalResolved++
      } catch (error) {
        console.error(`❌ [INCREMENTAL-UPDATER] Failed to resolve position ${position.position}:`, error)
        // Continúa con las otras posiciones
      }
    }
    
    console.log(`✅ [INCREMENTAL-UPDATER] Completed: ${totalResolved}/${definitivePositions.length} positions resolved`)
    return totalResolved
  }
  
  /**
   * Actualiza un seed placeholder específico con couple_id real
   */
  private async updatePlaceholderSeed(
    tournamentId: string,
    zoneId: string, 
    position: number,
    coupleId: string
  ): Promise<boolean> {
    console.log(`🔄 [INCREMENTAL-UPDATER] Updating seed for zone ${zoneId}, position ${position}, couple ${coupleId}`)
    
    const supabase = await createClient()

    const { data: existingResolvedSeed, error: existingSeedError } = await supabase
      .from('tournament_couple_seeds')
      .select('id, seed')
      .eq('tournament_id', tournamentId)
      .eq('couple_id', coupleId)
      .maybeSingle()

    if (existingSeedError) {
      console.error(`âŒ [INCREMENTAL-UPDATER] Error checking existing seed for couple ${coupleId}:`, existingSeedError)
      throw new Error(`Failed to check existing seed: ${existingSeedError.message}`)
    }

    if (existingResolvedSeed) {
      console.warn(`âš ï¸ [INCREMENTAL-UPDATER] Couple ${coupleId} already resolved in seed ${existingResolvedSeed.seed}. Skipping automatic resolution; manual drag-and-drop/audit must handle it.`)
      return false
    }
    
    // 3. ACTUALIZAR tournament_couple_seeds
    const { data: updatedSeeds, error: seedError } = await supabase
      .from('tournament_couple_seeds')
      .update({
        couple_id: coupleId,
        is_placeholder: false,
        resolved_at: new Date().toISOString()
      })
      .eq('tournament_id', tournamentId)
      .eq('placeholder_zone_id', zoneId)
      .eq('placeholder_position', position)
      .eq('is_placeholder', true)
      .select('id')
    
    if (seedError) {
      console.error(`❌ [INCREMENTAL-UPDATER] Error updating seed for zone ${zoneId} position ${position}:`, seedError)
      throw new Error(`Failed to update seed: ${seedError.message}`)
    }
    
    if (!updatedSeeds?.length) {
      console.log(`⚠️ [INCREMENTAL-UPDATER] No placeholder seed found for zone ${zoneId} position ${position} (already resolved?)`)
      return false
    }
    
    const seedId = updatedSeeds[0].id
    console.log(`✅ [INCREMENTAL-UPDATER] Updated seed ${seedId} with couple ${coupleId}`)
    
    // 4. ACTUALIZAR matches que referencian este seed
    await this.updateMatchesWithResolvedCouple(
      tournamentId,
      seedId,
      coupleId
    )
    
    return true
  }
  
  /**
   * Actualiza matches que referencian el seed resuelto
   */
  private async updateMatchesWithResolvedCouple(
    tournamentId: string,
    seedId: string,
    coupleId: string
  ): Promise<void> {
    console.log(`🔄 [INCREMENTAL-UPDATER] Updating matches for seed ${seedId} with couple ${coupleId}`)
    
    const supabase = await createClient()
    let matchesUpdated = 0
    
    // 4a. ACTUALIZAR matches donde seed es tournament_couple_seed1_id → couple1_id
    // Primero obtener los matches que vamos a actualizar para verificar su estado
    const { data: matchesToUpdate1, error: fetchError1 } = await supabase
      .from('matches')
      .select('id, couple2_id, status')
      .eq('tournament_id', tournamentId)
      .eq('tournament_couple_seed1_id', seedId)
      .is('couple1_id', null)
    
    if (fetchError1) {
      console.error(`❌ [INCREMENTAL-UPDATER] Error fetching matches for couple1 update:`, fetchError1)
      throw new Error(`Failed to fetch matches for couple1 update: ${fetchError1.message}`)
    }
    
    let matches1 = []
    if (matchesToUpdate1?.length) {
      // Actualizar cada match con lógica de status
      for (const match of matchesToUpdate1) {
        const updateData: any = { couple1_id: coupleId }
        
        // Si couple2_id también está presente, cambiar status a PENDING
        if (match.couple2_id) {
          updateData.status = match.status === 'DRAFT' ? 'DRAFT' : 'PENDING'
        }
        
        const { data: updatedMatch, error: updateError } = await supabase
          .from('matches')
          .update(updateData)
          .eq('id', match.id)
          .select('id')
        
        if (updateError) {
          console.error(`❌ [INCREMENTAL-UPDATER] Error updating match ${match.id}:`, updateError)
          continue
        }
        
        if (updatedMatch?.length) {
          matches1.push(...updatedMatch)
          const statusInfo = match.couple2_id ? ' (status → PENDING)' : ''
          console.log(`✅ [INCREMENTAL-UPDATER] Updated match ${match.id}: couple1_id = ${coupleId}${statusInfo}`)
        }
      }
    }
    
    if (matches1?.length) {
      matchesUpdated += matches1.length
      console.log(`✅ [INCREMENTAL-UPDATER] Updated ${matches1.length} matches with couple1_id = ${coupleId}`)
    }
    
    // 4b. ACTUALIZAR matches donde seed es tournament_couple_seed2_id → couple2_id
    // Primero obtener los matches que vamos a actualizar para verificar su estado
    const { data: matchesToUpdate2, error: fetchError2 } = await supabase
      .from('matches')
      .select('id, couple1_id, status')
      .eq('tournament_id', tournamentId)
      .eq('tournament_couple_seed2_id', seedId)
      .is('couple2_id', null)
    
    if (fetchError2) {
      console.error(`❌ [INCREMENTAL-UPDATER] Error fetching matches for couple2 update:`, fetchError2)
      throw new Error(`Failed to fetch matches for couple2 update: ${fetchError2.message}`)
    }
    
    let matches2 = []
    if (matchesToUpdate2?.length) {
      // Actualizar cada match con lógica de status
      for (const match of matchesToUpdate2) {
        const updateData: any = { couple2_id: coupleId }
        
        // Si couple1_id también está presente, cambiar status a PENDING
        if (match.couple1_id) {
          updateData.status = match.status === 'DRAFT' ? 'DRAFT' : 'PENDING'
        }
        
        const { data: updatedMatch, error: updateError } = await supabase
          .from('matches')
          .update(updateData)
          .eq('id', match.id)
          .select('id')
        
        if (updateError) {
          console.error(`❌ [INCREMENTAL-UPDATER] Error updating match ${match.id}:`, updateError)
          continue
        }
        
        if (updatedMatch?.length) {
          matches2.push(...updatedMatch)
          const statusInfo = match.couple1_id ? ' (status → PENDING)' : ''
          console.log(`✅ [INCREMENTAL-UPDATER] Updated match ${match.id}: couple2_id = ${coupleId}${statusInfo}`)
        }
      }
    }
    
    if (matches2?.length) {
      matchesUpdated += matches2.length
      console.log(`✅ [INCREMENTAL-UPDATER] Updated ${matches2.length} matches with couple2_id = ${coupleId}`)
    }
    
    if (matchesUpdated === 0) {
      console.log(`⚠️ [INCREMENTAL-UPDATER] No matches found to update for seed ${seedId} (already resolved?)`)
    } else {
      console.log(`✅ [INCREMENTAL-UPDATER] Total matches updated for seed ${seedId}: ${matchesUpdated}`)
    }
  }
}
