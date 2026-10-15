import { withTournamentSortValues } from '../lib/tournaments/tournament-sort-values'
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

// Load .env.local file (Next.js convention)
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

interface CleanupStats {
    tournament_id: string;
    tournament_name: string;
    match_hierarchy_deleted: number;
    matches_deleted: number;
    tournament_couple_seeds_deleted: number;
    tournament_updated: boolean;
    errors: number;
    errorDetails: Array<{ operation: string; error: string }>;
}

const main = async () => {
    console.log('🚀 Starting tournament data cleanup script...\n');

    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('❌ Missing SUPABASE env vars: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log('✅ Connected to Supabase\n');

    // Get tournament ID from command line arguments
    const tournamentId = process.argv[2];
    if (!tournamentId) {
        throw new Error('❌ Please provide tournament ID as argument: npm run cleanup-tournament <tournament-id>');
    }

    console.log(`🎯 Target tournament ID: ${tournamentId}\n`);

    // Step 1: Verify tournament exists
    console.log('📋 Step 1: Verifying tournament exists...');
    const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .select('id, name, status, bracket_status')
        .eq('id', tournamentId)
        .single();

    if (tournamentError) {
        if (tournamentError.code === 'PGRST116') {
            throw new Error(`❌ Tournament with ID ${tournamentId} not found.`);
        }
        console.error('❌ Error fetching tournament:', tournamentError);
        throw tournamentError;
    }

    console.log(`✅ Tournament found: "${tournament.name}"`);
    console.log(`   Current status: ${tournament.status}`);
    console.log(`   Current bracket_status: ${tournament.bracket_status}\n`);

    // Initialize stats
    const stats: CleanupStats = {
        tournament_id: tournamentId,
        tournament_name: tournament.name,
        match_hierarchy_deleted: 0,
        matches_deleted: 0,
        tournament_couple_seeds_deleted: 0,
        tournament_updated: false,
        errors: 0,
        errorDetails: []
    };

    // Step 2: Count existing records before deletion
    console.log('📋 Step 2: Counting existing records...');
    
    const { count: matchHierarchyCount } = await supabase
        .from('match_hierarchy')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId);

    const { count: matchesCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId);

    const { count: zoneMatchesCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('round', 'ZONE');

    const { count: nonZoneMatchesCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .not('round', 'eq', 'ZONE');

    const { count: seedsCount } = await supabase
        .from('tournament_couple_seeds')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId);

    console.log(`📊 Existing records:`);
    console.log(`   match_hierarchy: ${matchHierarchyCount || 0}`);
    console.log(`   matches: ${matchesCount || 0} (ZONE: ${zoneMatchesCount || 0}, Others: ${nonZoneMatchesCount || 0})`);
    console.log(`   tournament_couple_seeds: ${seedsCount || 0}\n`);

    // Step 3: Delete match_hierarchy records
    console.log('📋 Step 3: Deleting match_hierarchy records...');
    const { error: matchHierarchyError, count: matchHierarchyDeleted } = await supabase
        .from('match_hierarchy')
        .delete({ count: 'exact' })
        .eq('tournament_id', tournamentId);

    if (matchHierarchyError) {
        console.error(`❌ Error deleting match_hierarchy: ${matchHierarchyError.message}`);
        stats.errors++;
        stats.errorDetails.push({
            operation: 'delete_match_hierarchy',
            error: matchHierarchyError.message
        });
    } else {
        stats.match_hierarchy_deleted = matchHierarchyDeleted || 0;
        console.log(`✅ Deleted ${stats.match_hierarchy_deleted} match_hierarchy records\n`);
    }

    // Step 4: Delete matches records (excluding ZONE round matches)
    console.log('📋 Step 4: Deleting matches records (excluding ZONE round matches)...');
    const { error: matchesError, count: matchesDeleted } = await supabase
        .from('matches')
        .delete({ count: 'exact' })
        .eq('tournament_id', tournamentId)
        .not('round', 'eq', 'ZONE');

    if (matchesError) {
        console.error(`❌ Error deleting matches: ${matchesError.message}`);
        stats.errors++;
        stats.errorDetails.push({
            operation: 'delete_matches',
            error: matchesError.message
        });
    } else {
        stats.matches_deleted = matchesDeleted || 0;
        console.log(`✅ Deleted ${stats.matches_deleted} matches records\n`);
    }

    // Step 5: Delete tournament_couple_seeds records
    console.log('📋 Step 5: Deleting tournament_couple_seeds records...');
    const { error: seedsError, count: seedsDeleted } = await supabase
        .from('tournament_couple_seeds')
        .delete({ count: 'exact' })
        .eq('tournament_id', tournamentId);

    if (seedsError) {
        console.error(`❌ Error deleting tournament_couple_seeds: ${seedsError.message}`);
        stats.errors++;
        stats.errorDetails.push({
            operation: 'delete_tournament_couple_seeds',
            error: seedsError.message
        });
    } else {
        stats.tournament_couple_seeds_deleted = seedsDeleted || 0;
        console.log(`✅ Deleted ${stats.tournament_couple_seeds_deleted} tournament_couple_seeds records\n`);
    }

    // Step 6: Update tournament status
    console.log('📋 Step 6: Updating tournament status...');
    const { error: updateError } = await supabase
        .from('tournaments')
        .update(withTournamentSortValues({
            status: 'ZONE_PHASE',
            bracket_status: 'NOT_STARTED',
            bracket_generated_at: null,
            last_bracket_update: null,
            placeholder_brackets_generated_at: null
        }))
        .eq('id', tournamentId);

    if (updateError) {
        console.error(`❌ Error updating tournament: ${updateError.message}`);
        stats.errors++;
        stats.errorDetails.push({
            operation: 'update_tournament',
            error: updateError.message
        });
    } else {
        stats.tournament_updated = true;
        console.log(`✅ Tournament status updated to ZONE_PHASE and bracket_status to NOT_STARTED\n`);
    }

    // Step 7: Final report
    console.log('\n' + '='.repeat(70));
    console.log('📊 CLEANUP SUMMARY');
    console.log('='.repeat(70));
    console.log(`Tournament: "${stats.tournament_name}" (${stats.tournament_id})`);
    console.log(`✅ match_hierarchy deleted:     ${stats.match_hierarchy_deleted}`);
    console.log(`✅ matches deleted:             ${stats.matches_deleted}`);
    console.log(`✅ tournament_couple_seeds deleted: ${stats.tournament_couple_seeds_deleted}`);
    console.log(`✅ Tournament status updated:   ${stats.tournament_updated ? 'Yes' : 'No'}`);
    console.log(`❌ Errors:                      ${stats.errors}`);
    console.log('='.repeat(70));

    if (stats.errorDetails.length > 0) {
        console.log('\n❌ Error Details:');
        stats.errorDetails.forEach(detail => {
            console.log(`   Operation: ${detail.operation}`);
            console.log(`   Error: ${detail.error}\n`);
        });
    }

    // Step 8: Verification query
    console.log('\n📋 Step 8: Verification - Checking final state...');
    
    // Check if all records were deleted
    const { count: finalMatchHierarchyCount } = await supabase
        .from('match_hierarchy')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId);

    const { count: finalMatchesCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId);

    const { count: finalZoneMatchesCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('round', 'ZONE');

    const { count: finalNonZoneMatchesCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .not('round', 'eq', 'ZONE');

    const { count: finalSeedsCount } = await supabase
        .from('tournament_couple_seeds')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId);

    // Check tournament status
    const { data: finalTournament } = await supabase
        .from('tournaments')
        .select('status, bracket_status')
        .eq('id', tournamentId)
        .single();

    console.log(`📊 Final state:`);
    console.log(`   match_hierarchy remaining: ${finalMatchHierarchyCount || 0}`);
    console.log(`   matches remaining: ${finalMatchesCount || 0} (ZONE: ${finalZoneMatchesCount || 0}, Others: ${finalNonZoneMatchesCount || 0})`);
    console.log(`   tournament_couple_seeds remaining: ${finalSeedsCount || 0}`);
    console.log(`   Tournament status: ${finalTournament?.status}`);
    console.log(`   Tournament bracket_status: ${finalTournament?.bracket_status}`);

    if (stats.errors === 0) {
        console.log('\n✅ Cleanup script completed successfully!');
    } else {
        console.log('\n⚠️  Cleanup completed with errors. Please review the error details above.');
    }
};

main().catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});
