'use server'

import { revalidatePath } from 'next/cache'
import { commitScheduleBatch, previewScheduleBatch, unlinkScheduleMember, type ScheduleReviewedBatch, type ScheduleCommittedBatch } from '@/lib/services/schedule-sharing/rpc'
import { getScheduleDestinationOptions, type ScheduleDestinationOptions } from '@/lib/services/schedule-sharing/destinations'

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export const loadScheduleDestinationOptionsAction = async (ids: unknown): Promise<ActionResult<ScheduleDestinationOptions>> => {
  try {
    return { success: true, data: await getScheduleDestinationOptions(ids) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'No se pudieron consultar los destinos.' }
  }
}

export const previewScheduleBatchAction = async (input: unknown): Promise<ActionResult<ScheduleReviewedBatch>> => {
  try { return { success: true, data: await previewScheduleBatch(input) } }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo revisar la configuración.' } }
}

export const commitScheduleBatchAction = async (input: unknown, revision: string): Promise<ActionResult<ScheduleCommittedBatch>> => {
  try {
    const data = await commitScheduleBatch(input, revision)
    revalidatePath('/schedules')
    revalidatePath(`/schedules/${data.group_id}`)
    for (const destination of data.destinations) {
      const path = `/tournaments/${destination.tournament_id}`
      for (const suffix of ['', '/schedules', '/dates', '/schedule-management', '/match-scheduling']) revalidatePath(`${path}${suffix}`)
    }
    return { success: true, data }
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo guardar la configuración.' } }
}

export const unlinkScheduleMemberAction = async (group: string, member: string, fecha: string, updatedAt: string): Promise<ActionResult<string>> => {
  try {
    const tournament = await unlinkScheduleMember(group, member, fecha, updatedAt)
    revalidatePath('/schedules')
    revalidatePath(`/schedules/${group}`)
    revalidatePath(`/tournaments/${tournament}/schedules`)
    return { success: true, data: tournament }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'No se pudo desvincular el torneo.' }
  }
}
