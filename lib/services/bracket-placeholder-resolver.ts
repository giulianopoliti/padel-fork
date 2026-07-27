/**
 * BRACKET PLACEHOLDER RESOLVER SERVICE
 * 
 * Servicio TypeScript unificado que reemplaza la arquitectura RPC + PlaceholderService + IncrementalBracketUpdater
 * 
 * RESPONSABILIDADES:
 * 1. Resolver placeholders cuando las posiciones de zona se vuelven definitivas
 * 2. Actualizar matches del bracket directamente
 * 3. Detectar BYEs inteligentemente
 * 4. Avanzar ganadores BYE una ronda únicamente
 * 
 * ARQUITECTURA: Todo en TypeScript, sin dependencias de RPC
 */

import { createClientServiceRole } from '@/utils/supabase/server'
import { QualificationSourceService } from '@/lib/services/qualification-source.service'
import { TournamentFormatRulesService } from '@/lib/services/tournament-format-rules.service'

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface DefinitivePosition {
  zoneId: string | null
  position: number
  coupleId: string
  isDefinitive: boolean
}

export interface ResolvedSeed {
  seedId: string
  seedNumber: number
  placeholderLabel: string
  coupleId: string
  zoneId: string | null
  position: number
}

export interface UpdatedMatch {
  matchId: string
  couple1Id: string | null
  couple2Id: string | null
  seed1Id: string | null
  seed2Id: string | null
  wasUpdated: boolean
}

export interface ByeMatch {
  matchId: string
  winnerId: string
  round: string
  orderInRound: number
  isTrueBye: boolean
}

export interface AdvancedMatch {
  parentMatchId: string
  winnerId: string
  slot: number
  newStatus: string
}

export interface BracketUpdateResult {
  success: boolean
  definitivePositions: number
  resolvedSeeds: number
  updatedMatches: number
  detectedByes: number
  advancedMatches: number
  executionTime: number
  errors?: string[]
}

// ============================================================================
// AUXILIARY FUNCTIONS
// ============================================================================

/**
 * FUNCIÓN 1: Buscar posiciones definitivas de la zona actualizada
 */
export async function getNewDefinitivePositions(
  tournamentId: string, 
  zoneId: string
): Promise<DefinitivePosition[]> {
  console.log(`🔍 [BRACKET-RESOLVER] Getting definitive positions for zone ${zoneId}`)
  
  const supabase = await createClientServiceRole()
  
  const { data: positions, error } = await supabase
    .from('zone_positions')
    .select('zone_id, position, couple_id, is_definitive')
    .eq('tournament_id', tournamentId)
    .eq('zone_id', zoneId)
    .eq('is_definitive', true)
  
  if (error) {
    console.error(`❌ [BRACKET-RESOLVER] Error fetching definitive positions:`, error)
    throw new Error(`Failed to fetch definitive positions: ${error.message}`)
  }
  
  const definitivePositions: DefinitivePosition[] = (positions || []).map(p => ({
    zoneId: p.zone_id,
    position: p.position,
    coupleId: p.couple_id,
    isDefinitive: p.is_definitive
  }))
  
  console.log(`✅ [BRACKET-RESOLVER] Found ${definitivePositions.length} definitive positions`)
  definitivePositions.forEach(p => {
    console.log(`   - Position ${p.position}: couple ${p.coupleId}`)
  })
  
  return definitivePositions
}

type PlaceholderResolutionScope = 'ZONE_POSITIONS' | 'GLOBAL_STANDINGS' | 'HYBRID_FIRSTS_GLOBAL_REST_ZONES'

async function getPlaceholderResolutionScope(tournamentId: string): Promise<PlaceholderResolutionScope> {
  const supabase = await createClientServiceRole()

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('type, format_type, format_config')
    .eq('id', tournamentId)
    .single()

  if (error || !tournament) {
    console.error(`[BRACKET-RESOLVER] Error loading tournament format: ${error?.message || 'Tournament not found'}`)
    return 'ZONE_POSITIONS'
  }

  const rules = TournamentFormatRulesService.resolve({ tournament })
  return rules.qualificationSource
}

