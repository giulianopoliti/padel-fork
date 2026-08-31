"use client";

import React, { useEffect, useState } from 'react';
import { Trophy, Calendar, Users, Clock, CheckCircle, XCircle } from 'lucide-react';

import PlayerTournamentDashboard from '@/components/player/PlayerTournamentDashboard';
import NotRegisteredView from '@/components/tournament/NotRegisteredView';
import TournamentHeroDetails from '@/components/tournament/TournamentHeroDetails';
import TournamentPublicInfoCard from '@/components/tournament/TournamentPublicInfoCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/contexts/user-context';
import type { TournamentPublicInfo } from '@/lib/tournaments/public-tournament-details';
import { Gender } from '@/types';
import { createClient } from '@/utils/supabase/client';
import type { LongPlayerOverview } from '@/lib/services/long-player-overview.shared';
import type { AccessLevel } from '@/utils/tournament-permissions';

interface Tournament {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  gender?: Gender | string | null;
  price?: string | number | null;
  enable_transfer_proof?: boolean;
  enable_public_inscriptions?: boolean;
  show_public_inscriptions?: boolean;
  registration_locked?: boolean | null;
  bracket_status?: string | null;
  transfer_alias?: string | null;
  transfer_amount?: number | null;
  is_full?: boolean;
  has_few_slots?: boolean;
  start_date: string | null;
  end_date: string | null;
  category_name?: string | null;
  clubes?: {
    name: string;
    phone?: string | null;
    address?: string | null;
  } | null;
}

interface TournamentStats {
  inscriptionsCount: number;
  finishedMatches: number;
  notStartedMatches: number;
  scheduledDatesCount: number;
  status: string;
}

interface LongTournamentViewProps {
  tournamentId: string;
  tournament: Tournament;
  publicInfo: TournamentPublicInfo;
  playerOverview: LongPlayerOverview | null;
  accessLevel: AccessLevel;
}

/**
 * VISTA PRINCIPAL PARA TORNEOS LARGOS
 *
 * Dashboard que detecta el rol del usuario:
 * - PLAYER: Muestra PlayerTournamentDashboard
 * - Otros roles: Dashboard con estadísticas básicas y sidebar
 */
const LongTournamentView: React.FC<LongTournamentViewProps> = ({
  tournamentId,
  tournament,
  publicInfo,
  playerOverview,
  accessLevel,
}) => {
  const { userDetails } = useUser();
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const canViewInscriptions =
      accessLevel === 'FULL_MANAGEMENT' || Boolean(tournament.show_public_inscriptions)

    if (playerOverview || !canViewInscriptions) {
      setLoading(false)
      return
    }

    const fetchStats = async () => {
      const supabase = createClient();

      const [
        { count: inscriptionsCount },
        { count: finishedMatches },
        { count: notStartedMatches },
        { count: scheduledDatesCount }
      ] = await Promise.all([
        supabase.from('parejas').select('*', { count: 'exact', head: true }).eq('tournament_id', tournamentId),
        supabase.from('matches').select('*', { count: 'exact', head: true }).eq('tournament_id', tournamentId).eq('status', 'FINISHED'),
        supabase.from('matches').select('*', { count: 'exact', head: true }).eq('tournament_id', tournamentId).eq('status', 'SCHEDULED'),
        supabase.from('fechas').select('*', { count: 'exact', head: true }).eq('tournament_id', tournamentId)
      ]);

      setStats({
        inscriptionsCount: inscriptionsCount || 0,
        finishedMatches: finishedMatches || 0,
        notStartedMatches: notStartedMatches || 0,
        scheduledDatesCount: scheduledDatesCount || 0,
        status: tournament.status || 'UNKNOWN'
      });
      setLoading(false);
    };

    fetchStats();
  }, [accessLevel, playerOverview, tournament.show_public_inscriptions, tournament.status, tournamentId]);

  if (playerOverview) {
    return (
      <PlayerTournamentDashboard
        tournamentId={tournamentId}
        overview={playerOverview}
        tournament={{
          id: tournament.id,
          name: tournament.name,
          category: tournament.category_name ?? undefined,
          type: tournament.type,
          status: tournament.status ?? undefined,
          gender: (tournament.gender as Gender | null) ?? undefined,
          price: tournament.price,
          start_date: tournament.start_date ?? null,
          enable_transfer_proof: tournament.enable_transfer_proof,
          enable_public_inscriptions: tournament.enable_public_inscriptions,
          registration_locked: tournament.registration_locked,
          bracket_status: tournament.bracket_status,
          transfer_alias: tournament.transfer_alias,
          transfer_amount: tournament.transfer_amount,
          is_full: tournament.is_full,
          has_few_slots: tournament.has_few_slots,
          publicInfo,
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando estadísticas...</p>
        </div>
      </div>
    );
  }

  if (userDetails && userDetails.role !== 'PLAYER') {
    if (!stats) {
      return (
        <div className="p-6">
          <p className="text-destructive">Error al cargar estadísticas del torneo</p>
        </div>
      );
    }
  } else {
    return (
      <div className="p-6 space-y-6">
        <NotRegisteredView
          tournamentId={tournamentId}
          tournament={{
            id: tournament.id,
            name: tournament.name,
            category: tournament.category_name ?? undefined,
            type: tournament.type,
            status: tournament.status ?? undefined,
            gender: (tournament.gender as Gender | null) ?? undefined,
            price: tournament.price,
            enable_transfer_proof: tournament.enable_transfer_proof,
            enable_public_inscriptions: tournament.enable_public_inscriptions,
            registration_locked: tournament.registration_locked,
            bracket_status: tournament.bracket_status,
            transfer_alias: tournament.transfer_alias,
            transfer_amount: tournament.transfer_amount,
            is_full: tournament.is_full,
            has_few_slots: tournament.has_few_slots,
            publicInfo,
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <Trophy className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{tournament.name}</h1>
            <p className="text-muted-foreground">{publicInfo.organizerName || publicInfo.clubName || 'Sin organizador'}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>{publicInfo.startDateLabel || 'Sin fecha'}</span>
          </div>
          {publicInfo.showStatus ? (
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{publicInfo.statusLabel}</span>
            </div>
          ) : null}
        </div>

        <TournamentHeroDetails
          publicInfo={publicInfo}
          variant="light"
          className="pt-2"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Parejas Inscriptas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inscriptionsCount}</div>
            <p className="text-xs text-muted-foreground">Total de equipos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Partidos Terminados</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.finishedMatches}</div>
            <p className="text-xs text-muted-foreground">Completados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Partidos Pendientes</CardTitle>
            <XCircle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.notStartedMatches}</div>
            <p className="text-xs text-muted-foreground">Sin empezar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fechas Programadas</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.scheduledDatesCount}</div>
            <p className="text-xs text-muted-foreground">Fechas del torneo</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Trophy className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">
                Liga - Sistema de Fechas
              </h3>
              <p className="text-blue-700 text-sm">
                Utiliza la sidebar para navegar entre las diferentes secciones del torneo.
                Gestiona inscripciones, programa partidos y controla el desarrollo del torneo.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <TournamentPublicInfoCard publicInfo={publicInfo} showSchedule={false} />
    </div>
  );
};

export default LongTournamentView;
