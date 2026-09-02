"use client";

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Trophy, Calendar, MapPin, Clock } from 'lucide-react';
import { Database } from '@/database.types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type Match = Database['public']['Tables']['matches']['Row'] & {
  set_matches?: Database['public']['Tables']['set_matches']['Row'][];
  couple1?: {
    id: string;
    players_player1: { first_name: string | null; last_name: string | null; } | null;
    players_player2: { first_name: string | null; last_name: string | null; } | null;
  } | null;
  couple2?: {
    id: string;
    players_player1: { first_name: string | null; last_name: string | null; } | null;
    players_player2: { first_name: string | null; last_name: string | null; } | null;
  } | null;
};

interface MatchDetailsDialogProps {
  match: Match;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewingCoupleId: string;
  isSingleSetFormat: boolean;
}

const MatchDetailsDialog: React.FC<MatchDetailsDialogProps> = ({
  match,
  open,
  onOpenChange,
  viewingCoupleId,
  isSingleSetFormat
}) => {
  const isCompleted = match.status === 'COMPLETED' || match.status === 'FINISHED';

  const getCoupleDisplayName = (couple: Match['couple1']): string => {
    if (!couple) return 'N/A';

    const player1Name = couple.players_player1
      ? `${couple.players_player1.first_name || ''} ${couple.players_player1.last_name || ''}`.trim()
      : '';
    const player2Name = couple.players_player2
      ? `${couple.players_player2.first_name || ''} ${couple.players_player2.last_name || ''}`.trim()
      : '';

    return `${player1Name} / ${player2Name}`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'No programada';
    try {
      return format(new Date(dateString), "dd 'de' MMMM, yyyy", { locale: es });
    } catch {
      return 'Fecha inválida';
    }
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return 'No programada';
    try {
      return format(new Date(dateString), 'HH:mm', { locale: es });
    } catch {
      return 'Hora inválida';
    }
  };

  // Obtener detalles de sets para mostrar en una línea
  const getSetScores = () => {
    if (!match.set_matches || match.set_matches.length === 0) return null;

    return match.set_matches
      .sort((a, b) => a.set_number - b.set_number)
      .map(set => `${set.couple1_games}-${set.couple2_games}`)
      .join('  ');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader className="pb-3">
          <DialogTitle className="text-lg font-bold text-slate-900">
            Detalles del Partido
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Marcador estilo deportivo - Todo en filas */}
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-surface border-2 border-slate-200 overflow-hidden">
            {/* Header con labels */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 bg-slate-100 border-b border-slate-300">
              <div className="text-xs font-semibold text-slate-600 uppercase">Pareja</div>
              {isCompleted && match.set_matches && match.set_matches.length > 0 && (
                match.set_matches
                  .sort((a, b) => a.set_number - b.set_number)
                  .map((set) => (
                    <div key={set.id} className="text-xs font-semibold text-slate-600 uppercase text-center w-14">
                      Set {set.set_number}
                    </div>
                  ))
              )}
            </div>

            {/* Pareja 1 */}
            <div className={`grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 border-b transition-all ${
              match.winner_id === match.couple1_id
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center gap-2 min-w-0">
                {match.winner_id === match.couple1_id && (
                  <Trophy className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                )}
                <span className="font-semibold text-slate-900 truncate text-sm">
                  {getCoupleDisplayName(match.couple1)}
                </span>
              </div>
              {isCompleted && match.set_matches && match.set_matches.length > 0 && (
                match.set_matches
                  .sort((a, b) => a.set_number - b.set_number)
                  .map((set) => {
                    const isWinner = set.couple1_games > set.couple2_games;
                    return (
                      <div key={set.id} className="flex items-center justify-center w-14">
                        <Badge
                          variant="outline"
                          className={`text-sm font-bold px-2 py-1 ${
                            isWinner
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                              : 'bg-white border-slate-300'
                          }`}
                        >
                          {set.couple1_games}
                        </Badge>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Pareja 2 */}
            <div className={`grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 transition-all ${
              match.winner_id === match.couple2_id
                ? 'bg-emerald-50'
                : 'bg-white'
            }`}>
              <div className="flex items-center gap-2 min-w-0">
                {match.winner_id === match.couple2_id && (
                  <Trophy className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                )}
                <span className="font-semibold text-slate-900 truncate text-sm">
                  {getCoupleDisplayName(match.couple2)}
                </span>
              </div>
              {isCompleted && match.set_matches && match.set_matches.length > 0 && (
                match.set_matches
                  .sort((a, b) => a.set_number - b.set_number)
                  .map((set) => {
                    const isWinner = set.couple2_games > set.couple1_games;
                    return (
                      <div key={set.id} className="flex items-center justify-center w-14">
                        <Badge
                          variant="outline"
                          className={`text-sm font-bold px-2 py-1 ${
                            isWinner
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                              : 'bg-white border-slate-300'
                          }`}
                        >
                          {set.couple2_games}
                        </Badge>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Estado y badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={
                isCompleted
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                  : match.status === 'SCHEDULED'
                  ? 'bg-blue-100 text-blue-700 border-blue-300'
                  : 'bg-slate-100 text-slate-700 border-slate-300'
              }
            >
              {match.status === 'COMPLETED' || match.status === 'FINISHED'
                ? 'Finalizado'
                : match.status === 'SCHEDULED'
                ? 'Programado'
                : match.status === 'IN_PROGRESS'
                ? 'En curso'
                : 'Sin programar'}
            </Badge>
            {match.type === 'ZONE' && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300">
                Partido de zona
              </Badge>
            )}
          </div>

          {/* Info adicional */}
          <Separator />
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>{formatDate(match.scheduled_at)}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span>{formatTime(match.scheduled_at)}</span>
            </div>
            {match.court && (
              <div className="flex items-center gap-2 text-slate-600">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <span>Cancha {match.court}</span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MatchDetailsDialog;
