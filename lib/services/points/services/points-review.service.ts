import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { applyManualCategoryDecisions, buildPointsReview, PointsReviewError } from './points-review.engine'
import type { PointsContextResponse, PointsReview, PointsSettlementInput } from '../types/points-review.types'

export const pointsConfirmationSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
  categoryChanges: z.array(z.object({ playerId: z.string().uuid(), newCategory: z.string().min(1).max(60) }).strict()).max(512),
  acceptCurrentScoreBasis: z.boolean(),
}).strict()

export const throwPointsDatabaseError = (error: { code?: string; message: string }): never => {
  if (['PGRST202', 'PGRST205', '42883', '42P01'].includes(error.code ?? '')) {
    throw new PointsReviewError('La revisión de puntos todavía no está habilitada en este entorno. Contactá al administrador.', 503)
  }
  if (error.code === '42501') throw new PointsReviewError('No tenés permiso para gestionar los puntos de este torneo.', 403)
  if (error.code === '40001' || error.code === '23505') {
    throw new PointsReviewError('Los datos cambiaron desde la revisión. Actualizá los puntos y revisá nuevamente las decisiones.', 409)
  }
  if (['22023', '22P02', '23514', '22003'].includes(error.code ?? '')) throw new PointsReviewError(error.message, 400)
  console.error('[Tournament points]', error.code, error.message)
  throw new PointsReviewError('No se pudieron guardar los puntos. No se aplicó ningún cambio; podés reintentar.', 500)
}

export const loadPointsReview = async (service: SupabaseClient, tournamentId: string, actorId: string): Promise<PointsSettlementInput> => {
  const { data, error } = await service.rpc('get_tournament_points_context', { p_tournament_id: tournamentId, p_actor_id: actorId })
  if (error) throwPointsDatabaseError(error)
  if (!data) throw new PointsReviewError('No se pudo cargar la revisión de puntos.', 500)
  return buildPointsReview(data as PointsContextResponse)
}

export const confirmPointsReview = async (
  service: SupabaseClient, tournamentId: string, actorId: string, body: z.infer<typeof pointsConfirmationSchema>,
): Promise<{ review: PointsReview; alreadyApplied: boolean }> => {
  const input = await loadPointsReview(service, tournamentId, actorId)
  if (input.review.state === 'APPLIED') return { review: input.review, alreadyApplied: true }
  if (input.review.state === 'LEGACY') throw new PointsReviewError('Este torneo ya tiene sus puntos acreditados.')
  if (input.review.fingerprint !== body.fingerprint) throw new PointsReviewError('Los datos cambiaron desde la revisión. Actualizá los puntos y revisá nuevamente las decisiones.')
  if (input.review.scoreBasis !== 'SNAPSHOT' && !body.acceptCurrentScoreBasis) {
    throw new PointsReviewError('Confirmá el uso de los puntajes actuales para los jugadores sin captura inicial.', 400)
  }
  const calculation = applyManualCategoryDecisions(input, body.categoryChanges)
  const { data, error } = await service.rpc('commit_tournament_points', {
    p_tournament_id: tournamentId, p_actor_id: actorId, p_fingerprint: body.fingerprint, p_calculation: calculation,
  })
  if (error) throwPointsDatabaseError(error)
  return data as { review: PointsReview; alreadyApplied: boolean }
}
