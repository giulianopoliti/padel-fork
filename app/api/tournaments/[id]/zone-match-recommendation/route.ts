import { NextResponse } from 'next/server'
import { getAmericanSingleZoneRecommendation } from '@/lib/services/zone-match-recommendation/american-single-zone.service'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'

/**
 * Entrada HTTP de sólo lectura. Autentica al organizador y delega toda la
 * traducción de datos/reglas al adaptador American Single Zone.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: tournamentId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })
    }

    const permission = await checkTournamentPermissions(user.id, tournamentId)
    if (!permission.hasPermission) {
      return NextResponse.json(
        { success: false, error: permission.reason || 'Sin permisos para administrar este torneo' },
        { status: 403 },
      )
    }

    // No se guarda ningún fixture: cada GET calcula contra el estado actual.
    const recommendation = await getAmericanSingleZoneRecommendation(supabase, tournamentId)
    return NextResponse.json({ success: true, recommendation })
  } catch (error) {
    if (error instanceof Error && error.message === 'MATCH_RECOMMENDATION_NOT_APPLICABLE') {
      return NextResponse.json(
        { success: false, code: 'NOT_APPLICABLE', error: 'El recomendador todavía sólo está habilitado para AMERICAN SINGLE_ZONE' },
        { status: 404 },
      )
    }

    console.error('[zone-match-recommendation] Could not build recommendation:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'No se pudo calcular la recomendación' },
      { status: 500 },
    )
  }
}