export async function getGlobalDefinitivePositions(
  tournamentId: string
): Promise<DefinitivePosition[]> {
  console.log(`[BRACKET-RESOLVER] Getting definitive global standings positions`)

  const entries = await QualificationSourceService.getQualifiedEntries(tournamentId)
  const definitivePositions = entries
    .filter((entry) => entry.isDefinitive && entry.coupleId && entry.globalPosition)
    .map((entry) => ({
      zoneId: null,
      position: entry.globalPosition!,
      coupleId: entry.coupleId!,
      isDefinitive: true,
    }))

  console.log(`[BRACKET-RESOLVER] Found ${definitivePositions.length} definitive global positions`)
  definitivePositions.forEach((position) => {
    console.log(`   - Global #${position.position}: couple ${position.coupleId}`)
  })

  return definitivePositions
}

export async function getHybridDefinitivePositions(
  tournamentId: string,
  zoneId: string
): Promise<DefinitivePosition[]> {
  console.log(`[BRACKET-RESOLVER] Getting hybrid definitive positions`)

  const [entries, zonePositions] = await Promise.all([
    QualificationSourceService.getQualifiedEntries(tournamentId),
    getNewDefinitivePositions(tournamentId, zoneId),
  ])

  const definitiveFirsts = entries
    .filter((entry) => (
      entry.isDefinitive &&
      entry.coupleId &&
      entry.zoneId === null &&
      entry.localPosition === 1 &&
      entry.globalPosition
    ))
    .map((entry) => ({
      zoneId: null,
      position: entry.globalPosition!,
      coupleId: entry.coupleId!,
      isDefinitive: true,
    }))

  const definitiveZoneRest = zonePositions.filter((position) => position.position > 1)

  console.log(
    `[BRACKET-RESOLVER] Hybrid definitive positions: ${definitiveFirsts.length} first slots, ${definitiveZoneRest.length} zone slots`
  )

  return [...definitiveFirsts, ...definitiveZoneRest]
}

/**
 * FUNCIÓN 2: Resolver seeds de placeholders
 */
export async function resolvePlaceholderSeeds(
  tournamentId: string, 
  positions: DefinitivePosition[]
): Promise<ResolvedSeed[]> {
  console.log(`🔧 [BRACKET-RESOLVER] Resolving placeholder seeds for ${positions.length} positions`)
  
  if (positions.length === 0) {
    console.log(`📭 [BRACKET-RESOLVER] No definitive positions to resolve`)
    return []
  }
  
  const supabase = await createClientServiceRole()
  const resolvedSeeds: ResolvedSeed[] = []
  
  for (const position of positions) {
    console.log(`🔄 [BRACKET-RESOLVER] Processing zone ${position.zoneId}, position ${position.position}`)
    
    // Buscar seeds que necesitan esta posición
    let seedQuery = supabase
      .from('tournament_couple_seeds')
      .select('id, seed, placeholder_label, placeholder_zone_id, placeholder_position, is_placeholder, couple_id')
      .eq('tournament_id', tournamentId)
      .eq('placeholder_position', position.position)
      .eq('is_placeholder', true)

    seedQuery = position.zoneId
      ? seedQuery.eq('placeholder_zone_id', position.zoneId)
      : seedQuery.is('placeholder_zone_id', null)

    const { data: seeds, error: seedsError } = await seedQuery
    
    if (seedsError) {
      console.error(`❌ [BRACKET-RESOLVER] Error fetching seeds for position ${position.position}:`, seedsError)
      continue
    }
    
    if (!seeds || seeds.length === 0) {
      console.log(`📭 [BRACKET-RESOLVER] No placeholder seeds found for zone ${position.zoneId}, position ${position.position}`)
      continue
    }
    
    // Resolver cada seed encontrado
    for (const seed of seeds) {
      console.log(`🔧 [BRACKET-RESOLVER] Resolving seed ${seed.seed} (${seed.placeholder_label})`)
      
      // Actualizar el seed
      const { error: updateError } = await supabase
        .from('tournament_couple_seeds')
        .update({
          couple_id: position.coupleId,
          is_placeholder: false,
          placeholder_zone_id: null,
          placeholder_position: null,
          placeholder_label: null,
          resolved_at: new Date().toISOString()
        })
        .eq('id', seed.id)
      
      if (updateError) {
        console.error(`❌ [BRACKET-RESOLVER] Error updating seed ${seed.id}:`, updateError)
        continue
      }
      
      resolvedSeeds.push({
        seedId: seed.id,
        seedNumber: seed.seed,
        placeholderLabel: seed.placeholder_label,
        coupleId: position.coupleId,
        zoneId: position.zoneId,
        position: position.position
      })
      
      console.log(`✅ [BRACKET-RESOLVER] Resolved seed ${seed.seed}: ${seed.placeholder_label} → couple ${position.coupleId}`)
    }
  }
  
  console.log(`✅ [BRACKET-RESOLVER] Completed seed resolution: ${resolvedSeeds.length} seeds resolved`)
  return resolvedSeeds
}

