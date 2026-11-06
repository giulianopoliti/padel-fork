import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { isScheduleSharingEnabled, SCHEDULE_SHARING_SCHEMA_VERSION } from '@/config/schedule-sharing'
import { scheduleBatchSchema } from './batch'
import { getScheduleWorkspaceScope } from './scope'

export const scheduleMetadataSchema = z.object({ name: z.string(), description: z.string().nullable(), start_date: z.string().nullable(), end_date: z.string().nullable() })
export const scheduleContentSchema = z.object({
  date: z.string(), start_time: z.string(), end_time: z.string(), court_name: z.string().nullable(),
  max_matches: z.number().int().positive(), description: z.string().nullable(), is_available: z.boolean(),
})
const previewSchema = z.object({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  preview: z.object({ operation_key: z.string().uuid(), can_commit: z.boolean(),
    physical_slots_to_create: z.number().int().nonnegative(), physical_slots_to_reuse: z.number().int().nonnegative(),
    destinations: z.array(z.object({
      tournament_id: z.string().uuid(), tournament_name: z.string(), fecha_id: z.string().uuid().nullable(),
      fecha_number: z.number().int().positive(), transition_to_zone_phase: z.boolean(), preserves_local_metadata: z.boolean(),
      new_slots: z.array(scheduleContentSchema.extend({ key: z.string() })),
      reused_slots: z.array(z.object({ key: z.string(), slot_id: z.string().uuid() })),
      conflicts: z.array(z.object({ code: z.string(), message: z.string(), slot_key: z.string().optional(), candidate_ids: z.array(z.string().uuid()).optional() })),
    })),
  }),
})
const commitSchema = z.object({
  group_id: z.string().uuid(), operation_key: z.string().uuid(), destinations: z.array(z.object({
    tournament_id: z.string().uuid(), fecha_id: z.string().uuid(), new_slots: z.number().int().nonnegative(), reused_slots: z.number().int().nonnegative(),
  })),
})
export type ScheduleReviewedBatch = z.infer<typeof previewSchema>
export type ScheduleCommittedBatch = z.infer<typeof commitSchema>

export const requireScheduleSharing = async (): Promise<void> => {
  if (!isScheduleSharingEnabled() || process.env.SCHEDULE_SHARING_ENABLED !== 'true') {
    throw new Error('La gestión compartida de fechas todavía no está habilitada.')
  }
  const client = await createClient()
  const { data, error } = await client.rpc('schedule_sharing_schema_version')
  if (error || data !== SCHEDULE_SHARING_SCHEMA_VERSION) throw new Error('La base todavía no tiene el esquema requerido para fechas compartidas.')
}

const parseAuthorizedDraft = async (input: unknown) => {
  await requireScheduleSharing()
  const draft = scheduleBatchSchema.parse(input)
  const scope = await getScheduleWorkspaceScope()
  const manageable = new Set(scope.tournaments.map(tournament => tournament.id))
  if (draft.destinations.some(destination => !manageable.has(destination.tournament_id))) {
    throw new Error('No tenés permisos sobre todos los destinos elegidos.')
  }
  // SQL rechecks the optional source, every destination and all versions under lock.
  return draft
}

const rpcError = (error: { code?: string; message?: string }): Error => {
  if (error.code === '40001' || error.code === '40P01') return new Error('La vista previa quedó desactualizada. Volvé a revisar los destinos antes de guardar.')
  if (error.code === '42501') return new Error('Los permisos cambiaron o alguno de los destinos no es administrable.')
  if (['22023', '23514', '23505'].includes(error.code ?? '')) return new Error(error.message || 'Hay conflictos pendientes en la configuración.')
  return new Error('No se pudo completar la operación de horarios. El guardado se realiza completo o no se realiza.')
}

export const previewScheduleBatch = async (input: unknown): Promise<ScheduleReviewedBatch> => {
  const payload = await parseAuthorizedDraft(input)
  const client = await createClient()
  const { data, error } = await client.rpc('preview_schedule_batch', { payload })
  if (error) throw rpcError(error)
  return previewSchema.parse(data)
}

export const commitScheduleBatch = async (input: unknown, revision: string): Promise<ScheduleCommittedBatch> => {
  const payload = await parseAuthorizedDraft(input)
  const expected_revision = z.string().regex(/^[a-f0-9]{64}$/).parse(revision)
  const client = await createClient()
  const { data, error } = await client.rpc('commit_schedule_batch', { payload, expected_revision })
  if (error) throw rpcError(error)
  return commitSchema.parse(data)
}

export const unlinkScheduleMember = async (group: string, member: string, fecha: string, updatedAt: string): Promise<string> => {
  await requireScheduleSharing()
  const uuid = z.string().uuid()
  const client = await createClient()
  const { data, error } = await client.rpc('unlink_schedule_member', {
    p_group: uuid.parse(group), p_member: uuid.parse(member), p_fecha: uuid.parse(fecha),
    p_updated_at: z.string().datetime({ offset: true }).parse(updatedAt),
  })
  if (error?.code === '40001') throw new Error('La copia cambió. Volvé a cargar la configuración.')
  if (error) throw rpcError(error)
  return uuid.parse(data)
}
