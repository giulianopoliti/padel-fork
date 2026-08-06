"use client";

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Trophy, AlertCircle } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import { useTournamentPermissions } from '@/hooks/use-tournament-permissions';
import { useTournamentInscriptions } from '@/hooks/use-tournament-inscriptions';

// ✅ REUTILIZAR: Componentes de tabs del americano (completo)
import TournamentCouplesTab from '@/components/tournament/tournament-couples-tab';
import TournamentPlayersTab from '@/components/tournament/tournament-players-tab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Gender } from '@/types';
import ImportInscriptionsExcelDialog from './ImportInscriptionsExcelDialog';

/**
 * 🎯 CLIENT COMPONENT SIMPLIFICADO
 * 
 * Responsabilidades:
 * ✅ Header personalizado para torneo largo
 * ✅ Usar TournamentCouplesTab del americano directamente
 * ✅ Datos SSR sin necesidad de SWR (TournamentCouplesTab maneja reloads)
 */

// ========================================
// TIPOS E INTERFACES (REUTILIZAR DEL AMERICANO)
// ========================================

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
  tournament_id: string;
  player_1_id: string | null;
  player_2_id: string | null;
  created_at: string;
  player_1_info: PlayerInfo | null;
  player_2_info: PlayerInfo | null;
  is_pending?: boolean;
  inscription_id?: string;
  payment_proof_status?: 'NOT_REQUIRED' | 'PENDING_REVIEW' | 'APPROVED';
  payment_proof_uploaded_at?: string | null;
  payment_alias_snapshot?: string | null;
  payment_amount_snapshot?: number | null;
  // Payment status for each player
  player_1_has_paid?: boolean;
  player_2_has_paid?: boolean;
}

interface Tournament {
  id: string;
  name: string;
  type: string;
  status: string;
  gender: Gender;
  registration_locked?: boolean;
  bracket_status?: string;
  enable_public_inscriptions?: boolean;
  enable_payment_checkboxes?: boolean;
  enable_transfer_proof?: boolean;
  enable_trust_based_payment_policy?: boolean;
  trust_policy_min_played_tournaments?: number;
  transfer_alias?: string | null;
  transfer_amount?: number | null;
  transfer_amount_per_player?: number | null;
  hide_venue?: boolean;
  clubes?: {
    name?: string;
    phone?: string;
    address?: string;
  };
}

interface InscriptionsClientProps {
  tournament: Tournament;
  coupleInscriptions: CoupleInfo[];
  individualInscriptions: PlayerInfo[];
  allPlayers: PlayerInfo[];
  tournamentId: string;
}


// ========================================
// COMPONENTE PRINCIPAL
// ========================================

/**
 * 🏗️ CLIENT COMPONENT PRINCIPAL
 * 
 * ✅ USA TournamentCouplesTab del americano directamente
 * ✅ Solo maneja header personalizado y datos SSR
 */