/**
 * FUNCIÓN 3: Actualizar matches del bracket
 */
export async function updateBracketMatches(
  tournamentId: string, 
  resolvedSeeds: ResolvedSeed[]
): Promise<UpdatedMatch[]> {
  console.log(`🎯 [BRACKET-RESOLVER] Updating bracket matches for ${resolvedSeeds.length} resolved seeds`)
  
  if (resolvedSeeds.length === 0) {
    console.log(`📭 [BRACKET-RESOLVER] No resolved seeds to update matches`)
    return []
  }
  
  const supabase = await createClientServiceRole()
  const updatedMatches: UpdatedMatch[] = []
  
  for (const seed of resolvedSeeds) {
    console.log(`🔄 [BRACKET-RESOLVER] Updating matches for seed ${seed.seedNumber} (${seed.placeholderLabel})`)
    
    // Buscar matches que usan este seed
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('id, couple1_id, couple2_id, tournament_couple_seed1_id, tournament_couple_seed2_id, round, order_in_round, status')
      .eq('tournament_id', tournamentId)
      .eq('type', 'ELIMINATION')
      .or(`tournament_couple_seed1_id.eq.${seed.seedId},tournament_couple_seed2_id.eq.${seed.seedId}`)
    
    if (matchesError) {
      console.error(`❌ [BRACKET-RESOLVER] Error fetching matches for seed ${seed.seedId}:`, matchesError)
      continue
    }
    
    if (!matches || matches.length === 0) {
      console.log(`📭 [BRACKET-RESOLVER] No matches found for seed ${seed.seedId}`)
      continue
    }
    
    // Actualizar cada match SOLO si es apropiado (no debe tener ya una pareja del mismo seed)
    for (const match of matches) {
      const isSeed1 = match.tournament_couple_seed1_id === seed.seedId
      const isSeed2 = match.tournament_couple_seed2_id === seed.seedId
      
      // Verificar si el match ya tiene la pareja asignada
      const alreadyHasCouple1 = match.couple1_id !== null
      const alreadyHasCouple2 = match.couple2_id !== null
      
      // Solo actualizar si el slot está vacío
      const shouldUpdateSlot1 = isSeed1 && !alreadyHasCouple1
      const shouldUpdateSlot2 = isSeed2 && !alreadyHasCouple2
      
      if (!shouldUpdateSlot1 && !shouldUpdateSlot2) {
        console.log(`⏭️ [BRACKET-RESOLVER] Match ${match.round} ${match.order_in_round}: Already has couples assigned, skipping`)
        continue
      }
      
      const updateData: any = {}
      
      if (shouldUpdateSlot1) {
        updateData.couple1_id = seed.coupleId
        updateData.placeholder_couple1_label = null
      }
      
      if (shouldUpdateSlot2) {
        updateData.couple2_id = seed.coupleId
        updateData.placeholder_couple2_label = null
      }
      
      // Determinar el nuevo status del match
      const newCouple1Id = shouldUpdateSlot1 ? seed.coupleId : match.couple1_id
      const newCouple2Id = shouldUpdateSlot2 ? seed.coupleId : match.couple2_id
      const bothCouplesPresent = newCouple1Id && newCouple2Id

      // Si ambas parejas están presentes, cambiar status a PENDING
      if (bothCouplesPresent) {
        updateData.status = match.status === 'DRAFT' ? 'DRAFT' : 'PENDING'
        updateData.winner_id = null
      }
      // 🆕 NUEVO: Si es BYE (solo una pareja), marcar winner_id para poder desprocesar después
      else {
        const hasOnlyCouple1 = newCouple1Id && !newCouple2Id
        const hasOnlyCouple2 = newCouple2Id && !newCouple1Id

        if (hasOnlyCouple1 || hasOnlyCouple2) {
          const winner = newCouple1Id || newCouple2Id
          updateData.winner_id = winner
          console.log(`🏆 [BRACKET-RESOLVER] BYE detected: setting winner_id = ${winner}`)
        }
      }
      
      // Actualizar match
      const { error: updateError } = await supabase
        .from('matches')
        .update(updateData)
        .eq('id', match.id)
      
      if (updateError) {
        console.error(`❌ [BRACKET-RESOLVER] Error updating match ${match.id}:`, updateError)
        continue
      }
      
      const updatedMatch: UpdatedMatch = {
        matchId: match.id,
        couple1Id: shouldUpdateSlot1 ? seed.coupleId : match.couple1_id,
        couple2Id: shouldUpdateSlot2 ? seed.coupleId : match.couple2_id,
        seed1Id: match.tournament_couple_seed1_id,
        seed2Id: match.tournament_couple_seed2_id,
        wasUpdated: true
      }
      
      updatedMatches.push(updatedMatch)
      
      const slotUpdated = shouldUpdateSlot1 ? 'couple1' : 'couple2'
      const statusInfo = bothCouplesPresent ? ' (status → PENDING)' : ''
      console.log(`✅ [BRACKET-RESOLVER] Updated match ${match.round} ${match.order_in_round}: ${slotUpdated} = ${seed.coupleId}${statusInfo}`)
    }
  }
  
  console.log(`✅ [BRACKET-RESOLVER] Completed match updates: ${updatedMatches.length} matches updated`)
  return updatedMatches
}

