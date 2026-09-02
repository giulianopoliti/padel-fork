"use client";

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy } from 'lucide-react';

// ✅ REUTILIZAR: UnifiedMatchesTab del sistema actual
import UnifiedMatchesTab from '@/components/tournament/unified-matches-tab';

/**
 * 🎯 CLIENT COMPONENT: VISTA DE PARTIDOS
 *
 * Responsabilidades:
 * ✅ Header personalizado para la página de partidos
 * ✅ Usa UnifiedMatchesTab que maneja todo el flujo de partidos
 * ✅ Control de permisos integrado
 */

interface Tournament {
  id: string;
  name: string;
  type: string;
  status: string;
  gender: string;
}

interface MatchesViewProps {
  tournament: Tournament;
  isOwner: boolean;
  isPublicView: boolean;
  clubCourts: number;
}

const MatchesView: React.FC<MatchesViewProps> = ({
  tournament,
  isOwner,
  isPublicView,
  clubCourts
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
              <div className="bg-emerald-100 p-2 lg:p-3 rounded-elevated">
                <Trophy className="h-5 w-5 lg:h-6 lg:w-6 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-2 truncate">
                  Partidos de Zona - {tournament.name}
                </h1>

                <div className="flex flex-wrap items-center gap-3 lg:gap-4 text-xs lg:text-sm text-slate-600">
                  <div className="flex items-center gap-1">
                    <Trophy className="h-3 w-3 lg:h-4 lg:w-4" />
                    <span>Gestión de partidos y resultados</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <span>•</span>
                    <span>Estado: {getStatusLabel(tournament.status)}</span>
                  </div>

                  {isOwner && (
                    <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded">
                      <span className="text-green-700 text-xs font-medium">Modo edición</span>
                    </div>
                  )}

                  {isPublicView && (
                    <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded">
                      <span className="text-slate-700 text-xs font-medium">Vista pública</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================
          CONTENIDO: UNIFIED MATCHES TAB
          ======================================== */}
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-7xl mx-auto">
          {/* ✅ REUTILIZAR: UnifiedMatchesTab maneja todo el flujo */}
          <UnifiedMatchesTab
            tournamentId={tournament.id}
            clubCourts={clubCourts}
            isOwner={isOwner}
            isPublicView={isPublicView}
            tournamentStatus={tournament.status}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * Helper para obtener etiqueta amigable del estado
 */
function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    'NOT_STARTED': 'No iniciado',
    'ZONE_PHASE': 'Fase de zonas',
    'BRACKET_PHASE': 'Fase eliminatoria',
    'FINISHED': 'Finalizado',
    'CANCELED': 'Cancelado',
  };

  return statusMap[status] || status;
}

export default MatchesView;
