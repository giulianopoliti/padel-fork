import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { getPublicTournamentHref } from '@/lib/tournaments/public-tournament-url'

type TournamentStatus = 'NOT_STARTED' | 'ZONE_PHASE' | 'BRACKET_PHASE'

const getNextTournamentStatus = async (
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournamentId: string
): Promise<TournamentStatus> => {
  const [{ data: bracketByRound }, { data: bracketByType }] = await Promise.all([
    supabase
      .from('matches')
      .select('id')
      .eq('tournament_id', tournamentId)
      .neq('round', 'ZONE')
      .limit(1),
    supabase
      .from('matches')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('type', 'ELIMINATION')
      .limit(1),
  ])

  if ((bracketByRound?.length || 0) > 0 || (bracketByType?.length || 0) > 0) {
    return 'BRACKET_PHASE'
  }

  const [{ data: zones }, { data: zoneMatches }] = await Promise.all([
    supabase
      .from('zones')
      .select('id')
      .eq('tournament_id', tournamentId)
      .limit(1),
    supabase
      .from('matches')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('round', 'ZONE')
      .limit(1),
  ])

  if ((zones?.length || 0) > 0 || (zoneMatches?.length || 0) > 0) {
    return 'ZONE_PHASE'
  }

  return 'NOT_STARTED'
}

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
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const permissions = await checkTournamentPermissions(user.id, tournamentId)

    if (!permissions.hasPermission) {
      return NextResponse.json({
        success: false,
        error: 'No tienes permisos para restaurar este torneo'
      }, { status: 403 })
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, status, seo_slug, is_draft')
      .eq('id', tournamentId)
      .single()

    if (tournamentError || !tournament) {
      return NextResponse.json({ success: false, error: 'Tournament not found' }, { status: 404 })
    }

    if (tournament.status !== 'CANCELED') {
      return NextResponse.json({
        success: false,
        error: 'El torneo no esta cancelado'
      }, { status: 400 })
    }

    const nextStatus = await getNextTournamentStatus(supabase, tournamentId)

    const { error: updateError } = await supabase
      .from('tournaments')
      .update({ status: nextStatus })
      .eq('id', tournamentId)

    if (updateError) {
      console.error('[restoreTournament API]', updateError)
      return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 })
    }

    try {
      revalidatePath(`/tournaments/${tournamentId}`, 'page')
      revalidatePath('/tournaments', 'page')
      revalidatePath('/my-tournaments', 'page')
      revalidatePath('/panel', 'page')
      revalidatePath(getPublicTournamentHref({ id: tournamentId, seoSlug: tournament.seo_slug, isDraft: tournament.is_draft }), 'page')
      revalidatePath('/', 'page')
    } catch (revalidateError) {
      console.error('[restoreTournament API] Error revalidating paths:', revalidateError)
    }

    return NextResponse.json({ success: true, status: nextStatus })
  } catch (err) {
    console.error('[restoreTournament API]', err)
    return NextResponse.json({ success: false, error: 'Unexpected error' }, { status: 500 })
  }
}
