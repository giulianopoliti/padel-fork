import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { getScheduleWorkspaceScope } from './scope'
import { requireScheduleSharing, scheduleContentSchema, scheduleMetadataSchema } from './rpc'
import { compareScheduleMember } from './differences'
import { isCivilDate } from './validation'

const stateSchema = z.enum(['INDIVIDUAL', 'COMPLETE', 'MISSING_SLOTS', 'LOCAL_CHANGES', 'SHARED_CHANGES', 'UNLINKED'])
const civilDate = z.string().refine(isCivilDate, 'Día inválido.')
export const scheduleWorkspaceFilterSchema = z.object({
  club: z.string().uuid().optional(), tournament: z.string().uuid().optional(),
  from: civilDate.optional(), to: civilDate.optional(), period: z.enum(['all', 'dated', 'undated']).default('all'),
  round: z.enum(['ZONE', '32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']).optional(),
  bracket: z.enum(['MAIN', 'GOLD', 'SILVER']).optional(), state: stateSchema.optional(),
  page: z.coerce.number().int().positive().max(100000).default(1),
}).refine(filters => !filters.from || !filters.to || filters.from <= filters.to, 'El período del filtro es inválido.')
export type ScheduleWorkspaceFilters = z.infer<typeof scheduleWorkspaceFilterSchema>
const entrySchema = scheduleMetadataSchema.extend({
  id: z.string().uuid(), kind: z.enum(['GROUP', 'INDIVIDUAL']), created_at: z.string(),
  tournament_ids: z.array(z.string().uuid()), club_ids: z.array(z.string().uuid()),
  round_types: z.array(z.string()), bracket_keys: z.array(z.string()), tournament_count: z.number().int().nonnegative(),
  slot_count: z.number().int().nonnegative(), distribution_state: stateSchema,
})
const groupSchema = scheduleMetadataSchema.extend({ id: z.string().uuid(), version: z.number().int().positive(), created_at: z.string(), updated_at: z.string() })
const memberSchema = z.object({
  id: z.string().uuid(), group_id: z.string().uuid(), tournament_id: z.string().uuid().nullable(), fecha_id: z.string().uuid().nullable(),
  status: z.enum(['active', 'unlinked', 'deleted']), applied_metadata: scheduleMetadataSchema, applied_version: z.number().int().positive(), updated_at: z.string(),
})
const itemSchema = z.object({ id: z.string().uuid(), group_id: z.string().uuid(), item_key: z.string(), content: scheduleContentSchema, deleted: z.boolean(), version: z.number().int().positive() })
const targetSchema = z.object({
  id: z.string().uuid(), member_id: z.string().uuid(), item_id: z.string().uuid(), slot_id: z.string().uuid().nullable(),
  status: z.enum(['active', 'unlinked', 'deleted']), applied_content: scheduleContentSchema, applied_item_content: scheduleContentSchema, applied_version: z.number().int().positive(),
})
const fechaSchema = scheduleMetadataSchema.extend({ id: z.string().uuid(), tournament_id: z.string().uuid(), fecha_number: z.number().int(), round_type: z.string(), bracket_key: z.string() })
const slotSchema = z.object({ id: z.string().uuid(), fecha_id: z.string().uuid(), date: z.string(), start_time: z.string(), end_time: z.string(),
  court_name: z.string().nullable(), max_matches: z.number().int(), description: z.string().nullable(), is_available: z.boolean(), slot_type: z.enum(['TIME_RANGE', 'FREE_DATE']), is_system: z.boolean() })

