import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'
import type { ScheduleMatchDependency, ScheduleSlotDependencies } from './dependencies'

const matchSchema = z.object({
  scheduled_time_slot_id: z.string().nullable(), scheduled_date: z.string().nullable(),
  scheduled_start_time: z.string().nullable(), scheduled_end_time: z.string().nullable(),
  court_assignment: z.string().nullable(),
})

/** Invoke only after authorizing the slot's tournament. Fail closed on every read error. */
export const getScheduleSlotDependencies = async (
  supabase: Awaited<ReturnType<typeof createClient>>, slotId: string, fechaId: string,
): Promise<ScheduleSlotDependencies> => {
  const { count, error } = await supabase.from('couple_time_availability').select('id', { count: 'exact', head: true }).eq('time_slot_id', slotId)
  if (error || count === null) throw new Error('No se pudieron verificar las respuestas del horario.')
  const matches: ScheduleMatchDependency[] = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const result = await supabase.from('fecha_matches')
      .select('scheduled_time_slot_id, scheduled_date, scheduled_start_time, scheduled_end_time, court_assignment')
      .or(`fecha_id.eq.${fechaId},scheduled_time_slot_id.eq.${slotId}`)
      .order('id').range(from, from + pageSize - 1)
    if (result.error) throw new Error('No se pudieron verificar los partidos programados.')
    const rows = z.array(matchSchema).parse(result.data)
    matches.push(...rows)
    if (rows.length < pageSize) break
  }
  return { availability_count: count, matches }
}
