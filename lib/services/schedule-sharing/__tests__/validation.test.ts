import {
  getArgentinaToday, getScheduleSlotFingerprint, getScheduleSlotIdentity, isCivilDate,
  isPlayableScheduleSlot, normalizeLocalTime, normalizeScheduleSlot, validateScheduleSlots,
} from '../validation'
import type { ScheduleDraftSlot, ScheduleSlotInput, StoredScheduleSlot } from '../types'

const slot = (patch: Partial<ScheduleDraftSlot> = {}): ScheduleDraftSlot => ({
  key: 'morning', date: '2026-11-06', start_time: '08:00', end_time: '12:00', ...patch,
})
const stored = (patch: Partial<StoredScheduleSlot> = {}): StoredScheduleSlot => ({ ...slot(), id: 'saved', ...patch })
const options = { today: '2026-11-05' }
const codes = (slots: ScheduleDraftSlot[], extra = {}): string[] => {
  const result = validateScheduleSlots(slots, { ...options, ...extra })
  return result.ok ? [] : result.issues.map(issue => issue.code)
}

describe('schedule civil dates and local times', () => {
  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '0000-01-01', '2026-11-05T00:00:00Z', '05/11/2026'])('rejects invalid date %s', value => {
    expect(isCivilDate(value)).toBe(false)
  })
  it.each(['2024-02-29', '2000-02-29', '2026-11-05'])('preserves civil date %s', value => {
    const result = normalizeScheduleSlot(slot({ date: value }))
    expect(result.ok && result.data.date).toBe(value)
  })
  it('uses Argentina today across the UTC day boundary', () => {
    expect(getArgentinaToday(new Date('2026-11-06T01:30:00Z'))).toBe('2026-11-05')
    expect(getArgentinaToday(new Date('2026-11-06T03:00:00Z'))).toBe('2026-11-06')
  })
  it('normalizes form and PostgreSQL times without discarding seconds', () => {
    expect(normalizeLocalTime('8:05')).toBe('08:05:00')
    expect(normalizeLocalTime('08:05:37')).toBe('08:05:37')
    expect(normalizeLocalTime('12:60')).toBeNull()
    expect(normalizeLocalTime('no-time')).toBeNull()
  })
  it('keeps 24:00 disabled by default and never truncates to 23:59', () => {
    expect(normalizeLocalTime('24:00')).toBeNull()
    expect(codes([slot({ end_time: '24:00' })])).toContain('INVALID_TIME')
    const result = normalizeScheduleSlot(slot({ end_time: '24:00' }), true)
    expect(result.ok && result.data.end_time).toBe('24:00:00')
    expect(normalizeLocalTime('24:01', true)).toBeNull()
    expect(normalizeScheduleSlot(slot({ start_time: '24:00', end_time: '24:00' }), true).ok).toBe(false)
  })
  it.each(['08:00', '07:59'])('rejects zero/negative range ending %s', end_time => {
    expect(codes([slot({ end_time })])).toContain('INVALID_RANGE')
  })
  it.each([0, -1, 1.5, NaN, Infinity])('rejects capacity %s', max_matches => {
    expect(codes([slot({ max_matches })])).toContain('INVALID_CAPACITY')
  })
})

