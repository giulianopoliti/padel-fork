import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GranularMatchCard } from '../GranularMatchCard'
import { BracketDragDropProvider } from '../../context/bracket-drag-context'
import { useZoneMatchHistory } from '../../hooks/useZoneMatchHistory'
import { presentFreeBracket } from '@/lib/services/americano-libre-presentation'
import { buildFreeBracket } from '@/lib/services/americano-libre-generator'
import type { FreeBracketSnapshot } from '@/types/americano-libre'

jest.mock('../../hooks/useZoneMatchHistory', () => ({
  ...jest.requireActual('../../hooks/useZoneMatchHistory'),
  useZoneMatchHistory: jest.fn(),
}))
jest.mock('@/components/tournament/winner-photo-menu', () => ({ WinnerPhotoMenu: () => null }))

const render = (history: Map<string, Set<string>>) => {
  jest.mocked(useZoneMatchHistory).mockReturnValue({ history, matches: [], isLoading: false, error: null })
  const generated = buildFreeBracket(2)
  const snapshot: FreeBracketSnapshot = {
    tournament_id: 'test', bracket_key: 'MAIN', contract_version: 1, revision: 0, requested_count: 2, base_size: 2,
    original_slots: {}, effective_capacity: 2, assigned_count: 2, created_at: '', hierarchy: [],
    matches: generated.matches.map(match => ({ ...match, couple1_id: 'couple-a', couple2_id: 'couple-b',
      seed1_id: null, seed2_id: null, status: 'PENDING', winner_id: null, bye_processed: false, bracket_is_active: true })),
  }
  const match = presentFreeBracket(snapshot, { couples: [], guards: {} }, false).data.matches[0]
  return renderToStaticMarkup(<BracketDragDropProvider><GranularMatchCard match={match} tournamentId="test"
    isOwner isEditMode={false} managedActions={{ onManage: () => undefined, onClearResult: () => undefined }} />
  </BracketDragDropProvider>)
}

describe('zone rematch warning in Americano libre', () => {
  it('shows the shared warning for manual entries that played each other in zones', () => {
    expect(render(new Map([['couple-b', new Set(['couple-a'])]]))).toContain('Ya jugaron en zona')
  })
  it('does not warn merely because two couples are assigned', () => {
    expect(render(new Map())).not.toContain('Ya jugaron en zona')
  })
})
