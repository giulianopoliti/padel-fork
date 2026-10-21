import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AmericanFreeBracketEditor } from '@/components/tournament/american-free-bracket-editor'
import { AmericanFreeZonesPanel } from '@/components/tournament/american-free-zones-panel'
import { buildFreeBracket } from '@/lib/services/americano-libre-generator'
import type { FreeBracketSnapshot } from '@/types/americano-libre'
import type { FreeEditorData } from '@/types/americano-libre-editor'

jest.mock('../../hooks/useZoneMatchHistory', () => ({
  useZoneMatchHistory: () => ({ history: new Map(), isLoading: false }), havePlayedInZone: () => false,
}))
jest.mock('@/components/tournament/winner-photo-menu', () => ({ WinnerPhotoMenu: () => null }))

const editor: FreeEditorData = { guards: {}, couples: [
  { coupleId: 'a', zoneId: 'zone-a', zoneName: 'Zona A', name: 'Ana Paz / Luz Sol', position: 1, wins: 2, losses: 0, gamesDifference: 4, eligible: true },
  { coupleId: 'b', zoneId: 'zone-b', zoneName: 'Zona B', name: 'Eva Mar / Sol Sur', position: 2, wins: 1, losses: 1, gamesDifference: 0, eligible: true },
] }
const generated = buildFreeBracket(2)
const snapshot: FreeBracketSnapshot = {
  tournament_id: 'test', bracket_key: 'MAIN', contract_version: 1, revision: 0, requested_count: 2, base_size: 2,
  original_slots: {}, effective_capacity: 2, assigned_count: 2, created_at: '', hierarchy: [],
  matches: generated.matches.map(match => ({ ...match, couple1_id: 'a', couple2_id: 'b', seed1_id: null, seed2_id: null,
    status: 'PENDING', winner_id: null, bye_processed: false, bracket_is_active: true })),
}
const render = (show: boolean, source = editor) => renderToStaticMarkup(<AmericanFreeBracketEditor
  tournamentId="test" snapshot={snapshot} editor={source} canManage={false} showZoneReferences={show}
  onMatchAction={() => undefined} onSaved={async () => undefined} onReload={async () => undefined} />)

describe('current zone references and complete zone list', () => {
  const actionsFor = (origin: 'BYE' | 'ENTRY' | 'WINNER', rival: string | null) => renderToStaticMarkup(<AmericanFreeBracketEditor
    tournamentId="test" snapshot={{ ...snapshot, matches: snapshot.matches.map(match => ({ ...match, slot2_origin: origin, couple2_id: rival })) }}
    editor={editor} canManage showZoneReferences={false} onMatchAction={() => undefined} onSaved={async () => undefined} onReload={async () => undefined} />)
  it('uses the three dots for exceptional actions and keeps start/result/scheduling separate', () => {
    const html = actionsFor('ENTRY', 'b')
    expect(html).toContain('Más acciones del partido')
    expect(html).toContain('Iniciar partido')
    expect(html).toContain('Cargar resultado')
    expect(html).not.toContain('Cancha y horario')
    expect(html).not.toContain('Gestionar partido')
    expect(html).not.toContain('Procesar BYE')
  })
  it('offers only the BYE action when a defined couple has an explicit free pass', () => {
    const html = actionsFor('BYE', null)
    expect(html).toContain('Procesar BYE')
    expect(html).not.toContain('Más acciones del partido')
    expect(html).not.toContain('Cancha y horario')
    expect(html).not.toContain('Iniciar partido')
  })
  it('offers one-step processing for an empty initial entry', () => {
    expect(actionsFor('ENTRY', null)).toContain('Procesar BYE')
  })
  it.each(['WINNER'] as const)('does not confuse a pending %s rival with a BYE', origin => {
    const html = actionsFor(origin, null)
    expect(html).not.toContain('Procesar BYE')
    expect(html).not.toContain('Más acciones del partido')
  })
  it('shows compact zone references for public viewers too', () => {
    const html = render(true)
    expect(html).toContain('1°A'); expect(html).toContain('2°B')
    expect(html).not.toContain('Ocultar referencia de zona')
  })
  it('respects hidden references without removing the players', () => {
    const html = render(false)
    expect(html).not.toContain('1°A'); expect(html).not.toContain('2°B')
    expect(html).toContain('Ana Paz'); expect(html).toContain('Eva Mar')
  })
  it('uses current standings instead of a position frozen in the bracket snapshot', () => {
    const html = render(true, { ...editor, couples: [{ ...editor.couples[0], position: 3 }, editor.couples[1]] })
    expect(html).toContain('3°A'); expect(html).not.toContain('1°A')
  })
  it('renders all zones with separate position and statistics columns', () => {
    const html = renderToStaticMarkup(<AmericanFreeZonesPanel zones={editor.couples.map(couple => ({ id: couple.zoneId, couples: [couple] }))}
      assigned={new Set(['a'])} selected={null} isEditing onSelect={() => undefined} onDragStart={() => undefined} onDragEnd={() => undefined} />)
    expect(html).toContain('Zona A'); expect(html).toContain('Zona B')
    expect(html).toContain('scope="col"'); expect(html).toContain('Pos.')
    expect(html).toContain('border-r')
    expect(html).toContain('Ubicada'); expect(html).not.toContain('<select')
    expect(html).not.toContain('overflow-y-auto')
    expect(html).toContain('border-red-300 bg-red-50')
    expect(html).toContain('Seleccionar o arrastrar')
  })
  it('uses green for a completed zone and yellow for pending matches while both remain selectable', () => {
    const couples = [editor.couples[0], { ...editor.couples[1], zoneId: 'zone-a', zoneName: 'Zona A', wins: 1, losses: 0 }, { ...editor.couples[1], coupleId: 'c', zoneId: 'zone-a', zoneName: 'Zona A', wins: 0, losses: 0 }]
    const html = renderToStaticMarkup(<AmericanFreeZonesPanel zones={[{ id: 'zone-a', couples }]}
      assigned={new Set()} selected={null} isEditing targetMatchesPerCouple={2} onSelect={() => undefined} onDragStart={() => undefined} onDragEnd={() => undefined} />)
    expect(html).toContain('border-emerald-300 bg-emerald-50')
    expect(html).toContain('border-amber-300 bg-amber-50')
    expect(html).toContain('draggable="true"')
    expect(html).toContain('2/2 partidos')
    expect(html).toContain('1/2 partidos')
  })
  it('lets the bracket grow with its matches instead of constraining its vertical height', () => {
    const html = render(true)
    expect(html).not.toContain('overflow-y-auto')
    expect(html).not.toContain('56rem')
    expect(html).not.toContain('h-full overflow-auto')
  })
})
