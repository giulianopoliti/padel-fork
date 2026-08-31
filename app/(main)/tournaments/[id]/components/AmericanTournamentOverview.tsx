"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { TournamentPublicInfo } from '@/lib/tournaments/public-tournament-details';
import type { AccessLevel, TournamentPermission } from '@/utils/tournament-permissions';
import AmericanPublicView from './AmericanPublicView';
import AmericanOrganizerView from './AmericanOrganizerView';
import AmericanPlayerDashboard from '@/components/player/AmericanPlayerDashboard';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Lock } from 'lucide-react';

interface AmericanTournamentOverviewProps {
  tournamentId: string;
  tournament: any; // Tournament from Supabase with clubes relation
  accessLevel: AccessLevel;
  permissions: TournamentPermission[];
  metadata: {
    userRole?: 'ADMIN' | 'CLUB' | 'ORGANIZADOR' | 'PLAYER' | 'COACH';
    isInscribed?: boolean;
    isPending?: boolean;
    isEliminated?: boolean;
    coupleId?: string;
    playerId?: string;
    source?: 'admin' | 'club_owner' | 'organization_member' | 'player' | 'public';
  };
  publicInfo: TournamentPublicInfo;
}

/**
 * 🎯 VISTA OVERVIEW PARA TORNEO AMERICANO - Sistema V2
 *
 * Responsabilidades:
 * ✅ Routing basado en accessLevel (V2)
 * ✅ Carga de inscripciones (client-side)
 * ✅ Separación clara de vistas por rol
 *
 * Routing:
 * - FULL_MANAGEMENT → AmericanOrganizerView
 * - PLAYER_ACTIVE/ELIMINATED → AmericanPlayerDashboard
 * - PUBLIC_VIEW → AmericanPublicView
 *
 * @see docs/PERMISSIONS_SPEC.md
 */
export default function AmericanTournamentOverview({
  tournamentId,
  tournament,
  accessLevel,
  permissions,
  metadata,
  publicInfo
}: AmericanTournamentOverviewProps) {

  // ========================================
  // ESTADO: Inscripciones (Client-side)
  // ========================================

  const [coupleInscriptions, setCoupleInscriptions] = useState<any[]>([]);
  const [individualInscriptions, setIndividualInscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canViewInscriptions =
    accessLevel === 'FULL_MANAGEMENT' || Boolean(tournament.show_public_inscriptions)

  // Cargar inscripciones (necesarias para todas las vistas)
  useEffect(() => {
    if (!canViewInscriptions) {
      setCoupleInscriptions([])
      setIndividualInscriptions([])
      setLoading(false)
      return
    }

    const fetchInscriptions = async () => {
      try {
        setLoading(true);
        const supabase = createClient();

        // Obtener inscripciones de PAREJAS (couple_id NOT NULL)
        const couplesRes = await supabase
          .from('inscriptions')
          .select(`
            id,
            tournament_id,
            couple_id,
            created_at,
            is_pending,
            couples:couple_id (
              id,
              player1_id,
              player2_id,
              player_1_info:players!couples_player1_id_fkey(id, first_name, last_name, score),
              player_2_info:players!couples_player2_id_fkey(id, first_name, last_name, score)
            )
          `)
          .eq('tournament_id', tournamentId)
          .not('couple_id', 'is', null);

        // Obtener inscripciones INDIVIDUALES (couple_id IS NULL)
        const individualsRes = await supabase
          .from('inscriptions')
          .select(`
            id,
            tournament_id,
            player_id,
            created_at,
            phone,
            player:players!inscriptions_player_id_fkey(id, first_name, last_name, score, dni, phone)
          `)
          .eq('tournament_id', tournamentId)
          .is('couple_id', null);

        // Transformar datos de parejas para compatibilidad con vistas
        const couplesData = (couplesRes.data || []).map((inscription: any) => ({
          id: inscription.couples?.id || inscription.couple_id,
          tournament_id: inscription.tournament_id,
          player_1_id: inscription.couples?.player1_id,
          player_2_id: inscription.couples?.player2_id,
          created_at: inscription.created_at,
          player_1_info: inscription.couples?.player_1_info,
          player_2_info: inscription.couples?.player_2_info,
          is_pending: inscription.is_pending ?? false
        }));

        const individualsData = (individualsRes.data || []).map((inscription: any) => ({
          id: inscription.id,
          tournament_id: inscription.tournament_id,
          player_id: inscription.player_id,
          created_at: inscription.created_at,
          player: inscription.player
        }));

        setCoupleInscriptions(couplesData);
        setIndividualInscriptions(individualsData);
      } catch (err) {
        console.error('❌ Error fetching inscriptions:', err);
        // No mostrar error al usuario por inscripciones vacías
        setCoupleInscriptions([]);
        setIndividualInscriptions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchInscriptions();
  }, [canViewInscriptions, tournamentId]);

  // ========================================
  // LOADING STATE
  // ========================================

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-3 py-12">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-6 w-48" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ========================================
  // ERROR STATE
  // ========================================

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // ========================================
  // ROUTING POR ACCESS LEVEL (V2)
  // ========================================

  const commonProps = {
    tournamentId,
    tournament,
    accessLevel,
    permissions,
    metadata,
    coupleInscriptions,
    individualInscriptions
  };

  // FULL_MANAGEMENT: Organizador/Admin/Club Owner
  if (accessLevel === 'FULL_MANAGEMENT') {
    return <AmericanOrganizerView {...commonProps} />;
  }

  // PLAYER_ACTIVE o PLAYER_ELIMINATED: Jugador inscrito
  if (accessLevel === 'PLAYER_ACTIVE' || accessLevel === 'PLAYER_ELIMINATED') {
    return (
      <AmericanPlayerDashboard
        tournamentId={tournamentId}
        tournament={{
          id: tournament.id,
          name: tournament.name,
          clubName: publicInfo.clubName || undefined,
          type: tournament.type,
          status: tournament.status,
          gender: tournament.gender,
          price: tournament.price ?? null,
          start_date: tournament.start_date ?? null,
          enable_public_inscriptions: tournament.enable_public_inscriptions ?? false,
          show_public_inscriptions: tournament.show_public_inscriptions ?? false,
          registration_locked: tournament.registration_locked ?? null,
          bracket_status: tournament.bracket_status ?? null,
          is_full: tournament.is_full ?? false,
          has_few_slots: tournament.has_few_slots ?? false,
          enable_transfer_proof: tournament.enable_transfer_proof ?? false,
          transfer_alias: tournament.transfer_alias ?? null,
          transfer_amount: tournament.transfer_amount ?? null,
          publicInfo
        }}
      />
    );
  }

  // PUBLIC_VIEW: Vista pública (GUEST o usuarios sin permisos)
  if (accessLevel === 'PUBLIC_VIEW') {
    return <AmericanPublicView {...commonProps} publicInfo={publicInfo} />;
  }

  // ========================================
  // ACCESS DENIED (Fallback)
  // ========================================

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="max-w-md">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <Lock className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                Acceso No Permitido
              </h2>
              <p className="text-sm text-muted-foreground">
                No tienes permisos para acceder a este torneo.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Nivel de acceso: <code className="text-xs bg-muted px-1 py-0.5 rounded">{accessLevel}</code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