describe('schedule batch validation', () => {
  it('accepts any number of contiguous ranges and pauses', () => {
    expect(codes([
      slot(), slot({ key: 'noon', start_time: '12:00', end_time: '16:00' }),
      slot({ key: 'night', start_time: '18:07', end_time: '22:03' }),
    ])).toEqual([])
    expect(codes([])).toEqual([]) // A date without time slots is valid.
  })
  it('detects overlaps within the batch even without a court', () => {
    expect(codes([slot(), slot({ key: 'second', start_time: '11:00', end_time: '15:00', court_name: '  ' })])).toContain('OVERLAP')
  })
  it('detects duplicates across PostgreSQL/form time and court formats', () => {
    const existingSlots = [stored({ start_time: '08:00:00', end_time: '12:00:00', court_name: ' Cancha   UNO ' })]
    expect(codes([slot({ court_name: 'cancha uno' })], { existingSlots })).toContain('DUPLICATE')
  })
  it('allows overlap on different courts or dates', () => {
    expect(codes([slot(), slot({ key: 'other-court', court_name: '1' }), slot({ key: 'other-date', date: '2026-11-07' })])).toEqual([])
  })
  it('does not treat availability=false as permission to overlap', () => {
    expect(codes([slot()], { existingSlots: [stored({ is_available: false })] })).toContain('DUPLICATE')
  })
  it('excludes FREE_DATE and all system rows', () => {
    expect(codes([slot()], { existingSlots: [stored({ slot_type: 'FREE_DATE' }), stored({ id: 'system', is_system: true })] })).toEqual([])
    expect(isPlayableScheduleSlot({ is_system: true, slot_type: 'TIME_RANGE' })).toBe(false)
  })
  it('rejects malformed existing rows rather than silently skipping a possible conflict', () => {
    expect(codes([slot()], { existingSlots: [stored({ end_time: 'bad' })] })).toContain('INVALID_EXISTING_SLOT')
  })
  it('validates period bounds and the period itself', () => {
    expect(codes([slot()], { period: { start_date: '2026-11-07', end_date: null } })).toContain('OUTSIDE_PERIOD')
    expect(codes([slot()], { period: { start_date: null, end_date: '2026-11-05' } })).toContain('OUTSIDE_PERIOD')
    expect(codes([], { period: { start_date: '2026-11-07', end_date: '2026-11-05' } })).toContain('INVALID_PERIOD')
    expect(codes([slot()], { period: { start_date: null, end_date: null } })).toEqual([])
  })
  it('allows text-only historical editing without creating new historical ranges', () => {
    const existingSlots = [stored({ date: '2026-11-01' })]
    const edit = slot({ key: 'saved', date: '2026-11-01', description: 'Nueva descripción' })
    expect(codes([edit], { existingSlots, editingSlotIds: ['saved'] })).toEqual([])
    expect(codes([{ ...edit, end_time: '13:00' }], { existingSlots, editingSlotIds: ['saved'] })).toContain('PAST_DATE')
    expect(codes([{ ...edit, key: 'new' }], { existingSlots })).toContain('PAST_DATE')
  })
  it('does not infer permission to replace a row merely from a matching draft key', () => {
    expect(codes([slot({ key: 'saved' })], { existingSlots: [stored()] })).toContain('DUPLICATE')
  })
  it('compares the final batch when two existing ranges are moved together', () => {
    const existingSlots = [stored(), stored({ id: 'afternoon', start_time: '13:00', end_time: '16:00' })]
    expect(codes([
      slot({ key: 'saved', start_time: '13:00', end_time: '16:00' }),
      slot({ key: 'afternoon', start_time: '08:00', end_time: '12:00' }),
    ], { existingSlots, editingSlotIds: ['saved', 'afternoon'] })).toEqual([])
  })
  it('rejects repeated draft identities', () => {
    expect(codes([slot(), slot({ date: '2026-11-07' })])).toContain('INVALID_KEY')
  })
  it('separates physical identity from content so capacity changes remain visible', () => {
    const first = normalizeScheduleSlot(slot({ max_matches: 2 }))
    const second = normalizeScheduleSlot(slot({ max_matches: 3 }))
    if (!first.ok || !second.ok) throw new Error('Invalid fixture')
    expect(getScheduleSlotIdentity(first.data)).toBe(getScheduleSlotIdentity(second.data))
    expect(getScheduleSlotFingerprint(first.data)).not.toBe(getScheduleSlotFingerprint(second.data))
  })
  it('does not mutate caller input during normalization', () => {
    const input: ScheduleSlotInput = Object.freeze({ ...slot(), court_name: ' Cancha   1 ', max_matches: 4 })
    const result = normalizeScheduleSlot(input)
    expect(result.ok && result.data.court_name).toBe('Cancha 1')
    expect(result.ok && result.data.max_matches).toBe(4)
    expect(input.court_name).toBe(' Cancha   1 ')
  })
})
