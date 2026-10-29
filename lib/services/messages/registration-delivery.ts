import { after } from 'next/server'
import { createClientServiceRole } from '@/utils/supabase/server'
import { sendSafely } from '@/lib/services/email/notification-utils'
import type { TournamentMessageEvent } from './types'

type EmailInput = Parameters<typeof sendSafely>[0]

export const sendRegistrationEmail = async (input: EmailInput, label: string, event: TournamentMessageEvent) => {
  if (!event.delivery) return sendSafely(input, label)
  const client = await createClientServiceRole()
  const { data, error } = await client.rpc('prepare_registration_event', {
    p_id: event.delivery.eventId, p_attempt: event.delivery.attempt,
    p_message: { ...input, idempotencyKey: `registration-event-${event.delivery.eventId}` },
  })
  if (error || !data) throw new Error('No se pudo preparar el aviso de inscripción.')
  return sendSafely(data as EmailInput, label)
}

interface RegistrationEvent {
  id: string
  tournament_id: string
  inscription_id: string | null
  kind: 'SUBMITTED' | 'CONFIRMED' | 'CAPACITY_FULL' | 'PROOF_WITHOUT_SLOT' | 'SLOT_ASSIGNED' | 'PROOF_WAIVED'
  attempts: number
  notification_allowed: boolean
}

export const processRegistrationEvents = async (limit = 20): Promise<{ processed: number; failed: number }> => {
  const client = await createClientServiceRole()
  const { data, error } = await client.rpc('claim_registration_events', { p_limit: limit })
  if (error) throw new Error('No se pudieron consultar los avisos de inscripciones.')
  let processed = 0; let failed = 0
  const { sendTournamentMessage } = await import('./index')
  for (const event of (data || []) as RegistrationEvent[]) {
    let failure: string | null = null
    try {
      const { data: tournament, error: tournamentError } = await client.from('tournaments').select('status,messages_enabled').eq('id', event.tournament_id).maybeSingle()
      if (tournamentError) throw new Error('No se pudo verificar el torneo del aviso.')
      if (event.notification_allowed && tournament && tournament.messages_enabled !== false && !['CANCELED', 'FINISHED', 'FINISHED_POINTS_PENDING', 'FINISHED_POINTS_CALCULATED'].includes(tournament.status)) {
        const delivery = { eventId: event.id, attempt: event.attempts }
        const message: TournamentMessageEvent | null = event.kind === 'SUBMITTED' && event.inscription_id
          ? { type: 'INSCRIPTION_SUBMITTED_ADMIN', supabase: client, inscriptionId: event.inscription_id, delivery }
          : event.kind === 'CONFIRMED' && event.inscription_id
            ? { type: 'INSCRIPTION_APPROVED_PLAYER', supabase: client, inscriptionId: event.inscription_id, delivery }
            : event.kind === 'CAPACITY_FULL' || event.kind === 'PROOF_WITHOUT_SLOT'
              ? { type: 'REGISTRATION_ATTENTION_ADMIN', supabase: client, tournamentId: event.tournament_id,
                inscriptionId: event.inscription_id || undefined, kind: event.kind, delivery } : null
        if (message) {
          const results = await sendTournamentMessage(message)
          if (results.some(result => !result.success)) throw new Error('Falló la entrega del aviso de inscripción.')
        }
      }
      processed++
    } catch (error) { failure = error instanceof Error ? error.message : 'No se pudo entregar el aviso.'; failed++ }
    const { error: finishError } = await client.rpc('finish_registration_event', { p_id: event.id, p_attempt: event.attempts, p_error: failure })
    if (finishError) { failed++; console.warn('[registration-events] delivery_result_unconfirmed', { eventId: event.id }) }
  }
  return { processed, failed }
}

export const scheduleRegistrationNotifications = (): void => {
  try { after(async () => { try { await processRegistrationEvents() } catch { console.warn('[registration-events] processing_deferred') } }) }
  catch { console.warn('[registration-events] queued_for_scheduled_retry') }
}
