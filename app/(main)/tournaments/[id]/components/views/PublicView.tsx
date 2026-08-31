"use client";

import React from 'react';
import { useTournament } from '../../providers/TournamentProvider';
import TournamentFullLayout from '@/components/tournament/tournament-full-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LogIn } from 'lucide-react';
import Link from 'next/link';

/**
 * Vista pública para usuarios no autenticados
 * Implementa la estrategia de visualización sin permisos de edición
 */
interface PublicViewProps {
  extraNotice?: React.ReactNode;
}

const PublicView: React.FC<PublicViewProps> = ({ extraNotice }) => {
  const { 
    tournament, 
    individualInscriptions, 
    coupleInscriptions, 
    maxPlayers,
    allPlayers 
  } = useTournament();

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

  // Crear status badge
  const statusBadge = (
    <Badge variant="outline" className="text-xs">
      {getStatusText(tournament.status)}
    </Badge>
  );

  return (
    <TournamentFullLayout
      tournament={tournamentData}
      individualInscriptions={individualInscriptions}
      coupleInscriptions={coupleInscriptions}
      maxPlayers={maxPlayers}
      allPlayers={allPlayers}
      backUrl="/torneos"
      backLabel="Volver a Torneos"
      statusBadge={statusBadge}
      isPublicView={true} // ← Clave: Vista de solo lectura
      isOwner={false}
      additionalSections={extraNotice}
    />
  );
};

/**
 * Obtener texto del estado del torneo
 */
function getStatusText(status: string | null): string {
  switch (status) {
    case "NOT_STARTED":
      return "Próximamente";
    case "ZONE_PHASE":
      return "Fase de Zonas";
    case "BRACKET_PHASE":
      return "Fase Eliminatoria";
    case "PAIRING":
      return "Emparejamiento";
    case "ZONE_REGISTRATION":
      return "Inscripción de Zonas";
    case "IN_PROGRESS":
      return "En curso";
    case "FINISHED":
      return "Finalizado";
    case "FINISHED_POINTS_PENDING":
      return "Puntos Pendientes";
    case "FINISHED_POINTS_CALCULATED":
      return "Puntos Aplicados";
    case "CANCELED":
      return "Cancelado";
    default:
      return status || "Desconocido";
  }
}

export default PublicView;
