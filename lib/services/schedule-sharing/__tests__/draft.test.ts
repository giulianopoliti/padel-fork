import { applyScheduleDraftOperation, moveScheduleSlot, splitScheduleSlot } from '../draft'
import type { ScheduleDraftSlot } from '../types'
import { localTimeToSeconds } from '../validation'

const morning: ScheduleDraftSlot = {
  key: 'morning', date: '2026-11-06', start_time: '08:07', end_time: '15:13',
  court_name: '1', max_matches: 4, description: 'Texto', is_available: false,
}
const options = { today: '2026-11-05' }

describe('schedule draft operations', () => {
  it('splits at any valid minute while exactly preserving coverage and metadata', () => {
    const result = splitScheduleSlot(morning, '12:11', 'noon')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [first, second] = result.data
    expect(first.start_time).toBe('08:07:00')
    expect(first.end_time).toBe(second.start_time)
    expect(second.end_time).toBe('15:13:00')
    expect(first.key).toBe('morning')
    expect(second.key).toBe('noon')
    for (const part of result.data) expect(part).toMatchObject({ max_matches: 4, is_available: false, court_name: '1', description: 'Texto' })
    const duration = (slot: ScheduleDraftSlot): number => localTimeToSeconds(slot.end_time) - localTimeToSeconds(slot.start_time)
    expect(duration(first) + duration(second)).toBe(duration(morning))
  })
  it.each(['08:07', '15:13', '07:00', '24:00', 'bad'])('rejects splitting at %s', at => {
    expect(splitScheduleSlot(morning, at, 'noon').ok).toBe(false)
  })
  it('moves by a precise number of minutes without reducing capacity', () => {
    const result = moveScheduleSlot(morning, 7)
    expect(result.ok && result.data).toMatchObject({ start_time: '08:14:00', end_time: '15:20:00', max_matches: 4 })
    expect(morning.start_time).toBe('08:07')
    expect(moveScheduleSlot(morning, -500).ok).toBe(false)
    expect(moveScheduleSlot(morning, 0.5).ok).toBe(false)
    expect(moveScheduleSlot(morning, 600).ok).toBe(false)
  })
  it('copies a day to deduplicated target days without copying source identities', () => {
    let id = 0
    const result = applyScheduleDraftOperation([morning], {
      type: 'copy-day', sourceDate: morning.date, targetDates: [morning.date, '2026-11-07', '2026-11-07', '2026-11-08'], mode: 'add',
    }, options, () => `copy-${++id}`)
    expect(result.ok && result.data.map(slot => [slot.key, slot.date, slot.max_matches])).toEqual([
      ['morning', '2026-11-06', 4], ['copy-1', '2026-11-07', 4], ['copy-2', '2026-11-08', 4],
    ])
  })
  it('keeps pauses and unrelated days when replacing a draft day', () => {
    const night = { ...morning, key: 'night', start_time: '18:00', end_time: '22:00' }
    const old = { ...morning, key: 'old', date: '2026-11-07' }
    const unrelated = { ...morning, key: 'other', date: '2026-11-09' }
    let id = 0
    const result = applyScheduleDraftOperation([morning, night, old, unrelated], {
      type: 'copy-day', sourceDate: morning.date, targetDates: ['2026-11-07'], mode: 'replace',
    }, options, () => `copy-${++id}`)
    expect(result.ok && result.data.map(slot => slot.key)).toEqual(['morning', 'night', 'other', 'copy-1', 'copy-2'])
    expect(old.key).toBe('old')
  })
  it('fails atomically when add-copy conflicts and leaves the original array intact', () => {
    const original = [morning, { ...morning, key: 'old', date: '2026-11-07' }]
    const snapshot = JSON.stringify(original)
    const result = applyScheduleDraftOperation(original, {
      type: 'copy-day', sourceDate: morning.date, targetDates: ['2026-11-07'], mode: 'add',
    }, options, () => 'copy')
    expect(result.ok).toBe(false)
    expect(JSON.stringify(original)).toBe(snapshot)
  })
  it('never treats replacing memory as permission to remove a saved conflicting row', () => {
    const result = applyScheduleDraftOperation([morning], {
      type: 'copy-day', sourceDate: morning.date, targetDates: ['2026-11-07'], mode: 'replace',
    }, { ...options, existingSlots: [{ ...morning, date: '2026-11-07', id: 'saved' }] }, () => 'copy')
    expect(result.ok).toBe(false)
  })
  it('validates manual resizing, new rows and deletion through the same state transition', () => {
    expect(applyScheduleDraftOperation([morning], { type: 'update', key: 'morning', patch: { end_time: '08:00' } }, options).ok).toBe(false)
    expect(applyScheduleDraftOperation([], { type: 'add', slot: morning }, options).ok).toBe(true)
    expect(applyScheduleDraftOperation([morning], { type: 'remove', key: 'morning' }, options)).toEqual({ ok: true, data: [] })
    expect(applyScheduleDraftOperation([], { type: 'remove', key: 'missing' }, options).ok).toBe(false)
  })
  it('never copies or splits FREE_DATE/system data supplied as draft input', () => {
    expect(splitScheduleSlot({ ...morning, slot_type: 'FREE_DATE' }, '12:00', 'new').ok).toBe(false)
    expect(applyScheduleDraftOperation([{ ...morning, is_system: true }], {
      type: 'copy-day', sourceDate: morning.date, targetDates: ['2026-11-07'], mode: 'add',
    }, options, () => 'copy').ok).toBe(false)
  })
  it('validates each copied day against period and history', () => {
    expect(applyScheduleDraftOperation([morning], {
      type: 'copy-day', sourceDate: morning.date, targetDates: ['2026-11-04'], mode: 'add',
    }, options, () => 'copy').ok).toBe(false)
  })
})
