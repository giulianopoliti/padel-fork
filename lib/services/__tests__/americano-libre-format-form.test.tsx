import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TournamentFormatConfigForm from '@/app/(main)/tournaments/[id]/settings/components/TournamentFormatConfigForm'
import { buildTournamentFormatConfig } from '../tournament-format-config-builder'
import type { TournamentFormatPresetId } from '@/types/tournament-format-v2'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/(main)/tournaments/[id]/settings/actions', () => ({ updateTournamentFormatConfig: jest.fn() }))
jest.mock('@/components/ui/select', () => {
  const Container = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
  const Select = ({ children, value }: { children: React.ReactNode; value: string }) => <div data-value={value}>{children}</div>
  return { Select, SelectContent: Container, SelectTrigger: Container, SelectValue: () => null,
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <span data-option={value}>{children}</span> }
})
const render = (presetId: TournamentFormatPresetId, status = 'ZONE_PHASE', count = 8) => renderToStaticMarkup(
  <TournamentFormatConfigForm tournamentId="t" tournamentType="AMERICAN" tournamentStatus={status}
    registeredCouplesCount={count} formatConfig={buildTournamentFormatConfig({ presetId })} />,
)
describe('free format selector in settings', () => {
  it('offers Americano libre alongside the existing multizone algorithms', () => {
    expect(render('AMERICAN_MULTI_ZONE_2')).toContain('data-option="MANUAL">Americano libre multizona')
  })
  it('offers free mode for single-zone tournaments', () => {
    expect(render('AMERICAN_SINGLE_ZONE_GLOBAL_2')).toContain('Americano libre — asignación manual')
  })
  it.each(['AMERICAN_MULTI_ZONE_FREE', 'AMERICAN_SINGLE_ZONE_FREE'] as const)('keeps %s editable before brackets without an automatic advancement count', preset => {
    const html = render(preset, 'NOT_STARTED', 0)
    expect(html).toContain('Guardar Formato')
    expect(html).toContain('data-value="MANUAL"')
    expect(html).not.toContain('id="single-advance-count"')
    expect(html).not.toContain('<fieldset disabled=')
  })
  it.each(['AMERICAN_MULTI_ZONE_FREE', 'AMERICAN_SINGLE_ZONE_FREE'] as const)('shows %s read-only once brackets start', preset => {
    const html = render(preset, 'BRACKET_PHASE')
    expect(html).not.toContain('Guardar Formato')
    expect(html).toContain('primero revertí la llave')
  })
})
