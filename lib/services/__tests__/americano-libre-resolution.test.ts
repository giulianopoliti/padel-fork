import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { getBracketPlaceholderResolver } from '../bracket-placeholder-resolver'
import { QualificationSourceService } from '../qualification-source.service'
import { IncrementalPlaceholderUpdater } from '../incremental-placeholder-updater'
import { validatePlaceholderBracketGeneration } from '../bracket-generation-validation'
import { PlaceholderBracketGenerator } from '../bracket-generator-v2'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))
jest.mock('../corrected-definitive-analyzer', () => ({
  CorrectedDefinitiveAnalyzer: jest.fn(() => ({ analyzeZone: jest.fn().mockResolvedValue([
    { definitivePositions: 2, totalCouples: 4, analysis: [] },
  ]) })),
}))

describe('Americano libre does not assign from standings', () => {
  let from: jest.Mock
  beforeEach(() => {
    jest.clearAllMocks()
    from = jest.fn((table: string) => {
      if (table !== 'tournaments') throw new Error(`Unexpected ranking/assignment query: ${table}`)
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({
        data: { type: 'AMERICAN', format_config: getTournamentFormatPreset('AMERICAN_MULTI_ZONE_FREE') }, error: null,
      }) }
    })
    jest.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof createClient>>)
    jest.mocked(createClientServiceRole).mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof createClientServiceRole>>)
  })

  it('does not provide automatically qualified entries', async () => {
    await expect(QualificationSourceService.getQualifiedEntries('free')).resolves.toEqual([])
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('rejects the old generation path before querying or writing bracket artifacts', async () => {
    await expect(validatePlaceholderBracketGeneration('free')).resolves.toMatchObject({ success: false, code: 'MANUAL_BRACKET_REQUIRED' })
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('does not generate ranking seeds through a direct generator call', async () => {
    await expect(new PlaceholderBracketGenerator().generatePlaceholderSeeding('free')).rejects.toThrow('Americano libre no genera seeds')
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('does not resolve zone placeholders, process byes or advance entries', async () => {
    await expect(getBracketPlaceholderResolver().resolveZonePlaceholders('free', 'zone')).resolves.toMatchObject({
      success: true, resolvedSeeds: 0, updatedMatches: 0, detectedByes: 0, advancedMatches: 0,
    })
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('retains definitive position analysis without assigning its results', async () => {
    await expect(new IncrementalPlaceholderUpdater().analyzeZoneAndResolveDefinitives('free', 'zone')).resolves.toEqual({ resolved: 0, definitive: 2 })
    expect(from).toHaveBeenCalledTimes(1)
  })
})
