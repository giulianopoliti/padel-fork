import { randomUUID } from 'node:crypto'
import { presentFreeBracket } from '../americano-libre-presentation'
import { buildFreeBracket } from '../americano-libre-generator'
import type { FreeBracketSnapshot } from '@/types/americano-libre'
import type { FreeEditorData } from '@/types/americano-libre-editor'

const fixture = (count = 4): FreeBracketSnapshot => {
  const generated = buildFreeBracket(count)
  return {
    tournament_id: randomUUID(), bracket_key: 'MAIN', contract_version: 1, revision: 3,
    requested_count: count, base_size: count > 4 ? 8 : 4, original_slots: {}, effective_capacity: count,
    assigned_count: 0, created_at: '2026-10-21T00:00:00Z', hierarchy: generated.hierarchy,
    matches: generated.matches.map((match) => ({ ...match, couple1_id: null, couple2_id: null, seed1_id: null, seed2_id: null,
      status: 'PENDING', bracket_is_active: true, winner_id: null, bye_processed: false })),
  }
}
const editor: FreeEditorData = { couples: [], guards: {} }

describe('free bracket using the Multizone presentation', () => {
  it('enables the normal match actions when both manual entries are assigned even if the stored state still says waiting', () => {
    const snapshot = fixture()
    const match = snapshot.matches[0]
    match.couple1_id = randomUUID(); match.couple2_id = randomUUID(); match.status = 'WAITING_OPONENT'
    expect(presentFreeBracket(snapshot, editor, false).data.matches[0].status).toBe('PENDING')
    match.couple2_id = null
    expect(presentFreeBracket(snapshot, editor, false).data.matches[0].status).toBe('WAITING_OPPONENT')
  })
  it('keeps missing entries and WINNER references distinct from explicit BYEs', () => {
    const snapshot = fixture(3)
    const { data } = presentFreeBracket(snapshot, editor, false)
    const slots = data.matches.flatMap((match) => [match.participants.slot1, match.participants.slot2])
    expect(slots.filter((slot) => slot.type === 'bye')).toHaveLength(1)
    expect(slots.filter((slot) => slot.type === 'empty')).toHaveLength(3)
    expect(slots.filter((slot) => slot.type === 'placeholder')).toHaveLength(2)
    expect(slots.filter((slot) => slot.type === 'placeholder').every((slot) => slot.placeholder?.rule.type === 'match-winner')).toBe(true)
    expect(snapshot.matches.every((match) => !match.winner_id)).toBe(true)
  })
  it('uses persisted connections regardless of match order', () => {
    const snapshot = fixture(8)
    snapshot.matches.reverse()
    const { relations } = presentFreeBracket(snapshot, editor, false)
    expect(relations).toEqual(snapshot.hierarchy.map((edge) => ({ parentMatchId: edge.parent_match_id, childMatchId: edge.child_match_id, parentSlot: edge.parent_slot, inactive: false })))
  })
  it('hides inactive branches while viewing and shows their dashed connections only while editing', () => {
    const snapshot = fixture()
    const edge = snapshot.hierarchy[0]
    const child = snapshot.matches.find((match) => match.id === edge.child_match_id)!
    const parent = snapshot.matches.find((match) => match.id === edge.parent_match_id)!
    child.bracket_is_active = false
    parent.slot1_origin = 'ENTRY'
    const view = presentFreeBracket(snapshot, editor, false)
    expect(view.data.matches.map((match) => match.id)).not.toContain(child.id)
    expect(view.relations.some((relation) => relation.childMatchId === child.id)).toBe(false)
    const edit = presentFreeBracket(snapshot, editor, true)
    expect(edit.data.matches).toHaveLength(snapshot.matches.length)
    expect(edit.relations.find((relation) => relation.childMatchId === child.id)?.inactive).toBe(true)
  })
  it('displays the saved winner, score and court without reassigning couples from standings', () => {
    const snapshot = fixture()
    const first = snapshot.matches[0]
    const coupleId = randomUUID()
    first.couple1_id = coupleId; first.winner_id = coupleId; first.status = 'FINISHED'; first.score1 = '6'; first.score2 = '0'; first.court = '2'
    const reference: FreeEditorData = { guards: {}, couples: [{ coupleId, zoneId: randomUUID(), zoneName: 'Zona B', name: 'Ana Paz / Luz Sol', position: 4, wins: 0, losses: 0, gamesDifference: 0, eligible: true,
      player1: { id: randomUUID(), first_name: 'Ana', last_name: 'Paz' }, player2: { id: randomUUID(), first_name: 'Luz', last_name: 'Sol' } }] }
    const match = presentFreeBracket(snapshot, reference, false).data.matches.find((match) => match.id === first.id)!
    expect(match.participants.slot1.couple?.player1_details?.first_name).toBe('Ana')
    expect(match.winner_id).toBe(coupleId)
    expect(match.result?.sets).toEqual([{ slot1Score: 6, slot2Score: 0 }])
    expect(match.scheduling?.court).toBe('2')
    reference.couples[0].position = 1
    expect(presentFreeBracket(snapshot, reference, false).data.matches.find((match) => match.id === first.id)?.couple1_id).toBe(coupleId)
  })
})
