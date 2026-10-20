import { randomUUID } from 'node:crypto'
import { buildFreeBracket } from '../americano-libre-generator'
import { freeLayout, getFreeSlot, moveFreeEntry, removeFreeEntry } from '../americano-libre-editor'
import type { FreeBracketSnapshot } from '@/types/americano-libre'
import type { FreeEditorData, FreeSlot, FreeSource } from '@/types/americano-libre-editor'

export const fixture = (count = 32): { snapshot: FreeBracketSnapshot; editor: FreeEditorData } => {
  const structure = buildFreeBracket(count)
  const snapshot: FreeBracketSnapshot = {
    tournament_id: randomUUID(), bracket_key: 'MAIN', contract_version: 1, revision: 0,
    requested_count: count, base_size: count === 16 ? 16 : 32, effective_capacity: count, assigned_count: 0,
    created_at: '2026-10-19T00:00:00Z',
    original_slots: Object.fromEntries(structure.matches.map((match) => [match.id, [match.slot1_origin, match.slot2_origin]])),
    hierarchy: structure.hierarchy,
    matches: structure.matches.map((match) => ({ ...match, couple1_id: null, couple2_id: null, seed1_id: null, seed2_id: null,
      winner_id: null, bye_processed: false, bracket_is_active: true, status: 'WAITING_OPONENT' })),
  }
  const zoneId = randomUUID()
  const editor: FreeEditorData = { guards: {}, couples: [1, 2, 3].map((position) => ({ zoneId, zoneName: 'Zona A', coupleId: randomUUID(),
    name: `Pareja ${position}`, position, wins: 0, losses: 0, gamesDifference: 0, eligible: true })) }
  return { snapshot, editor }
}
const place = (snapshot: FreeBracketSnapshot, round: string, order: number, slot: 1 | 2 = 1): FreeSlot => ({ matchId: snapshot.matches.find((match) => match.round === round && match.order_in_round === order)!.id, slot })
const zone = (editor: FreeEditorData, index = 0): FreeSource => ({ kind: 'ZONE', zoneId: editor.couples[index].zoneId, coupleId: editor.couples[index].coupleId })
const source = (slot: FreeSlot): FreeSource => ({ kind: 'SLOT', ...slot })

