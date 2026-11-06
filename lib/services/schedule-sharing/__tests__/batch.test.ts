import { buildScheduleBatchPreview, scheduleBatchSchema, type SchedulePreviewFecha, type SchedulePreviewTournament } from '../batch'
import type { SchedulePermissionScope } from '../permissions'
import type { ScheduleBatchDraft, ScheduleSlotContent } from '../types'

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const scope: SchedulePermissionScope = { user_id: id(1), role: 'CLUB', owned_club_ids: [id(2), id(3)], active_organization_ids: [] }
const tournament: SchedulePreviewTournament = {
  id: id(4), name: 'Caballito 4ta', club_id: id(2), organization_id: null,
  type: 'LONG', status: 'NOT_STARTED', format_config: {}, round_options: [{ round_type: 'ZONE', bracket_key: 'MAIN' }],
}
const slot: ScheduleSlotContent = { date: '2026-11-06', start_time: '08:00:00', end_time: '15:00:00', court_name: '1', max_matches: 4, description: null, is_available: true }
const draft = (): ScheduleBatchDraft => ({
  operation_key: id(5), source_fecha_id: null,
  metadata: { name: 'Primera fecha', description: null, start_date: '2026-11-06', end_date: '2026-11-08' },
  slots: [{ ...slot, key: 'morning' }],
  destinations: [{ tournament_id: tournament.id, fecha: { kind: 'create' }, round_type: 'ZONE', bracket_key: 'MAIN',
    estimated_match_duration_minutes: 90, max_matches_per_couple: null, court_choice: 'preserve' }],
})
const fecha = (patch: Partial<SchedulePreviewFecha> = {}): SchedulePreviewFecha => ({
  ...draft().metadata, id: id(6), tournament_id: tournament.id, fecha_number: 8,
  round_type: 'ZONE', bracket_key: 'MAIN', estimated_match_duration_minutes: 90, max_matches_per_couple: null, active_group_id: null, slots: [], ...patch,
})
const preview = (input = draft(), tournaments = [tournament], fechas: SchedulePreviewFecha[] = []) =>
  buildScheduleBatchPreview(input, scope, tournaments, fechas, '2026-11-05')