const InscriptionsClient: React.FC<InscriptionsClientProps> = ({
  tournament,
  coupleInscriptions,
  individualInscriptions,
  allPlayers,
  tournamentId
}) => {

  // ========================================
  // HOOKS Y STATE MANAGEMENT CON SWR
  // ========================================

  const { user } = useUser();
  const { isOwner: hasManagementPermissions, isLoading: permissionsLoading } = useTournamentPermissions(tournamentId);

  // 🚀 SWR Hook for real-time data with optimistic updates
  const {
    coupleInscriptions: liveCoupleInscriptions,
    individualInscriptions: liveIndividualInscriptions,
    isLoading: isLoadingInscriptions,
    isValidating,
    addCoupleOptimistic,
    removeCoupleOptimistic,
    addPlayerOptimistic,
    removePlayerOptimistic,
    pairPlayersOptimistic,
    refresh
  } = useTournamentInscriptions(tournamentId, {
    coupleInscriptions,
    individualInscriptions,
    tournament
  });

  const isLoggedIn = !!user;

  // Use centralized permissions as the single source of truth
  const isOwner = hasManagementPermissions;
  const handleRefresh = async () => {
    await refresh();
  };
  
  // ========================================
  // RENDER (SIMPLIFICADO CON AMERICANO)
  // ========================================
  
  return (
    <div className="min-h-screen bg-slate-50">
      
      {/* ========================================
          HEADER PERSONALIZADO PARA TORNEO LARGO
          ======================================== */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4 lg:py-6">
          <div className="max-w-7xl mx-auto">
            
            {/* Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 lg:mb-6">
              <Button asChild variant="outline" className="border-gray-300 w-fit">
                <Link href={`/tournaments/${tournamentId}`} className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Volver al Dashboard</span>
                </Link>
              </Button>
              
              {/* ✅ Badge adaptado al tipo de torneo */}
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
              <div className="bg-blue-100 p-2 lg:p-3 rounded-xl">
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
                    <span>{liveCoupleInscriptions?.length || 0} parejas registradas</span>
                    {isValidating && (
                      <span className="text-xs text-blue-600 ml-1">●</span>
                    )}
                  </div>
                  
                  {!tournament.hide_venue && tournament.clubes?.name && (
                    <div className="flex items-center gap-1">
                      <span>•</span>
                      <span>{tournament.clubes.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================
          TABS SYSTEM (REUTILIZAR DEL AMERICANO)
          ======================================== */}
      <div className="container mx-auto px-4">
        <div className="max-w-7xl mx-auto">
          {!isLoggedIn && (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-900">Llegaste a la vista técnica de inscripciones</p>
                    <p className="text-sm text-amber-800">
                      Si quieres registrarte o iniciar sesión para inscribirte, usa la página principal del torneo.
                    </p>
                  </div>
                </div>

                <Button asChild variant="outline" className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100">
                  <Link href={`/tournaments/${tournamentId}`}>Ir al torneo</Link>
                </Button>
              </div>
            </div>
          )}

          {isOwner && (
            <div className="mt-6 flex justify-end">
              <ImportInscriptionsExcelDialog
                tournamentId={tournamentId}
                disabled={permissionsLoading}
                onImported={handleRefresh}
              />
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm mt-6">
            
            <Tabs defaultValue="couples" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="couples" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Parejas ({liveCoupleInscriptions?.length || 0})
                  {isValidating && <span className="text-xs text-blue-600 ml-1">●</span>}
                </TabsTrigger>
                <TabsTrigger value="players" className="flex items-center gap-2">
                  <Trophy className="h-4 w-4" />
                  Jugadores ({liveIndividualInscriptions?.length || 0})
                  {isValidating && <span className="text-xs text-blue-600 ml-1">●</span>}
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="couples" className="mt-0">
                {/* ✅ USAR: TournamentCouplesTab con datos SWR y optimistic updates */}
                <TournamentCouplesTab
                  coupleInscriptions={liveCoupleInscriptions || []}
                  tournamentId={tournamentId}
                  tournamentStatus={tournament.status}
                  allPlayers={allPlayers}
                  isOwner={isOwner}
                  tournamentGender={tournament.gender}
                  // 🔒 NEW: Registration control props
                  registrationLocked={tournament.registration_locked || false}
                  bracketStatus={tournament.bracket_status || "NOT_STARTED"}
                  enablePaymentCheckboxes={tournament.enable_payment_checkboxes || false}
                  enableTransferProof={tournament.enable_transfer_proof || false}
                  enableTrustBasedPaymentPolicy={tournament.enable_trust_based_payment_policy || false}
                  trustPolicyMinPlayedTournaments={tournament.trust_policy_min_played_tournaments || 2}
                  transferAlias={tournament.transfer_alias || null}
                  transferAmount={tournament.transfer_amount || null}
                  transferAmountPerPlayer={tournament.transfer_amount_per_player || null}
                  // 🚀 Optimistic mutations para UX inmediata
                  onCoupleAdded={addCoupleOptimistic}
                  onCoupleRemoved={removeCoupleOptimistic}
                  onRefresh={handleRefresh}
                />
              </TabsContent>

              <TabsContent value="players" className="mt-0">
                {/* ✅ USAR: TournamentPlayersTab con datos SWR y optimistic updates */}
                <TournamentPlayersTab
                  individualInscriptions={liveIndividualInscriptions || []}
                  tournamentId={tournamentId}
                  tournamentStatus={tournament.status}
                  allPlayers={allPlayers}
                  isPublicView={false}
                  tournamentGender={tournament.gender}
                  // 🔒 NEW: Registration control props
                  registrationLocked={tournament.registration_locked || false}
                  bracketStatus={tournament.bracket_status || "NOT_STARTED"}
                  enableTransferProof={tournament.enable_transfer_proof || false}
                  enableTrustBasedPaymentPolicy={tournament.enable_trust_based_payment_policy || false}
                  trustPolicyMinPlayedTournaments={tournament.trust_policy_min_played_tournaments || 2}
                  transferAlias={tournament.transfer_alias || null}
                  transferAmount={tournament.transfer_amount || null}
                  transferAmountPerPlayer={tournament.transfer_amount_per_player || null}
                  // 🚀 Optimistic mutations para UX inmediata
                  onPlayerAdded={addPlayerOptimistic}
                  onPlayerRemoved={removePlayerOptimistic}
                  onPlayersPaired={pairPlayersOptimistic}
                  onCoupleAdded={addCoupleOptimistic} // Para cuando se registra pareja desde tab players
                  onRefresh={handleRefresh}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InscriptionsClient;
