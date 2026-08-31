import React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { checkTournamentPermissions } from '@/utils/tournament-permissions';
import ZonesView from './components/ZonesView';

interface ZonesPageProps {
  params: { id: string };
}

/**
 * 🎯 SERVER COMPONENT: ZONAS DEL TORNEO
 *
 * Página dedicada para la gestión de zonas en torneos americanos.
 *
 * CARACTERÍSTICAS:
 * ✅ SSR inicial - Datos cargados en servidor
 * ✅ Detecta sistema legacy vs nuevo
 * ✅ Renderiza TournamentZonesWrapper
 * ✅ Compatible con todos los tipos de torneo
 * ✅ Vista pública disponible (sin autenticación requerida)
 * ✅ Vista propietario con permisos de edición
 */

/**
 * 📄 METADATA DINÁMICO PARA SEO
 */
export async function generateMetadata({ params }: ZonesPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, type, clubes:club_id(name)')
    .eq('id', resolvedParams.id)
    .single();

  const clubName = tournament?.clubes?.name || 'Club';

  return {
    title: `Zonas - ${tournament?.name || 'Torneo'}`,
    description: `Gestión de zonas para ${tournament?.name} en ${clubName}. ${
      tournament?.type === 'AMERICAN' ? 'Sistema de armado de zonas con distribución serpentino.' : 'Zonas del torneo.'
    }`,
  };
}

/**
 * 🏗️ SERVER COMPONENT PRINCIPAL
 */
export default async function ZonesPage({ params }: ZonesPageProps) {
  const resolvedParams = await params;
  const tournamentId = resolvedParams.id;
  const supabase = await createClient();

  // ========================================
  // PASO 1: VERIFICAR TORNEO
  // ========================================

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('id, name, type, status, club_id, gender')
    .eq('id', tournamentId)
    .single();

  if (error || !tournament) {
    console.error('Tournament not found');
    redirect('/torneos');
  }

  // ========================================
  // PASO 2: VERIFICAR PERMISOS (CENTRALIZADO)
  // ========================================

  const { data: { user } } = await supabase.auth.getUser();

  // ✅ Permitir vista pública - No requiere autenticación
  // Si hay usuario, verificar permisos; si no, isOwner = false
  let isOwner = false;

  if (user) {
    // ✅ USAR FUNCIÓN CENTRALIZADA que maneja ADMIN, CLUB y ORGANIZADOR
    const permissions = await checkTournamentPermissions(user.id, tournamentId);
    isOwner = permissions.hasPermission;
  }

  // ========================================
  // PASO 3: OBTENER PAREJAS INSCRITAS (aprobadas)
  // ========================================

  const { data: inscriptionsData } = await supabase
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
          score,
          dni,
          phone
        ),
        players_player2:player2_id (
          id,
          first_name,
          last_name,
          score,
          dni,
          phone
        )
      )
    `)
    .eq('tournament_id', tournamentId)
    .eq('is_pending', false)
    .not('couple_id', 'is', null)
    .order('created_at', { ascending: true });

  const coupleInscriptions = inscriptionsData || [];

  // ========================================
  // PASO 3.5: OBTENER CONTEO DE INSCRIPCIONES PENDIENTES
  // ========================================

  const { count: pendingCount } = await supabase
    .from('inscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('is_pending', true)
    .not('couple_id', 'is', null);

  const pendingInscriptionsCount = pendingCount || 0;

  // ========================================
  // PASO 4: RENDERIZAR CLIENT COMPONENT
  // ========================================

  return (
    <ZonesView
      tournament={tournament as any}
      coupleInscriptions={coupleInscriptions as any}
      isOwner={isOwner}
      pendingInscriptionsCount={pendingInscriptionsCount}
    />
  );
}
