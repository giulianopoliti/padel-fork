import { compareScheduleMember } from '../differences'
import type { ScheduleMemberSnapshot, ScheduleMetadata, ScheduleSharedItem, ScheduleSlotContent } from '../types'

const metadata: ScheduleMetadata = { name: 'Fecha 1', description: null, start_date: '2026-11-06', end_date: '2026-11-08' }
const content: ScheduleSlotContent = {
  date: '2026-11-06', start_time: '08:00:00', end_time: '15:00:00', court_name: null,
  description: null, max_matches: 3, is_available: true,
}
const item: ScheduleSharedItem = { id: 'item', content, deleted: false }
const member = (patch: Partial<ScheduleMemberSnapshot> = {}): ScheduleMemberSnapshot => ({
  status: 'active', applied_metadata: metadata, current_metadata: metadata,
  targets: [{ item_id: 'item', status: 'active', slot_id: 'physical', applied: content }],
  slots: [{ ...content, id: 'physical' }], ...patch,
})

describe('three-way schedule differences', () => {
  it('does not mistake an explicitly remapped destination court for a new common change', () => {
    const copy = member()
    const physical = { ...content, court_name: 'Central local' }
    const result = compareScheduleMember(metadata, [item], { ...copy,
      slots: [{ ...physical, id: 'physical' }], targets: [{ ...copy.targets[0], applied: physical, applied_shared: content }],
    })
    expect(result.state).toBe('COMPLETE')
  })
  it('reports complete when the current copy and common configuration match the applied snapshots', () => {
    expect(compareScheduleMember(metadata, [item], member()).state).toBe('COMPLETE')
  })
  it('detects a local edit from an old form without relying on version counters', () => {
    const result = compareScheduleMember(metadata, [item], member({ slots: [{ ...content, id: 'physical', max_matches: 5 }] }))
    expect(result.state).toBe('LOCAL_CHANGES')
    expect(result.items[0]).toMatchObject({ locally_changed: true, shared_changed: false, can_complete_missing: false })
  })
  it('detects a newer common configuration without changing an unselected copy', () => {
    const result = compareScheduleMember(metadata, [{ ...item, content: { ...content, description: 'Nuevo texto' } }], member())
    expect(result.state).toBe('SHARED_CHANGES')
    expect(result.items[0].shared_changed).toBe(true)
  })
  it('retains both sides of a concurrent local/common difference for review', () => {
    const result = compareScheduleMember(metadata, [{ ...item, content: { ...content, end_time: '16:00' } }], member({
      slots: [{ ...content, id: 'physical', end_time: '17:00' }],
    }))
    expect(result.items[0]).toMatchObject({ locally_changed: true, shared_changed: true, can_complete_missing: false })
  })
  it('detects missing distribution identities regardless of equal row counts', () => {
    const result = compareScheduleMember(metadata, [item], member({ targets: [], slots: [{ ...content, id: 'manual' }] }))
    expect(result.state).toBe('MISSING_SLOTS')
    expect(result.items[0].can_complete_missing).toBe(true)
    expect(result.local_slot_ids).toEqual(['manual'])
  })
  it.each(['deleted', 'unlinked'] as const)('never restores deliberately %s targets', status => {
    const copy = member()
    const result = compareScheduleMember(metadata, [item], member({ targets: [{ ...copy.targets[0], status }] }))
    expect(result.state).toBe('UNLINKED')
    expect(result.items[0].can_complete_missing).toBe(false)
  })
  it('requires review of a disappeared physical row instead of blindly recreating it', () => {
    const result = compareScheduleMember(metadata, [item], member({ slots: [] }))
    expect(result.state).toBe('LOCAL_CHANGES')
    expect(result.items[0].can_complete_missing).toBe(false)
  })
  it('does not include FREE_DATE/system rows in local extras or playable coverage', () => {
    const copy = member()
    const result = compareScheduleMember(metadata, [item], { ...copy, slots: [
      ...copy.slots, { ...content, id: 'free', slot_type: 'FREE_DATE' }, { ...content, id: 'system', is_system: true },
    ] })
    expect(result.state).toBe('COMPLETE')
    expect(result.local_slot_ids).toEqual([])
  })
  it('tracks extra local ranges without deleting them or considering them shared', () => {
    const copy = member()
    const result = compareScheduleMember(metadata, [item], { ...copy, slots: [...copy.slots, { ...content, id: 'local-extra', date: '2026-11-07' }] })
    expect(result.local_slot_ids).toEqual(['local-extra'])
    expect(result.state).toBe('COMPLETE')
  })
  it('compares metadata independently from slots', () => {
    expect(compareScheduleMember(metadata, [item], member({ current_metadata: { ...metadata, name: 'Local' } })).metadata.locally_changed).toBe(true)
    expect(compareScheduleMember({ ...metadata, description: 'Común' }, [item], member()).metadata.shared_changed).toBe(true)
  })
  it('ignores tombstones never applied and marks applied tombstones as shared changes', () => {
    expect(compareScheduleMember(metadata, [{ ...item, id: 'new-deleted', deleted: true }, item], member()).state).toBe('COMPLETE')
    expect(compareScheduleMember(metadata, [{ ...item, deleted: true }], member()).state).toBe('SHARED_CHANGES')
  })
  it('returns no copy details for an explicitly unlinked member', () => {
    expect(compareScheduleMember(metadata, [item], member({ status: 'unlinked' }))).toEqual({
      state: 'UNLINKED', metadata: { locally_changed: false, shared_changed: false }, items: [], local_slot_ids: [],
    })
  })
})
