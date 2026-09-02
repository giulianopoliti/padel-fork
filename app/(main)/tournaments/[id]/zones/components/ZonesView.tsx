"use client";

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ListChecks } from 'lucide-react';

// ✅ REUTILIZAR: TournamentZonesWrapper del sistema actual
import TournamentZonesWrapper from '@/components/tournament/tournament-zones-wrapper';
import InitiateTournamentButton from '@/components/tournament/club/initiate-tournament-button';
import BuildZonesButton from '@/components/tournament/club/build-zones-button';

/**
 * 🎯 CLIENT COMPONENT: VISTA DE ZONAS
 *
 * Responsabilidades:
 * ✅ Header personalizado para la página de zonas
 * ✅ Usa TournamentZonesWrapper que ya maneja legacy vs nuevo sistema
 * ✅ Datos SSR sin necesidad de fetching adicional
 * ✅ Oculta botones de acción cuando isOwner = false (vista pública)
 * ✅ Muestra botones solo para propietarios en estado NOT_STARTED
 */

interface Tournament {
  id: string;
  name: string;
  type: string;
  status: string;
  gender: string;
}

interface PlayerInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  score: number | null;
  dni?: string | null;
  phone?: string | null;
}

interface CoupleInfo {
  id: string;
  couple_id: string;
  created_at: string;
  couples: {
    id: string;
    player1_id: string;
    player2_id: string;
    players_player1: PlayerInfo;
    players_player2: PlayerInfo;
  };
}

interface ZonesViewProps {
  tournament: Tournament;
  coupleInscriptions: CoupleInfo[];
  isOwner: boolean;
  pendingInscriptionsCount?: number;
}

const ZonesView: React.FC<ZonesViewProps> = ({
  tournament,
  coupleInscriptions,
  isOwner,
  pendingInscriptionsCount = 0
}) => {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* ========================================
          HEADER PERSONALIZADO
          ======================================== */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4 lg:py-6">
          <div className="max-w-7xl mx-auto">
            {/* Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 lg:mb-6">
              <Button asChild variant="outline" className="border-gray-300 w-fit">
                <Link href={`/tournaments/${tournament.id}`} className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Volver al Torneo</span>
                </Link>
              </Button>

              {/* Badge según tipo de torneo */}
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                tournament.type === 'LONG'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-blue-100 text-blue-800'
              }`}>
                {tournament.type === 'LONG' ? 'Torneo Largo' : 'Torneo Americano'}
              </div>
            </div>

            {/* Page Title */}
            <div className="flex items-start gap-3 lg:gap-4">
              <div className="bg-orange-100 p-2 lg:p-3 rounded-elevated">
                <ListChecks className="h-5 w-5 lg:h-6 lg:w-6 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-2 truncate">
                  Armado de Zonas - {tournament.name}
                </h1>

                <div className="flex flex-wrap items-center gap-3 lg:gap-4 text-xs lg:text-sm text-slate-600">
                  <div className="flex items-center gap-1">
                    <ListChecks className="h-3 w-3 lg:h-4 lg:w-4" />
                    <span>Gestión de zonas y distribución de parejas</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <span>•</span>
                    <span>{coupleInscriptions?.length || 0} parejas inscritas</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons - Show only when NOT_STARTED and isOwner */}
              {isOwner && tournament.status === 'NOT_STARTED' && (
                <div className="hidden sm:flex gap-2">
                  <BuildZonesButton
                    tournamentId={tournament.id}
                    tournament={tournament as any}
                    couplesCount={coupleInscriptions?.length || 0}
                    playersCount={0}
                    pendingInscriptionsCount={pendingInscriptionsCount}
                  />
                  <InitiateTournamentButton
                    tournamentId={tournament.id}
                    tournament={tournament as any}
                    couplesCount={coupleInscriptions?.length || 0}
                    playersCount={0}
                  />
                </div>
              )}
            </div>

            {/* Mobile buttons - below title on small screens */}
            {isOwner && tournament.status === 'NOT_STARTED' && (
              <div className="sm:hidden mt-4 flex flex-col gap-2">
                <BuildZonesButton
                  tournamentId={tournament.id}
                  tournament={tournament as any}
                  couplesCount={coupleInscriptions?.length || 0}
                  playersCount={0}
                  pendingInscriptionsCount={pendingInscriptionsCount}
                />
                <InitiateTournamentButton
                  tournamentId={tournament.id}
                  tournament={tournament as any}
                  couplesCount={coupleInscriptions?.length || 0}
                  playersCount={0}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================
          CONTENIDO: TOURNAMENT ZONES WRAPPER
          ======================================== */}
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-7xl mx-auto">
          {/* ✅ REUTILIZAR: TournamentZonesWrapper maneja legacy vs nuevo */}
          <TournamentZonesWrapper
            tournamentId={tournament.id}
            isOwner={isOwner}
            tournamentStatus={tournament.status}
          />
        </div>
      </div>
    </div>
  );
};

export default ZonesView;
