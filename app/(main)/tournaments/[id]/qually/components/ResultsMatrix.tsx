"use client";

import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { createClient } from '@/utils/supabase/client';
import { Database } from '@/database.types';
import MatchResultIcon from './MatchResultIcon';
import CoupleAvatar from './CoupleAvatar';

type Tournament = Database['public']['Tables']['tournaments']['Row'];
type Match = Database['public']['Tables']['matches']['Row'] & {
  set_matches?: Database['public']['Tables']['set_matches']['Row'][];
  couple1?: {
    id: string;
    players_player1: { first_name: string | null; last_name: string | null; profile_image_url?: string | null; } | null;
    players_player2: { first_name: string | null; last_name: string | null; profile_image_url?: string | null; } | null;
  } | null;
  couple2?: {
    id: string;
    players_player1: { first_name: string | null; last_name: string | null; profile_image_url?: string | null; } | null;
    players_player2: { first_name: string | null; last_name: string | null; profile_image_url?: string | null; } | null;
  } | null;
};

type CoupleInscription = {
  id: string;
  couple_id: string | null;
  couples?: {
    id: string;
    player1_id: string | null;
    player2_id: string | null;
    players_player1: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      score: number | null;
      dni: string | null;
      phone: string | null;
      profile_image_url?: string | null;
    } | null;
    players_player2: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      score: number | null;
      dni: string | null;
      phone: string | null;
      profile_image_url?: string | null;
    } | null;
  } | null;
};

type ZonePosition = {
  couple_id: string;
  position: number;
};

interface ResultsMatrixProps {
  tournament: Tournament;
  coupleInscriptions: CoupleInscription[];
  isSingleSetFormat: boolean;
}