/**
 * FUNCIÓN 4: Detectar BYEs inteligentemente
 */
export async function detectTrueByes(
  tournamentId: string, 
  updatedMatches: UpdatedMatch[]
): Promise<ByeMatch[]> {
  console.log(`🔍 [BRACKET-RESOLVER] Detecting true BYE matches from ${updatedMatches.length} updated matches`)
  
  if (updatedMatches.length === 0) {
    console.log(`📭 [BRACKET-RESOLVER] No updated matches to check for BYEs`)
    return []
  }
  
  const supabase = await createClientServiceRole()
  const byeMatches: ByeMatch[] = []
  
  for (const updatedMatch of updatedMatches) {
    console.log(`🔄 [BRACKET-RESOLVER] Checking match ${updatedMatch.matchId} for BYE condition`)
    
    // Obtener estado actual del match
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('id, couple1_id, couple2_id, tournament_couple_seed1_id, tournament_couple_seed2_id, round, order_in_round, status')
      .eq('id', updatedMatch.matchId)
      .single()
    
    if (matchError || !match) {
      console.error(`❌ [BRACKET-RESOLVER] Error fetching match ${updatedMatch.matchId}:`, matchError)
      continue
    }
    
    // Verificar si es BYE (solo una pareja)
    const hasCouple1 = match.couple1_id !== null
    const hasCouple2 = match.couple2_id !== null
    const hasOnlyOneCouple = (hasCouple1 && !hasCouple2) || (!hasCouple1 && hasCouple2)
    
    if (!hasOnlyOneCouple) {
      console.log(`⏭️ [BRACKET-RESOLVER] Match ${match.round} ${match.order_in_round}: Not a BYE (has ${hasCouple1 ? '1' : '0'} + ${hasCouple2 ? '1' : '0'} couples)`)
      continue
    }
    
    // DETECCIÓN INTELIGENTE: Solo es BYE si el slot vacío NO tiene seed esperando
    const emptySeedId = hasCouple1 ? match.tournament_couple_seed2_id : match.tournament_couple_seed1_id
    const isTrueBye = emptySeedId === null // No hay seed esperando = BYE verdadero
    
    if (!isTrueBye) {
      console.log(`⏳ [BRACKET-RESOLVER] Match ${match.round} ${match.order_in_round}: Waiting for opponent (has seed ${emptySeedId} pending)`)
      continue
    }
    
    // Es un BYE verdadero
    const winnerId = hasCouple1 ? match.couple1_id : match.couple2_id
    
    // Marcar match como BYE
    const { error: byeError } = await supabase
      .from('matches')
      .update({
        status: 'FINISHED',
        winner_id: winnerId
      })
      .eq('id', match.id)
    
    if (byeError) {
      console.error(`❌ [BRACKET-RESOLVER] Error marking match ${match.id} as BYE:`, byeError)
      continue
    }
    
    byeMatches.push({
      matchId: match.id,
      winnerId: winnerId!,
      round: match.round,
      orderInRound: match.order_in_round,
      isTrueBye: true
    })
    
    console.log(`✅ [BRACKET-RESOLVER] Detected true BYE: ${match.round} ${match.order_in_round}, winner: ${winnerId}`)
  }
  
  console.log(`✅ [BRACKET-RESOLVER] Completed BYE detection: ${byeMatches.length} true BYEs found`)
  return byeMatches
}

