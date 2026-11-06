import type {
  ScheduleDistributionState, ScheduleMemberSnapshot, ScheduleMetadata, ScheduleSharedItem,
  ScheduleSlotContent, ScheduleSlotTargetSnapshot,
} from './types'
import { getScheduleSlotFingerprint, isPlayableScheduleSlot, normalizeScheduleSlot } from './validation'

export interface ScheduleItemDifference {
  item_id: string
  state: ScheduleDistributionState
  locally_changed: boolean
  shared_changed: boolean
  /** Only absent active items are eligible; explicit removals are never restored. */
  can_complete_missing: boolean
}

export interface ScheduleMemberDifferences {
  state: ScheduleDistributionState
  metadata: { locally_changed: boolean; shared_changed: boolean }
  items: ScheduleItemDifference[]
  local_slot_ids: string[]
}

const metadataFingerprint = (metadata: ScheduleMetadata): string => JSON.stringify([
  metadata.name.trim(), metadata.description?.trim() || null, metadata.start_date, metadata.end_date,
])

const sameContent = (left: ScheduleSlotContent, right: ScheduleSlotContent): boolean =>
  getScheduleSlotFingerprint(left) === getScheduleSlotFingerprint(right)

const compareItem = (
  item: ScheduleSharedItem | undefined,
  target: ScheduleSlotTargetSnapshot | undefined,
  member: ScheduleMemberSnapshot,
): ScheduleItemDifference => {
  const itemId = item?.id ?? target!.item_id
  if (target && target.status !== 'active') {
    return { item_id: itemId, state: 'UNLINKED', locally_changed: false, shared_changed: false, can_complete_missing: false }
  }
  if (!target) {
    return { item_id: itemId, state: item?.deleted ? 'UNLINKED' : 'MISSING_SLOTS', locally_changed: false, shared_changed: false, can_complete_missing: !item?.deleted }
  }
  const current = member.slots.find(slot => slot.id === target.slot_id && isPlayableScheduleSlot(slot))
  const normalized = current ? normalizeScheduleSlot(current, true) : null
  const locallyChanged = !normalized?.ok || !sameContent(normalized.data, target.applied)
  const sharedChanged = !item || item.deleted || !sameContent(item.content, target.applied_shared ?? target.applied)
  // An unexpected missing physical row needs review, rather than blind recreation.
  return { item_id: itemId, state: locallyChanged ? 'LOCAL_CHANGES' : sharedChanged ? 'SHARED_CHANGES' : 'COMPLETE',
    locally_changed: locallyChanged, shared_changed: sharedChanged, can_complete_missing: false }
}

/** Pure three-way comparison: current copy, applied snapshot, latest common data. */
export const compareScheduleMember = (
  metadata: ScheduleMetadata,
  sharedItems: readonly ScheduleSharedItem[],
  member: ScheduleMemberSnapshot,
): ScheduleMemberDifferences => {
  if (member.status !== 'active') return { state: 'UNLINKED', metadata: { locally_changed: false, shared_changed: false }, items: [], local_slot_ids: [] }
  const appliedMetadata = metadataFingerprint(member.applied_metadata)
  const locallyChanged = metadataFingerprint(member.current_metadata) !== appliedMetadata
  const sharedChanged = metadataFingerprint(metadata) !== appliedMetadata
  const itemMap = new Map(sharedItems.map(item => [item.id, item]))
  const targetMap = new Map(member.targets.map(target => [target.item_id, target]))
  const itemIds = new Set([...sharedItems.filter(item => !item.deleted).map(item => item.id), ...targetMap.keys()])
  const items = [...itemIds].map(id => compareItem(itemMap.get(id), targetMap.get(id), member))
  const targetSlotIds = new Set(member.targets.map(target => target.slot_id))
  const localSlotIds = member.slots.filter(slot => isPlayableScheduleSlot(slot) && !targetSlotIds.has(slot.id)).map(slot => slot.id)
  const state: ScheduleDistributionState = locallyChanged || items.some(item => item.state === 'LOCAL_CHANGES')
    ? 'LOCAL_CHANGES' : sharedChanged || items.some(item => item.state === 'SHARED_CHANGES')
      ? 'SHARED_CHANGES' : items.some(item => item.state === 'MISSING_SLOTS')
        ? 'MISSING_SLOTS' : items.some(item => item.state === 'UNLINKED') ? 'UNLINKED' : 'COMPLETE'
  return { state, metadata: { locally_changed: locallyChanged, shared_changed: sharedChanged }, items, local_slot_ids: localSlotIds }
}