export const readAllScheduleRows = async <T>(schema: z.ZodType<T>, query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> => {
  const rows: T[] = []
  for (let from = 0; ; from += 500) {
    const result = await query(from, from + 499)
    if (result.error) throw new Error('No se pudo cargar la configuración compartida.')
    const page = z.array(schema).parse(result.data ?? [])
    rows.push(...page)
    if (page.length < 500) return rows
  }
}

const readAll = readAllScheduleRows

export const listScheduleWorkspace = async (input: unknown) => {
  await requireScheduleSharing()
  const filters = scheduleWorkspaceFilterSchema.parse(input)
  const scope = await getScheduleWorkspaceScope()
  const client = await createClient()
  const pageSize = 20
  let query = client.from('schedule_workspace_entries').select(
    'id, kind, name, description, start_date, end_date, created_at, tournament_ids, club_ids, round_types, bracket_keys, tournament_count, slot_count, distribution_state',
    { count: 'exact' },
  ).order('created_at', { ascending: false }).order('kind').order('id')
  if (filters.club || filters.tournament || filters.round || filters.bracket) {
    const destination = {
      club_id: filters.club, tournament_id: filters.tournament,
      round_type: filters.round, bracket_key: filters.bracket,
    }
    query = query.filter('destinations', 'cs', JSON.stringify([destination]))
  }
  if (filters.state) query = query.eq('distribution_state', filters.state)
  if (filters.period === 'undated') query = query.is('start_date', null).is('end_date', null)
  else {
    if (filters.period === 'dated' || filters.from || filters.to) query = query.or('start_date.not.is.null,end_date.not.is.null')
    if (filters.from) query = query.or(`end_date.gte.${filters.from},end_date.is.null`)
    if (filters.to) query = query.or(`start_date.lte.${filters.to},start_date.is.null`)
  }
  const { data, error, count } = await query.range((filters.page - 1) * pageSize, filters.page * pageSize - 1)
  if (error || count === null) throw new Error('No se pudo cargar el panel de fechas y horarios.')
  const entries = z.array(entrySchema).parse(data)
  const authorized = new Set(scope.tournaments.map(tournament => tournament.id))
  if (entries.some(entry => entry.tournament_ids.some(id => !authorized.has(id)))) {
    throw new Error('El alcance de permisos cambió. Volvé a cargar el panel.')
  }
  return { scope, filters, entries, total: count, pageSize }
}

export const getScheduleGroupDetail = async (input: string) => {
  await requireScheduleSharing()
  const id = z.string().uuid().parse(input)
  const scope = await getScheduleWorkspaceScope()
  const client = await createClient()
  const response = await client.from('schedule_share_groups')
    .select('id, name, description, start_date, end_date, version, created_at, updated_at').eq('id', id).maybeSingle()
  if (response.error) throw new Error('No se pudo cargar la configuración compartida.')
  if (!response.data) return null
  const group = groupSchema.parse(response.data)
  const [members, items] = await Promise.all([
    readAll(memberSchema, (from, to) => client.from('schedule_share_members').select('id, group_id, tournament_id, fecha_id, status, applied_metadata, applied_version, updated_at').eq('group_id', id).order('id').range(from, to)),
    readAll(itemSchema, (from, to) => client.from('schedule_share_items').select('id, group_id, item_key, content, deleted, version').eq('group_id', id).order('id').range(from, to)),
  ])
  // RLS already filters members; scope is a second explicit resource check.
  const tournaments = new Map(scope.tournaments.map(tournament => [tournament.id, tournament]))
  const visibleMembers = members.filter(member => member.tournament_id && tournaments.has(member.tournament_id))
  const fechaIds = visibleMembers.flatMap(member => member.fecha_id ? [member.fecha_id] : [])
  if (visibleMembers.length === 0) return null
  const [fechas, slots, targets] = await Promise.all([
    fechaIds.length ? readAll(fechaSchema, (from, to) => client.from('tournament_fechas').select('id, tournament_id, fecha_number, name, description, start_date, end_date, round_type, bracket_key').in('id', fechaIds).order('id').range(from, to)) : [],
    fechaIds.length ? readAll(slotSchema, (from, to) => client.from('tournament_time_slots').select('id, fecha_id, date, start_time, end_time, court_name, max_matches, description, is_available, slot_type, is_system').in('fecha_id', fechaIds).order('id').range(from, to)) : [],
    readAll(targetSchema, (from, to) => client.from('schedule_share_item_targets').select('id, member_id, item_id, slot_id, status, applied_content, applied_item_content, applied_version').in('member_id', visibleMembers.map(member => member.id)).order('id').range(from, to)),
  ])
  const copies = visibleMembers.map(member => {
    const fecha = fechas.find(candidate => candidate.id === member.fecha_id)
    return { ...member, tournament: tournaments.get(member.tournament_id!)!, fecha: fecha ?? null,
      differences: compareScheduleMember(group, items, {
        status: fecha ? member.status : 'deleted', applied_metadata: member.applied_metadata, current_metadata: fecha ?? member.applied_metadata,
        slots: slots.filter(slot => slot.fecha_id === member.fecha_id),
        targets: targets.filter(target => target.member_id === member.id).map(target => ({ ...target, applied: target.applied_content, applied_shared: target.applied_item_content })),
      }),
    }
  })
  return { group, items, copies, appliedCount: copies.filter(copy => copy.status === 'active' && copy.fecha).length }
}

export type ScheduleWorkspaceData = Awaited<ReturnType<typeof listScheduleWorkspace>>
export type ScheduleGroupDetail = NonNullable<Awaited<ReturnType<typeof getScheduleGroupDetail>>>