/**
 * FUNCIÓN 5: Marcar BYEs como finalizados (NO avanzar - ya están conectados por jerarquía)
 */
export async function markByeMatchesAsFinished(
  tournamentId: string, 
  byeMatches: ByeMatch[]
): Promise<AdvancedMatch[]> {
  console.log(`✅ [BRACKET-RESOLVER] Marking ${byeMatches.length} BYE matches as FINISHED (no advancement needed - already connected)`)
  
  if (byeMatches.length === 0) {
    console.log(`📭 [BRACKET-RESOLVER] No BYE matches to mark as finished`)
    return []
  }
  
  const supabase = await createClientServiceRole()
  const processedMatches: AdvancedMatch[] = []
  
  for (const bye of byeMatches) {
    console.log(`🔄 [BRACKET-RESOLVER] Marking BYE match ${bye.matchId} as FINISHED with winner ${bye.winnerId}`)
    
    // Solo marcar el match como FINISHED - NO mover ganadores
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        status: 'FINISHED',
        winner_id: bye.winnerId
      })
      .eq('id', bye.matchId)
    
    if (updateError) {
      console.error(`❌ [BRACKET-RESOLVER] Error marking match ${bye.matchId} as FINISHED:`, updateError)
      continue
    }
    
    processedMatches.push({
      parentMatchId: bye.matchId, // El match procesado
      winnerId: bye.winnerId,
      slot: 0, // No aplicable
      newStatus: 'FINISHED'
    })
    
    console.log(`✅ [BRACKET-RESOLVER] Marked BYE match ${bye.round} ${bye.orderInRound} as FINISHED (winner: ${bye.winnerId})`)
  }
  
  console.log(`✅ [BRACKET-RESOLVER] Completed BYE marking: ${processedMatches.length} matches marked as FINISHED`)
  return processedMatches
}

