import { NextRequest, NextResponse } from 'next/server'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { IncrementalPlaceholderUpdater } from '@/lib/services/incremental-placeholder-updater'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { handleMatchEliminationUpdate } from '@/utils/bracket-seeding-algorithm'
import { revertActiveBracketDisqualificationsForMatches } from '@/lib/services/tournament-disqualifications'

// ============================================================================
// HELPER FUNCTIONS (Mejores Prácticas: Separación de Responsabilidades)
// ============================================================================

/**
 * Determina si hay cambio de ganador y si es válido modificar
 * CORREGIDO: Solo considera modificación si el match ya está FINISHED
 */
function analyzeWinnerChange(
  previousWinner: string | null, 
  newWinner: string,
  currentStatus: string
): { winnerChanged: boolean; isModification: boolean } {
  const winnerChanged = previousWinner !== null && previousWinner !== newWinner
  // CORREGIDO: Solo es modificación si ya estaba FINISHED y tenía ganador
  const isModification = currentStatus === 'FINISHED' && previousWinner !== null
  
  return { winnerChanged, isModification }
}

/**
 * Valida si una modificación es permitida
 * CORREGIDO: Lógica simplificada y más clara
 */
function validateModification(
  matchData: any,
  previousWinner: string | null,
  newWinner: string
): { valid: boolean; reason?: string } {
  // Si no hay ganador anterior, siempre es válido (primera asignación)
  if (!previousWinner) {
    return { valid: true }
  }
  
  // Si el match NO está finalizado, es primera asignación de resultado, no modificación
  if (matchData.status !== 'FINISHED') {
    return { valid: true }
  }
  
  // Solo aquí es verdadera modificación: match FINISHED con ganador siendo cambiado
  // Validación: el nuevo ganador debe ser diferente
  if (previousWinner === newWinner) {
    return { 
      valid: false, 
      reason: 'El nuevo ganador debe ser diferente al anterior' 
    }
  }
  
  return { valid: true }
}

/**
 * Remueve un ganador anterior SOLO del match padre específico
 * CORREGIDO: No remueve de todos los matches, solo del relevante
 */
async function removePreviousWinnerFromParentMatch(
  supabase: any,
  previousWinner: string,
  parentMatchId: string | null
): Promise<{ removedFrom: string[]; error?: string }> {
  const removedFrom: string[] = []
  
  // Si no hay match padre, no hay nada que remover
  if (!parentMatchId) {
    return { removedFrom: [] }
  }
  
  try {
    // SOLO remover del match padre específico, no de todos los matches
    
    // Verificar si está en couple1_id del match padre
    const { data: parentMatch, error: parentError } = await supabase
      .from('matches')
      .select('id, couple1_id, couple2_id')
      .eq('id', parentMatchId)
      .single()
    
    if (parentError) throw parentError
    
    if (!parentMatch) {
      return { removedFrom: [], error: 'Parent match not found' }
    }
    
    // Remover solo si está en este match padre específico
    if (parentMatch.couple1_id === previousWinner) {
      const { error: removeError1 } = await supabase
        .from('matches')
        .update({ couple1_id: null })
        .eq('id', parentMatchId)
      
      if (removeError1) throw removeError1
      removedFrom.push(parentMatchId)
    }
    
    if (parentMatch.couple2_id === previousWinner) {
      const { error: removeError2 } = await supabase
        .from('matches')
        .update({ couple2_id: null })
        .eq('id', parentMatchId)
      
      if (removeError2) throw removeError2
      if (!removedFrom.includes(parentMatchId)) {
        removedFrom.push(parentMatchId)
      }
    }
    
    return { removedFrom }
    
  } catch (error) {
    console.error('Error removing previous winner from parent match:', error)
    return { 
      removedFrom: [], 
      error: error instanceof Error ? error.message : 'Error removing previous winner from parent match' 
    }
  }
}

interface MatchResult {
  format: 'single_set' | 'best_of_3'
  sets: Array<{
    couple1_games: number
    couple2_games: number
  }>
  winner_id: string
  match_duration_minutes?: number
  notes?: string
}

interface UpdateResultRequest {
  result: MatchResult
  finishMatch?: boolean  // Si true, marca el match como FINISHED
}

interface PropagationInfo {
  parentMatch: string
  parentSlot: number
  operation: 'initial' | 'modification'
  previousWinner?: string
  newWinner: string
}

