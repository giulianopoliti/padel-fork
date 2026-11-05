import type { AvailabilityItem, CoupleWithData, TimeSlot } from '../actions'
import { getRivalInsight, summarizeZoneMatches, type ZoneMatchSummary } from '../utils/schedulingInsights'
import { AVAILABILITY_REMINDER, getPlayerContact } from '../utils/playerContact'

const couple = (id: string, overrides: Partial<CoupleWithData> = {}): CoupleWithData => ({
  id, player1: { name: id, last_name: 'Uno' }, player2: { name: id, last_name: 'Dos' },
  zone_position: null, matches_in_fecha: 0, has_played_in_this_date: false,
  match_status: null, free_date_blocked: false, free_date_notes: null, opponent_statuses: {},
  ...overrides,
})

const match = (id: string, status: string, overrides: Partial<ZoneMatchSummary> = {}): ZoneMatchSummary => ({
  id, status, couple1_id: 'a', couple2_id: 'b', round: 'ZONE', bracket_is_active: true, ...overrides,
})

const slot: TimeSlot = { id: 'slot', start_time: '18:00:00', end_time: '21:00:00', date: '2026-11-07', court_name: null, max_matches: 1 }
const available = (coupleId: string, overrides: Partial<AvailabilityItem> = {}): AvailabilityItem => ({
  couple_id: coupleId, time_slot_id: slot.id, is_available: true, notes: null, ...overrides,
})
const availabilityMap = (...items: AvailabilityItem[]): Map<string, AvailabilityItem> =>
  new Map(items.map(item => [`${item.couple_id}:${item.time_slot_id}`, item]))

describe('zone match totals and opponent history', () => {
  it('separates finished, draft and pending matches across fechas, without counting inactive, eliminated or duplicate rows', () => {
    const summaries = summarizeZoneMatches([
      match('1', 'FINISHED'), match('2', 'COMPLETED'), match('3', 'DRAFT'), match('4', 'PENDING'),
      match('1', 'FINISHED'), match('5', 'CANCELLED'), match('6', 'FINISHED', { round: 'FINAL' }),
      match('7', 'FINISHED', { bracket_is_active: false }),
    ])
    expect(summaries.get('a')?.counts).toEqual({ played: 2, draft: 1, pending: 1 })
    expect(summaries.get('b')?.counts).toEqual({ played: 2, draft: 1, pending: 1 })
    expect(summaries.get('a')?.opponents.b).toBe('played')
    expect(summaries.get('b')?.opponents.a).toBe('played')
  })

  it('preserves a draft encounter in either couple order', () => {
    expect(summarizeZoneMatches([match('1', 'DRAFT', { couple1_id: 'b', couple2_id: 'a' })]).get('a')?.opponents.b).toBe('draft')
  })

  it('keeps in-progress matches pending until their result is finished', () => {
    const summary = summarizeZoneMatches([match('1', 'IN_PROGRESS')]).get('a')
    expect(summary?.counts).toEqual({ played: 0, draft: 0, pending: 1 })
    expect(summary?.opponents.b).toBe('pending')
  })

  it('prioritizes pending over draft and played over either regardless of row order', () => {
    const rows = [match('1', 'DRAFT'), match('2', 'PENDING')]
    expect(summarizeZoneMatches(rows).get('a')?.opponents.b).toBe('pending')
    expect(summarizeZoneMatches([...rows].reverse()).get('a')?.opponents.b).toBe('pending')
    expect(summarizeZoneMatches([match('3', 'FINISHED'), ...rows]).get('a')?.opponents.b).toBe('played')
  })
})

describe('rival highlighting', () => {
  it('allows a new rival without time slots and clearly leaves the time to coordinate', () => {
    expect(getRivalInsight(couple('a'), couple('b'), [], new Map(), 90)).toMatchObject({ tone: 'green', reason: expect.stringContaining('a coordinar') })
  })

  it('marks previous encounters red, even if a couple now has fecha libre', () => {
    expect(getRivalInsight(couple('a', { opponent_statuses: { b: 'played' } }), couple('b', { free_date_blocked: true }), [], new Map(), 90).tone).toBe('red')
  })

  it.each([
    [couple('a'), couple('b', { has_played_in_this_date: true })],
    [couple('a', { has_played_in_this_date: true }), couple('b')],
    [couple('a'), couple('b', { free_date_blocked: true })],
    [couple('a', { opponent_statuses: undefined }), couple('b')],
  ])('uses neutral colors for assigned or unconfirmed rivals, reserving yellow for drafts', (first, second) => {
    expect(getRivalInsight(first, second, [], new Map(), 90).tone).toBe('neutral')
  })

  it.each([
    ['draft', 'amber'],
    ['pending', 'blue'],
  ] as const)('distinguishes an existing %s encounter from a new rival', (status, tone) => {
    expect(getRivalInsight(couple('a', { opponent_statuses: { b: status } }), couple('b'), [], new Map(), 90).tone).toBe(tone)
  })

  it.each([
    ['DRAFT', 'amber'],
    ['PENDING', 'blue'],
  ] as const)('shows the status of a candidate already assigned to another match (%s)', (status, tone) => {
    expect(getRivalInsight(couple('a'), couple('b', { has_played_in_this_date: true, match_status: status }), [], new Map(), 90).tone).toBe(tone)
  })

  it('explains the selected-couple block without painting all new rivals as drafts', () => {
    const selected = couple('a', { has_played_in_this_date: true, match_status: 'FINISHED', opponent_statuses: { b: 'played' } })
    expect(getRivalInsight(selected, couple('b'), [], new Map(), 90).tone).toBe('red')
    expect(getRivalInsight(selected, couple('c'), [], new Map(), 90)).toMatchObject({
      tone: 'neutral', reason: 'La pareja seleccionada ya tiene un partido en esta fecha',
    })
  })

  it('highlights only shared windows long enough for the match', () => {
    const data = availabilityMap(available('a', { preferred_start_time: '19:00' }), available('b', { preferred_end_time: '20:30' }))
    expect(getRivalInsight(couple('a'), couple('b'), [slot], data, 90)).toMatchObject({ tone: 'green', commonSlotIds: ['slot'] })
    expect(getRivalInsight(couple('a'), couple('b'), [slot], data, 120).tone).toBe('neutral')
  })

  it('does not assume missing availability or pending note interpretations are confirmed', () => {
    expect(getRivalInsight(couple('a'), couple('b'), [slot], availabilityMap(available('a')), 90).tone).toBe('neutral')
    const data = availabilityMap(available('a'), available('b', { note_interpretation_status: 'PENDING_REVIEW' }))
    expect(getRivalInsight(couple('a'), couple('b'), [slot], data, 90).tone).toBe('neutral')
  })
})

describe('player WhatsApp contact', () => {
  it('normalizes the phone and preserves the exact reminder in the URL', () => {
    const contact = getPlayerContact('+54 9 11 2345-6789')
    expect(contact.phone).toBe('+5491123456789')
    const url = new URL(contact.whatsappUrl!)
    expect(url.pathname).toBe('/5491123456789')
    expect(url.searchParams.get('text')).toBe(AVAILABILITY_REMINDER)
  })

  it('keeps an invalid number copyable without generating a broken chat link', () => {
    expect(getPlayerContact(' 123 ')).toEqual({ phone: '123', whatsappUrl: null })
    expect(getPlayerContact(null)).toEqual({ phone: '', whatsappUrl: null })
  })
})
