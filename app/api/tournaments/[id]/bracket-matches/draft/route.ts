import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'

type DraftMode = 'draft' | 'publish'
type DraftScope = 'match' | 'bracket' | 'all'
type BracketKey = 'MAIN' | 'GOLD' | 'SILVER'

interface UpdateBracketDraftRequest {
  mode?: DraftMode
  scope?: DraftScope
  matchId?: string
  bracketKey?: BracketKey
}

const VALID_BRACKET_KEYS = new Set<BracketKey>(['MAIN', 'GOLD', 'SILVER'])

const isDraftMode = (value: unknown): value is DraftMode =>
  value === 'draft' || value === 'publish'

const isDraftScope = (value: unknown): value is DraftScope =>
  value === 'match' || value === 'bracket' || value === 'all'

const isBracketKey = (value: unknown): value is BracketKey =>
  typeof value === 'string' && VALID_BRACKET_KEYS.has(value as BracketKey)

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params
    const body = (await request.json().catch(() => ({}))) as UpdateBracketDraftRequest
    const { mode, scope, matchId, bracketKey } = body

    if (!tournamentId) {
      return NextResponse.json({ success: false, error: 'ID de torneo requerido' }, { status: 400 })
    }

    if (!isDraftMode(mode)) {
      return NextResponse.json({ success: false, error: 'Modo invalido' }, { status: 400 })
    }

    if (!isDraftScope(scope)) {
      return NextResponse.json({ success: false, error: 'Alcance invalido' }, { status: 400 })
    }

    if (scope === 'match' && !matchId) {
      return NextResponse.json({ success: false, error: 'ID de partido requerido' }, { status: 400 })
    }

    if (scope === 'bracket' && !isBracketKey(bracketKey)) {
      return NextResponse.json({ success: false, error: 'Llave requerida' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Usuario no autenticado' }, { status: 401 })
    }

    const permissions = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissions.hasPermission) {
      return NextResponse.json(
        { success: false, error: permissions.reason || 'Permisos insuficientes' },
        { status: 403 }
      )
    }

    if (scope === 'match') {
      const { data: match, error: matchError } = await supabase
        .from('matches')
        .select('id, status, round, couple1_id, couple2_id, winner_id')
        .eq('id', matchId)
        .eq('tournament_id', tournamentId)
        .single()

      if (matchError || !match) {
        return NextResponse.json({ success: false, error: 'Partido no encontrado' }, { status: 404 })
      }

      if (match.round === 'ZONE') {
        return NextResponse.json(
          { success: false, error: 'Esta accion solo aplica a partidos de llave' },
          { status: 400 }
        )
      }

      if (match.status === 'IN_PROGRESS' || match.status === 'FINISHED' || match.winner_id) {
        return NextResponse.json(
          { success: false, error: 'No se puede cambiar el borrador de un partido en curso o finalizado' },
          { status: 400 }
        )
      }

      if (
        mode === 'draft' &&
        match.status !== 'PENDING' &&
        match.status !== 'WAITING_OPONENT' &&
        match.status !== 'WAITING_OPPONENT'
      ) {
        return NextResponse.json({
          success: true,
          updatedCount: 0,
          skippedCount: 1,
          message: 'El partido no esta publicado o no es elegible para pasar a borrador',
        })
      }

      if (mode === 'publish') {
        if (match.status !== 'DRAFT') {
          return NextResponse.json({
            success: true,
            updatedCount: 0,
            skippedCount: 1,
            message: 'El partido no esta en borrador',
          })
        }

        if (!match.couple1_id || !match.couple2_id) {
          return NextResponse.json(
            { success: false, error: 'No se puede publicar un partido sin ambas parejas definidas' },
            { status: 400 }
          )
        }
      }
    }

    const nextStatus = mode === 'draft' ? 'DRAFT' : 'PENDING'

    let updateQuery = supabase
      .from('matches')
      .update({ status: nextStatus })
      .eq('tournament_id', tournamentId)
      .neq('round', 'ZONE')

    updateQuery = mode === 'draft'
      ? updateQuery.in('status', ['PENDING', 'WAITING_OPONENT'])
      : updateQuery.eq('status', 'DRAFT')

    if (scope === 'match') {
      updateQuery = updateQuery.eq('id', matchId)
    }

    if (scope === 'bracket') {
      updateQuery = updateQuery.eq('bracket_key', bracketKey)
    }

    if (mode === 'publish') {
      updateQuery = updateQuery
        .not('couple1_id', 'is', null)
        .not('couple2_id', 'is', null)
    }

    const { data: updatedMatches, error: updateError } = await updateQuery.select('id, status')

    if (updateError) {
      console.error('Error updating bracket draft status:', updateError)
      return NextResponse.json(
        { success: false, error: 'Error actualizando partidos de llave' },
        { status: 500 }
      )
    }

    revalidatePath(`/tournaments/${tournamentId}/bracket`)
    revalidatePath('/panel')
    revalidatePath('/panel-cpa')

    const updatedCount = updatedMatches?.length || 0
    const message =
      mode === 'draft'
        ? `${updatedCount} partido(s) marcados como borrador`
        : `${updatedCount} partido(s) publicados`

    return NextResponse.json({
      success: true,
      updatedCount,
      status: nextStatus,
      message,
    })
  } catch (error) {
    console.error('Unexpected error updating bracket draft status:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