describe('LIBRE editor draft', () => {
  it('places an entry without mutating the saved snapshot or manufacturing a win', () => {
    const { snapshot, editor } = fixture(20), before = structuredClone(snapshot)
    const draft = moveFreeEntry(snapshot, snapshot, editor, zone(editor), place(snapshot, '16VOS', 2))
    expect(snapshot).toEqual(before)
    expect(draft.assigned_count).toBe(1)
    expect(draft.effective_capacity).toBe(20)
    expect(draft.matches.every((match) => !match.winner_id && !match.bye_processed && match.status === 'WAITING_OPONENT')).toBe(true)
    expect(draft.matches.find((match) => match.id === place(snapshot, '16VOS', 2).matchId)?.slot2_origin).toBe('ENTRY')
  })
  it('supports direct quarter entry, chosen retreat and removal, preserving the original tree and rival branch', () => {
    const { snapshot, editor } = fixture()
    const first = place(snapshot, '16VOS', 1), rival = place(snapshot, '16VOS', 3), quarter = place(snapshot, '4TOS', 1)
    let draft = moveFreeEntry(snapshot, snapshot, editor, zone(editor), first)
    draft = moveFreeEntry(snapshot, draft, editor, zone(editor, 1), rival)
    draft = moveFreeEntry(snapshot, draft, editor, source(first), quarter)
    expect(draft.effective_capacity).toBe(29)
    expect(draft.assigned_count).toBe(2)
    expect(draft.matches.filter((match) => !match.bracket_is_active)).toHaveLength(3)
    expect(draft.matches.find((match) => match.id === rival.matchId)?.bracket_is_active).toBe(true)
    const saved = structuredClone(draft)
    const chosen = place(snapshot, '8VOS', 1, 2)
    draft = moveFreeEntry(saved, saved, editor, source(quarter), chosen)
    expect(draft.effective_capacity).toBe(31)
    expect(draft.matches.find((match) => match.id === chosen.matchId)?.couple2_id).toBe(editor.couples[0].coupleId)
    expect(draft.matches.find((match) => match.id === chosen.matchId)?.slot1_origin).toBe('WINNER')
    expect(draft.hierarchy).toEqual(snapshot.hierarchy)
    expect(draft.original_slots).toEqual(snapshot.original_slots)
    draft = removeFreeEntry(saved, draft, editor, chosen)
    expect(draft.effective_capacity).toBe(32)
    expect(draft.assigned_count).toBe(1)
    expect(draft.matches.every((match) => match.bracket_is_active && !match.winner_id && !match.bye_processed)).toBe(true)
  })
  it.each(['sports', 'agenda'] as const)('checks %s on a grandchild before inactivating its branch', (field) => {
    const { snapshot, editor } = fixture()
    editor.guards[place(snapshot, '16VOS', 2).matchId] = { sports: false, agenda: false, [field]: true }
    expect(() => moveFreeEntry(snapshot, snapshot, editor, zone(editor), place(snapshot, '4TOS', 1))).toThrow('rama anterior')
  })
  it('rejects a branch with a participant even if its immediate child is empty', () => {
    const { snapshot, editor } = fixture()
    const draft = moveFreeEntry(snapshot, snapshot, editor, zone(editor), place(snapshot, '16VOS', 1))
    expect(() => moveFreeEntry(snapshot, draft, editor, zone(editor, 1), place(snapshot, '4TOS', 1))).toThrow('rama anterior')
  })
  it('moves and swaps initial assignments within the same round', () => {
    const { snapshot, editor } = fixture()
    const a = place(snapshot, '16VOS', 1), b = place(snapshot, '16VOS', 8, 2)
    let draft = moveFreeEntry(snapshot, snapshot, editor, zone(editor), a)
    draft = moveFreeEntry(snapshot, draft, editor, zone(editor, 1), b)
    draft = moveFreeEntry(snapshot, draft, editor, source(a), b)
    expect(draft.matches.find((match) => match.id === a.matchId)?.couple1_id).toBe(editor.couples[1].coupleId)
    expect(draft.matches.find((match) => match.id === b.matchId)?.couple2_id).toBe(editor.couples[0].coupleId)
    expect(draft.effective_capacity).toBe(32)
  })
  it('rejects cross-round destinations outside the exact branch', () => {
    const { snapshot, editor } = fixture(), a = place(snapshot, '16VOS', 1)
    const draft = moveFreeEntry(snapshot, snapshot, editor, zone(editor), a)
    expect(() => moveFreeEntry(snapshot, draft, editor, source(a), place(snapshot, '4TOS', 4))).toThrow('rama compatible')
  })
  it('does not allow a same-round intermediate move to bypass final-layout compatibility', () => {
    const { snapshot, editor } = fixture(), a = place(snapshot, '16VOS', 1), b = place(snapshot, '16VOS', 16)
    const assigned = moveFreeEntry(snapshot, snapshot, editor, zone(editor), a)
    const draft = moveFreeEntry(assigned, assigned, editor, source(a), b)
    expect(() => moveFreeEntry(assigned, draft, editor, source(b), place(snapshot, '4TOS', 4, 2))).toThrow('entrada guardada')
  })
  it('blocks duplicate entries, disabled couples, BYEs and inactive destinations', () => {
    const { snapshot, editor } = fixture(20)
    const draft = moveFreeEntry(snapshot, snapshot, editor, zone(editor), place(snapshot, '16VOS', 2))
    expect(() => moveFreeEntry(snapshot, draft, editor, zone(editor), place(snapshot, '16VOS', 7))).toThrow('otra entrada')
    editor.couples[1].eligible = false
    expect(() => moveFreeEntry(snapshot, draft, editor, zone(editor, 1), place(snapshot, '16VOS', 7))).toThrow('habilitada')
    const bye = snapshot.matches.find((match) => match.slot1_origin === 'BYE' || match.slot2_origin === 'BYE')!
    expect(() => moveFreeEntry(snapshot, snapshot, editor, zone(editor), { matchId: bye.id, slot: bye.slot1_origin === 'BYE' ? 1 : 2 })).toThrow('pase libre previsto')
    const direct = moveFreeEntry(snapshot, snapshot, editor, zone(editor), place(snapshot, '4TOS', 1))
    expect(() => moveFreeEntry(snapshot, direct, editor, zone(editor, 2), place(snapshot, '16VOS', 1))).toThrow()
  })
  it('protects played matches and WINNER participants from selection/removal', () => {
    const { snapshot, editor } = fixture(), a = place(snapshot, '16VOS', 1)
    const played = moveFreeEntry(snapshot, snapshot, editor, zone(editor), a)
    const match = played.matches.find((item) => item.id === a.matchId)!
    match.status = 'FINISHED'; match.winner_id = editor.couples[0].coupleId
    expect(() => removeFreeEntry(played, played, editor, a)).toThrow('actividad deportiva')
    const winner = played.matches.find((item) => item.round === '8VOS')!
    winner.couple1_id = editor.couples[0].coupleId
    expect(() => moveFreeEntry(played, played, editor, source({ matchId: winner.id, slot: 1 }), place(played, '4TOS', 1))).toThrow('entrada manual')
  })
  it('produces a full layout with no client-supplied capacity, activity, seeds or hierarchy', () => {
    const { snapshot } = fixture()
    expect(freeLayout(snapshot)).toHaveLength(31)
    expect(Object.keys(freeLayout(snapshot)[0]).sort()).toEqual(['couple1_id', 'couple2_id', 'id', 'slot1_origin', 'slot2_origin'])
    expect(getFreeSlot(snapshot.matches[0], 1)).toEqual({ origin: 'ENTRY', coupleId: null })
  })
})
