import type { SupabaseClient } from '@supabase/supabase-js'
import { isCurrentPlayerTimeSlot } from './player-panel-agenda.shared'

type Slot = { id: string; fecha_id: string; slot_type: string; date: string; end_time: string; is_system: boolean | null }
type AvailabilityResponse = { couple_id: string; time_slot_id: string; is_available: boolean }

export const loadPlayerPanelAvailability = async (
  supabase: Pick<SupabaseClient, 'from'>, fechaIds: string[], coupleIds: string[], now: Date,
) => {
  const slotsByFecha = new Map<string, { playableIds: string[]; freeDateIds: string[]; hasPublishedSlots: boolean }>()
  const responsesByCouple = new Map<string, Map<string, boolean>>()

  if (fechaIds.length && coupleIds.length) {
    const { data, error } = await supabase.from('tournament_time_slots')
      .select('id, fecha_id, slot_type, date, end_time, is_system').in('fecha_id', fechaIds).eq('is_available', true)
    if (error) throw error
    for (const slot of (data ?? []) as Slot[]) {
      const group = slotsByFecha.get(slot.fecha_id) ?? { playableIds: [], freeDateIds: [], hasPublishedSlots: false }
      if (slot.slot_type === 'TIME_RANGE' && !slot.is_system) {
        group.hasPublishedSlots = true
        if (isCurrentPlayerTimeSlot(slot, now)) group.playableIds.push(slot.id)
      }
      if (slot.slot_type === 'FREE_DATE') group.freeDateIds.push(slot.id)
      slotsByFecha.set(slot.fecha_id, group)
    }

    const relevantSlotIds = Array.from(slotsByFecha.values()).flatMap(group => [...group.playableIds, ...group.freeDateIds])
    if (relevantSlotIds.length) {
      const { data: responses, error: responseError } = await supabase.from('couple_time_availability')
        .select('couple_id, time_slot_id, is_available').in('couple_id', coupleIds).in('time_slot_id', relevantSlotIds)
      if (responseError) throw responseError
      for (const response of (responses ?? []) as AvailabilityResponse[]) {
        const group = responsesByCouple.get(response.couple_id) ?? new Map<string, boolean>()
        group.set(response.time_slot_id, response.is_available)
        responsesByCouple.set(response.couple_id, group)
      }
    }
  }

  return (fechaId: string, coupleId: string) => {
    const slots = slotsByFecha.get(fechaId)
    const playableSlotIds = slots?.playableIds ?? []
    const responses = responsesByCouple.get(coupleId)
    return {
      playableSlotIds,
      hasPublishedSlots: slots?.hasPublishedSlots ?? false,
      respondedPlayableSlotIds: playableSlotIds.filter(id => responses?.has(id)),
      freeDateSelected: slots?.freeDateIds.some(id => responses?.get(id) === true) ?? false,
    }
  }
}
