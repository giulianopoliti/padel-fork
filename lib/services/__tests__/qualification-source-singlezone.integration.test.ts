import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import { QualificationSourceService, type QualifiedEntry } from '@/lib/services/qualification-source.service'
import { createClient } from '@/utils/supabase/server'
import { getActiveDisqualifiedCoupleIds } from '@/lib/services/tournament-disqualifications'

jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/services/tournament-disqualifications', () => {
  const actual = jest.requireActual('@/lib/services/tournament-disqualifications')
  return {
    ...actual,
    getActiveDisqualifiedCoupleIds: jest.fn(),
  }
})

const buildEntries = (total: number): QualifiedEntry[] => Array.from({ length: total }, (_, index) => ({
  key: `global:${index + 1}`,
  coupleId: `couple-${index + 1}`,
  currentCoupleId: `couple-${index + 1}`,
  zoneId: 'zone-general',
  localPosition: index + 1,
  globalPosition: index + 1,
  label: `${index + 1}°`,
  isDefinitive: true,
}))

const createTournamentClient = (presetId: Parameters<typeof getTournamentFormatPreset>[0]) => ({
  from: jest.fn((table: string) => {
    if (table !== 'tournaments') throw new Error(`Unexpected table: ${table}`)
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'tournament-singlezone',
          type: 'AMERICAN',
          format_type: 'AMERICAN_2',
          format_config: getTournamentFormatPreset(presetId),
        },
        error: null,
      }),
    }
  }),
})

describe('QualificationSourceService single-zone allocation integration', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  test.each([
    ['AMERICAN_SINGLE_ZONE_GLOBAL_2', 'MAIN', 8, 8],
    ['AMERICAN_SINGLE_ZONE_GLOBAL_3', 'MAIN', 9, 9],
    ['AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_2', 'GOLD', 9, 4],
    ['AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_2', 'SILVER', 9, 5],
    ['AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_3', 'GOLD', 9, 4],
    ['AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_3', 'SILVER', 9, 5],
  ] as const)('runs standings -> eligible population -> AUTO allocation for %s/%s', async (presetId, bracketKey, totalEntries, expectedCount) => {
    ;(createClient as jest.Mock).mockResolvedValue(createTournamentClient(presetId))
    ;(getActiveDisqualifiedCoupleIds as jest.Mock).mockResolvedValue(new Set<string>())
    jest.spyOn(QualificationSourceService as any, 'getGlobalStandingEntries').mockResolvedValue(buildEntries(totalEntries))

    const entries = await QualificationSourceService.getQualifiedEntries('tournament-singlezone', { bracketKey })

    expect(entries).toHaveLength(expectedCount)
  })

  it('excludes a disqualified couple before recalculating both AUTO cup cuts', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(
      createTournamentClient('AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_3')
    )
    ;(getActiveDisqualifiedCoupleIds as jest.Mock).mockResolvedValue(new Set(['couple-2']))
    jest.spyOn(QualificationSourceService as any, 'getGlobalStandingEntries').mockResolvedValue(buildEntries(9))

    const gold = await QualificationSourceService.getQualifiedEntries('tournament-singlezone', { bracketKey: 'GOLD' })
    const silver = await QualificationSourceService.getQualifiedEntries('tournament-singlezone', { bracketKey: 'SILVER' })

    expect(gold.map((entry) => entry.coupleId)).toEqual(['couple-1', 'couple-3', 'couple-4', 'couple-5'])
    expect(silver.map((entry) => entry.coupleId)).toEqual(['couple-6', 'couple-7', 'couple-8', 'couple-9'])
    expect(new Set([...gold, ...silver].map((entry) => entry.coupleId)).size).toBe(8)
  })
})
