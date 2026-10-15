/**
 * Delete Tournament Bracket API Endpoint
 * DELETE /api/tournaments/[id]/delete-bracket
 *
 * Supports deleting all bracket artifacts or a specific bracket_key.
 */

import { withTournamentSortValues } from '@/lib/tournaments/tournament-sort-values'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import type { BracketKey } from '@/types/tournament-format-v2'
import { normalizeBracketKey } from '@/lib/services/bracket-key-policy'

type BracketDeletionTarget =
  | { mode: 'ALL' }
  | { mode: 'ONE'; bracketKey: BracketKey }

function resolveBracketDeletionTarget(request: NextRequest): BracketDeletionTarget | null {
  const raw = request.nextUrl.searchParams.get('bracket_key')
  if (!raw || raw.toUpperCase() === 'ALL') {
    return { mode: 'ALL' }
  }

  const normalized = normalizeBracketKey(raw)
  if (!normalized) {
    return null
  }

  return {
    mode: 'ONE',
    bracketKey: normalized,
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params
    const deletionTarget = resolveBracketDeletionTarget(request)

    if (!tournamentId) {
      return NextResponse.json(
        { success: false, error: 'Tournament ID is required' },
        { status: 400 }
      )
    }

    if (!deletionTarget) {
      return NextResponse.json(
        { success: false, error: 'Invalid bracket_key. Use MAIN, GOLD, SILVER or ALL.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, name, status, bracket_generated_at, placeholder_brackets_generated_at')
      .eq('id', tournamentId)
      .single()

    if (tournamentError || !tournament) {
      return NextResponse.json(
        { success: false, error: 'Tournament not found' },
        { status: 404 }
      )
    }

    let existingSeedsQuery = supabase
      .from('tournament_couple_seeds')
      .select('id')
      .eq('tournament_id', tournamentId)
      .limit(1)

    if (deletionTarget.mode === 'ONE') {
      existingSeedsQuery = existingSeedsQuery.eq('bracket_key', deletionTarget.bracketKey)
    }

    const { data: existingSeeds, error: seedsError } = await existingSeedsQuery
    if (seedsError) {
      throw new Error(`Error checking existing bracket: ${seedsError.message}`)
    }

    if (!existingSeeds || existingSeeds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No bracket found to delete' },
        { status: 404 }
      )
    }

    let finishedMatchesQuery = supabase
      .from('matches')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('type', 'ELIMINATION')
      .eq('status', 'FINISHED')
      .limit(1)

    if (deletionTarget.mode === 'ONE') {
      finishedMatchesQuery = finishedMatchesQuery.eq('bracket_key', deletionTarget.bracketKey)
    }

    const { data: finishedMatches, error: finishedError } = await finishedMatchesQuery
    if (finishedError) {
      throw new Error(`Error checking finished matches: ${finishedError.message}`)
    }

    if (finishedMatches && finishedMatches.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot delete bracket with finished matches. Bracket has started and has results.',
        },
        { status: 409 }
      )
    }

    let seedsCountQuery = supabase
      .from('tournament_couple_seeds')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
    if (deletionTarget.mode === 'ONE') {
      seedsCountQuery = seedsCountQuery.eq('bracket_key', deletionTarget.bracketKey)
    }
    const { count: seedsCount } = await seedsCountQuery

    let matchesCountQuery = supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('type', 'ELIMINATION')
    if (deletionTarget.mode === 'ONE') {
      matchesCountQuery = matchesCountQuery.eq('bracket_key', deletionTarget.bracketKey)
    }
    const { count: matchesCount } = await matchesCountQuery

    let hierarchyCountQuery = supabase
      .from('match_hierarchy')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
    if (deletionTarget.mode === 'ONE') {
      hierarchyCountQuery = hierarchyCountQuery.eq('bracket_key', deletionTarget.bracketKey)
    }
    const { count: hierarchyCount } = await hierarchyCountQuery

    let resolutionsCountQuery = supabase
      .from('placeholder_resolutions')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
    if (deletionTarget.mode === 'ONE') {
      resolutionsCountQuery = resolutionsCountQuery.eq('bracket_key', deletionTarget.bracketKey)
    }
    const { count: resolutionsCount } = await resolutionsCountQuery

    const { error: transactionError } = await supabase.rpc('begin_transaction')
    if (transactionError) {
      throw new Error(`Transaction start failed: ${transactionError.message}`)
    }

    try {
      if (resolutionsCount && resolutionsCount > 0) {
        let deleteQuery = supabase
          .from('placeholder_resolutions')
          .delete()
          .eq('tournament_id', tournamentId)
        if (deletionTarget.mode === 'ONE') {
          deleteQuery = deleteQuery.eq('bracket_key', deletionTarget.bracketKey)
        }

        const { error: deleteError } = await deleteQuery
        if (deleteError) {
          throw new Error(`Placeholder resolutions delete failed: ${deleteError.message}`)
        }
      }

      if (hierarchyCount && hierarchyCount > 0) {
        let deleteQuery = supabase
          .from('match_hierarchy')
          .delete()
          .eq('tournament_id', tournamentId)
        if (deletionTarget.mode === 'ONE') {
          deleteQuery = deleteQuery.eq('bracket_key', deletionTarget.bracketKey)
        }

        const { error: deleteError } = await deleteQuery
        if (deleteError) {
          throw new Error(`Match hierarchy delete failed: ${deleteError.message}`)
        }
      }

      if (matchesCount && matchesCount > 0) {
        let deleteQuery = supabase
          .from('matches')
          .delete()
          .eq('tournament_id', tournamentId)
          .eq('type', 'ELIMINATION')
        if (deletionTarget.mode === 'ONE') {
          deleteQuery = deleteQuery.eq('bracket_key', deletionTarget.bracketKey)
        }

        const { error: deleteError } = await deleteQuery
        if (deleteError) {
          throw new Error(`Bracket matches delete failed: ${deleteError.message}`)
        }
      }

      if (seedsCount && seedsCount > 0) {
        let deleteQuery = supabase
          .from('tournament_couple_seeds')
          .delete()
          .eq('tournament_id', tournamentId)
        if (deletionTarget.mode === 'ONE') {
          deleteQuery = deleteQuery.eq('bracket_key', deletionTarget.bracketKey)
        }

        const { error: deleteError } = await deleteQuery
        if (deleteError) {
          throw new Error(`Tournament seeds delete failed: ${deleteError.message}`)
        }
      }

      if (deletionTarget.mode === 'ALL') {
        const { error: tournamentUpdateError } = await supabase
          .from('tournaments')
          .update(withTournamentSortValues({
            status: 'ZONE_PHASE',
            bracket_generated_at: null,
            placeholder_brackets_generated_at: null,
          }))
          .eq('id', tournamentId)

        if (tournamentUpdateError) {
          throw new Error(`Tournament status update failed: ${tournamentUpdateError.message}`)
        }
      } else {
        const { count: remainingEliminationMatches, error: remainingMatchesError } = await supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .eq('tournament_id', tournamentId)
          .eq('type', 'ELIMINATION')

        if (remainingMatchesError) {
          throw new Error(`Error checking remaining bracket matches: ${remainingMatchesError.message}`)
        }

        if ((remainingEliminationMatches || 0) === 0) {
          const { error: tournamentUpdateError } = await supabase
            .from('tournaments')
            .update(withTournamentSortValues({
              status: 'ZONE_PHASE',
              bracket_generated_at: null,
              placeholder_brackets_generated_at: null,
            }))
            .eq('id', tournamentId)

          if (tournamentUpdateError) {
            throw new Error(`Tournament status update failed: ${tournamentUpdateError.message}`)
          }
        }
      }

      const { error: commitError } = await supabase.rpc('commit_transaction')
      if (commitError) {
        throw new Error(`Transaction commit failed: ${commitError.message}`)
      }

      return NextResponse.json({
        success: true,
        message:
          deletionTarget.mode === 'ALL'
            ? 'Bracket deleted successfully. Tournament reverted to zone phase.'
            : `Bracket ${deletionTarget.bracketKey} deleted successfully.`,
        data: {
          tournament_id: tournamentId,
          tournament_name: tournament.name,
          bracket_key: deletionTarget.mode === 'ONE' ? deletionTarget.bracketKey : 'ALL',
          deleted_items: {
            seeds: seedsCount || 0,
            matches: matchesCount || 0,
            hierarchy_relationships: hierarchyCount || 0,
            placeholder_resolutions: resolutionsCount || 0,
          },
          tournament_status: deletionTarget.mode === 'ALL' ? 'ZONE_PHASE' : tournament.status,
          previous_status: tournament.status,
          was_placeholder_bracket: !!tournament.placeholder_brackets_generated_at,
          deletion_timestamp: new Date().toISOString(),
        },
      })
    } catch (error: any) {
      await supabase.rpc('rollback_transaction')
      throw error
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error deleting bracket',
      },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params
    const deletionTarget = resolveBracketDeletionTarget(request)
    const supabase = await createClient()

    if (!deletionTarget) {
      return NextResponse.json(
        { success: false, error: 'Invalid bracket_key. Use MAIN, GOLD, SILVER or ALL.' },
        { status: 400 }
      )
    }

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('id, name, status, bracket_generated_at, placeholder_brackets_generated_at')
      .eq('id', tournamentId)
      .single()

    if (!tournament) {
      return NextResponse.json(
        { success: false, error: 'Tournament not found' },
        { status: 404 }
      )
    }

    let seedsCountQuery = supabase
      .from('tournament_couple_seeds')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
    if (deletionTarget.mode === 'ONE') {
      seedsCountQuery = seedsCountQuery.eq('bracket_key', deletionTarget.bracketKey)
    }
    const { count: seedsCount } = await seedsCountQuery

    let matchesCountQuery = supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('type', 'ELIMINATION')
    if (deletionTarget.mode === 'ONE') {
      matchesCountQuery = matchesCountQuery.eq('bracket_key', deletionTarget.bracketKey)
    }
    const { count: matchesCount } = await matchesCountQuery

    let hierarchyCountQuery = supabase
      .from('match_hierarchy')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
    if (deletionTarget.mode === 'ONE') {
      hierarchyCountQuery = hierarchyCountQuery.eq('bracket_key', deletionTarget.bracketKey)
    }
    const { count: hierarchyCount } = await hierarchyCountQuery

    let resolutionsCountQuery = supabase
      .from('placeholder_resolutions')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
    if (deletionTarget.mode === 'ONE') {
      resolutionsCountQuery = resolutionsCountQuery.eq('bracket_key', deletionTarget.bracketKey)
    }
    const { count: resolutionsCount } = await resolutionsCountQuery

    let finishedMatchesCountQuery = supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('type', 'ELIMINATION')
      .eq('status', 'FINISHED')
    if (deletionTarget.mode === 'ONE') {
      finishedMatchesCountQuery = finishedMatchesCountQuery.eq('bracket_key', deletionTarget.bracketKey)
    }
    const { count: finishedMatchesCount } = await finishedMatchesCountQuery

    const hasBracket = (seedsCount || 0) > 0
    const canDelete = hasBracket && (finishedMatchesCount || 0) === 0

    return NextResponse.json({
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        has_placeholder_bracket: !!tournament.placeholder_brackets_generated_at,
        has_regular_bracket: !!tournament.bracket_generated_at,
      },
      bracket_key: deletionTarget.mode === 'ONE' ? deletionTarget.bracketKey : 'ALL',
      bracket_exists: hasBracket,
      can_delete: canDelete,
      deletion_blocked_reason: !canDelete && hasBracket ? 'Bracket has finished matches' : null,
      items_to_delete: {
        seeds: seedsCount || 0,
        matches: matchesCount || 0,
        hierarchy_relationships: hierarchyCount || 0,
        placeholder_resolutions: resolutionsCount || 0,
      },
      finished_matches_count: finishedMatchesCount || 0,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
