import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { checkTournamentAccess } from '@/utils/tournament-permissions';
import { canViewTournamentParticipantPages } from '@/utils/tournament-visibility';
import QuallyView from './components/QuallyView';

interface QuallyPageProps {
  params: Promise<{ id: string }>;
}

/**
 * 🎯 PÁGINA INDEPENDIENTE PARA GESTIÓN DE QUALI
 * 
 * Esta página es completamente independiente del sistema americano.
 * Maneja la gestión previa de parejas inscritas con drag & drop para
 * agregar/quitar parejas que se hayan anotado después.
 */
export default async function QuallyPage({ params }: QuallyPageProps) {
  const resolvedParams = await params;
  const tournamentId = resolvedParams.id;
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Verificar que el torneo existe
  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('id, name, type, status, club_id, enable_public_inscriptions, format_type')
    .eq('id', tournamentId)
    .single();

  if (error || !tournament) {
    redirect('/tournaments');
  }

  // Por ahora solo para torneos largos, pero se puede extender
  if (tournament.type !== 'LONG') {
    redirect(`/tournaments/${tournamentId}`);
  }

  const accessCheck = await checkTournamentAccess(user?.id || null, tournamentId);

  if (!canViewTournamentParticipantPages({
    enablePublicInscriptions: tournament.enable_public_inscriptions,
    accessLevel: accessCheck.accessLevel,
  })) {
    redirect(`/tournaments/${tournamentId}`);
  }

  // Obtener parejas inscritas con información de jugadores
  const { data: coupleInscriptions, error: inscriptionsError } = await supabase
    .from('inscriptions')
    .select(`
      id,
      couple_id,
      created_at,
      couples:couple_id (
        id,
        player1_id,
        player2_id,
        players_player1:player1_id (
          id,
          first_name,
          last_name,
          profile_image_url,
          score
        ),
        players_player2:player2_id (
          id,
          first_name,
          last_name,
          profile_image_url,
          score
        )
      )
    `)
    .eq('tournament_id', tournamentId)
    .eq('is_pending', false)
    .not('couple_id', 'is', null)
    .order('created_at', { ascending: true });

  if (inscriptionsError) {
    console.error('Error loading qually inscriptions', {
      tournamentId,
      code: inscriptionsError.code,
      message: inscriptionsError.message,
    });
    return (
      <div role="alert" className="mx-auto max-w-7xl p-4 sm:p-6">
        <p className="text-destructive">No pudimos cargar las parejas inscritas. Intentá recargar la página.</p>
      </div>
    );
  }

  return (
    <QuallyView 
      tournament={tournament as any}
      coupleInscriptions={coupleInscriptions ?? []}
      canManageTournament={accessCheck.accessLevel === 'FULL_MANAGEMENT'}
      playerCoupleId={accessCheck.metadata.coupleId || null}
    />
  );
}
