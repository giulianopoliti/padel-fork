import { withTournamentSortValues } from '@/lib/tournaments/tournament-sort-values'
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params

  if (!tournamentId) {
    return NextResponse.json({ success: false, error: 'Missing tournament id' }, { status: 400 })
  }

  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Verificar permisos usando función centralizada (soporta CLUB + ORGANIZADOR + ADMIN)
    const permissions = await checkTournamentPermissions(user.id, tournamentId)

    if (!permissions.hasPermission) {
      return NextResponse.json({
        success: false,
        error: 'No tienes permisos para cancelar este torneo'
      }, { status: 403 })
    }

    // Get tournament status
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('id, status')
      .eq('id', tournamentId)
      .single()

    if (tErr || !tournament) {
      return NextResponse.json({ success: false, error: 'Tournament not found' }, { status: 404 })
    }

    // Only allow cancel if not finished or already canceled
    if (tournament.status === 'CANCELED') {
      return NextResponse.json({ success: false, error: 'El torneo ya esta cancelado' }, { status: 400 })
    }
    
    if (tournament.status === 'FINISHED') {
      return NextResponse.json({ success: false, error: 'No se puede cancelar un torneo que ya ha finalizado' }, { status: 400 })
    }

    const { error } = await supabase
      .from('tournaments')
      .update(withTournamentSortValues({ status: 'CANCELED' }))
      .eq('id', tournamentId)

    if (error) {
      console.error('[cancelTournament API]', error)
      return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 })
    }

    // Revalidate pages to show updated tournament status
    try {
      // Revalidar todas las rutas necesarias
      revalidatePath(`/tournaments/${tournamentId}`, 'page')
      revalidatePath('/tournaments', 'page')
      revalidatePath('/my-tournaments', 'page')
      revalidatePath('/', 'page') // Por si el torneo aparece en la página principal
    } catch (revalidateError) {
      console.error('[cancelTournament API] Error revalidating paths:', revalidateError)
      // Don't fail the request if revalidation fails
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[cancelTournament API]', err)
    return NextResponse.json({ success: false, error: 'Unexpected error' }, { status: 500 })
  }
}

