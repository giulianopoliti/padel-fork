/**
 * ZoneAnalysisTriggerService - Automated zone analysis with reliability patterns
 * Triggers zone analysis when matches are completed with circuit breaker and debouncing
 */

import { createClient } from '@/utils/supabase/server'
import { CorrectedDefinitiveAnalyzer } from './corrected-definitive-analyzer'
import { getPlaceholderResolverV2 } from './placeholder-resolution-v2'
import { QualificationSourceService } from './qualification-source.service'
import { TournamentFormatRulesService } from './tournament-format-rules.service'

interface CircuitBreakerState {
  failures: number
  lastFailure: number
}

export class ZoneAnalysisTriggerService {
  private analysisQueue = new Map<string, NodeJS.Timeout>()
  private circuitBreaker = new Map<string, CircuitBreakerState>()
  
  // Circuit breaker configuration
  private readonly MAX_FAILURES = 3
  private readonly FAILURE_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
  private readonly DEBOUNCE_DELAY_MS = 500 // 500ms debounce

  /**
   * Main entry point: Trigger zone analysis with reliability patterns
   */
  async triggerZoneAnalysis(tournamentId: string, zoneId: string): Promise<void> {
    const key = `${tournamentId}-${zoneId}`
    
    // Circuit breaker check
    if (this.isCircuitBreakerOpen(key)) {
      console.warn(`[ZONE-TRIGGER] Circuit breaker OPEN for zone ${zoneId}, skipping analysis`)
      return
    }

    // Debouncing: Cancel previous analysis if pending
    if (this.analysisQueue.has(key)) {
      clearTimeout(this.analysisQueue.get(key)!)
      console.log(`[ZONE-TRIGGER] Debouncing zone analysis for ${zoneId}`)
    }

    // Schedule new analysis
    const timeout = setTimeout(async () => {
      try {
        await this.performZoneAnalysis(tournamentId, zoneId)
        this.resetCircuitBreaker(key)
        console.log(`✅ [ZONE-TRIGGER] Zone analysis completed for zone: ${zoneId}`)
      } catch (error) {
        this.recordFailure(key)
        console.error(`❌ [ZONE-TRIGGER] Zone analysis failed for zone: ${zoneId}`, error)
      } finally {
        this.analysisQueue.delete(key)
      }
    }, this.DEBOUNCE_DELAY_MS)

    this.analysisQueue.set(key, timeout)
    console.log(`🔄 [ZONE-TRIGGER] Zone analysis scheduled for zone: ${zoneId}`)
  }

  /**
   * Execute the actual zone analysis workflow
   */
  private async performZoneAnalysis(tournamentId: string, zoneId: string): Promise<void> {
    console.log(`🔍 [ZONE-TRIGGER] Starting zone analysis for zone: ${zoneId}`)

    // Step 1: Recalculate zone positions
    await this.recalculateZonePositions(tournamentId, zoneId)
    
    // Step 2: Analyze definitive positions for this zone
    const definitivePositions = await this.analyzeZoneDefinitivePositions(tournamentId, zoneId)
    
    // Step 3: ✅ NEW - Trigger placeholder resolution for new definitive positions
    await this.triggerPlaceholderResolution(tournamentId, zoneId, definitivePositions)
    
    console.log(`✅ [ZONE-TRIGGER] Zone analysis workflow completed for zone: ${zoneId}`)
  }

