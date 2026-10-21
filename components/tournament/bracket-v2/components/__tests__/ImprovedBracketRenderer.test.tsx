import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ImprovedBracketRenderer } from '../ImprovedBracketRenderer'
import { BracketDragDropProvider } from '../../context/bracket-drag-context'
import { DEFAULT_BRACKET_CONFIG } from '../../constants/bracket-constants'
import { BracketState, type BracketData, type BracketMatchV2 } from '../../types/bracket-types'

jest.mock('../GranularMatchCard', () => ({ GranularMatchCard: () => null }))
jest.mock('../BracketMoveCoupleSheet', () => ({ BracketMoveCoupleSheet: () => null }))
jest.mock('../BracketMatchActionDialogs', () => ({ BracketMatchActionDialogs: () => null }))

const match = (id: string, round: BracketMatchV2['round'], order: number): BracketMatchV2 => ({
  id, round, order_in_round: order, status: 'PENDING', participants: { slot1: { type: 'empty' }, slot2: { type: 'empty' } },
})
const data: BracketData = {
  matches: [match('semi-1', 'SEMIFINAL', 1), match('semi-2', 'SEMIFINAL', 2), match('final', 'FINAL', 1)],
  seeds: [], zones: [], config: DEFAULT_BRACKET_CONFIG, state: BracketState.PARTIALLY_RESOLVED,
  algorithmInfo: { algorithm: 'custom', description: 'Manual' },
}
const render = (allowRoundNavigation: boolean, bracketData = data) => renderToStaticMarkup(
  <BracketDragDropProvider><ImprovedBracketRenderer tournamentId="test" bracketData={bracketData}
    allowRoundNavigation={allowRoundNavigation} relations={[]}
    renderMatch={match => <span data-match={match.id}>{match.id}</span>} />
  </BracketDragDropProvider>,
)

describe('optional round navigation', () => {
  it('starts with the complete bracket and offers round navigation as the second option', () => {
    const html = render(true)
    expect(html).toContain('Por rondas')
    expect(html).toContain('Llave completa')
    expect(html).toContain('data-match="semi-1"')
    expect(html).toContain('data-match="semi-2"')
    expect(html).toContain('data-match="final"')
    expect(html.indexOf('Llave completa')).toBeLessThan(html.indexOf('Por rondas'))
    expect(html).toContain('aria-pressed="true">Llave completa')
  })
  it('preserves the existing Multizone tree and mobile list when not enabled', () => {
    const html = render(false)
    expect(html).not.toContain('Vista de la llave')
    expect(html).toContain('data-match="final"')
    expect(html).toContain('overflow-x-auto')
  })
  it('handles an empty bracket without creating an invalid round selection', () => {
    expect(render(true, { ...data, matches: [] })).toContain('No hay partidos para mostrar')
  })
})
