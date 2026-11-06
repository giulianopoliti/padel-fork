import { getScheduleMutationBlocker, isMatchDependentOnScheduleSlot, type ScheduleMatchDependency } from '../dependencies'
import type { StoredScheduleSlot } from '../types'

const slot: StoredScheduleSlot = { id: 'slot', date: '2026-11-06', start_time: '08:00', end_time: '15:00', court_name: '1', max_matches: 4 }
const match = (patch: Partial<ScheduleMatchDependency> = {}): ScheduleMatchDependency => ({
  scheduled_time_slot_id: null, scheduled_date: slot.date, scheduled_start_time: '10:00', scheduled_end_time: '11:30', court_assignment: '1', ...patch,
})

describe('schedule dependency protection', () => {
  it('protects every answer, including unavailable=false and notes', () => {
    expect(getScheduleMutationBlocker(slot, { ...slot, start_time: '09:00' }, { availability_count: 1, matches: [] })).toContain('respuestas')
    expect(getScheduleMutationBlocker(slot, null, { availability_count: 1, matches: [] })).toContain('respuestas')
  })
  it('allows compatible text changes without invalidating answers or matches', () => {
    expect(getScheduleMutationBlocker(slot, { ...slot, description: 'Nuevo texto', start_time: '08:00:00', court_name: ' 1 ' }, { availability_count: 8, matches: [match()] })).toBeNull()
  })
  it('protects direct references regardless of date or court metadata', () => {
    expect(isMatchDependentOnScheduleSlot(slot, match({ scheduled_time_slot_id: slot.id, scheduled_date: null, court_assignment: null }))).toBe(true)
  })
  it('protects concrete programming even without a time-slot reference', () => {
    expect(getScheduleMutationBlocker(slot, null, { availability_count: 0, matches: [match()] })).toContain('Reprogramalos')
    expect(getScheduleMutationBlocker(slot, { ...slot, court_name: '2' }, { availability_count: 0, matches: [match()] })).toContain('Reprogramalos')
  })
  it('distinguishes separate courts, dates and contiguous match boundaries', () => {
    expect(isMatchDependentOnScheduleSlot(slot, match({ court_assignment: '2' }))).toBe(false)
    expect(isMatchDependentOnScheduleSlot(slot, match({ scheduled_date: '2026-11-07' }))).toBe(false)
    expect(isMatchDependentOnScheduleSlot(slot, match({ scheduled_start_time: '15:00', scheduled_end_time: '16:30' }))).toBe(false)
    expect(isMatchDependentOnScheduleSlot(slot, match({ scheduled_start_time: '06:30', scheduled_end_time: '08:00' }))).toBe(false)
  })
  it('treats missing court/time data conservatively', () => {
    expect(isMatchDependentOnScheduleSlot(slot, match({ court_assignment: null }))).toBe(true)
    expect(isMatchDependentOnScheduleSlot(slot, match({ scheduled_start_time: null }))).toBe(true)
    expect(isMatchDependentOnScheduleSlot(slot, match({ scheduled_end_time: null }))).toBe(true)
    expect(isMatchDependentOnScheduleSlot({ ...slot, court_name: null }, match({ court_assignment: '2' }))).toBe(true)
  })
  it('never edits or deletes FREE_DATE/system slots', () => {
    expect(getScheduleMutationBlocker({ ...slot, slot_type: 'FREE_DATE' }, null, { availability_count: 0, matches: [] })).toContain('sistema')
    expect(getScheduleMutationBlocker({ ...slot, is_system: true }, slot, { availability_count: 0, matches: [] })).toContain('sistema')
  })
  it('permits unreferenced mutations but blocks reducing capacity with scheduled matches', () => {
    expect(getScheduleMutationBlocker(slot, null, { availability_count: 0, matches: [] })).toBeNull()
    expect(getScheduleMutationBlocker(slot, { ...slot, max_matches: 1 }, { availability_count: 0, matches: [match()] })).toContain('capacidad')
  })
})