// ============================================================================
// UNIFIED BRACKET PLACEHOLDER RESOLVER SERVICE
// ============================================================================

/**
 * SERVICIO UNIFICADO: Reemplaza RPC + PlaceholderService + IncrementalBracketUpdater
 */
export class BracketPlaceholderResolver {
  
  /**
   * FUNCIÓN PRINCIPAL: Resolver placeholders cuando una zona se actualiza
   */
  async resolveZonePlaceholders(
    tournamentId: string, 
    zoneId: string
  ): Promise<BracketUpdateResult> {
    const startTime = Date.now()
    console.log(`🚀 [BRACKET-RESOLVER] Starting unified placeholder resolution for zone ${zoneId} in tournament ${tournamentId}`)
    
    const errors: string[] = []
    
    try {
      // PASO 1: Buscar posiciones definitivas de la zona actualizada
      console.log(`📍 [BRACKET-RESOLVER] STEP 1/5: Getting definitive positions`)
      const resolutionScope = await getPlaceholderResolutionScope(tournamentId)
      const definitivePositions = resolutionScope === 'GLOBAL_STANDINGS'
        ? await getGlobalDefinitivePositions(tournamentId)
        : resolutionScope === 'HYBRID_FIRSTS_GLOBAL_REST_ZONES'
          ? await getHybridDefinitivePositions(tournamentId, zoneId)
          : await getNewDefinitivePositions(tournamentId, zoneId)
      
      if (definitivePositions.length === 0) {
        console.log(`📭 [BRACKET-RESOLVER] No definitive positions found - nothing to resolve`)
        return {
          success: true,
          definitivePositions: 0,
          resolvedSeeds: 0,
          updatedMatches: 0,
          detectedByes: 0,
          advancedMatches: 0,
          executionTime: Date.now() - startTime,
          errors: []
        }
      }
      
      // PASO 2: Resolver seeds de placeholders
      console.log(`📍 [BRACKET-RESOLVER] STEP 2/5: Resolving placeholder seeds`)
      const resolvedSeeds = await resolvePlaceholderSeeds(tournamentId, definitivePositions)
      
      if (resolvedSeeds.length === 0) {
        console.log(`📭 [BRACKET-RESOLVER] No placeholder seeds found to resolve`)
        console.log(`⏭️ [BRACKET-RESOLVER] SKIPPING BYE processing - no new placeholders resolved`)
        return {
          success: true,
          definitivePositions: definitivePositions.length,
          resolvedSeeds: 0,
          updatedMatches: 0,
          detectedByes: 0,
          advancedMatches: 0,
          executionTime: Date.now() - startTime,
          errors: []
        }
      }
      
      // PASO 3: Actualizar matches del bracket
      console.log(`📍 [BRACKET-RESOLVER] STEP 3/3: Updating bracket matches`)
      const updatedMatches = await updateBracketMatches(tournamentId, resolvedSeeds)
      
      // ⚠️ IMPORTANTE: NO procesar BYEs aquí - ya se procesaron en la generación inicial del bracket
      console.log(`⏭️ [BRACKET-RESOLVER] SKIPPING BYE processing - BYEs are handled during initial bracket generation only`)
      
      const executionTime = Date.now() - startTime
      
      // RESULTADO FINAL
      const result: BracketUpdateResult = {
        success: true,
        definitivePositions: definitivePositions.length,
        resolvedSeeds: resolvedSeeds.length,
        updatedMatches: updatedMatches.length,
        detectedByes: 0, // BYEs no se procesan aquí - solo en generación inicial
        advancedMatches: 0, // BYEs no se procesan aquí - solo en generación inicial
        executionTime,
        errors: errors.length > 0 ? errors : undefined
      }
      
      console.log(`✅ [BRACKET-RESOLVER] Unified resolution completed successfully:`, {
        definitivePositions: result.definitivePositions,
        resolvedSeeds: result.resolvedSeeds,
        updatedMatches: result.updatedMatches,
        executionTime: `${result.executionTime}ms`
      })
      
      return result
      
    } catch (error: any) {
      const executionTime = Date.now() - startTime
      console.error(`❌ [BRACKET-RESOLVER] Unified resolution failed:`, error)
      
      return {
        success: false,
        definitivePositions: 0,
        resolvedSeeds: 0,
        updatedMatches: 0,
        detectedByes: 0,
        advancedMatches: 0,
        executionTime,
        errors: [error.message || 'Unknown error']
      }
    }
  }
  
