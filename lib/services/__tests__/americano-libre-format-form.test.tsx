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
const renderFormat = (type: 'AMERICAN' | 'LONG', formatConfig: unknown, count: number, status = 'ZONE_PHASE') => renderToStaticMarkup(
  <TournamentFormatConfigForm tournamentId="t" tournamentType={type} tournamentStatus={status}
    registeredCouplesCount={count} formatConfig={formatConfig} />,
)
const render = (presetId: TournamentFormatPresetId, status = 'ZONE_PHASE', count = 8) =>
  renderFormat('AMERICAN', buildTournamentFormatConfig({ presetId }), count, status)

const getSingleAdvanceCount = (html: string) =>
  html.match(/<input\b[^>]*\bid="single-advance-count"[^>]*\bvalue="([^"]+)"/)?.[1]

describe('single-bracket advancement count in settings', () => {
  it.each([
    ['LONG', 'LONG_SINGLE_ZONE_BRACKET', 'CUSTOM'],
    ['LONG', 'LONG_SINGLE_ZONE_BRACKET', undefined],
    ['AMERICAN', 'AMERICAN_SINGLE_ZONE_GLOBAL_2', 'CUSTOM'],
  ] as const)('loads 12 saved places for %s with %s and mode %s', (type, presetId, allocationMode) => {
    const config = buildTournamentFormatConfig({ presetId, singleAdvanceCount: 12, allocationMode })
    expect(getSingleAdvanceCount(renderFormat(type, config, 16))).toBe('12')
  })

  it('uses the current registration count in automatic mode', () => {
    const config = buildTournamentFormatConfig({
      presetId: 'AMERICAN_SINGLE_ZONE_GLOBAL_2', singleAdvanceCount: 12, allocationMode: 'AUTO',
    })
    expect(getSingleAdvanceCount(renderFormat('AMERICAN', config, 16))).toBe('16')
  })

  it('keeps the registration count as the default for a legacy Long without a saved format', () => {
    expect(getSingleAdvanceCount(renderFormat('LONG', {}, 16))).toBe('16')
  })
})

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