describe('schedule batch preview', () => {
  it('creates from the general panel with no source and a single expandable destination', () => {
    const result = preview()
    expect(result.can_commit).toBe(true)
    expect(result.physical_slots_to_create).toBe(1)
    expect(result.destinations[0]).toMatchObject({ fecha_id: null, fecha_number: 1, transition_to_zone_phase: true })
  })
  it('supports date-only creation', () => {
    expect(preview({ ...draft(), slots: [] })).toMatchObject({ can_commit: true, physical_slots_to_create: 0 })
  })
  it('calculates max(number)+1 rather than relying on count or assuming unique numbering', () => {
    expect(preview(draft(), [tournament], [fecha(), fecha({ id: id(7), fecha_number: 8 })]).destinations[0].fecha_number).toBe(9)
  })
  it('authorizes every destination before returning any names or coverage', () => {
    expect(() => preview(draft(), [{ ...tournament, club_id: id(999) }])).toThrow('permisos')
    expect(() => preview({ ...draft(), source_fecha_id: id(999) })).toThrow('origen')
  })
  it('checks every round and every destination while preserving the entire selection on conflict', () => {
    const input = draft()
    input.destinations.push({ ...input.destinations[0], tournament_id: id(7) })
    const result = preview(input, [tournament, { ...tournament, id: id(7), status: 'COMPLETED' }])
    expect(result.can_commit).toBe(false)
    expect(result.destinations).toHaveLength(2)
    expect(result.destinations[1].conflicts[0].code).toBe('INELIGIBLE')
    input.destinations[0].round_type = 'FINAL'
    expect(preview(input, [tournament, { ...tournament, id: id(7) }]).destinations[0].conflicts[0].code).toBe('INCOMPATIBLE_ROUND')
  })
  it('adopts a manually selected fecha and equivalent slot preserving their IDs', () => {
    const input = draft()
    input.destinations[0].fecha = { kind: 'adopt', fecha_id: id(6) }
    const result = preview(input, [tournament], [fecha({ slots: [{ ...slot, id: id(8) }] })])
    expect(result.can_commit).toBe(true)
    expect(result.physical_slots_to_create).toBe(0)
    expect(result.physical_slots_to_reuse).toBe(1)
    expect(result.destinations[0].reused_slots).toEqual([{ key: 'morning', slot_id: id(8) }])
    expect(result.destinations[0].transition_to_zone_phase).toBe(false)
  })
  it('does not implicitly adopt a date with a matching name or period', () => {
    expect(preview(draft(), [tournament], [fecha()]).destinations[0].fecha_id).toBeNull()
  })
  it('requires explicit resolution of ambiguous physical equivalents', () => {
    const input = draft()
    input.destinations[0].fecha = { kind: 'adopt', fecha_id: id(6) }
    const candidate = fecha({ slots: [{ ...slot, id: id(8) }, { ...slot, id: id(9) }] })
    expect(preview(input, [tournament], [candidate]).destinations[0].conflicts[0].code).toBe('AMBIGUOUS_SLOT')
    input.destinations[0].slot_adoptions = { morning: id(9) }
    expect(preview(input, [tournament], [candidate]).destinations[0].reused_slots).toEqual([{ key: 'morning', slot_id: id(9) }])
    input.destinations[0].slot_adoptions.morning = id(999)
    expect(preview(input, [tournament], [candidate]).can_commit).toBe(false)
  })
  it('preserves local content instead of overwriting equivalent manual slots', () => {
    const input = draft()
    input.destinations[0].fecha = { kind: 'adopt', fecha_id: id(6) }
    const result = preview(input, [tournament], [fecha({ slots: [{ ...slot, max_matches: 7, id: id(8) }] })])
    expect(result.destinations[0].conflicts[0].code).toBe('LOCAL_SLOT_DIFFERENCE')
    expect(result.physical_slots_to_create).toBe(0)
  })
  it('validates the explicit date belongs to the target, has compatible period and is not already linked', () => {
    const input = draft()
    input.destinations[0].fecha = { kind: 'adopt', fecha_id: id(6) }
    expect(preview(input, [tournament], [fecha({ tournament_id: id(999) })]).can_commit).toBe(false)
    expect(preview(input, [tournament], [fecha({ end_date: null })]).can_commit).toBe(false)
    expect(preview(input, [tournament], [fecha({ estimated_match_duration_minutes: 75 })]).can_commit).toBe(false)
    expect(preview(input, [tournament], [fecha({ active_group_id: id(12) })]).destinations[0].conflicts[0].code).toBe('ALREADY_SHARED')
  })
  it('detects overlaps introduced when cross-club court labels are cleared', () => {
    const input = draft()
    input.slots.push({ ...input.slots[0], key: 'other', court_name: '2' })
    input.destinations[0].court_choice = 'clear'
    expect(preview(input).can_commit).toBe(false)
  })
  it('requires a decision for every court when remapping labels', () => {
    const input = draft()
    input.destinations[0].court_choice = { rename: {} }
    expect(preview(input).can_commit).toBe(false)
    input.destinations[0].court_choice.rename = { morning: 'Central' }
    expect(preview(input).destinations[0].new_slots[0].court_name).toBe('Central')
  })
  it('rejects system slots, duplicate destinations and malformed payloads at the runtime boundary', () => {
    const input = draft()
    expect(scheduleBatchSchema.safeParse({ ...input, slots: [{ ...input.slots[0], slot_type: 'FREE_DATE' }] }).success).toBe(false)
    expect(scheduleBatchSchema.safeParse({ ...input, destinations: [...input.destinations, ...input.destinations] }).success).toBe(false)
    expect(scheduleBatchSchema.safeParse({ ...input, metadata: { ...input.metadata, name: ' ' } }).success).toBe(false)
    expect(scheduleBatchSchema.safeParse({ ...input, tenant_id: id(22) }).success).toBe(false)
  })
  it('bounds projected physical writes and rejects obsolete manual-slot selections', () => {
    const input = draft()
    input.destinations[0].slot_adoptions = { removed: id(8) }
    expect(scheduleBatchSchema.safeParse(input).success).toBe(false)
    delete input.destinations[0].slot_adoptions
    input.destinations = Array.from({ length: 30 }, (_, index) => ({ ...input.destinations[0], tournament_id: id(30 + index) }))
    input.slots = Array.from({ length: 29 }, (_, index) => ({ ...input.slots[0], key: `slot-${index}` }))
    expect(scheduleBatchSchema.safeParse(input).success).toBe(false)
  })
})
