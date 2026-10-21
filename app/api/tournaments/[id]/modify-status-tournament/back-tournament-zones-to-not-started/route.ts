import { isAmericanLibreTournament } from '@/lib/services/americano-libre-format'
import { resetFreeTournament } from '@/lib/services/americano-libre-reset'
import { FreeBracketPersistenceError } from '@/lib/services/americano-libre-persistence'
import { withTournamentSortValues } from '@/lib/tournaments/tournament-sort-values'
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { revalidatePath } from 'next/cache'
import { getZonesFromTournament, deleteZonesAndData } from '../actions'

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
    
    // Verificar que el torneo existe y está en fase de zonas
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
    
    if (tournament.status !== 'ZONE_PHASE') {
      return NextResponse.json({
        success: false,
        error: 'Tournament is not in zone phase'
      }, { status: 400 })
    }
    
    if (isAmericanLibreTournament(tournament)) {
      await resetFreeTournament(await createClientServiceRole(), tournamentId, user.id, 'NOT_STARTED')
      revalidatePath(`/tournaments/${tournamentId}`, 'layout')
      return NextResponse.json({ success: true, message: 'Fase revertida correctamente' })
    }

    // Obtener todas las zonas del torneo usando la función abstraída
    const zonesResult = await getZonesFromTournament(tournamentId)
    
    if (!zonesResult.success) {
      return NextResponse.json({
        success: false,
        error: zonesResult.error || 'Error fetching zones'
      }, { status: 500 })
    }

    if (!zonesResult.zoneIds || zonesResult.zoneIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: zonesResult.message || 'No zones found for this tournament'
      })
    }

    const zoneIds = zonesResult.zoneIds
    
    // Eliminar todas las zonas y datos relacionados usando la función abstraída
    const deleteResult = await deleteZonesAndData(zoneIds)
    
    if (!deleteResult.success) {
      return NextResponse.json({
        success: false,
        error: deleteResult.error || 'Error deleting zones and related data'
      }, { status: 500 })
    }

    // Actualizar el status del torneo a NOT_STARTED
    const { error: statusError } = await supabase
      .from('tournaments')
      .update(withTournamentSortValues({ status: 'NOT_STARTED' }))
      .eq('id', tournamentId)

    if (statusError) {
      return NextResponse.json({
        success: false,
        error: 'Error updating tournament status'
      }, { status: 500 })
    }

    // Revalidar la página del torneo
    revalidatePath(`/tournaments/${tournamentId}`)
    
    return NextResponse.json({
      success: true,
      message: deleteResult.message || `Successfully deleted ${zoneIds.length} zones`
    })

  } catch (error) {
    console.error('Error in back-tournament-zones-to-not-started:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof FreeBracketPersistenceError ? error.message : 'Internal server error'
    }, { status: error instanceof FreeBracketPersistenceError ? error.status : 500 })
  }
}