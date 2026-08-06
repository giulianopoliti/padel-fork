import React from 'react';
import { createClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';
import { mapTournamentToPublicInfo } from '@/lib/tournaments/public-tournament-details';
import { getTournamentCategoryDisplay } from '@/lib/services/tournament-category-config';
import {
  buildTournamentCapacitySummary,
  getTournamentCoupleCount,
} from '@/lib/services/tournament-capacity.service';
import { checkTournamentAccess } from '@/utils/tournament-permissions';
import { ensureSerializable } from '@/utils/serialization';
import AmericanTournamentOverview from './components/AmericanTournamentOverview';
import LongTournamentView from './components/LongTournamentView';
import { getLongPlayerOverview } from '@/lib/services/long-player-overview';
import { normalizeTournamentOperationalSettings } from '@/lib/services/tournament-operational-settings';
import { getTenantBranding } from '@/config/tenant';

interface TournamentPageProps {
  params: Promise<{ id: string }>;
}

interface ClientTournament {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  gender: string | null;
  price: string | number | null;
  enable_transfer_proof: boolean;
  enable_trust_based_payment_policy: boolean;
  trust_policy_min_played_tournaments: number;
  transfer_alias: string | null;
  transfer_amount: number | null;
  transfer_amount_per_player: number | null;
  start_date: string | null;
  end_date: string | null;
  category_name: string | null;
  category_config?: unknown;
  description: string | null;
  award: string | null;
  max_participants: number | null;
  remaining_slots: number | null;
  is_full: boolean;
  has_few_slots: boolean;
  show_few_slots_alert: boolean;
  hide_venue: boolean;
  club_id: string | null;
  organization_id: string | null;
  enable_public_inscriptions: boolean;
  format_type: string | null;
  clubes: {
    id: string;
    name: string;
    address: string | null;
    formatted_address: string | null;
    google_place_id: string | null;
    latitude: number | null;
    longitude: number | null;
    maps_url: string | null;
    phone: string | null;
    phone2: string | null;
    email: string | null;
    logo_url: string | null;
    cover_image_url: string | null;
    courts: number | null;
  } | null;
  organization: {
    id: string;
    name: string | null;
    phone: string | null;
  } | null;
}

const serializeTournamentForClient = (
  tournament: any,
  capacity: {
    remainingSlots: number | null;
    isFull: boolean;
    hasFewSlots: boolean;
  },
): ClientTournament => ({
  id: tournament.id,
  name: tournament.name ?? '',
  type: tournament.type ?? null,
  status: tournament.status ?? null,
  gender: tournament.gender ?? null,
  price: tournament.price ?? null,
  enable_transfer_proof: Boolean(tournament.enable_transfer_proof),
  enable_trust_based_payment_policy: Boolean(tournament.enable_trust_based_payment_policy),
  trust_policy_min_played_tournaments: tournament.trust_policy_min_played_tournaments ?? 2,
  transfer_alias: tournament.transfer_alias ?? null,
  transfer_amount: tournament.transfer_amount ?? null,
  transfer_amount_per_player: tournament.transfer_amount_per_player ?? null,
  start_date: tournament.start_date ?? null,
  end_date: tournament.end_date ?? null,
  category_name: getTournamentCategoryDisplay(tournament),
  category_config: tournament.category_config ?? null,
  description: tournament.description ?? null,
  award: tournament.award ?? null,
  max_participants: tournament.max_participants ?? null,
  remaining_slots: capacity.remainingSlots,
  is_full: capacity.isFull,
  has_few_slots: capacity.hasFewSlots,
  show_few_slots_alert: tournament.show_few_slots_alert !== false,
  hide_venue: Boolean(tournament.hide_venue),
  club_id: tournament.club_id ?? null,
  organization_id: tournament.organization_id ?? null,
  enable_public_inscriptions: Boolean(tournament.enable_public_inscriptions),
  format_type: tournament.format_type ?? null,
  clubes: tournament.clubes
    ? {
        id: tournament.clubes.id,
        name: tournament.clubes.name ?? '',
        address: tournament.clubes.address ?? null,
        formatted_address: tournament.clubes.formatted_address ?? null,
        google_place_id: tournament.clubes.google_place_id ?? null,
        latitude: tournament.clubes.latitude ?? null,
        longitude: tournament.clubes.longitude ?? null,
        maps_url: tournament.clubes.maps_url ?? null,
        phone: tournament.clubes.phone ?? null,
        phone2: tournament.clubes.phone2 ?? null,
        email: tournament.clubes.email ?? null,
        logo_url: tournament.clubes.logo_url ?? null,
        cover_image_url: tournament.clubes.cover_image_url ?? null,
        courts: tournament.clubes.courts ?? null,
      }
    : null,
  organization: tournament.organization
    ? {
        id: tournament.organization.id,
        name: tournament.organization.name ?? null,
        phone: tournament.organization.phone ?? null,
      }
    : null,
});

/**
 * 🎯 PUNTO DE ENTRADA ÚNICO PARA TODOS LOS TORNEOS - Sistema V2
 *
 * Esta página maneja AMBOS tipos de torneo con permisos granulares:
 * - AMERICAN: Vista overview con routing basado en accessLevel
 * - LONG: Sistema de torneos largos con dashboard
 *
 * ✅ Sistema V2 con checkTournamentAccess():
 *    - Soporte GUEST (usuarios no logeados)
 *    - AccessLevel granular (FULL_MANAGEMENT, PLAYER_*, PUBLIC_VIEW)
 *    - Props type-safe desde server-side
 *
 * @see docs/PERMISSIONS_SPEC.md
 */
export default async function TournamentPage({ params }: TournamentPageProps) {
  const resolvedParams = await params;
  const tournamentId = resolvedParams.id;
  const branding = getTenantBranding();

  // ========================================
  // OBTENER DATOS DEL TORNEO
  // ========================================

  const supabase = await createClient();
  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select(`
      *,
      clubes (
        id,
        name,
        address,
        formatted_address,
        google_place_id,
        latitude,
        longitude,
        maps_url,
        phone,
        phone2,
        email,
        logo_url,
        cover_image_url,
        courts
      ),
      organization:organizaciones (
        id,
        name,
        phone
      )
    `)
    .eq('id', tournamentId)
    .single();

  if (error || !tournament) {
    notFound();
  }

  const currentCouples = await getTournamentCoupleCount(supabase, tournamentId)
  const capacity = buildTournamentCapacitySummary(tournament.max_participants ?? null, currentCouples)
  const { data: rankingConfig } = await supabase
    .from('tournament_ranking_config')
    .select('operational_settings')
    .eq('tournament_id', tournamentId)
    .eq('is_active', true)
    .maybeSingle()
  const operationalSettings = normalizeTournamentOperationalSettings(
    rankingConfig?.operational_settings
  )

  // ========================================
  // VERIFICAR PERMISOS CON SISTEMA V2
  // ========================================

  const { data: { user } } = await supabase.auth.getUser();

  // ✅ Sistema V2: Una sola llamada, soporte GUEST, type-safe
  const access = await checkTournamentAccess(user?.id || null, tournamentId);
  const clientTournament = ensureSerializable(serializeTournamentForClient(tournament, capacity));
  const clientAccess = {
    accessLevel: access.accessLevel,
    permissions: [...access.permissions],
    metadata: { ...access.metadata },
  };
  const publicInfo = ensureSerializable(mapTournamentToPublicInfo({
    ...tournament,
    show_tournament_status: branding.key === 'padel-elite'
      ? true
      : operationalSettings.showTournamentStatus,
  }));

  // ========================================
  // ROUTING POR TIPO DE TORNEO
  // ========================================

  if (tournament.type === 'LONG') {
    const playerOverview = user && access.metadata.userRole === 'PLAYER'
      ? await getLongPlayerOverview(tournamentId, user.id)
      : null;

    return (
      <LongTournamentView
        tournamentId={tournamentId}
        tournament={clientTournament}
        publicInfo={publicInfo}
        playerOverview={playerOverview ? ensureSerializable(playerOverview) : null}
      />
    );
  }

  // ➜ SISTEMA AMERICANO: Overview con props V2
  return (
    <AmericanTournamentOverview
      tournamentId={tournamentId}
      tournament={clientTournament}
      accessLevel={clientAccess.accessLevel}
      permissions={ensureSerializable(clientAccess.permissions)}
      metadata={ensureSerializable(clientAccess.metadata)}
      publicInfo={publicInfo}
    />
  );
} 
