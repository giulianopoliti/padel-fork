import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { PointsReviewError } from '@/lib/services/points/services/points-review.engine'
import { confirmPointsReview, loadPointsReview, pointsConfirmationSchema } from '@/lib/services/points/services/points-review.service'

type Context = { params: Promise<{ id: string }> }
export const dynamic = 'force-dynamic'

const authorize = async (id: string): Promise<string> => {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new PointsReviewError('Iniciá sesión para revisar los puntos.', 401)
  const permissions = await checkTournamentPermissions(user.id, id)
  if (!permissions.hasPermission) throw new PointsReviewError(permissions.reason || 'No tenés permiso para gestionar este torneo.', 403)
  return user.id
}

const errorResponse = (error: unknown): NextResponse => {
  if (error instanceof PointsReviewError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('[Tournament points route]', error)
  return NextResponse.json({ error: 'No se pudo completar la operación. Reintentá en unos instantes.' }, { status: 500 })
}

export const GET = async (_request: Request, { params }: Context): Promise<NextResponse> => {
  try {
    const { id } = await params
    const actorId = await authorize(id)
    const { review } = await loadPointsReview(await createClientServiceRole(), id, actorId)
    return NextResponse.json(review, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return errorResponse(error) }
}

export const POST = async (request: Request, { params }: Context): Promise<NextResponse> => {
  try {
    const { id } = await params
    const actorId = await authorize(id)
    const body = pointsConfirmationSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) return NextResponse.json({ error: 'Revisá los puntos antes de confirmar. Las decisiones enviadas no son válidas.' }, { status: 400 })
    const result = await confirmPointsReview(await createClientServiceRole(), id, actorId, body.data)
    for (const path of [`/tournaments/${id}`, `/tournaments/${id}/bracket`, '/ranking', '/my-players', '/my-tournaments', '/profile', '/']) revalidatePath(path)
    return NextResponse.json({ success: true, ...result })
  } catch (error) { return errorResponse(error) }
}
