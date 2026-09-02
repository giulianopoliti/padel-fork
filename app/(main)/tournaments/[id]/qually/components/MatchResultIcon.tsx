"use client";

import React, { useState } from 'react';
import { CircleCheck, CircleX, Minus, Clock } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Database } from '@/database.types';
import MatchDetailsDialog from './MatchDetailsDialog';

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

interface MatchResultIconProps {
  match: Match | null;
  viewingCoupleId: string;
  isSingleSetFormat: boolean;
}

const MatchResultIcon: React.FC<MatchResultIconProps> = ({
  match,
  viewingCoupleId,
  isSingleSetFormat
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  // Sin partido programado
  if (!match) {
    return (
      <div className="flex items-center justify-center w-10 h-10">
        <Minus className="w-5 h-5 text-slate-300" />
      </div>
    );
  }

  const isCompleted = match.status === 'COMPLETED' || match.status === 'FINISHED';
  const isWinner = match.winner_id === viewingCoupleId;
  const isScheduled = match.status === 'SCHEDULED' || match.status === 'IN_PROGRESS';

  // Formatear resultado para el hover
  const getResultText = (): string => {
    if (!isCompleted) {
      return match.status === 'SCHEDULED' ? 'Partido programado' : 'Sin jugar';
    }

    if (isSingleSetFormat) {
      if (match.result_couple1 && match.result_couple2) {
        const isCouple1 = match.couple1_id === viewingCoupleId;
        return isCouple1
          ? `${match.result_couple1}-${match.result_couple2}`
          : `${match.result_couple2}-${match.result_couple1}`;
      }
    } else {
      const setMatches = match.set_matches || [];
      if (setMatches.length > 0) {
        const isCouple1 = match.couple1_id === viewingCoupleId;
        return setMatches
          .sort((a, b) => a.set_number - b.set_number)
          .map(set => {
            return isCouple1
              ? `${set.couple1_games}-${set.couple2_games}`
              : `${set.couple2_games}-${set.couple1_games}`;
          })
          .join(', ');
      }
    }

    return '-';
  };

  // Ícono y estilos según estado
  const getIcon = () => {
    if (!isCompleted) {
      if (isScheduled) {
        return <Clock className="w-5 h-5 text-blue-500" />;
      }
      return <Minus className="w-5 h-5 text-slate-300" />;
    }

    if (isWinner) {
      return <CircleCheck className="w-5 h-5 text-emerald-600" />;
    }
    return <CircleX className="w-5 h-5 text-rose-600" />;
  };

  const getBgColor = () => {
    if (!isCompleted) {
      if (isScheduled) return 'bg-blue-50 hover:bg-blue-100';
      return 'bg-slate-50 hover:bg-slate-100';
    }
    if (isWinner) return 'bg-emerald-50 hover:bg-emerald-100';
    return 'bg-rose-50 hover:bg-rose-100';
  };

  return (
    <>
      <HoverCard openDelay={200}>
        <HoverCardTrigger asChild>
          <button
            onClick={() => setDialogOpen(true)}
            className={`w-10 h-10 rounded-control flex items-center justify-center transition-all duration-200 cursor-pointer ${getBgColor()} border border-transparent hover:border-slate-300 active:scale-95`}
            aria-label={`Ver detalles del partido: ${getResultText()}`}
          >
            {getIcon()}
          </button>
        </HoverCardTrigger>
        <HoverCardContent className="w-auto p-3" side="top">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-700">
              {isCompleted ? (isWinner ? 'Victoria' : 'Derrota') : 'Sin resultado'}
            </p>
            {isCompleted && (
              <p className="text-sm font-bold text-slate-900">
                {getResultText()}
              </p>
            )}
            {isScheduled && (
              <p className="text-xs text-blue-600">Programado</p>
            )}
            <p className="text-xs text-slate-500 mt-1">
              Click para ver detalles
            </p>
          </div>
        </HoverCardContent>
      </HoverCard>

      <MatchDetailsDialog
        match={match}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        viewingCoupleId={viewingCoupleId}
        isSingleSetFormat={isSingleSetFormat}
      />
    </>
  );
};

export default MatchResultIcon;
