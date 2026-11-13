import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'

type Context = { params: Promise<{ id: string }> }

const id = z.string().uuid()
const alertSchema = z.object({
  coupleId: id,
  playerId: id,
  message: z.string().trim().min(1).max(500).nullable(),
}).strict()

const authorize = async (tournamentId: string) => {
  if (!id.safeParse(tournamentId).success) return NextResponse.json({ error: 'Torneo inválido.' }, { status: 400 })
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Iniciá sesión para gestionar alertas.' }, { status: 401 })
  const permission = await checkTournamentPermissions(user.id, tournamentId)
  if (!permission.hasPermission) return NextResponse.json({ error: 'Sin permisos para gestionar este torneo.' }, { status: 403 })
  const service = await createClientServiceRole()
  const { data: tournament, error: tournamentError } = await service.from('tournaments').select('type').eq('id', tournamentId).maybeSingle()
  if (tournamentError) return databaseError(tournamentError)
  if (tournament?.type !== 'LONG') return NextResponse.json({ error: 'Torneo largo no encontrado.' }, { status: 404 })
  return service
}

const databaseError = (error: { code?: string; message: string }) => {
  console.error('[tournament player alerts]', error)
  return NextResponse.json({ error: 'No se pudieron gestionar las alertas.' }, { status: 500 })
}

export const GET = async (_request: Request, { params }: Context) => {
  const { id: tournamentId } = await params
  const service = await authorize(tournamentId)
  if (service instanceof NextResponse) return service
  const { data, error } = await service.from('tournament_player_alerts').select('player_id, message').eq('tournament_id', tournamentId)
  if (error) return databaseError(error)
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export const PUT = async (request: Request, { params }: Context) => {
  const { id: tournamentId } = await params
  const service = await authorize(tournamentId)
  if (service instanceof NextResponse) return service
  const parsed = alertSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ingresá una alerta de hasta 500 caracteres.' }, { status: 400 })
  const { coupleId, playerId, message } = parsed.data

  const { data: inscription, error: inscriptionError } = await service.from('inscriptions')
    .select('id, couple:couples!inner(player1_id, player2_id)')
    .eq('tournament_id', tournamentId).eq('couple_id', coupleId).limit(1).maybeSingle()
  if (inscriptionError) return databaseError(inscriptionError)
  const couple = Array.isArray(inscription?.couple) ? inscription.couple[0] : inscription?.couple
  if (!couple || (couple.player1_id !== playerId && couple.player2_id !== playerId)) {
    return NextResponse.json({ error: 'El jugador no pertenece a esa inscripción.' }, { status: 404 })
  }

  const alerts = service.from('tournament_player_alerts')
  const { error } = await (message === null
    ? alerts.delete().eq('tournament_id', tournamentId).eq('player_id', playerId)
    : alerts.upsert({ tournament_id: tournamentId, player_id: playerId, message }))
  if (error) return databaseError(error)
  return NextResponse.json({ success: true })
}