  /**
   * Recalculate positions for a specific zone
   */
  private async recalculateZonePositions(tournamentId: string, zoneId: string): Promise<void> {
    console.log(`📊 [ZONE-TRIGGER] Recalculating positions for zone: ${zoneId}`)
    
    const supabase = await createClient()
    
    // Use the existing zone positions endpoint logic
    const response = await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/tournaments/${tournamentId}/zone-positions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        zoneId, 
        action: 'recalculate',
        source: 'auto-trigger' 
      })
    })

    if (!response.ok) {
      throw new Error(`Zone position recalculation failed: ${response.statusText}`)
    }

    console.log(`✅ [ZONE-TRIGGER] Zone positions recalculated for zone: ${zoneId}`)
  }

  /**
   * Analyze definitive positions for a specific zone
   */
  private async analyzeZoneDefinitivePositions(tournamentId: string, zoneId: string): Promise<any[]> {
    console.log(`🧠 [ZONE-TRIGGER] Analyzing definitive positions for zone: ${zoneId}`)
    
    const analyzer = new CorrectedDefinitiveAnalyzer()
    
    // Use the modified analyzer that accepts specific zone ID
    await analyzer.analyzeZone(tournamentId, zoneId)
    
    // Get the updated zone positions to check which became definitive
    const definitivePositions = await this.getNewDefinitivePositions(tournamentId, zoneId)
    
    console.log(`✅ [ZONE-TRIGGER] Definitive analysis completed for zone: ${zoneId}, found ${definitivePositions.length} definitive positions`)
    
    return definitivePositions
  }

  /**
   * Get zone positions that are now definitive
   */
  private async getNewDefinitivePositions(tournamentId: string, zoneId: string): Promise<any[]> {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('zone_positions')
      .select('zone_id, position, couple_id, is_definitive')
      .eq('tournament_id', tournamentId)
      .eq('zone_id', zoneId)
      .eq('is_definitive', true)
      .not('couple_id', 'is', null)

    if (error) {
      console.error(`❌ [ZONE-TRIGGER] Error fetching definitive positions: ${error.message}`)
      return []
    }

    return data || []
  }

  /**
   * ✅ NEW - Trigger placeholder resolution for definitive positions
   */
  private async triggerPlaceholderResolution(
    tournamentId: string, 
    zoneId: string, 
    definitivePositions: any[]
  ): Promise<void> {
    const resolutionScope = await this.getPlaceholderResolutionScope(tournamentId)
    if (resolutionScope === 'MANUAL') return

    if (resolutionScope === 'GLOBAL_STANDINGS') {
      await this.triggerGlobalPlaceholderResolution(tournamentId)
      return
    }

    if (resolutionScope === 'HYBRID_FIRSTS_GLOBAL_REST_ZONES') {
      await this.triggerGlobalPlaceholderResolution(tournamentId)
    }

    if (definitivePositions.length === 0) {
      console.log(`📭 [ZONE-TRIGGER] No definitive positions to resolve for zone: ${zoneId}`)
      return
    }

    console.log(`🔄 [ZONE-TRIGGER] Triggering placeholder resolution for ${definitivePositions.length} definitive positions`)

    const placeholderResolver = getPlaceholderResolverV2()
    let totalResolved = 0

    for (const position of definitivePositions) {
      if (resolutionScope === 'HYBRID_FIRSTS_GLOBAL_REST_ZONES' && position.position === 1) {
        continue
      }

      try {
        const result = await placeholderResolver.resolveFromZonePosition(
          tournamentId,
          position.zone_id,
          position.position,
          position.couple_id
        )

        if (result.success) {
          totalResolved += result.seedsResolved
          console.log(`✅ [ZONE-TRIGGER] Resolved ${result.seedsResolved} seeds for position ${position.position} in zone ${zoneId}`)
        } else {
          console.error(`❌ [ZONE-TRIGGER] Failed to resolve position ${position.position}: ${result.errors?.join(', ')}`)
        }

      } catch (error) {
        console.error(`❌ [ZONE-TRIGGER] Exception resolving position ${position.position}:`, error)
      }
    }

    console.log(`🎯 [ZONE-TRIGGER] Placeholder resolution completed: ${totalResolved} total seeds resolved for zone ${zoneId}`)
  }

  private async getPlaceholderResolutionScope(
    tournamentId: string
  ): Promise<'ZONE_POSITIONS' | 'GLOBAL_STANDINGS' | 'HYBRID_FIRSTS_GLOBAL_REST_ZONES' | 'MANUAL'> {
    const supabase = await createClient()

    const { data: tournament, error } = await supabase
      .from('tournaments')
      .select('type, format_type, format_config')
      .eq('id', tournamentId)
      .single()

    if (error || !tournament) {
      console.error(`[ZONE-TRIGGER] Error loading tournament format: ${error?.message || 'Tournament not found'}`)
      return 'ZONE_POSITIONS'
    }

    const rules = TournamentFormatRulesService.resolve({ tournament })
    return rules.qualificationSource
  }

  private async triggerGlobalPlaceholderResolution(tournamentId: string): Promise<void> {
    console.log(`[ZONE-TRIGGER] Triggering global placeholder resolution`)

    const entries = await QualificationSourceService.getQualifiedEntries(tournamentId)
    const placeholderResolver = getPlaceholderResolverV2()
    let totalResolved = 0

    for (const entry of entries) {
      if (!entry.isDefinitive || !entry.coupleId || !entry.globalPosition) {
        continue
      }

      try {
        const result = await placeholderResolver.resolveFromGlobalPosition(
          tournamentId,
          entry.globalPosition,
          entry.coupleId
        )

        if (result.success) {
          totalResolved += result.seedsResolved
          console.log(`[ZONE-TRIGGER] Resolved ${result.seedsResolved} seeds for global position ${entry.globalPosition}`)
        } else {
          console.error(`[ZONE-TRIGGER] Failed to resolve global position ${entry.globalPosition}: ${result.errors?.join(', ')}`)
        }
      } catch (error) {
        console.error(`[ZONE-TRIGGER] Exception resolving global position ${entry.globalPosition}:`, error)
      }
    }

    console.log(`[ZONE-TRIGGER] Global placeholder resolution completed: ${totalResolved} total seeds resolved`)
  }

  /**
   * Circuit breaker: Check if circuit is open for this zone
   */
  private isCircuitBreakerOpen(key: string): boolean {
    const state = this.circuitBreaker.get(key)
    if (!state) return false

    const isWithinFailureWindow = Date.now() - state.lastFailure < this.FAILURE_WINDOW_MS
    return state.failures >= this.MAX_FAILURES && isWithinFailureWindow
  }

  /**
   * Circuit breaker: Record a failure
   */
  private recordFailure(key: string): void {
    const state = this.circuitBreaker.get(key) || { failures: 0, lastFailure: 0 }
    state.failures++
    state.lastFailure = Date.now()
    this.circuitBreaker.set(key, state)
    
    console.warn(`⚠️ [ZONE-TRIGGER] Circuit breaker recorded failure ${state.failures}/${this.MAX_FAILURES} for ${key}`)
  }

  /**
   * Circuit breaker: Reset on successful operation
   */
  private resetCircuitBreaker(key: string): void {
    if (this.circuitBreaker.has(key)) {
      this.circuitBreaker.delete(key)
      console.log(`🔄 [ZONE-TRIGGER] Circuit breaker reset for ${key}`)
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  public cleanup(): void {
    console.log(`🧹 [ZONE-TRIGGER] Cleaning up ${this.analysisQueue.size} pending analyses`)
    
    for (const timeout of this.analysisQueue.values()) {
      clearTimeout(timeout)
    }
    
    this.analysisQueue.clear()
    this.circuitBreaker.clear()
  }

  /**
   * Get circuit breaker status for monitoring
   */
  public getCircuitBreakerStatus(): Record<string, CircuitBreakerState> {
    return Object.fromEntries(this.circuitBreaker.entries())
  }

  /**
   * Get pending analyses for monitoring
   */
  public getPendingAnalyses(): string[] {
    return Array.from(this.analysisQueue.keys())
  }
}

// Singleton instance for application-wide use
export const zoneAnalysisTrigger = new ZoneAnalysisTriggerService()
