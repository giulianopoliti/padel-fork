import { createClientServiceRole } from '@/utils/supabase/server'
import { PlaceholderBracketGenerator } from '@/lib/services/bracket-generator-v2'
import { updateDefinitivePositionsService } from '@/lib/services/definitive-positions-service'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import {
  validatePlaceholderBracketGeneration,
  type PlaceholderBracketValidationFailure
} from '@/lib/services/bracket-generation-validation'
import {
  savePlaceholderBracketToDatabase,
  savePlaceholderSeedingToDatabase,
  updateProcessedPlaceholderMatches
} from '@/lib/services/bracket-generation-persistence'
import {
  rollbackPlaceholderBracketGeneration,
  type TournamentBracketSnapshot
} from '@/lib/services/bracket-generation-rollback'
import type { BracketKey } from '@/types/tournament-format-v2'
import { getOperationalBracketKeysForFormat } from '@/lib/services/bracket-key-policy'

export interface GeneratePlaceholderBracketSuccess {
  success: true
  message: string
  data: {
    totalSeeds: number
    definitiveSeeds: number
    placeholderSeeds: number
    totalMatches: number
    byeMatches: number
    definitiveAnalysis: Awaited<ReturnType<typeof updateDefinitivePositionsService>>
  }
}

export interface GeneratePlaceholderBracketFailure {
  success: false
  message: string
  code?: PlaceholderBracketValidationFailure['code'] | 'BRACKET_GENERATION_FAILED'
  rollbackAttempted?: boolean
}

export type GeneratePlaceholderBracketResult =
  | GeneratePlaceholderBracketSuccess
  | GeneratePlaceholderBracketFailure

export interface GenerateCanonicalSeedingSuccess {
  success: true
  message: string
  data: {
    totalSeeds: number
    definitiveSeeds: number
    placeholderSeeds: number
    seeds: Array<{ id: string; seed: number; bracket_position: number | null; couple_id: string | null; bracket_key: BracketKey }>
    definitiveAnalysis: Awaited<ReturnType<typeof updateDefinitivePositionsService>>
  }
}

export interface GenerateCanonicalSeedingFailure {
  success: false
  message: string
  code?: PlaceholderBracketValidationFailure['code'] | 'BRACKET_GENERATION_FAILED'
}

export type GenerateCanonicalSeedingResult =
  | GenerateCanonicalSeedingSuccess
  | GenerateCanonicalSeedingFailure

/**
 * Technical flow note:
 * - Validate tournament + zones before mutating state
 * - Transition temporarily to BRACKET_PHASE only to run definitive analysis
 * - Persist seeds/matches/hierarchy and process BYEs
 * - Confirm bracket_status only after the bracket exists in DB
 * - Roll everything back if any post-transition step fails
 */