interface ModificationSummary {
  winnerChanged: boolean
  previousWinner?: string
  newWinner: string
  cascadeInfo?: {
    removedFrom: string[]
    addedTo: string[]
    affectedMatches: number
  }
}

interface EliminationInfo {
  processed: boolean
  operations: string[]
  error?: string
}

interface UpdateResultResponse {
  success: boolean
  matchId: string
  result: MatchResult
  status: string
  propagated?: PropagationInfo
  modification?: ModificationSummary
  elimination?: EliminationInfo
  error?: string
}

interface DeleteResultResponse {
  success: boolean
  matchId: string
  status: string
  parentCleared?: boolean
  deletedSets?: boolean
  error?: string
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
): Promise<NextResponse<DeleteResultResponse>> {
  const routeParams = await params

  try {
    void request

    const tournamentId = routeParams.id
    const matchId = routeParams.matchId
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        matchId,
        status: '',
        error: 'Unauthorized'
      }, { status: 401 })
    }

    const permissionResult = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionResult.hasPermission) {
      return NextResponse.json({
        success: false,
        matchId,
        status: '',
        error: permissionResult.reason || 'Insufficient permissions'
      }, { status: 403 })
    }

    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .select('id, status, winner_id, tournament_id')
      .eq('id', matchId)
      .eq('tournament_id', tournamentId)
      .single()

    if (matchError || !matchData) {
      return NextResponse.json({
        success: false,
        matchId,
        status: '',
        error: 'Match not found'
      }, { status: 404 })
    }

    let parentCleared = false

    if (matchData.winner_id) {
      const { data: hierarchy, error: hierarchyError } = await supabase
        .from('match_hierarchy')
        .select('parent_match_id, parent_slot')
        .eq('child_match_id', matchId)
        .eq('tournament_id', tournamentId)
        .maybeSingle()

      if (hierarchyError) {
        console.error('Failed to fetch match hierarchy:', hierarchyError)
        return NextResponse.json({
          success: false,
          matchId,
          status: '',
          error: 'Failed to validate parent match'
        }, { status: 500 })
      }

      if (hierarchy?.parent_match_id) {
        const { data: parentMatch, error: parentError } = await supabase
          .from('matches')
          .select('id, status, couple1_id, couple2_id')
          .eq('id', hierarchy.parent_match_id)
          .eq('tournament_id', tournamentId)
          .single()

        if (parentError || !parentMatch) {
          return NextResponse.json({
            success: false,
            matchId,
            status: '',
            error: 'Parent match not found'
          }, { status: 404 })
        }

        const slotField = hierarchy.parent_slot === 1 ? 'couple1_id' : 'couple2_id'
        const winnerIsInParentSlot = parentMatch[slotField] === matchData.winner_id

        if (winnerIsInParentSlot) {
          if (parentMatch.status === 'FINISHED') {
            return NextResponse.json({
              success: false,
              matchId,
              status: matchData.status,
              error: 'Primero borra el resultado del partido siguiente, porque ya usa este ganador.'
            }, { status: 409 })
          }

          const nextParentState = {
            [slotField]: null,
            status: 'WAITING_OPONENT'
          }

          const { error: clearParentError } = await supabase
            .from('matches')
            .update(nextParentState)
            .eq('id', parentMatch.id)
            .eq('tournament_id', tournamentId)

          if (clearParentError) {
            console.error('Failed to clear parent match slot:', clearParentError)
            return NextResponse.json({
              success: false,
              matchId,
              status: '',
              error: 'Failed to clear advanced winner'
            }, { status: 500 })
          }

          parentCleared = true
        }
      }
    }

    const { error: deleteSetsError } = await supabase
      .from('set_matches')
      .delete()
      .eq('match_id', matchId)

    if (deleteSetsError) {
      console.error('Failed to delete set_matches:', deleteSetsError)
      return NextResponse.json({
        success: false,
        matchId,
        status: '',
        error: 'Failed to delete set details'
      }, { status: 500 })
    }

    const { error: resetMatchError } = await supabase
      .from('matches')
      .update({
        status: 'PENDING',
        winner_id: null,
        result_couple1: null,
        result_couple2: null
      })
      .eq('id', matchId)
      .eq('tournament_id', tournamentId)

    if (resetMatchError) {
      console.error('Failed to reset match result:', resetMatchError)
      return NextResponse.json({
        success: false,
        matchId,
        status: '',
        error: 'Failed to reset match result'
      }, { status: 500 })
    }

    try {
      const adminSupabase = await createClientServiceRole()
      await revertActiveBracketDisqualificationsForMatches(
        tournamentId,
        [matchId],
        adminSupabase,
        { revertedBy: user.id, reason: 'match_result_deleted' }
      )
    } catch (disqualificationError) {
      console.error('Failed to revert bracket disqualification after result delete:', disqualificationError)
      return NextResponse.json({
        success: false,
        matchId,
        status: '',
        error: 'Resultado borrado, pero no se pudo limpiar la descalificacion asociada'
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      matchId,
      status: 'PENDING',
      parentCleared,
      deletedSets: true
    })
  } catch (error) {
    console.error('Delete result error:', error)
    return NextResponse.json({
      success: false,
      matchId: routeParams.matchId,
      status: '',
      error: 'Internal server error'
    }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
): Promise<NextResponse<UpdateResultResponse>> {
  const routeParams = await params

  try {
    const tournamentId = routeParams.id
    const matchId = routeParams.matchId
    const body: UpdateResultRequest = await request.json()
    
    const { result, finishMatch = true } = body

    // Validar datos del resultado
    if (!result || !result.sets || result.sets.length === 0) {
      return NextResponse.json({
        success: false,
        matchId,
        result: {} as MatchResult,
        status: '',
        error: 'Invalid result data'
      }, { status: 400 })
    }

    if (!result.winner_id) {
      return NextResponse.json({
        success: false,
        matchId,
        result: {} as MatchResult,
        status: '',
        error: 'Winner ID is required'
      }, { status: 400 })
    }

    // Crear cliente de Supabase
    const supabase = await createClient()
    
    // Verificar autenticación y permisos
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        matchId,
        result: {} as MatchResult,
        status: '',
        error: 'Unauthorized'
      }, { status: 401 })
    }

    // Verificar permisos usando la función centralizada
    const permissionResult = await checkTournamentPermissions(user.id, tournamentId)

    if (!permissionResult.hasPermission) {
      return NextResponse.json({
        success: false,
        matchId,
        result: {} as MatchResult,
        status: '',
        error: permissionResult.reason || 'Insufficient permissions'
      }, { status: 403 })
    }

    // Obtener datos del torneo
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('club_id, status')
      .eq('id', tournamentId)
      .single()

    if (tournamentError || !tournament) {
      return NextResponse.json({
        success: false,
        matchId,
        result: {} as MatchResult,
        status: '',
        error: 'Tournament not found'
      }, { status: 404 })
    }

    // Obtener el match actual con información de jerarquía
    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .select(`
        id, status, court, couple1_id, couple2_id, winner_id, 
        round, order_in_round, result_couple1, result_couple2, zone_id,
        parent_hierarchy:match_hierarchy!match_hierarchy_child_match_id_fkey(
          parent_match_id, parent_slot,
          parent_match:parent_match_id(id, round, order_in_round, couple1_id, couple2_id)
        )
      `)
      .eq('id', matchId)
      .eq('tournament_id', tournamentId)
      .single()

    if (matchError || !matchData) {
      return NextResponse.json({
        success: false,
        matchId,
        result: {} as MatchResult,
        status: '',
        error: 'Match not found'
      }, { status: 404 })
    }

    // Validar que el match puede recibir resultado
    if (matchData.status === 'WAITING_OPONENT') {
      return NextResponse.json({
        success: false,
        matchId,
        result: {} as MatchResult,
        status: matchData.status,
        error: 'Cannot add result to match waiting for opponent'
      }, { status: 400 })
    }

    // Validar que el winner_id es una de las parejas del match
    if (result.winner_id !== matchData.couple1_id && result.winner_id !== matchData.couple2_id) {
      return NextResponse.json({
        success: false,
        matchId,
        result: {} as MatchResult,
        status: matchData.status,
        error: 'Winner must be one of the match participants'
      }, { status: 400 })
    }

    // Generar score textual
    const finalScore = result.sets.map(set => `${set.couple1_games}-${set.couple2_games}`).join(', ')

    // Determinar resultados por pareja (sistema numérico - puntos de games)
    const couple1Result = result.sets[0].couple1_games.toString()
    const couple2Result = result.sets[0].couple2_games.toString()
    
    // Validar que el winner_id coincide con el cálculo automático por puntos
    const calculatedWinner = result.sets[0].couple1_games > result.sets[0].couple2_games 
      ? matchData.couple1_id 
      : matchData.couple2_id
      
    if (result.winner_id !== calculatedWinner) {
      return NextResponse.json({
        success: false,
        matchId,
        result: {} as MatchResult,
        status: '',
        error: `Winner inconsistente: enviado ${result.winner_id}, calculado ${calculatedWinner} (${result.sets[0].couple1_games}-${result.sets[0].couple2_games})`
      }, { status: 400 })
    }

    // Determinar nuevo estado
    const newStatus = finishMatch ? 'FINISHED' : matchData.status
    const previousWinner = matchData.winner_id

    // ========================================================================
    // ANÁLISIS DE MODIFICACIÓN (Mejores Prácticas: Validación Temprana)
    // ========================================================================
    
    const { winnerChanged, isModification } = analyzeWinnerChange(previousWinner, result.winner_id, matchData.status)
    
    // Declarar modificationSummary aquí para evitar errores de scope
    let modificationSummary: ModificationSummary | null = null
    
    // Validar si la modificación es permitida
    if (isModification) {
      const validation = validateModification(matchData, previousWinner, result.winner_id)
      if (!validation.valid) {
        return NextResponse.json({
          success: false,
          matchId,
          result: {} as MatchResult,
          status: matchData.status,
          error: validation.reason || 'Modificación no permitida'
        }, { status: 400 })
      }
      
      console.log(`🔄 [update-result] Modificación detectada:`, {
        matchId,
        previousWinner,
        newWinner: result.winner_id,
        winnerChanged
      })
      
      // 🆕 NUEVO: Manejar modificación con límite de 1 nivel
      if (winnerChanged && previousWinner) {
        console.log(`🔄 [update-result] Ejecutando modificación de ganador: ${previousWinner} → ${result.winner_id}`)
        
        try {
          const { handleWinnerModification } = await import('@/app/api/tournaments/actions')
          
          const modificationResult = await handleWinnerModification(
            supabase,
            tournamentId,
            matchId,
            previousWinner,
            result.winner_id
          )
          
          if (modificationResult.success) {
            console.log(`✅ [update-result] Modificación exitosa: ${modificationResult.message}`)
            
            // Inicializar summary de modificación si no existe
            if (!modificationSummary) {
              modificationSummary = {
                winnerChanged: true,
                previousWinner,
                newWinner: result.winner_id,
                cascadeInfo: {
                  removedFrom: [],
                  addedTo: [],
                  affectedMatches: 0
                }
              }
            }
            
            // Actualizar cascade info
            if (modificationSummary.cascadeInfo) {
              modificationSummary.cascadeInfo.addedTo.push('modification-propagated')
              modificationSummary.cascadeInfo.affectedMatches = Math.max(1, modificationSummary.cascadeInfo.affectedMatches)
            }
          } else {
            console.warn(`⚠️ [update-result] Modificación falló: ${modificationResult.error}`)
          }
        } catch (modificationError) {
          console.error('❌ Error en modificación de ganador:', modificationError)
        }
      }
    }

    // ========================================================================
    // ACTUALIZACIÓN DEL MATCH PRINCIPAL
    // ========================================================================
    
    // 1. Actualizar el match principal (solo columnas que existen)
    const { error: updateMatchError } = await supabase
      .from('matches')
      .update({
        winner_id: result.winner_id,
        status: newStatus,
        result_couple1: couple1Result,
        result_couple2: couple2Result
        // Nota: final_score y result_data no existen en la tabla
      })
      .eq('id', matchId)
      .eq('tournament_id', tournamentId)

    if (updateMatchError) {
      console.error('Failed to update match:', updateMatchError)
      return NextResponse.json({
        success: false,
        matchId,
        result: {} as MatchResult,
        status: '',
        error: 'Failed to update match'
      }, { status: 500 })
    }

    // ========================================================================
    // GESTIÓN DE ELIMINACIONES (NUEVA FUNCIONALIDAD)
    // ========================================================================

    let eliminationInfo: EliminationInfo | null = null

    // Solo procesar eliminaciones si el match está finalizado
    if (newStatus === 'FINISHED') {
      console.log(`🚫 [update-result] Processing elimination status for match ${matchId}`)

      try {
        const eliminationResult = await handleMatchEliminationUpdate(
          tournamentId,
          {
            id: matchData.id,
            round: matchData.round as 'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL',
            couple1_id: matchData.couple1_id,
            couple2_id: matchData.couple2_id,
            status: matchData.status
          },
          result.winner_id,
          previousWinner,
          isModification && winnerChanged,
          supabase
        )

        eliminationInfo = {
          processed: eliminationResult.success,
          operations: eliminationResult.operations || [],
          error: eliminationResult.error
        }

        if (eliminationResult.success) {
          console.log(`✅ [update-result] Elimination status updated successfully:`, eliminationResult.operations)
        } else {
          console.warn(`⚠️ [update-result] Elimination status update failed: ${eliminationResult.error}`)
          // No fallar el update del match por problemas de eliminación, solo logear el warning
        }

      } catch (eliminationError: any) {
        console.error('❌ [update-result] Elimination processing error:', eliminationError)
        eliminationInfo = {
          processed: false,
          operations: [],
          error: eliminationError.message || 'Unknown elimination error'
        }
        // No fallar el update del match por problemas de eliminación
      }
    } else {
      console.log(`⏸️ [update-result] Match not finished (${newStatus}), skipping elimination processing`)
      eliminationInfo = {
        processed: false,
        operations: ['skipped-not-finished']
      }
    }

    // ========================================================================
    // OBTENER INFO DEL MATCH PADRE (ANTES DE LA MODIFICACIÓN)
    // ========================================================================
    
    let parentMatchId: string | null = null
    
    // Si el match está finalizado, buscar la relación padre
    if (newStatus === 'FINISHED') {
      const { data: parentRelation, error: hierarchyError } = await supabase
        .from('match_hierarchy')
        .select('parent_match_id')
        .eq('child_match_id', matchId)
        .eq('tournament_id', tournamentId)
        .single()

      if (!hierarchyError && parentRelation) {
        parentMatchId = parentRelation.parent_match_id
      }
    }

    // ========================================================================
    // MANEJO DE MODIFICACIONES: REMOVER GANADOR ANTERIOR
    // ========================================================================
    
    if (winnerChanged && previousWinner) {
      console.log(`🔄 [update-result] Removiendo ganador anterior SOLO del match padre...`)
      
      const { removedFrom, error: removeError } = await removePreviousWinnerFromParentMatch(
        supabase, 
        previousWinner, 
        parentMatchId
      )
      
      if (removeError) {
        console.error('❌ Error removiendo ganador anterior:', removeError)
        return NextResponse.json({
          success: false,
          matchId,
          result: {} as MatchResult,
          status: '',
          error: `Error en modificación: ${removeError}`
        }, { status: 500 })
      }
      
      modificationSummary = {
        winnerChanged: true,
        previousWinner,
        newWinner: result.winner_id,
        cascadeInfo: {
          removedFrom,
          addedTo: [], // Se llenará abajo
          affectedMatches: removedFrom.length
        }
      }
      
      console.log(`✅ Ganador anterior removido SOLO del match padre:`, removedFrom)
    }

    // ========================================================================
    // PROPAGACIÓN AUTOMÁTICA USANDO SISTEMA LEGACY (FUNCIONAL)
    // ========================================================================
    
    let propagationInfo: PropagationInfo | null = null
    
    // Solo ejecutar avance automático si NO es una modificación con cambio de ganador
    // (las modificaciones se manejan arriba en la sección de modificaciones)
    const shouldAutoAdvance = newStatus === 'FINISHED' && (!isModification || !winnerChanged)
    
    if (shouldAutoAdvance) {
      // 🆕 NUEVO: Usar sistema de avance basado en match_hierarchy
      console.log(`🚀 [update-result] Utilizando avance automático con jerarquía para match ${matchId}`)
      
      try {
        // Importar la nueva función de avance
        const { advanceWinnerUsingHierarchy } = await import('@/app/api/tournaments/actions')
        
        // Ejecutar avance usando jerarquía
        const advanceResult = await advanceWinnerUsingHierarchy(
          supabase,
          tournamentId,
          matchId,
          result.winner_id,
          'normal_win'
        )
        
        if (advanceResult.success) {
          propagationInfo = {
            parentMatch: 'hierarchy-based',
            parentSlot: 0,
            operation: isModification ? 'modification' : 'initial',
            previousWinner: isModification ? previousWinner || undefined : undefined,
            newWinner: result.winner_id
          }
          
          // Actualizar el summary de modificación
          if (modificationSummary?.cascadeInfo) {
            modificationSummary.cascadeInfo.addedTo.push('hierarchy-advanced')
            modificationSummary.cascadeInfo.affectedMatches = Math.max(1, modificationSummary.cascadeInfo.affectedMatches)
          }
          
          console.log(`✅ Avance con jerarquía exitoso: ${advanceResult.message}`)
        } else {
          console.warn(`⚠️ Avance con jerarquía falló: ${advanceResult.error}`)
        }
        
      } catch (hierarchyAdvanceError) {
        console.error('❌ Error en avance con jerarquía:', hierarchyAdvanceError)
        // No fallar la actualización del match por esto
      }
    }

    // ========================================================================
    // INCREMENTAL PLACEHOLDER RESOLUTION WITH BACKTRACKING (V3)
    // ========================================================================
    
    let placeholderResolutionResult = null
    
    // Only resolve placeholders if this is a zone match that was completed AND tournament is in BRACKET_PHASE
    if (newStatus === 'FINISHED' && matchData.zone_id) {
      console.log(`🎯 [update-result] Match completed. Tournament status: ${tournament.status}`)
      
      // VALIDACIÓN: Solo resolver placeholders si ya estamos en BRACKET_PHASE
      if (tournament.status === 'BRACKET_PHASE') {
        console.log(`🔄 [update-result] Tournament in BRACKET_PHASE, analyzing zone with backtracking: ${matchData.zone_id}`)
        
        try {
          // Usar nuevo servicio con CorrectedDefinitiveAnalyzer (backtracking real)
          const incrementalUpdater = new IncrementalPlaceholderUpdater()
          const updateResult = await incrementalUpdater.analyzeZoneAndResolveDefinitives(
            tournamentId, 
            matchData.zone_id
          )
          
          placeholderResolutionResult = {
            zoneId: matchData.zone_id,
            resolutionExecuted: true,
            triggerSource: 'INCREMENTAL_V3_BACKTRACKING',
            tournamentPhase: tournament.status,
            isModification: isModification && winnerChanged,
            backtrackingEnabled: true,
            resolved: updateResult.resolved,
            definitive: updateResult.definitive
          }
          
          if (updateResult.resolved > 0) {
            console.log(`✅ [update-result] Incremental placeholder resolution completed - ${updateResult.resolved} placeholders resolved, bracket updated incrementally`)
          } else {
            console.log(`📝 [update-result] Zone analysis completed - ${updateResult.definitive} definitive positions found, but no placeholders needed resolution`)
          }
          
        } catch (placeholderError: any) {
          console.error('❌ [update-result] Placeholder resolution error:', placeholderError)
          
          // Don't fail the match update - placeholder resolution is auxiliary
          placeholderResolutionResult = {
            zoneId: matchData.zone_id,
            resolutionExecuted: false,
            error: 'Placeholder resolution failed: ' + placeholderError.message,
            triggerSource: 'INCREMENTAL_V3_BACKTRACKING',
            tournamentPhase: tournament.status,
            backtrackingEnabled: true
          }
        }
      } else {
        console.log(`⏸️ [update-result] Tournament in ${tournament.status}, skipping placeholder resolution`)
        
        placeholderResolutionResult = {
          zoneId: matchData.zone_id,
          resolutionExecuted: false,
          reason: `Tournament in ${tournament.status} phase, placeholder resolution only runs in BRACKET_PHASE`,
          triggerSource: 'INCREMENTAL_V3_BACKTRACKING',
          tournamentPhase: tournament.status,
          backtrackingEnabled: false
        }
      }
    }

    // El cierre del torneo es una acción manual independiente del resultado.
    const tournamentFinalized = false

    return NextResponse.json({
      success: true,
      matchId,
      result: {
        ...result,
        final_score: finalScore
      },
      status: newStatus,
      tournamentFinalized, // ← NUEVO: indica si se finalizó el torneo
      propagated: propagationInfo || undefined,
      modification: modificationSummary || undefined,
      elimination: eliminationInfo || undefined, // ← NUEVO: información de eliminaciones
      placeholderResolution: placeholderResolutionResult || undefined
    })

  } catch (error) {
    console.error('Update result error:', error)
    return NextResponse.json({
      success: false,
      matchId: routeParams.matchId,
      result: {} as MatchResult,
      status: '',
      error: 'Internal server error'
    }, { status: 500 })
  }
}
