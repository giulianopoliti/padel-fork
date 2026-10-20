'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/database.types';
import type { BaseMatch, Round } from '@/types';

export function useTournamentMatches(tournamentId: string) {
  const [matches, setMatches] = useState<BaseMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const supabase = createClientComponentClient<Database>();

    async function fetchMatches() {
      try {
        setLoading(true);
        
        const { data: matchesData, error: matchesError } = await supabase
          .from('matches')
          .select(`
            id,
            tournament_id,
            round,
            status,
            court,
            created_at,
            zone_info:zone_id(name),
            couple1:couples!matches_couple1_id_fkey(
              id,
              player1_id,
              player2_id,
              player1_details:players!couples_player1_id_fkey(id, first_name, last_name),
              player2_details:players!couples_player2_id_fkey(id, first_name, last_name)
            ),
            couple2:couples!matches_couple2_id_fkey(
              id,
              player1_id,
              player2_id,
              player1_details:players!couples_player1_id_fkey(id, first_name, last_name),
              player2_details:players!couples_player2_id_fkey(id, first_name, last_name)
            )
          `)
          .eq('tournament_id', tournamentId)
          .eq('bracket_is_active', true)
          .order('created_at', { ascending: true });

        if (matchesError) throw matchesError;
        if (!matchesData) return;

        // Transform matches
        const transformedMatches = matchesData
          .filter(match => {
            const hasBye = 
              match.couple1?.id === "BYE_MARKER" || 
              match.couple2?.id === "BYE_MARKER" ||
              match.couple1?.player1_details?.first_name?.includes('BYE') ||
              match.couple1?.player2_details?.first_name?.includes('BYE') ||
              match.couple2?.player1_details?.first_name?.includes('BYE') ||
              match.couple2?.player2_details?.first_name?.includes('BYE');
            
            return !hasBye;
          })
          .map(match => {
            const player1Couple1 = `${match.couple1?.player1_details?.first_name || ''} ${match.couple1?.player1_details?.last_name || ''}`.trim();
            const player2Couple1 = `${match.couple1?.player2_details?.first_name || ''} ${match.couple1?.player2_details?.last_name || ''}`.trim();
            const player1Couple2 = `${match.couple2?.player1_details?.first_name || ''} ${match.couple2?.player1_details?.last_name || ''}`.trim();
            const player2Couple2 = `${match.couple2?.player2_details?.first_name || ''} ${match.couple2?.player2_details?.last_name || ''}`.trim();

            return {
              id: match.id,
              tournament_id: match.tournament_id || tournamentId,
              round: (match.round || 'ZONE') as Round,
              status: match.status || 'PENDING',
              court: match.court,
              created_at: match.created_at,
              zone_name: match.zone_info?.name,
              couple_1: {
                id: match.couple1?.id || '',
                player_1: player1Couple1 || 'Jugador 1',
                player_2: player2Couple1 || 'Jugador 2',
              },
              couple_2: {
                id: match.couple2?.id || '',
                player_1: player1Couple2 || 'Jugador 1',
                player_2: player2Couple2 || 'Jugador 2',
              },
            };
          });

        console.log('Matches found:', transformedMatches.length);
        setMatches(transformedMatches);
      } catch (err) {
        // Mejoramos el log de errores para tener más contexto.
        console.error('Error in useTournamentMatches:', err);
        if (typeof err === 'object' && err !== null) {
          console.error('Error details:', JSON.stringify(err, null, 2));
        }
        setError(err instanceof Error ? err : new Error('An unknown error occurred while fetching matches'));
      } finally {
        setLoading(false);
      }
    }

    fetchMatches();

    // Subscribe to changes in matches
    const channel = supabase
      .channel('matches_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => {
          // Reload matches when there's a change
          fetchMatches();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [tournamentId]);

  return { matches, loading, error };
}
