import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import { generatePlaceholderBracket } from '@/lib/services/bracket-generation-orchestrator'
import { PlaceholderBracketGenerator } from '@/lib/services/bracket-generator-v2'
import { validatePlaceholderBracketGeneration } from '@/lib/services/bracket-generation-validation'
import { updateDefinitivePositionsService } from '@/lib/services/definitive-positions-service'
import {
  savePlaceholderBracketToDatabase,
  updateProcessedPlaceholderMatches,
} from '@/lib/services/bracket-generation-persistence'
import { rollbackPlaceholderBracketGeneration } from '@/lib/services/bracket-generation-rollback'
import { createClientServiceRole } from '@/utils/supabase/server'

jest.mock('@/lib/services/bracket-generation-validation', () => ({
  validatePlaceholderBracketGeneration: jest.fn(),
}))
jest.mock('@/lib/services/definitive-positions-service', () => ({
  updateDefinitivePositionsService: jest.fn(),
}))
jest.mock('@/lib/services/bracket-generation-persistence', () => ({
  savePlaceholderBracketToDatabase: jest.fn(),
  savePlaceholderSeedingToDatabase: jest.fn(),
  updateProcessedPlaceholderMatches: jest.fn(),
}))
jest.mock('@/lib/services/bracket-generation-rollback', () => ({
  rollbackPlaceholderBracketGeneration: jest.fn(),
}))
jest.mock('@/utils/supabase/server', () => ({
  createClientServiceRole: jest.fn(),
}))

const tournamentId = 'singlezone-cups'

describe('single-zone GOLD/SILVER generation orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(createClientServiceRole as jest.Mock).mockResolvedValue({
      from: jest.fn(() => ({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      })),
    })
    ;(validatePlaceholderBracketGeneration as jest.Mock).mockResolvedValue({
      success: true,
      code: 'READY',
      message: 'ready',
      tournament: {
        id: tournamentId,
        status: 'ZONE_PHASE',
        bracket_status: 'NOT_STARTED',
        bracket_generated_at: null,
        type: 'AMERICAN',
        format_type: 'AMERICAN_3',
        format_config: getTournamentFormatPreset('AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_3'),
      },
      totalCouples: 9,
      totalZones: 1,
      artifacts: {
        seedCount: 0,
        eliminationMatchCount: 0,
        hierarchyCount: 0,
        resolutionCount: 0,
        exists: false,
      },
    })
    ;(updateDefinitivePositionsService as jest.Mock).mockResolvedValue({ success: true })
    jest.spyOn(PlaceholderBracketGenerator.prototype, 'generatePlaceholderSeeding')
      .mockImplementation(async (_id, { bracketKey } = {}) => [{
        seed: 1,
        bracket_position: 1,
        couple_id: `couple-${bracketKey}`,
        is_placeholder: false,
        placeholder_zone_id: null,
        placeholder_position: null,
        placeholder_label: null,
        created_as_placeholder: false,
        bracket_key: bracketKey || 'MAIN',
      }])
    jest.spyOn(PlaceholderBracketGenerator.prototype, 'generateBracketMatches').mockResolvedValue([])
    jest.spyOn(PlaceholderBracketGenerator.prototype, 'createMatchHierarchy').mockResolvedValue([])
    jest.spyOn(PlaceholderBracketGenerator.prototype, 'processBracketByes').mockResolvedValue(undefined)
    ;(updateProcessedPlaceholderMatches as jest.Mock).mockResolvedValue(undefined)
    ;(rollbackPlaceholderBracketGeneration as jest.Mock).mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uses one replace-all write followed by an isolated second-cup write', async () => {
    ;(savePlaceholderBracketToDatabase as jest.Mock)
      .mockResolvedValueOnce({ savedMatches: [] })
      .mockResolvedValueOnce({ savedMatches: [] })

    const result = await generatePlaceholderBracket(tournamentId)

    expect(result.success).toBe(true)
    expect(savePlaceholderBracketToDatabase).toHaveBeenNthCalledWith(
      1,
      tournamentId,
      expect.arrayContaining([expect.objectContaining({ bracket_key: 'GOLD' })]),
      [],
      [],
      { replaceExisting: true }
    )
    expect(savePlaceholderBracketToDatabase).toHaveBeenNthCalledWith(
      2,
      tournamentId,
      expect.arrayContaining([expect.objectContaining({ bracket_key: 'SILVER' })]),
      [],
      [],
      { replaceExisting: false }
    )
    expect(rollbackPlaceholderBracketGeneration).not.toHaveBeenCalled()
  })

  it('rolls back the complete operation when persistence of SILVER fails', async () => {
    ;(savePlaceholderBracketToDatabase as jest.Mock)
      .mockResolvedValueOnce({ savedMatches: [] })
      .mockRejectedValueOnce(new Error('silver persistence failed'))

    const result = await generatePlaceholderBracket(tournamentId)

    expect(result).toMatchObject({
      success: false,
      code: 'BRACKET_GENERATION_FAILED',
      rollbackAttempted: true,
    })
    expect(rollbackPlaceholderBracketGeneration).toHaveBeenCalledWith(tournamentId, {
      status: 'ZONE_PHASE',
      bracket_status: 'NOT_STARTED',
      bracket_generated_at: null,
    })
  })
})
