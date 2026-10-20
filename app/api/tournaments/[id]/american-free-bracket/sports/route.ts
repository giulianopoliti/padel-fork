import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { freeSportsInputSchema } from '@/types/americano-libre-sports'
import { mutateFreeSports } from '@/lib/services/americano-libre-sports'
import { FreeBracketPersistenceError } from '@/lib/services/americano-libre-persistence'
import { freeSportsViewSchema } from '@/types/americano-libre-sports'

export const GET = async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params
    z.string().uuid().parse(id)
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ success: false, message: 'Iniciá sesión' }, { status: 401 })
    if (!(await checkTournamentPermissions(user.id, id)).hasPermission) return NextResponse.json({ success: false, message: 'Sin permisos sobre el torneo' }, { status: 403 })
    const { data: before, error } = await client.from('american_free_brackets').select('revision').eq('tournament_id', id).single()
    if (error || !before) throw new Error('No se encontró la llave libre')
    const [matches, dates, slots] = await Promise.all([
      client.from('matches').select('id,round,order_in_round,zone_id,couple1_id,couple2_id,status,winner_id,result_couple1,result_couple2,free_slot1_origin,free_slot2_origin,free_bye_processed,court').eq('tournament_id', id).eq('bracket_is_active', true).order('created_at'),
      client.from('tournament_fechas').select('id,fecha_number,round_type').eq('tournament_id', id),
      client.from('tournament_time_slots').select('id,fecha_id,date,start_time,fecha:tournament_fechas!inner(tournament_id)').eq('fecha.tournament_id', id).eq('is_available', true),
    ])
    if (matches.error || dates.error || slots.error) throw new Error(matches.error?.message || dates.error?.message || slots.error?.message)
    const { data: after, error: afterError } = await client.from('american_free_brackets').select('revision').eq('tournament_id', id).single()
    if (afterError) throw new Error(afterError.message)
    if (after?.revision !== before.revision) throw new FreeBracketPersistenceError('La llave cambió. Recargá antes de guardar.', '40001')
    return NextResponse.json({ success: true, ...freeSportsViewSchema.parse({ revision: before.revision, matches: matches.data, dates: dates.data, slots: slots.data }) })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'No se pudo cargar' }, { status: error instanceof FreeBracketPersistenceError ? error.status : 500 })
  }
}

export const POST = async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params
    z.string().uuid().parse(id)
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ success: false, message: 'Iniciá sesión' }, { status: 401 })
    if (!(await checkTournamentPermissions(user.id, id)).hasPermission) return NextResponse.json({ success: false, message: 'Sin permisos sobre el torneo' }, { status: 403 })
    const input = freeSportsInputSchema.parse(await request.json().catch(() => null))
    const snapshot = await mutateFreeSports(await createClientServiceRole(), id, user.id, input)
    return NextResponse.json({ success: true, snapshot })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof z.ZodError ? 'Operación deportiva inválida' : error instanceof Error ? error.message : 'No se pudo guardar' },
      { status: error instanceof FreeBracketPersistenceError ? error.status : error instanceof z.ZodError ? 400 : 500 })
  }
}
