/**
 * Generate Bracket with Placeholders API Endpoint
 * POST /api/tournaments/[id]/generate-bracket-with-placeholders
 * 
 * Creates tournament brackets before all zone matches are completed.
 * Uses placeholders for unknown positions and definitive couples for known positions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { PlaceholderBracketGenerator } from '@/lib/services/bracket-generator-v2'
import { DefinitivePositionAnalyzer } from '@/lib/services/definitive-position-analyzer'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params
    
    if (!tournamentId) {
      return NextResponse.json(
        { success: false, error: 'Tournament ID is required' },
        { status: 400 }
      )
    }

    console.log(`[GENERATE-BRACKET-PLACEHOLDERS] 🚀 Starting bracket generation for tournament: ${tournamentId}`)

    const supabase = await createClient()

    // 1. Validate tournament exists and is in correct state
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, name, status, type, allows_placeholder_brackets, enable_draft_matches')
      .eq('id', tournamentId)
      .single()

    if (tournamentError || !tournament) {
      return NextResponse.json(
        { success: false, error: 'Tournament not found' },
        { status: 404 }
      )
    }

    if (!tournament.allows_placeholder_brackets) {
      return NextResponse.json(
        { success: false, error: 'Tournament does not allow placeholder brackets' },
        { status: 400 }
      )
    }

    if (!['ZONE_PHASE', 'ZONES_READY', 'MATCHES_READY'].includes(tournament.status || '')) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Invalid tournament status: ${tournament.status}. Must be in zone phase to generate brackets.` 
        },
        { status: 400 }
      )
    }

    // 2. Check if brackets already exist
    const { data: existingSeeds, error: seedsError } = await supabase
      .from('tournament_couple_seeds')
      .select('id')
      .eq('tournament_id', tournamentId)
      .limit(1)

    if (seedsError) {
      throw new Error(`Error checking existing seeds: ${seedsError.message}`)
    }

    if (existingSeeds && existingSeeds.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Brackets already exist for this tournament. Use DELETE endpoint to clear first.' 
        },
        { status: 409 }
      )
    }

    // 3. Analyze definitive positions across all zones
    console.log(`[GENERATE-BRACKET-PLACEHOLDERS] 🔍 Analyzing definitive positions...`)
    
    const analyzer = new DefinitivePositionAnalyzer()
    const { data: zones } = await supabase
      .from('zones')
      .select('id, name')
      .eq('tournament_id', tournamentId)

    if (!zones || zones.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No zones found for tournament' },
        { status: 400 }
      )
    }

    let totalDefinitive = 0
    let totalPlaceholders = 0

    for (const zone of zones) {
      const analysis = await analyzer.analyzeZonePositions(zone.id)
      const definitiveCount = analysis.filter(a => a.isDefinitive).length
      const placeholderCount = analysis.filter(a => !a.isDefinitive).length
      
      totalDefinitive += definitiveCount
      totalPlaceholders += placeholderCount
      
      console.log(`[GENERATE-BRACKET-PLACEHOLDERS] Zone ${zone.name}: ${definitiveCount} definitive, ${placeholderCount} placeholders`)
    }

    console.log(`[GENERATE-BRACKET-PLACEHOLDERS] 📊 Total: ${totalDefinitive} definitive, ${totalPlaceholders} placeholders`)

    // 4. Generate bracket with placeholders
    const generator = new PlaceholderBracketGenerator()
    
    // Generate seeding
    console.log(`[GENERATE-BRACKET-PLACEHOLDERS] 🎯 Generating placeholder seeding...`)
    const seeds = await generator.generatePlaceholderSeeding(tournamentId)

    // Generate matches
    console.log(`[GENERATE-BRACKET-PLACEHOLDERS] ⚡ Creating bracket matches...`)
    const matches = await generator.generateBracketMatches(seeds, tournamentId, 'MAIN', {
      draftPlayableMatches: tournament.type === 'LONG' && Boolean(tournament.enable_draft_matches),
    })

    // Generate hierarchy
    console.log(`[GENERATE-BRACKET-PLACEHOLDERS] 🔗 Creating match hierarchy...`)
    const hierarchy = await generator.createMatchHierarchy(matches, tournamentId)
    console.log(`[GENERATE-BRACKET-PLACEHOLDERS] ✅ Hierarchy created with ${hierarchy.length} relationships`)

    // Process BYEs with hierarchy for propagation
    console.log(`[GENERATE-BRACKET-PLACEHOLDERS] 🔄 Processing BYE matches with propagation...`)
    console.log(`[GENERATE-BRACKET-PLACEHOLDERS] 📊 Before BYE processing - matches count: ${matches.length}`)
    
    try {
      await generator.processBracketByes(matches, hierarchy, {
        draftPlayableMatches: tournament.type === 'LONG' && Boolean(tournament.enable_draft_matches),
      })
      console.log(`[GENERATE-BRACKET-PLACEHOLDERS] ✅ BYE processing completed successfully`)
    } catch (error) {
      console.error(`[GENERATE-BRACKET-PLACEHOLDERS] ❌ Error processing BYEs:`, error)
      throw error
    }

    // 5. Save everything to database in transaction
    console.log(`[GENERATE-BRACKET-PLACEHOLDERS] 💾 Saving to database...`)
    
    const { error: transactionError } = await supabase.rpc('begin_transaction')
    if (transactionError) {
      throw new Error(`Transaction start failed: ${transactionError.message}`)
    }

    try {
      // 1. Insert seeds FIRST and get generated IDs back
      const { data: insertedSeeds, error: seedsInsertError } = await supabase
        .from('tournament_couple_seeds')
        .insert(seeds.map(seed => ({
          // No 'id' field - let Supabase generate it
          tournament_id: tournamentId,
          couple_id: seed.couple_id,
          seed: seed.seed,
          bracket_position: seed.bracket_position,
          is_placeholder: seed.is_placeholder,
          placeholder_zone_id: seed.placeholder_zone_id,
          placeholder_position: seed.placeholder_position,
          placeholder_label: seed.placeholder_label,
          created_as_placeholder: seed.created_as_placeholder
        })))
        .select('id, seed, bracket_position') // IMPORTANT: Get back the generated IDs

      if (seedsInsertError || !insertedSeeds) {
        throw new Error(`Seeds insert failed: ${seedsInsertError?.message || 'No data returned'}`)
      }

      console.log(`📊 [GENERATE-BRACKET-PLACEHOLDERS] Inserted ${insertedSeeds.length} seeds with generated IDs`)

      // 2. Populate matches with seed FK references
      const matchesWithSeedRefs = generator.populateMatchSeedReferences(matches, seeds, insertedSeeds)

      // 3. Insert matches with valid FK references
      const { error: matchesInsertError } = await supabase
        .from('matches')
        .insert(matchesWithSeedRefs.map(match => ({
          id: match.id,
          tournament_id: match.tournament_id,
          couple1_id: match.couple1_id,
          couple2_id: match.couple2_id,
          tournament_couple_seed1_id: match.tournament_couple_seed1_id, // ✅ Now populated correctly
          tournament_couple_seed2_id: match.tournament_couple_seed2_id, // ✅ Now populated correctly
          placeholder_couple1_label: match.placeholder_couple1_label,
          placeholder_couple2_label: match.placeholder_couple2_label,
          round: match.round as any,
          order_in_round: match.order_in_round,
          status: match.status as any,
          type: match.type,
          is_from_initial_generation: true
        })))

      if (matchesInsertError) {
        throw new Error(`Matches insert failed: ${matchesInsertError.message}`)
      }

      // Insert hierarchy
      const { error: hierarchyInsertError } = await supabase
        .from('match_hierarchy')
        .insert(hierarchy.map(h => ({
          tournament_id: h.tournament_id,
          parent_match_id: h.parent_match_id,
          child_match_id: h.child_match_id,
          parent_round: h.parent_round,
          child_round: h.child_round,
          parent_slot: h.parent_slot
        })))

      if (hierarchyInsertError) {
        throw new Error(`Hierarchy insert failed: ${hierarchyInsertError.message}`)
      }

      // Update tournament status
      const { error: tournamentUpdateError } = await supabase
        .from('tournaments')
        .update({
          status: 'BRACKET_PHASE',
          placeholder_brackets_generated_at: new Date().toISOString(),
          bracket_generated_at: new Date().toISOString()
        })
        .eq('id', tournamentId)

      if (tournamentUpdateError) {
        throw new Error(`Tournament update failed: ${tournamentUpdateError.message}`)
      }

      // Commit transaction
      const { error: commitError } = await supabase.rpc('commit_transaction')
      if (commitError) {
        throw new Error(`Transaction commit failed: ${commitError.message}`)
      }

      console.log(`[GENERATE-BRACKET-PLACEHOLDERS] ✅ Bracket generation completed successfully`)

      // 6. Return success response
      return NextResponse.json({
        success: true,
        message: `Bracket generated successfully with ${totalDefinitive} definitive couples and ${totalPlaceholders} placeholders`,
        data: {
          tournament_id: tournamentId,
          tournament_name: tournament.name,
          total_seeds: seeds.length,
          definitive_couples: totalDefinitive,
          placeholders: totalPlaceholders,
          total_matches: matches.length,
          rounds_created: [...new Set(matches.map(m => m.round))].length,
          hierarchy_relationships: hierarchy.length,
          bye_matches: matches.filter(m => m.status === 'BYE').length,
          seeds_breakdown: {
            definitive: seeds.filter(s => !s.is_placeholder).map(s => ({
              seed: s.seed,
              bracket_position: s.bracket_position,
              couple_id: s.couple_id
            })),
            placeholders: seeds.filter(s => s.is_placeholder).map(s => ({
              seed: s.seed,
              bracket_position: s.bracket_position,
              placeholder_label: s.placeholder_label,
              zone_reference: s.placeholder_zone_id
            }))
          }
        }
      })

    } catch (error: any) {
      // Rollback transaction
      await supabase.rpc('rollback_transaction')
      throw error
    }

  } catch (error: any) {
    console.error('[GENERATE-BRACKET-PLACEHOLDERS] ❌ Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Unknown error generating bracket with placeholders' 
      },
      { status: 500 }
    )
  }
}

// GET endpoint for checking bracket generation status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params
    const supabase = await createClient()

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('id, name, status, allows_placeholder_brackets, placeholder_brackets_generated_at')
      .eq('id', tournamentId)
      .single()

    const { data: seedsCount } = await supabase
      .from('tournament_couple_seeds')
      .select('id', { count: 'exact' })
      .eq('tournament_id', tournamentId)

    const { data: matchesCount } = await supabase
      .from('matches')
      .select('id', { count: 'exact' })
      .eq('tournament_id', tournamentId)
      .eq('type', 'ELIMINATION')

    return NextResponse.json({
      tournament,
      brackets_exist: (seedsCount?.length || 0) > 0,
      seeds_count: seedsCount?.length || 0,
      matches_count: matchesCount?.length || 0,
      can_generate_placeholders: tournament?.allows_placeholder_brackets && 
                                 ['ZONE_PHASE', 'ZONES_READY', 'MATCHES_READY'].includes(tournament?.status || '')
    })

  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
