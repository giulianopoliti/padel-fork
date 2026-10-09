import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getUserDetails } from '@/utils/db/getUserDetails'
import { getAmericanPlayerTournamentData } from '@/utils/american-player-matches'

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Iniciá sesión para consultar tu inscripción.' }, { status: 401 })
    }

    const profile = await getUserDetails()
    if (profile?.id !== user.id || profile.role !== 'PLAYER' || !profile.player_id) {
      return NextResponse.json({ error: 'No se pudo identificar tu perfil de jugador.' }, { status: 403 })
    }

    const { id } = await params
    const data = await getAmericanPlayerTournamentData(profile.player_id, id, supabase)
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[player-overview] Error consultando la inscripción:', error)
    return NextResponse.json({ error: 'No se pudo consultar tu inscripción. Intentá nuevamente.' }, { status: 500 })
  }
}