  /**
   * MÉTODO DE CONVENIENCIA: Resolver placeholders para todo el torneo
   */
  async resolveAllTournamentPlaceholders(tournamentId: string): Promise<BracketUpdateResult> {
    console.log(`🌍 [BRACKET-RESOLVER] Starting full tournament placeholder resolution for ${tournamentId}`)
    
    const supabase = await createClientServiceRole()
    
    // Obtener todas las zonas del torneo
    const { data: zones, error: zonesError } = await supabase
      .from('zones')
      .select('id, name')
      .eq('tournament_id', tournamentId)
    
    if (zonesError || !zones) {
      console.error(`❌ [BRACKET-RESOLVER] Error fetching zones:`, zonesError)
      throw new Error(`Failed to fetch zones: ${zonesError?.message}`)
    }
    
    console.log(`🔍 [BRACKET-RESOLVER] Found ${zones.length} zones to process`)
    
    let totalResult: BracketUpdateResult = {
      success: true,
      definitivePositions: 0,
      resolvedSeeds: 0,
      updatedMatches: 0,
      detectedByes: 0,
      advancedMatches: 0,
      executionTime: 0,
      errors: []
    }
    
    // Procesar cada zona secuencialmente
    for (const zone of zones) {
      console.log(`🔄 [BRACKET-RESOLVER] Processing zone: ${zone.name} (${zone.id})`)
      
      try {
        const zoneResult = await this.resolveZonePlaceholders(tournamentId, zone.id)
        
        // Acumular resultados
        totalResult.definitivePositions += zoneResult.definitivePositions
        totalResult.resolvedSeeds += zoneResult.resolvedSeeds
        totalResult.updatedMatches += zoneResult.updatedMatches
        totalResult.detectedByes += zoneResult.detectedByes
        totalResult.advancedMatches += zoneResult.advancedMatches
        totalResult.executionTime += zoneResult.executionTime
        
        if (zoneResult.errors) {
          totalResult.errors = [...(totalResult.errors || []), ...zoneResult.errors]
        }
        
        if (!zoneResult.success) {
          totalResult.success = false
        }
        
      } catch (error: any) {
        console.error(`❌ [BRACKET-RESOLVER] Error processing zone ${zone.name}:`, error)
        totalResult.success = false
        totalResult.errors = [...(totalResult.errors || []), `Zone ${zone.name}: ${error.message}`]
      }
    }
    
    console.log(`✅ [BRACKET-RESOLVER] Full tournament resolution completed:`, {
      zones: zones.length,
      definitivePositions: totalResult.definitivePositions,
      resolvedSeeds: totalResult.resolvedSeeds,
      updatedMatches: totalResult.updatedMatches,
      totalTime: `${totalResult.executionTime}ms`
    })
    
    return totalResult
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let _bracketPlaceholderResolver: BracketPlaceholderResolver | null = null

export function getBracketPlaceholderResolver(): BracketPlaceholderResolver {
  if (!_bracketPlaceholderResolver) {
    _bracketPlaceholderResolver = new BracketPlaceholderResolver()
  }
  return _bracketPlaceholderResolver
}
