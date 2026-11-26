import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { PointsReviewError } from '@/lib/services/points/services/points-review-error'

type Context = { params: Promise<{ id: string }> }
export const dynamic = 'force-dynamic'
const confirmationSchema = z.object({ fingerprint: z.string().regex(/^[a-f0-9]{32}$/) }).strict()

const authorize = async (id: string): Promise<string> => {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new PointsReviewError('Iniciá sesión para reabrir el torneo.', 401)
  const permissions = await checkTournamentPermissions(user.id, id)
  if (!permissions.hasPermission) throw new PointsReviewError(permissions.reason || 'No tenés permiso para gestionar este torneo.', 403)
  return user.id
}

const errorResponse = (error: unknown): NextResponse => {
  if (error instanceof PointsReviewError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('[Tournament reopen]', error)
  return NextResponse.json({ error: 'No se pudo reabrir el torneo. No se aplicó ningún cambio.' }, { status: 500 })
}

const throwDatabaseError = (error: { code?: string; message: string }): never => {
  if (['PGRST202', 'PGRST205', '42883', '42P01'].includes(error.code ?? '')) {
    throw new PointsReviewError('La reapertura todavía no está habilitada en este entorno. Contactá al administrador.', 503)
  }
  if (error.code === '42501') throw new PointsReviewError('No tenés permiso para reabrir este torneo.', 403)
  if (['40001', '23505', '40P01'].includes(error.code ?? '')) {
    throw new PointsReviewError('Los datos cambiaron. Actualizá la vista previa antes de confirmar.', 409)
  }
  if (['22023', '22P02', '23514'].includes(error.code ?? '')) throw new PointsReviewError(error.message, 400)
  throw error
}

export const GET = async (_request: Request, { params }: Context): Promise<NextResponse> => {
  try {
    const { id } = await params
    const actorId = await authorize(id)
    const service = await createClientServiceRole()
    const { data, error } = await service.rpc('preview_tournament_reopen', { p_tournament_id: id, p_actor_id: actorId })
    if (error) throwDatabaseError(error)
    if (!data) throw new Error('Missing reopening preview')
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return errorResponse(error) }
}

export const POST = async (request: Request, { params }: Context): Promise<NextResponse> => {
  try {
    const { id } = await params
    const actorId = await authorize(id)
    const body = confirmationSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new PointsReviewError('Revisá el impacto de la reapertura antes de confirmar.', 400)
    const service = await createClientServiceRole()
    const { data, error } = await service.rpc('reopen_tournament_points', {
      p_tournament_id: id, p_actor_id: actorId, p_fingerprint: body.data.fingerprint,
    })
    if (error) throwDatabaseError(error)
    if (!data) throw new Error('Missing reopening receipt')
    for (const path of [`/tournaments/${id}`, `/tournaments/${id}/bracket`, `/tournaments/${id}/settings/operacion`,
      '/ranking', '/my-players', '/my-tournaments', '/profile', '/', '/ascensos']) revalidatePath(path)
    return NextResponse.json({ success: true, ...data })
  } catch (error) { return errorResponse(error) }
}