const ResultsMatrix: React.FC<ResultsMatrixProps> = ({
  tournament,
  coupleInscriptions,
  isSingleSetFormat
}) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [zonePositions, setZonePositions] = useState<ZonePosition[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter valid couples (with couple_id) and remove duplicates
  const validCouplesRaw = coupleInscriptions
    .filter(inscription => inscription.couple_id && inscription.couples)
    .map(inscription => inscription.couples!)
    .filter(Boolean)
    .filter((couple, index, array) =>
      array.findIndex(c => c.id === couple.id) === index
    );

  // Sort couples by zone_positions
  const validCouples = React.useMemo(() => {
    if (zonePositions.length === 0) {
      return validCouplesRaw;
    }

    // Create position map
    const positionMap = new Map<string, number>();
    zonePositions.forEach(zp => {
      positionMap.set(zp.couple_id, zp.position);
    });

    // Sort by position
    return [...validCouplesRaw].sort((a, b) => {
      const posA = positionMap.get(a.id) ?? 9999;
      const posB = positionMap.get(b.id) ?? 9999;
      return posA - posB;
    });
  }, [validCouplesRaw, zonePositions]);

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();

      // Fetch matches
      const { data: matchesData } = await supabase
        .from('matches')
        .select(`
          *,
          set_matches (*),
          couple1:couple1_id (
            id,
            players_player1:player1_id (first_name, last_name, profile_image_url),
            players_player2:player2_id (first_name, last_name, profile_image_url)
          ),
          couple2:couple2_id (
            id,
            players_player1:player1_id (first_name, last_name, profile_image_url),
            players_player2:player2_id (first_name, last_name, profile_image_url)
          )
        `)
        .eq('tournament_id', tournament.id)
        .eq('type', 'ZONE')
        .eq('round', 'ZONE')
        .eq('es_prueba', false)
        .neq('status', 'DRAFT');

      // Fetch zone positions for ordering
      const { data: positionsData } = await supabase
        .from('zone_positions')
        .select('couple_id, position')
        .eq('tournament_id', tournament.id)
        .order('position', { ascending: true });

      setMatches((matchesData as Match[]) || []);
      setZonePositions((positionsData as ZonePosition[]) || []);
      setLoading(false);
    };

    fetchData();
  }, [tournament.id]);

  const getMatchResult = (couple1Id: string, couple2Id: string): Match | null => {
    return matches.find(match =>
      (match.couple1_id === couple1Id && match.couple2_id === couple2Id) ||
      (match.couple1_id === couple2Id && match.couple2_id === couple1Id)
    ) || null;
  };

  const getCoupleDisplayName = (couple: any): string => {
    if (!couple) return 'N/A';

    const player1Name = couple.players_player1
      ? `${couple.players_player1.first_name || ''} ${couple.players_player1.last_name || ''}`.trim()
      : '';
    const player2Name = couple.players_player2
      ? `${couple.players_player2.first_name || ''} ${couple.players_player2.last_name || ''}`.trim()
      : '';

    return `${player1Name} / ${player2Name}`;
  };

  const getPositionNumber = (coupleId: string): number => {
    const zp = zonePositions.find(zp => zp.couple_id === coupleId);
    return zp?.position ?? validCouples.findIndex(c => c.id === coupleId) + 1;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (validCouples.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        No hay parejas inscritas en este torneo.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Format Info */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-surface p-4 border border-purple-200">
          <p className="text-sm text-slate-700">
            <strong className="text-purple-700">Formato:</strong>{' '}
            {isSingleSetFormat ? 'Un set por partido' : 'Mejor de 3 sets por partido'}
            {!isSingleSetFormat && ' - Click en cada resultado para ver detalles completos'}
          </p>
        </div>

        {/* Results Matrix - Compact Design with Fixed Column */}
        <div className="w-full rounded-surface border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
            {/* Header */}
            <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider border-r-2 border-slate-300 bg-slate-50 sticky left-0 z-20 min-w-[240px] shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                  Pareja
                </th>
                {validCouples.map((couple) => (
                  <th
                    key={couple.id}
                    className="px-1 py-3 text-center text-xs font-semibold text-slate-600 border-r border-slate-200 w-[50px]"
                  >
                    <Badge variant="outline" className="bg-white text-slate-700 border-slate-300 text-xs">
                      {getPositionNumber(couple.id)}
                    </Badge>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body */}
            <tbody className="bg-white divide-y divide-slate-100">
              {validCouples.map((rowCouple) => {
                const rowPosition = getPositionNumber(rowCouple.id);
                const isTopThree = rowPosition <= 3;

                return (
                  <tr
                    key={rowCouple.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      isTopThree ? 'bg-amber-50/30' : ''
                    }`}
                  >
                    {/* Row Header - Couple Name (Fixed/Sticky) */}
                    <td className="px-4 py-3 text-sm font-medium border-r-2 border-slate-300 bg-white sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-3 cursor-help">
                            <Badge
                              variant="outline"
                              className={`w-7 h-7 flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                rowPosition === 1
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : rowPosition === 2
                                  ? 'bg-slate-100 text-slate-800 border-slate-300'
                                  : rowPosition === 3
                                  ? 'bg-orange-100 text-orange-800 border-orange-300'
                                  : 'bg-slate-50 text-slate-700 border-slate-300'
                              }`}
                            >
                              {rowPosition}
                            </Badge>
                            <CoupleAvatar
                              player1={rowCouple.players_player1}
                              player2={rowCouple.players_player2}
                              size="sm"
                            />
                            <div className="truncate max-w-[140px] text-xs text-slate-700">
                              {getCoupleDisplayName(rowCouple)}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipPrimitive.Portal>
                          <TooltipContent
                            side="bottom"
                            align="start"
                            className="bg-slate-900 text-white border-slate-700 max-w-xs z-[9999]"
                            sideOffset={5}
                          >
                            <p className="font-semibold text-sm">{getCoupleDisplayName(rowCouple)}</p>
                            <p className="text-xs text-slate-300 mt-1">Posición: {rowPosition}</p>
                          </TooltipContent>
                        </TooltipPrimitive.Portal>
                      </Tooltip>
                    </td>

                    {/* Match Results (Scrollable) */}
                    {validCouples.map((colCouple) => (
                      <td
                        key={colCouple.id}
                        className="px-1 py-2 text-center border-r border-slate-100 w-[50px]"
                      >
                        {rowCouple.id === colCouple.id ? (
                          <div className="flex items-center justify-center w-10 h-10 bg-slate-100 rounded-control mx-auto">
                            <span className="text-slate-300 text-lg font-bold">-</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <MatchResultIcon
                              match={getMatchResult(rowCouple.id, colCouple.id)}
                              viewingCoupleId={rowCouple.id}
                              isSingleSetFormat={isSingleSetFormat}
                            />
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-slate-50 rounded-surface p-4 border border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-emerald-50 border-2 border-emerald-200 rounded flex items-center justify-center">
            <div className="w-2 h-2 bg-emerald-600 rounded-full"></div>
          </div>
          <span className="text-slate-700">Victoria</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-rose-50 border-2 border-rose-200 rounded flex items-center justify-center">
            <div className="w-2 h-2 bg-rose-600 rounded-full"></div>
          </div>
          <span className="text-slate-700">Derrota</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-blue-50 border-2 border-blue-200 rounded flex items-center justify-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          </div>
          <span className="text-slate-700">Programado</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-slate-50 border-2 border-slate-200 rounded flex items-center justify-center">
            <div className="w-2 h-2 bg-slate-300 rounded-full"></div>
          </div>
          <span className="text-slate-700">Sin jugar</span>
        </div>
      </div>

        {/* Hint */}
        <p className="text-xs text-center text-slate-500 italic">
          Pasa el mouse sobre un resultado para ver el detalle, o haz clic para abrir información completa
        </p>
      </div>
    </TooltipProvider>
  );
};

export default ResultsMatrix;
