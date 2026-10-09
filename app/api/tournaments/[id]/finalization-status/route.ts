import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import { loadTournamentFinalization, validateTournamentBonuses } from '@/lib/tournaments/finalization'

type Context = { params: Promise<{ id: string }> }

export const GET = async (_request: NextRequest, { params }: Context) => {
  try {
    const supabase = await createClient()
    const { id } = await params
    const state = await loadTournamentFinalization(supabase, id)
    return NextResponse.json({
      success: true, ...state,
      status: state.tournament.status,
      winner_id: state.tournament.winner_id,
      isFinalized: ['FINISHED_POINTS_PENDING', 'FINISHED_POINTS_CALCULATED'].includes(state.tournament.status),
      finalCompleted: state.allMatchesFinished,
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Error al verificar el torneo.' }, { status: 500 })
  }
}

const handleSave = async (request: NextRequest, { params }: Context, finalize: boolean) => {
  try {
    const supabase = await createClient()
    const { id } = await params
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const permissions = await checkTournamentPermissions(user.id, id)
    if (!permissions.hasPermission) return NextResponse.json({ error: permissions.reason }, { status: 403 })
    const state = await loadTournamentFinalization(supabase, id)
    if (finalize ? !state.canFinalize : state.tournament.status !== 'FINISHED_POINTS_PENDING' || !state.allMatchesFinished) return NextResponse.json({ error: state.reason || 'El torneo ya no está en fase de llaves.' }, { status: 409 })
    const { bonuses } = await request.json()
    if (!validateTournamentBonuses(bonuses, state.bracketKeys)) {
      return NextResponse.json({ error: 'Configuración de bonos inválida. Usá puntos enteros entre 0 y 10000.' }, { status: 400 })
    }
    const primaryChampion = state.champions.find(champion => champion.bracketKey !== 'SILVER')
    const formatConfig = TournamentFormatResolver.getResolvedFormat(state.tournament)
    const { effectiveZoneStage, effectiveTargetMatchesPerCouple, effectiveBracketMode, effectiveAdvancementConfig, appliedNotes, ...baseConfig } = formatConfig
    const existingConfig = state.tournament.format_config && typeof state.tournament.format_config === 'object'
      ? state.tournament.format_config : baseConfig
    const { data, error } = await supabase.from('tournaments').update({
      ...(finalize ? {
        status: 'FINISHED_POINTS_PENDING',
        winner_id: primaryChampion?.winnerId ?? state.tournament.winner_id,
        end_date: new Date().toISOString(),
      } : {}),
      format_config: { ...existingConfig, bonuses },
    }).eq('id', id).eq('status', finalize ? 'BRACKET_PHASE' : 'FINISHED_POINTS_PENDING').select('id').maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'No se pudo finalizar el torneo. Actualizá la página e intentá nuevamente.' }, { status: 409 })
    revalidatePath(`/tournaments/${id}`)
    revalidatePath(`/tournaments/${id}/bracket`)
    revalidatePath('/my-tournaments')
    revalidatePath('/')
    return NextResponse.json({ success: true, status: 'FINISHED_POINTS_PENDING', champions: state.champions })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error al finalizar el torneo.' }, { status: 500 })
  }
}

export const POST = (request: NextRequest, context: Context) => handleSave(request, context, true)
export const PATCH = (request: NextRequest, context: Context) => handleSave(request, context, false)
