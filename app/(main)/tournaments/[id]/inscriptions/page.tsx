import React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getTournamentDetailsWithInscriptions } from '@/app/api/tournaments/actions';
import { getAllPlayersDTO } from '@/app/api/players/actions';
import { getTenantBranding } from '@/config/tenant';
import { shouldTreatTournamentRegistrationAsPublic } from '@/lib/tournaments/tenant-registration-policy';
import { checkTournamentAccess } from '@/utils/tournament-permissions';
import { canViewTournamentInscriptionsPage } from '@/utils/tournament-visibility';
import InscriptionsClient from './components/InscriptionsClient';
import { getTpeLateWithdrawalCounts } from '@/lib/services/tpe-registration-restrictions';

interface InscriptionsPageProps {
  params: { id: string };
}

/**
 * 🎯 SERVER COMPONENT: INSCRIPCIONES HÍBRIDAS
 * 
 * Arquitectura híbrida que combina:
 * ✅ SSR inicial - Datos cargados en servidor (SEO + performance)
 * ✅ Client updates - SWR para real-time y mutaciones
 * ✅ Reutilización - Componentes testeados del americano
 * ✅ Escalabilidad - Preparado para pagos y webhooks
 * 
 * FLUJO:
 * 1. Server renderiza con datos iniciales (este archivo)
 * 2. Client hidrata con SWR (InscriptionsClient.tsx)
 * 3. Mutaciones usan API routes (/api/tournaments/[id]/inscriptions)
 * 4. SWR revalida automáticamente para real-time
 */

/**
 * 📄 METADATA DINÁMICO PARA SEO
 * 
 * Genera meta tags basados en datos del torneo.
 * Importante para páginas públicas que pueden ser indexadas.
 */
export async function generateMetadata({ params }: InscriptionsPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const supabase = await createClient();
  
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, type, hide_venue, clubes:club_id(name)')
    .eq('id', resolvedParams.id)
    .single();

  const club = Array.isArray(tournament?.clubes) ? tournament.clubes[0] : tournament?.clubes;
  const clubName = tournament?.hide_venue ? null : club?.name;
  const venueDescription = clubName ? ` en ${clubName}` : '';
  
  // ✅ Descripción adaptada al tipo de torneo
  const description = tournament?.type === 'LONG'
    ? `Inscripciones abiertas para ${tournament?.name}${venueDescription}. Sistema de torneos largos con gestión de fechas.`
    : `Inscripciones abiertas para ${tournament?.name}${venueDescription}. Torneo americano con sistema de zonas.`;

  return {
    title: `Inscripciones - ${tournament?.name || 'Torneo'}`,
    description,
    robots: 'index, follow', // Permitir indexación para visibility pública
  };
}

/**
 * 🏗️ SERVER COMPONENT PRINCIPAL
 * 
 * ✅ REUTILIZA: getTournamentDetailsWithInscriptions del americano
 * ✅ Mismo formato de datos que espera TournamentCouplesTab
 * ✅ Sin queries complejos ni mapeo innecesario
 */
