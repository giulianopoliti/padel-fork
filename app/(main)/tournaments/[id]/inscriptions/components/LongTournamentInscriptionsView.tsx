"use client";

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, Users } from 'lucide-react';
import TournamentCouplesTab from '@/components/tournament/tournament-couples-tab';
import { Gender } from '@/types';

interface Tournament {
  id: string;
  name: string;
  type: string;
  status: string;
  gender: Gender;
  club_id: string;
}

interface PlayerInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  score: number | null;
  dni?: string | null;
  phone?: string | null;
}

interface CoupleInscription {
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

interface LongTournamentInscriptionsViewProps {
  tournament: Tournament;
  coupleInscriptions: CoupleInscription[];
  allPlayers: PlayerInfo[];
}

/**
 * 🎯 VISTA DE INSCRIPCIONES PARA TORNEOS LARGOS
 * 
 * Wrapper que reutiliza completamente TournamentCouplesTab del americano,
 * pero con layout específico y navegación propia para torneos largos.
 */
const LongTournamentInscriptionsView: React.FC<LongTournamentInscriptionsViewProps> = ({
  tournament,
  coupleInscriptions,
  allPlayers
}) => {
  // Transformar datos para que coincidan con la interfaz del componente americano
  const formattedCouples = coupleInscriptions.map(inscription => ({
    id: inscription.couples.id,
    tournament_id: tournament.id,
    player_1_id: inscription.couples.player1_id,
    player_2_id: inscription.couples.player2_id,
    created_at: inscription.created_at,
    player_1_info: inscription.couples.players_player1,
    player_2_info: inscription.couples.players_player2,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header específico para torneos largos */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4 lg:py-6">
          <div className="max-w-7xl mx-auto">
            {/* Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 lg:mb-6">
              <Button asChild variant="outline" className="border-gray-300 w-fit">
                <Link href={`/tournaments/${tournament.id}`} className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Volver al Dashboard</span>
                </Link>
              </Button>
              
              <div className="flex items-center gap-2">
                <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                  Torneo Largo
                </div>
              </div>
            </div>

            {/* Page Title */}
            <div className="flex items-start gap-3 lg:gap-4">
              <div className="bg-blue-100 p-2 lg:p-3 rounded-elevated">
                <Users className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-2 truncate">
                  Inscripciones - {tournament.name}
                </h1>
                
                <div className="flex flex-wrap items-center gap-3 lg:gap-4 text-xs lg:text-sm text-slate-600">
                  <div className="flex items-center gap-1">
                    <Trophy className="h-3 w-3 lg:h-4 lg:w-4" />
                    <span>Gestión de parejas inscritas</span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3 lg:h-4 lg:w-4" />
                    <span>{formattedCouples.length} parejas registradas</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Reutiliza componente americano */}
      <div className="container mx-auto px-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-surface shadow-sm mt-6">
            {/* 
              🔄 REUTILIZACIÓN COMPLETA 
              Usar TournamentCouplesTab tal como está en el americano
            */}
            <TournamentCouplesTab
              coupleInscriptions={formattedCouples}
              tournamentId={tournament.id}
              tournamentStatus={tournament.status}
              allPlayers={allPlayers}
              isOwner={true} // En torneos largos, asumimos permisos de gestión
              tournamentGender={tournament.gender}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LongTournamentInscriptionsView;