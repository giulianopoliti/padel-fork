import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { resolveFechaBracketKeyForTournament } from '@/lib/services/fecha-bracket-policy'
import { MAX_SCHEDULE_BATCH_TARGETS } from './batch'
import { readAllScheduleRows } from './reader'
import { requireScheduleSharing, scheduleMetadataSchema } from './rpc'
import { getScheduleWorkspaceScope, type ScheduleWorkspaceScope } from './scope'
import { getArgentinaToday, isPlayableScheduleSlot } from './validation'

const round = z.enum(['ZONE', '32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL'])
const cup = z.enum(['MAIN', 'GOLD', 'SILVER'])
const roundSchema = z.object({ tournament_id: z.string().uuid(), round_type: round, bracket_key: cup })
const fechaSchema = scheduleMetadataSchema.extend({
  id: z.string().uuid(), tournament_id: z.string().uuid(), fecha_number: z.number().int(),
  round_type: round, bracket_key: cup, estimated_match_duration_minutes: z.union([z.literal(60), z.literal(75), z.literal(90)]),
  max_matches_per_couple: z.number().int().positive().nullable(),
})
const linkSchema = z.object({ fecha_id: z.string().uuid(), group_id: z.string().uuid() })
const sourceSlotSchema = z.object({
  id: z.string().uuid(), date: z.string(), start_time: z.string(), end_time: z.string(),
  court_name: z.string().nullable(), max_matches: z.number().int(), description: z.string().nullable(),
  is_available: z.boolean(), slot_type: z.enum(['TIME_RANGE', 'FREE_DATE']), is_system: z.boolean(),
})

export const getScheduleDestinationOptions = async (input: unknown) => {
  const ids = z.array(z.string().uuid()).min(1).max(MAX_SCHEDULE_BATCH_TARGETS).parse(input)
  await requireScheduleSharing()
  const scope = await getScheduleWorkspaceScope()
  const tournaments = scope.tournaments.filter(tournament => tournament.eligible && ids.includes(tournament.id))
  if (tournaments.length !== new Set(ids).size) throw new Error('Alguno de los torneos elegidos ya no está disponible.')
  const client = await createClient()
  const [roundsResult, fechas, links] = await Promise.all([
    client.rpc('schedule_available_rounds', { tournament_ids: ids }),
    readAllScheduleRows(fechaSchema, (from, to) => client.from('tournament_fechas')
      .select('id,tournament_id,fecha_number,name,description,start_date,end_date,round_type,bracket_key,estimated_match_duration_minutes,max_matches_per_couple')
      .in('tournament_id', ids).order('fecha_number').order('id').range(from, to)),
    readAllScheduleRows(linkSchema, (from, to) => client.from('schedule_share_members').select('fecha_id,group_id')
      .in('tournament_id', ids).eq('status', 'active').not('fecha_id', 'is', null).order('id').range(from, to)),
  ])
  if (roundsResult.error) throw new Error('No se pudieron consultar las rondas de los torneos.')
  const rounds = z.array(roundSchema).parse(roundsResult.data)
  const linked = new Set(links.map(link => link.fecha_id))
  return tournaments.map(tournament => ({
    tournament_id: tournament.id,
    rounds: [
      { round_type: 'ZONE' as const, bracket_key: 'MAIN' as const },
      ...rounds.filter(option => option.tournament_id === tournament.id && resolveFechaBracketKeyForTournament(tournament, {
        roundType: option.round_type, requestedBracketKey: option.bracket_key,
      }).ok).map(({ round_type, bracket_key }) => ({ round_type, bracket_key })),
    ],
    fechas: fechas.filter(fecha => fecha.tournament_id === tournament.id && !linked.has(fecha.id)),
  }))
}

export const getScheduleCreationSource = async (id: string, scope: ScheduleWorkspaceScope) => {
  const client = await createClient()
  const result = await client.from('tournament_fechas')
    .select('id,tournament_id,fecha_number,name,description,start_date,end_date,round_type,bracket_key,estimated_match_duration_minutes,max_matches_per_couple')
    .eq('id', z.string().uuid().parse(id)).maybeSingle()
  if (result.error) throw new Error('No se pudo consultar la fecha.')
  if (!result.data) return null
  const fecha = fechaSchema.parse(result.data)
  if (!scope.tournaments.some(tournament => tournament.id === fecha.tournament_id && tournament.eligible)) return null
  const [slots, link] = await Promise.all([
    readAllScheduleRows(sourceSlotSchema, (from, to) => client.from('tournament_time_slots')
      .select('id,date,start_time,end_time,court_name,max_matches,description,is_available,slot_type,is_system')
      .eq('fecha_id', fecha.id).eq('slot_type', 'TIME_RANGE').eq('is_system', false).order('date').order('start_time').order('id').range(from, to)),
    client.from('schedule_share_members').select('group_id').eq('fecha_id', fecha.id).eq('status', 'active').maybeSingle(),
  ])
  if (link.error) throw new Error('No se pudo consultar el vínculo de la fecha.')
  const playable = slots.filter(isPlayableScheduleSlot)
  const today = getArgentinaToday()
  return {
    fecha,
    groupId: link.data ? z.string().uuid().parse(link.data.group_id) : null,
    pastCount: playable.filter(slot => slot.date < today).length,
    slots: playable.filter(slot => slot.date >= today).map(({ id, slot_type, is_system, ...slot }) => ({ ...slot, key: id })),
  }
}

export type ScheduleDestinationOptions = Awaited<ReturnType<typeof getScheduleDestinationOptions>>
export type ScheduleCreationSource = NonNullable<Awaited<ReturnType<typeof getScheduleCreationSource>>>
