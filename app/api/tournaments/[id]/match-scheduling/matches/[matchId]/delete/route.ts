import { NextRequest, NextResponse } from 'next/server'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { revalidatePath } from 'next/cache'
import { revertActiveBracketDisqualificationsForMatches } from '@/lib/services/tournament-disqualifications'
import { updateZonePositionsForTournament } from '@/lib/services/ranking'

interface RouteParams {
  params: {
    id: string
    matchId: string
  }
}

/**
 * DELETE /api/tournaments/[id]/match-scheduling/matches/[matchId]/delete
 * 
 * Elimina un partido del sistema de programación de partidos (match-scheduling)
 * Características específicas para Long Tournaments:
 * - Borra tanto el match de 'matches' como su entrada en 'fecha_matches'
 * - No requiere verificación de fase específica (funciona en cualquier estado)
 * - Optimizado para el flujo de match-scheduling
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id: tournamentId, matchId } = await params
  
  try {
    const supabase = await createClient()
    
    // Verificar autenticación
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Verify user has permissions (CLUB owner or ORGANIZADOR with access to this tournament)
    const permissionResult = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionResult.hasPermission) {
      return NextResponse.json(
        { success: false, error: permissionResult.reason || 'No tienes permisos para eliminar partidos en este torneo' },
        { status: 403 }
      )
    }

    // Verificar que el partido existe - con debugging mejorado
    console.log(`[DELETE match-scheduling] Looking for match ${matchId} in tournament ${tournamentId}`)
    
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('id, tournament_id, zone_id, status, winner_id, result_couple1, result_couple2, couple1_id, couple2_id')
      .eq('id', matchId)
      .eq('tournament_id', tournamentId)
      .single()

    console.log(`[DELETE match-scheduling] Match found:`, { match, matchError })

    if (matchError || !match) {
      console.error(`[DELETE match-scheduling] Match not found: ${matchId}`, matchError)
      return NextResponse.json(
        { success: false, error: 'Partido no encontrado' },
        { status: 404 }
      )
    }

    try {
      const adminSupabase = await createClientServiceRole()
      await revertActiveBracketDisqualificationsForMatches(
        tournamentId,
        [matchId],
        adminSupabase,
        { revertedBy: user.id, reason: 'match_deleted' }
      )
    } catch (disqualificationError) {
      console.error('[DELETE match-scheduling] Error reverting bracket disqualification:', disqualificationError)
      return NextResponse.json(
        { success: false, error: 'No se pudo limpiar la descalificacion asociada al partido' },
        { status: 500 }
      )
    }

    // Eliminar todas las tablas relacionadas en orden (CASCADE manual)
    console.log(`[DELETE match-scheduling] Starting cascade delete for match ${matchId}`)

    // 1. Check and delete sets from set_matches with detailed feedback
    const { data: setsToDelete, error: setsSelectError } = await supabase
      .from('set_matches')
      .select('id')
      .eq('match_id', matchId)
    
    console.log(`[DELETE match-scheduling] Found ${setsToDelete?.length || 0} sets to delete for match ${matchId}`)
    
    const { data: deletedSets, error: setsError } = await supabase
      .from('set_matches')
      .delete()
      .eq('match_id', matchId)
      .select()
    
    if (setsError) {
      console.error('[DELETE match-scheduling] Error deleting set_matches:', setsError)
    } else {
      console.log(`[DELETE match-scheduling] Successfully deleted ${deletedSets?.length || 0} sets`)
    }

    // 2. Check and delete fecha_matches with detailed feedback
    const { data: fechasToDelete, error: fechaSelectError } = await supabase
      .from('fecha_matches')
      .select('id')
      .eq('match_id', matchId)
    
    console.log(`[DELETE match-scheduling] Found ${fechasToDelete?.length || 0} fecha_matches to delete for match ${matchId}`)
    
    const { data: deletedFechas, error: fechaMatchError } = await supabase
      .from('fecha_matches')
      .delete()
      .eq('match_id', matchId)
      .select()

    if (fechaMatchError) {
      console.error('[DELETE match-scheduling] Error deleting fecha_matches:', fechaMatchError)
    } else {
      console.log(`[DELETE match-scheduling] Successfully deleted ${deletedFechas?.length || 0} fecha_matches`)
    }

    // 3. Skip tournament_results (table doesn't exist in this schema)
    console.log('[DELETE match-scheduling] Skipping tournament_results (table not found)')
    
    // 4. Check for any other related tables that might block deletion
    // Could add more table cleanups here if needed

    // Final step: delete the match with better debugging
    console.log(`[DELETE match-scheduling] Final attempt to delete match ${matchId}`)
    
    // Check what's still referencing this match before trying to delete
    const { data: remainingSets } = await supabase
      .from('set_matches')
      .select('id')
      .eq('match_id', matchId)
    
    const { data: remainingFecha } = await supabase
      .from('fecha_matches')
      .select('id')
      .eq('match_id', matchId)
      
    console.log(`[DELETE match-scheduling] Remaining references - Sets: ${remainingSets?.length || 0}, Fecha: ${remainingFecha?.length || 0}`)
    
    const { data: deleteData, error: matchDeleteError } = await supabase
      .from('matches')
      .delete()
      .eq('id', matchId)
      .select()

    console.log(`[DELETE match-scheduling] Final delete result:`, { 
      deletedRows: deleteData?.length || 0,
      error: matchDeleteError?.message,
      errorCode: matchDeleteError?.code
    })

    if (matchDeleteError) {
      console.error('[DELETE match-scheduling] DELETE ERROR details:', matchDeleteError)
      return NextResponse.json(
        { success: false, error: 'Error al eliminar el partido: ' + matchDeleteError.message },
        { status: 500 }
      )
    }

    if (!deleteData || deleteData.length === 0) {
      console.warn(`[DELETE match-scheduling] No rows deleted - still has references`)
      return NextResponse.json(
        { success: false, error: 'Partido no se pudo eliminar - tiene referencias en otras tablas' },
        { status: 404 }
      )
    }

    const hadResult = match.status === 'FINISHED'
      || match.winner_id !== null
      || match.result_couple1 !== null
      || match.result_couple2 !== null

    let positionsRecalculated = false
    let positionRecalculationError: string | undefined

    if (hadResult && match.zone_id) {
      const positionUpdate = await updateZonePositionsForTournament(tournamentId, match.zone_id)
      positionsRecalculated = positionUpdate.success
      positionRecalculationError = positionUpdate.error

      if (!positionUpdate.success) {
        console.error('[DELETE match-scheduling] Failed to recalculate zone positions:', positionUpdate.error)
      }
    }

    // Revalidate paths to clear cache
    revalidatePath(`/tournaments/${tournamentId}/match-scheduling`)
    revalidatePath(`/tournaments/${tournamentId}`)
    revalidatePath(`/tournaments/${tournamentId}/qually`)
    revalidatePath(`/tournaments/${tournamentId}/resultados`)
    
    console.log(`[DELETE match-scheduling] Match ${matchId} successfully deleted with all relations`)

    return NextResponse.json({
      success: true,
      message: positionsRecalculated
        ? 'Partido eliminado y posiciones recalculadas exitosamente'
        : 'Partido eliminado exitosamente',
      positionsRecalculated,
      positionRecalculationError
    })

  } catch (error) {
    console.error('[DELETE match-scheduling] Error inesperado:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
