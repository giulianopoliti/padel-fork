import React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { checkTournamentPermissions } from '@/utils/tournament-permissions';
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver';
import MatchesView from './components/MatchesView';

interface MatchesPageProps {
  params: { id: string };
}

/**
 * 🎯 SERVER COMPONENT: PARTIDOS DEL TORNEO
 *
 * Página dedicada para la gestión de partidos de zona en torneos americanos.
 *
 * CARACTERÍSTICAS:
 * ✅ SSR inicial - Datos cargados en servidor
 * ✅ Renderiza UnifiedMatchesTab
 * ✅ Compatible con torneos americanos
 * ✅ Control de permisos integrado
 */

/**
 * 📄 METADATA DINÁMICO PARA SEO
 */
export async function generateMetadata({ params }: MatchesPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, type, clubes:club_id(name)')
    .eq('id', resolvedParams.id)
    .single();

  const clubName = tournament?.clubes?.name || 'Club';

  return {
    title: `Partidos - ${tournament?.name || 'Torneo'}`,
    description: `Gestión de partidos de zona para ${tournament?.name} en ${clubName}. Sistema de partidos con resultados en tiempo real.`,
  };
}

/**
 * 🏗️ SERVER COMPONENT PRINCIPAL
 */
export default async function MatchesPage({ params }: MatchesPageProps) {
  const resolvedParams = await params;
  const tournamentId = resolvedParams.id;
  const supabase = await createClient();

  // ========================================
  // PASO 1: VERIFICAR TORNEO
  // ========================================

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('id, name, type, status, club_id, gender, format_type, format_config')
    .eq('id', tournamentId)
    .single();

  if (error || !tournament) {
    console.error('Tournament not found');
    redirect('/tournaments');
  }

  // ========================================
  // PASO 2: VERIFICAR PERMISOS (CENTRALIZADO)
  // ========================================

  const { data: { user } } = await supabase.auth.getUser();

  let isOwner = false;
  let isPublicView = !user;

  if (user) {
    // ✅ USAR FUNCIÓN CENTRALIZADA que maneja ADMIN, CLUB y ORGANIZADOR
    const permissions = await checkTournamentPermissions(user.id, tournamentId);
    isOwner = permissions.hasPermission;
  }

  // ========================================
  // PASO 3: OBTENER NÚMERO DE CANCHAS (OPCIONAL)
  // ========================================

  const { data: clubData } = await supabase
    .from('clubes')
    .select('courts')
    .eq('id', tournament.club_id)
    .single();

  const clubCourts = clubData?.courts || 10;
  const resolvedFormat = TournamentFormatResolver.getResolvedFormat(tournament);
  const recommendationEnabled = (
    resolvedFormat.baseType === 'AMERICAN' &&
    resolvedFormat.zoneMode === 'SINGLE_ZONE'
  );

  // ========================================
  // PASO 4: RENDERIZAR CLIENT COMPONENT
  // ========================================

  return (
    <MatchesView
      tournament={tournament as any}
      isOwner={isOwner}
      isPublicView={isPublicView}
      clubCourts={clubCourts}
      recommendationEnabled={recommendationEnabled}
    />
  );
}
