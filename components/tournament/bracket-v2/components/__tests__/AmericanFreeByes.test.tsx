import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AmericanFreeBracketEditor } from '@/components/tournament/american-free-bracket-editor'
import { buildFreeBracket } from '@/lib/services/americano-libre-generator'
import type { FreeBracketSnapshot } from '@/types/americano-libre'
import type { FreeEditorData } from '@/types/americano-libre-editor'
import type { BracketData, BracketMatchV2 } from '../../types/bracket-types'

jest.mock('../ImprovedBracketRenderer', () => ({ ImprovedBracketRenderer: ({ bracketData, renderMatch }: {
  bracketData: BracketData; renderMatch: (match: BracketMatchV2) => React.ReactNode
}) => <>{bracketData.matches.map(match => <div key={match.id}>{renderMatch(match)}</div>)}</> }))
jest.mock('../GranularMatchCard', () => ({ GranularMatchCard: ({ renderParticipant }: {
  renderParticipant: (slot: 'slot1' | 'slot2') => React.ReactNode
}) => <>{renderParticipant('slot1')}{renderParticipant('slot2')}</> }))

const makeSnapshot = (): FreeBracketSnapshot => {
  const tree = buildFreeBracket(6)
  return {
    tournament_id: 'test', bracket_key: 'MAIN', contract_version: 1, revision: 0,
    requested_count: 6, base_size: 8, effective_capacity: 6, assigned_count: 0, created_at: '',
    original_slots: Object.fromEntries(tree.matches.map(match => [match.id, [match.slot1_origin, match.slot2_origin]])),
    hierarchy: tree.hierarchy,
    matches: tree.matches.map(match => ({ ...match, couple1_id: null, couple2_id: null,
      seed1_id: null, seed2_id: null, status: 'WAITING_OPONENT', winner_id: null, bye_processed: false, bracket_is_active: true })),
  }
}
const editor: FreeEditorData = { couples: [], guards: {} }
const render = (snapshot: FreeBracketSnapshot, canManage = true): string => {
  jest.spyOn(React, 'useState').mockImplementationOnce(() => [{ baseline: snapshot, draft: snapshot, editor }, jest.fn()] as never)
  try {
    return renderToStaticMarkup(<AmericanFreeBracketEditor tournamentId="test" snapshot={snapshot} editor={editor} canManage={canManage}
      onMatchAction={() => undefined} onSaved={async () => undefined} onReload={async () => undefined} />)
  } finally { jest.restoreAllMocks() }
}

describe('Americano libre BYE controls', () => {
  it('allows removing a planned BYE without duplicating the direct process action', () => {
    const html = render(makeSnapshot())
    expect(html).toContain('Quitar BYE y habilitar pareja')
    expect(html).not.toContain('Asignar BYE en este lugar')
    expect(html).toContain('aria-label="Quitar BYE en')
  })
  it('hides BYE controls when matches have been processed or viewers cannot manage', () => {
    const snapshot = makeSnapshot()
    snapshot.matches.forEach(match => { match.bye_processed = true })
    const html = render(snapshot)
    expect(html).not.toContain('Quitar BYE y habilitar pareja')
    expect(html).not.toContain('Asignar BYE en este lugar')
    expect(render(makeSnapshot(), false)).not.toContain('Quitar BYE y habilitar pareja')
  })
})