export default async function InscriptionsPage({ params }: InscriptionsPageProps) {
  const resolvedParams = await params;
  const tournamentId = resolvedParams.id;

  // ========================================
  // PASO 0: VERIFICAR PERMISOS BÁSICOS
  // ========================================

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Nota: No redirigimos a login porque las inscripciones pueden ser públicas
  // pero sí verificamos permisos para mostrar funcionalidad de edición

  // ========================================
  // PASO 1: REUTILIZAR FUNCIÓN DEL AMERICANO
  // ========================================

  // ✅ MISMA función que usa TournamentProvider del americano
  const { tournament, inscriptions } = await getTournamentDetailsWithInscriptions(tournamentId);

  // Redirect si torneo no existe
  if (!tournament) {
    console.error('Tournament not found');
    redirect('/tournaments');
  }

  const accessCheck = await checkTournamentAccess(user?.id || null, tournamentId);
  const branding = getTenantBranding();
  const enablePublicRegistration = shouldTreatTournamentRegistrationAsPublic({
    tenantKey: branding.key,
    tournamentType: tournament.type,
    enablePublicInscriptions: tournament.enable_public_inscriptions,
  });

  if (!canViewTournamentInscriptionsPage({
    enablePublicInscriptions: enablePublicRegistration,
    accessLevel: accessCheck.accessLevel,
  })) {
    redirect(`/tournaments/${tournamentId}`);
  }

  // ✅ CAMBIO: Permitir tanto AMERICAN como LONG
  // Solo redirigir si el tipo es inválido o no existe
  if (!tournament.type || !['LONG', 'AMERICAN'].includes(tournament.type)) {
    console.log(`Tournament ${tournamentId} has invalid type ${tournament.type}, redirecting`);
    redirect(`/tournaments/${tournamentId}`);
  }

  // ========================================
  // PASO 2: OBTENER JUGADORES PARA FORMULARIOS
  // ========================================
  
  // ✅ REUTILIZAR: Misma función que usa el americano
  const allPlayers = await getAllPlayersDTO();

  // ========================================
  // PASO 3: PROCESAR PAREJAS (IGUAL QUE EL AMERICANO)
  // ========================================
  
  // ========================================
  // PASO 3A: PROCESAR PAREJAS (IGUAL QUE EL AMERICANO)
  // ========================================
  
  const coupleInscriptions = inscriptions
    .filter((inscription: any) => inscription.couple_id)
    .map((inscription: any) => {
      const couple = inscription.couple && inscription.couple.length > 0 ? inscription.couple[0] : null;
      if (!couple) return null;

      const player1 = couple.player1 && couple.player1.length > 0 ? couple.player1[0] : null;
      const player2 = couple.player2 && couple.player2.length > 0 ? couple.player2[0] : null;

      // Extraer datos de pago desde inscription_payments
      const payments = inscription.inscription_payments || [];
      const player1Payment = payments.find((p: any) => p.player_id === couple.player1_id);
      const player2Payment = payments.find((p: any) => p.player_id === couple.player2_id);

      return {
        id: String(couple.id),
        tournament_id: String(tournamentId),
        player_1_id: couple.player1_id ? String(couple.player1_id) : null,
        player_2_id: couple.player2_id ? String(couple.player2_id) : null,
        created_at: String(inscription.created_at || ''),
        player_1_info: player1 ? JSON.parse(JSON.stringify(player1)) : null,
        player_2_info: player2 ? JSON.parse(JSON.stringify(player2)) : null,
        is_pending: Boolean(inscription.is_pending ?? false),
        inscription_id: String(inscription.id),
        payment_proof_status: inscription.payment_proof_status ?? 'NOT_REQUIRED',
        payment_proof_uploaded_at: inscription.payment_proof_uploaded_at ?? null,
        payment_alias_snapshot: inscription.payment_alias_snapshot ?? null,
        payment_amount_snapshot: inscription.payment_amount_snapshot ?? null,
        // Incluir estado de pago para cada jugador
        player_1_has_paid: player1Payment?.has_paid ?? false,
        player_2_has_paid: player2Payment?.has_paid ?? false,
      };
    })
    .filter(Boolean); // Remove nulls
  
  // ========================================
  // PASO 3B: PROCESAR JUGADORES INDIVIDUALES (IGUAL QUE EL AMERICANO)
  // ========================================
  
  const individualInscriptions = inscriptions
    .filter((inscription: any) => inscription.player_id && !inscription.couple_id)
    .map((inscription: any) => {
      if (inscription.player && inscription.player.length > 0) {
        return JSON.parse(JSON.stringify(inscription.player[0]));
      }
      return {
        id: String(inscription.player_id),
        first_name: null,
        last_name: null,
        score: null,
        dni: null,
        phone: null,
      };
    });

  const playerIdsForHistory = [
    ...coupleInscriptions.flatMap((inscription: any) => [inscription?.player_1_id, inscription?.player_2_id]),
    ...individualInscriptions.map((player: any) => player.id),
  ].filter(Boolean);
  const lateWithdrawalCounts = await getTpeLateWithdrawalCounts(playerIdsForHistory);
  coupleInscriptions.forEach((inscription: any) => {
    if (inscription.player_1_info) inscription.player_1_info.late_withdrawal_count = lateWithdrawalCounts.get(inscription.player_1_id) || 0;
    if (inscription.player_2_info) inscription.player_2_info.late_withdrawal_count = lateWithdrawalCounts.get(inscription.player_2_id) || 0;
  });
  individualInscriptions.forEach((player: any) => {
    player.late_withdrawal_count = lateWithdrawalCounts.get(player.id) || 0;
  });

  // ========================================
  // PASO 4: RENDERIZAR CLIENT COMPONENT
  // ========================================
  
  // Serializar datos para evitar errores de Next.js con objetos no serializables
  const serializedTournament = JSON.parse(JSON.stringify({
    ...tournament,
    clubes: tournament.hide_venue ? undefined : tournament.clubes,
  }));
  const serializedAllPlayers = JSON.parse(JSON.stringify(allPlayers || []));

  return (
    <InscriptionsClient 
      tournament={serializedTournament}
      coupleInscriptions={coupleInscriptions}
      individualInscriptions={individualInscriptions}
      allPlayers={serializedAllPlayers}
      tournamentId={tournamentId}
    />
  );
}
