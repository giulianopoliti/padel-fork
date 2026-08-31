"use client";

import React from 'react';
import { useTournament } from '../../providers/TournamentProvider';
import TournamentFullLayout from '@/components/tournament/tournament-full-layout';
import { Badge } from '@/components/ui/badge';
import InitiateTournamentButton from '@/components/tournament/club/initiate-tournament-button';
import CancelTournamentButton from '@/components/tournament/club/cancel-tournament';
import WinnerImageSection from '@/components/tournament/winner-image-section';
import PreTournamentImageSection from '@/components/tournament/pre-tournament-image-section';
import LateRegistrationSection from '@/components/tournament/late-registration-section';
import { useTournamentZones } from '@/hooks/use-tournament-zones';
import { serialize } from '@/utils/serialization';

/**
 * Vista para clubes propietarios del torneo
 * Incluye todos los permisos de gestión y administración
 */
interface ClubViewProps {
  pointsReviewSection?: React.ReactNode;
}

const ClubView: React.FC<ClubViewProps> = ({ pointsReviewSection }) => {
  const { 
    tournament, 
    individualInscriptions, 
    coupleInscriptions, 
    pendingInscriptions,
    maxPlayers,
    allPlayers,
    refreshData
  } = useTournament();

  // Get zones data to show unassigned couples count
  const { availableCouples } = useTournamentZones(tournament?.id || '');

  if (!tournament) return null;

  // Formatear datos del torneo para el layout
  const tournamentData = {
    id: tournament.id,
    name: tournament.name || '',
    status: tournament.status || 'NOT_STARTED',
    start_date: tournament.start_date || undefined,
    end_date: tournament.end_date || undefined,
    clubes: tournament.clubes ? {
      name: tournament.clubes.name || undefined,
      phone: tournament.clubes.phone || undefined,
      phone2: tournament.clubes.phone2 || undefined,
      address: tournament.clubes.address || undefined,
    } : undefined,
  };

  // Status badge con estilos específicos para club
  const statusBadge = (
    <Badge 
      variant={getStatusVariant(tournament.status)} 
      className="text-sm px-3 py-1"
    >
      {getStatusText(tournament.status)}
    </Badge>
  );

  // Transformar tournament para los botones
  const tournamentForButtons = tournament as any;

  // Action buttons específicos para gestión del club
  const actionButtons = (
    <>
      {tournament.status === "NOT_STARTED" && (
        <>
          <InitiateTournamentButton
            tournamentId={tournament.id}
            tournament={tournamentForButtons}
            couplesCount={coupleInscriptions.length}
            playersCount={individualInscriptions.length}
          />
          <CancelTournamentButton
            tournamentId={tournament.id}
            tournament={tournamentForButtons}
            couplesCount={coupleInscriptions.length}
            playersCount={individualInscriptions.length}
            isClubOwner={true}
          />
        </>
      )}
      {(tournament.status === "ZONE_PHASE" || tournament.status === "BRACKET_PHASE") && (
        <CancelTournamentButton
          tournamentId={tournament.id}
          tournament={tournamentForButtons}
          couplesCount={coupleInscriptions.length}
          playersCount={individualInscriptions.length}
          isClubOwner={true}
        />
      )}
    </>
  );

  return (
    <>
      <TournamentFullLayout
        tournament={serialize(tournamentData)}
        individualInscriptions={serialize(individualInscriptions)}
        coupleInscriptions={serialize(coupleInscriptions)}
        pendingInscriptions={serialize(pendingInscriptions)}
        maxPlayers={maxPlayers}
        allPlayers={serialize(allPlayers)}
        backUrl="/torneos"
        backLabel="Volver a Torneos"
        statusBadge={statusBadge}
        actionButtons={actionButtons}
        isPublicView={false} // ← Vista completa de gestión
        isOwner={true}
        onDataRefresh={refreshData}
        pointsReviewSection={pointsReviewSection}
        additionalSections={
          <>
            {/* Late Registration Section - Solo en ZONE_PHASE */}
            {tournament.status === "ZONE_PHASE" && (
              <div className="mt-6">
                <LateRegistrationSection
                  tournamentId={tournament.id}
                  tournamentStatus={tournament.status}
                  unassignedCouplesCount={availableCouples?.length || 0}
                  onRegistrationComplete={refreshData}
                />
              </div>
            )}
            
            {/* PreTournamentImageSection - En estados activos */}
            {["NOT_STARTED", "ZONE_PHASE", "BRACKET_PHASE"].includes(tournament.status) && (
              <div className="mt-6">
                <PreTournamentImageSection
                  tournament={tournament}
                  tournamentId={tournament.id}
                  clubCoverImageUrl={tournament.clubes?.cover_image_url}
                />
              </div>
            )}
            
            {/* WinnerImageSection - En estados finalizados */}
            {["FINISHED", "FINISHED_POINTS_PENDING", "FINISHED_POINTS_CALCULATED"].includes(tournament.status) && (
              <div className="mt-6">
                <WinnerImageSection
                  tournament={tournament}
                  tournamentId={tournament.id}
                />
              </div>
            )}
          </>
        }
      />
    </>
  );
};

function getStatusText(status: string | null): string {
  switch (status) {
    case "NOT_STARTED":
      return "Próximamente";
    case "ZONE_PHASE":
      return "Fase de Zonas"; // Nuevo estado simplificado
    case "BRACKET_PHASE":
      return "Fase Eliminatoria"; // Nuevo estado
    case "FINISHED":
      return "Finalizado";
    case "FINISHED_POINTS_PENDING":
      return "Puntos Pendientes";
    case "FINISHED_POINTS_CALCULATED":
      return "Puntos Aplicados";
    case "CANCELED":
      return "Cancelado";
    // Legacy states - mantener compatibilidad
    case "PAIRING":
      return "Emparejamiento (Legacy)";
    case "ZONE_REGISTRATION":
      return "Inscripción de Zonas (Legacy)";
    case "IN_PROGRESS":
      return "En Curso (Legacy)";
    default:
      return status || "Desconocido";
  }
}

function getStatusVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "NOT_STARTED":
      return "outline";
    case "ZONE_PHASE":
      return "secondary"; // Azul para fase activa
    case "BRACKET_PHASE":
      return "default"; // Verde para eliminatoria
    case "FINISHED":
      return "secondary";
    case "FINISHED_POINTS_PENDING":
      return "secondary";
    case "FINISHED_POINTS_CALCULATED":
      return "default";
    case "CANCELED":
      return "destructive";
    // Legacy states
    case "PAIRING":
    case "ZONE_REGISTRATION":
    case "IN_PROGRESS":
      return "secondary";
    default:
      return "outline";
  }
}

export default ClubView;