export async function generatePlaceholderBracket(
  tournamentId: string
): Promise<GeneratePlaceholderBracketResult> {
  const validation = await validatePlaceholderBracketGeneration(tournamentId)
  if (!validation.success) {
    return {
      success: false,
      message: validation.message,
      code: validation.code
    }
  }

  const previousState: TournamentBracketSnapshot = {
    status: validation.tournament.status,
    bracket_status: validation.tournament.bracket_status,
    bracket_generated_at: validation.tournament.bracket_generated_at
  }

  const supabase = await createClientServiceRole()
  let rollbackAttempted = false

  try {
    console.log(`[BRACKET-GENERATION][validation] Tournament ${tournamentId} passed preconditions`)

    const { error: phaseTransitionError } = await supabase
      .from('tournaments')
      .update({ status: 'BRACKET_PHASE' })
      .eq('id', tournamentId)

    if (phaseTransitionError) {
      throw new Error(`Error transitioning tournament to BRACKET_PHASE: ${phaseTransitionError.message}`)
    }

    console.log(`[BRACKET-GENERATION][transition] Tournament ${tournamentId} moved temporarily to BRACKET_PHASE`)

    const definitiveResult = await updateDefinitivePositionsService(tournamentId)
    if (!definitiveResult.success) {
      throw new Error(`Error analyzing definitive positions: ${definitiveResult.error}`)
    }

    console.log(`[BRACKET-GENERATION][analysis] Definitive position analysis completed`)

    const resolvedFormat = TournamentFormatResolver.getResolvedFormat(validation.tournament, {
      totalCouples: validation.totalCouples,
    })
    const bracketKeys = getOperationalBracketKeysForFormat(resolvedFormat)
    const draftPlayableMatches =
      validation.tournament.type === 'LONG' && Boolean(validation.tournament.enable_draft_matches)
    const generator = new PlaceholderBracketGenerator()
    const allSeeds: any[] = []
    const allMatches: any[] = []
    const savedMatchesAll: any[] = []

    for (let index = 0; index < bracketKeys.length; index++) {
      const bracketKey = bracketKeys[index]
      const seeds = await generator.generatePlaceholderSeeding(tournamentId, { bracketKey })
      const matches = await generator.generateBracketMatches(seeds, tournamentId, bracketKey, {
        draftPlayableMatches,
      })
      const hierarchy = await generator.createMatchHierarchy(matches, tournamentId, bracketKey)

      console.log(
        `[BRACKET-GENERATION][persistence][${bracketKey}] Persisting ${seeds.length} seeds, ${matches.length} matches and ${hierarchy.length} hierarchy links`
      )

      const { savedMatches } = await savePlaceholderBracketToDatabase(tournamentId, seeds, matches, hierarchy, {
        replaceExisting: index === 0,
      })

      console.log(`[BRACKET-GENERATION][bye-processing][${bracketKey}] Processing BYEs for ${savedMatches.length} saved matches`)

      await generator.processBracketByes(savedMatches as any, hierarchy, {
        draftPlayableMatches,
      })
      await updateProcessedPlaceholderMatches(savedMatches)

      allSeeds.push(...seeds)
      allMatches.push(...matches)
      savedMatchesAll.push(...savedMatches)
    }

    const { error: finalizeTournamentError } = await supabase
      .from('tournaments')
      .update({
        status: 'BRACKET_PHASE',
        bracket_status: 'BRACKET_GENERATED',
        bracket_generated_at: new Date().toISOString()
      })
      .eq('id', tournamentId)

    if (finalizeTournamentError) {
      throw new Error(`Error finalizing tournament bracket status: ${finalizeTournamentError.message}`)
    }

    console.log(`[BRACKET-GENERATION][finalize] Bracket generation completed successfully for tournament ${tournamentId}`)

    return {
      success: true,
      message: 'Bracket con placeholders generado exitosamente',
      data: {
        totalSeeds: allSeeds.length,
        definitiveSeeds: allSeeds.filter(seed => !seed.is_placeholder).length,
        placeholderSeeds: allSeeds.filter(seed => seed.is_placeholder).length,
        totalMatches: allMatches.length,
        byeMatches: savedMatchesAll.filter(
          match => match.status === 'FINISHED' && (!match.couple1_id || !match.couple2_id)
        ).length,
        definitiveAnalysis: definitiveResult
      }
    }
  } catch (error: any) {
    console.error('[BRACKET-GENERATION][error] Generation failed:', error)

    rollbackAttempted = true
    try {
      await rollbackPlaceholderBracketGeneration(tournamentId, previousState)
      console.log(`[BRACKET-GENERATION][rollback] Rollback completed for tournament ${tournamentId}`)
    } catch (rollbackError) {
      console.error('[BRACKET-GENERATION][rollback] Rollback failed:', rollbackError)
    }

    return {
      success: false,
      message: error?.message || 'Failed to generate placeholder bracket',
      code: 'BRACKET_GENERATION_FAILED',
      rollbackAttempted
    }
  }
}

export async function generateCanonicalSeeding(
  tournamentId: string
): Promise<GenerateCanonicalSeedingResult> {
  const validation = await validatePlaceholderBracketGeneration(tournamentId)
  if (!validation.success) {
    return {
      success: false,
      message: validation.message,
      code: validation.code
    }
  }

  try {
    console.log(`[BRACKET-GENERATION][seeding] Tournament ${tournamentId} passed preconditions`)

    const definitiveResult = await updateDefinitivePositionsService(tournamentId)
    if (!definitiveResult.success) {
      throw new Error(`Error analyzing definitive positions: ${definitiveResult.error}`)
    }

    const resolvedFormat = TournamentFormatResolver.getResolvedFormat(validation.tournament, {
      totalCouples: validation.totalCouples,
    })
    const bracketKeys = getOperationalBracketKeysForFormat(resolvedFormat)
    const generator = new PlaceholderBracketGenerator()
    const allSeeds: any[] = []
    const savedSeedsAll: Array<{ id: string; seed: number; bracket_position: number | null; couple_id: string | null; bracket_key: BracketKey }> = []

    for (let index = 0; index < bracketKeys.length; index++) {
      const bracketKey = bracketKeys[index]
      const seeds = await generator.generatePlaceholderSeeding(tournamentId, { bracketKey })
      const { savedSeeds } = await savePlaceholderSeedingToDatabase(tournamentId, seeds, {
        replaceExisting: index === 0,
      })
      allSeeds.push(...seeds)
      savedSeedsAll.push(...savedSeeds)
    }

    return {
      success: true,
      message: 'Seeding canónico generado correctamente',
      data: {
        totalSeeds: allSeeds.length,
        definitiveSeeds: allSeeds.filter(seed => !seed.is_placeholder).length,
        placeholderSeeds: allSeeds.filter(seed => seed.is_placeholder).length,
        seeds: savedSeedsAll,
        definitiveAnalysis: definitiveResult
      }
    }
  } catch (error: any) {
    console.error('[BRACKET-GENERATION][seeding][error] Generation failed:', error)
    return {
      success: false,
      message: error?.message || 'Failed to generate canonical seeding',
      code: 'BRACKET_GENERATION_FAILED'
    }
  }
}
