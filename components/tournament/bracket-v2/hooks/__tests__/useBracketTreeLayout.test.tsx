import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useBracketTreeLayout, type TreeRelation } from '../useBracketTreeLayout'
import type { BracketMatchV2 } from '../../types/bracket-types'

const match = (id: string, round: BracketMatchV2['round'], order: number): BracketMatchV2 => ({
  id, round, order_in_round: order, status: 'PENDING', participants: { slot1: { type: 'empty' }, slot2: { type: 'empty' } },
})
const groups = [
  { round: 'SEMIFINAL', matches: [match('a','SEMIFINAL',1), match('b','SEMIFINAL',2)], displayName: 'Semifinales', totalMatches: 2, completedMatches: 0, canPlay: 0 },
  { round: 'FINAL', matches: [match('c','FINAL',1)], displayName: 'Final', totalMatches: 1, completedMatches: 0, canPlay: 0 },
]
const layoutFor = (relations?: TreeRelation[], cardExtraHeight = 0) => {
  let layout: ReturnType<typeof useBracketTreeLayout>['layout'] | undefined
  const Probe = () => { layout = useBracketTreeLayout({ tournamentId: 't', roundGroups: groups, relations, cardExtraHeight }).layout; return null }
  renderToStaticMarkup(<Probe />)
  return layout!
}
describe('shared bracket tree with manual entries', () => {
  it('reserves space for both zone references without overlapping the next match', () => {
    const plain = layoutFor()
    const expanded = layoutFor(undefined, 48)
    expect(expanded.cardSize.height).toBe(plain.cardSize.height + 48)
    expect(expanded.cardSize.connectorAnchorY).toBe(plain.cardSize.connectorAnchorY + 24)
    const firstRound = expanded.positions.filter(position => position.round === 'SEMIFINAL')
    expect(firstRound[1].y).toBeGreaterThan(firstRound[0].y + firstRound[0].height)
  })
  it('preserves the normal Multizone fallback without a supplied hierarchy', () => {
    expect(layoutFor().connectors.map((edge) => edge.sourceMatchId)).toEqual(['a','b'])
  })
  it('does not invent winner connections when a direct entry replaces a branch', () => {
    const layout = layoutFor([{ parentMatchId: 'c', childMatchId: 'b', parentSlot: 2 }])
    expect(layout.connectors).toHaveLength(1)
    expect(layout.connectors[0]).toMatchObject({ sourceMatchId: 'b', targetMatchId: 'c' })
    expect(layout.hasHierarchy).toBe(true)
  })
  it('respects an explicitly empty hierarchy', () => {
    expect(layoutFor([]).connectors).toEqual([])
  })
  it('keeps inactive edges identifiable during editing', () => {
    expect(layoutFor([{ parentMatchId: 'c', childMatchId: 'a', parentSlot: 1, inactive: true }]).connectors[0].inactive).toBe(true)
  })
})
