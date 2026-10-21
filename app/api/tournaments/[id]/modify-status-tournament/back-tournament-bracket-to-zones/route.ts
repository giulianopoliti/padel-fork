import { isAmericanLibreTournament } from '@/lib/services/americano-libre-format'
import { resetFreeTournament } from '@/lib/services/americano-libre-reset'
import { FreeBracketPersistenceError } from '@/lib/services/americano-libre-persistence'
import { withTournamentSortValues } from '@/lib/tournaments/tournament-sort-values'
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { revalidatePath } from 'next/cache'
import { deleteCoupleSeeds, deleteMatchesHierarchy, deleteBracketMatchesFromTournament} from '../actions'

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id: tournamentId } = await params
    const supabase = await createClient()
    
    // Verificar permisos del usuario
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    const permissionResult = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionResult.hasPermission) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient permissions'
      }, { status: 403 })
    }
    
    // Verificar que el torneo existe y está en fase de bracket
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('id, status, type, format_config')
      .eq('id', tournamentId)
      .single()
    
    if (tErr || !tournament) {
      return NextResponse.json({
        success: false,
        error: 'Tournament not found'
      }, { status: 404 })
    }
    
    if (tournament.status !== 'BRACKET_PHASE') {
      return NextResponse.json({
        success: false,
        error: 'Tournament is not in bracket phase'
      }, { status: 400 })
    }
    
    if (isAmericanLibreTournament(tournament)) {
      await resetFreeTournament(await createClientServiceRole(), tournamentId, user.id, 'ZONE_PHASE')
      revalidatePath(`/tournaments/${tournamentId}`, 'layout')
      return NextResponse.json({ success: true, message: 'Fase revertida correctamente' })
    }

    // ORDEN CORRECTO: Primero eliminar matches (que referencian seeds), luego hierarchy, luego seeds

    // 1. Eliminar matches de bracket (no de zonas)
    const deleteMatchesResult = await deleteBracketMatchesFromTournament(tournamentId)
    if (!deleteMatchesResult.success) {
      return NextResponse.json({
        success: false,
        error: deleteMatchesResult.error || 'Error deleting bracket matches'
      }, { status: 500 })
    }

    // 2. Eliminar matches_hierarchy
    const deleteHierarchyResult = await deleteMatchesHierarchy(tournamentId)
    if (!deleteHierarchyResult.success) {
      return NextResponse.json({
        success: false,
        error: deleteHierarchyResult.error || 'Error deleting matches hierarchy'
      }, { status: 500 })
    }

    // 3. Eliminar tournament_couple_seeds
    const deleteSeedsResult = await deleteCoupleSeeds(tournamentId)
    if (!deleteSeedsResult.success) {
      return NextResponse.json({
        success: false,
        error: deleteSeedsResult.error || 'Error deleting couple seeds'
      }, { status: 500 })
    }

    // 4. Actualizar el status del torneo a ZONE_PHASE
    const { error: statusError } = await supabase
      .from('tournaments')
      .update(withTournamentSortValues({ status: 'ZONE_PHASE' }))
      .eq('id', tournamentId)

    if (statusError) {
      return NextResponse.json({
        success: false,
        error: 'Error updating tournament status to zone phase'
      }, { status: 500 })
    }

    // Revalidar la página del torneo
    revalidatePath(`/tournaments/${tournamentId}`)
    
    return NextResponse.json({
      success: true,
      message: 'Successfully reverted tournament from bracket phase to zone phase'
    })

  } catch (error) {
    console.error('Error in back-tournament-bracket-to-zones:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof FreeBracketPersistenceError ? error.message : 'Internal server error'
    }, { status: error instanceof FreeBracketPersistenceError ? error.status : 500 })
  }
}
