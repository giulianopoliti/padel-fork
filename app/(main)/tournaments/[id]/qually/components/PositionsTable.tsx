"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Award, Ban, ExternalLink, Loader2, Medal, MoreHorizontal, RotateCcw, Trophy } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { Database } from '@/database.types';
import { getTenantBranding } from '@/config/tenant';

type Tournament = Database['public']['Tables']['tournaments']['Row'];

type PlayerSummary = {
  id?: string;
  first_name: string | null;
  last_name: string | null;
  score?: number | null;
  dni?: string | null;
  phone?: string | null;
  profile_image_url?: string | null;
};

type CoupleInscription = {
  id: string;
  couple_id: string | null;
  couples?: {
    id: string;
    player1_id: string | null;
    player2_id: string | null;
    players_player1: PlayerSummary | null;
    players_player2: PlayerSummary | null;
  } | null;
};

type ZonePosition = {
  id: string;
  position: number;
  wins: number;
  losses: number;
  sets_difference: number;
  games_difference: number;
  couple_id: string;
  couples: {
    id: string;
    players_player1: PlayerSummary | null;
    players_player2: PlayerSummary | null;
  };
};

type ActiveDisqualification = {
  id: string;
  couple_id: string;
  phase: string;
  status: string;
};

type PendingDisqualificationAction = {
  zonePosition: ZonePosition;
  action: 'disqualify' | 'revert';
};

interface PositionsTableProps {
  tournament: Tournament;
  coupleInscriptions: CoupleInscription[];
  isSingleSetFormat: boolean;
  canManageTournament?: boolean;
  playerCoupleId?: string | null;
}

const getPlayerName = (player: PlayerSummary | null, fallback: string): string => {
  if (!player) return fallback;

  const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
  return fullName || fallback;
};

const getInitials = (player: PlayerSummary | null): string => {
  if (!player) return '?';

  const firstName = player.first_name?.charAt(0)?.toUpperCase() || '';
  const lastName = player.last_name?.charAt(0)?.toUpperCase() || '';
  return firstName + lastName || '??';
};

const PositionsTable: React.FC<PositionsTableProps> = ({
  tournament,
  isSingleSetFormat,
  canManageTournament = false,
  playerCoupleId = null
}) => {
  const [standings, setStandings] = useState<ZonePosition[]>([]);
  const [activeDisqualifications, setActiveDisqualifications] = useState<ActiveDisqualification[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingCoupleId, setUpdatingCoupleId] = useState<string | null>(null);
  const [pendingDisqualification, setPendingDisqualification] = useState<PendingDisqualificationAction | null>(null);
  const { toast } = useToast();

  const canUpdateDisqualifications = canManageTournament && tournament.status === 'ZONE_PHASE';
  const showPublicResults = getTenantBranding().key === 'padel-fv';
  const columnsCount = 7 + (showPublicResults ? 1 : 0) + (canUpdateDisqualifications ? 1 : 0);
  const disqualificationsByCouple = React.useMemo(() => {
    return new Map(activeDisqualifications.map((disqualification) => [disqualification.couple_id, disqualification]));
  }, [activeDisqualifications]);

  const fetchZonePositions = React.useCallback(async () => {
    const supabase = createClient();

    const [positionsResult, disqualificationsResponse] = await Promise.all([
      supabase
        .from('zone_positions')
        .select(`
          *,
          couples (
            id,
            players_player1:players!couples_player1_id_fkey (
              first_name,
              last_name,
              profile_image_url
            ),
            players_player2:players!couples_player2_id_fkey (
              first_name,
              last_name,
              profile_image_url
            )
          )
        `)
        .eq('tournament_id', tournament.id)
        .order('position', { ascending: true }),
      fetch(`/api/tournaments/${tournament.id}/disqualifications?phase=ZONE_PHASE`).catch(() => null)
    ]);

    const { data, error } = positionsResult;

    if (error) {
      console.error('Error fetching zone positions:', error);
      setStandings([]);
    } else {
      setStandings(data as ZonePosition[] || []);
    }

    if (disqualificationsResponse?.ok) {
      const disqualificationData = await disqualificationsResponse.json().catch(() => null);
      setActiveDisqualifications(disqualificationData?.disqualifications || []);
    } else {
      setActiveDisqualifications([]);
    }

    setLoading(false);
  }, [tournament.id]);

  useEffect(() => {
    fetchZonePositions();
  }, [fetchZonePositions]);

  const getCoupleDisplayName = (zonePosition: ZonePosition): string => {
    if (!zonePosition.couples) return 'N/A';

    return `${getPlayerName(zonePosition.couples.players_player1, 'Jugador 1')} / ${getPlayerName(zonePosition.couples.players_player2, 'Jugador 2')}`;
  };

  const getCouplePlayerNames = (zonePosition: ZonePosition): [string, string] => {
    if (!zonePosition.couples) return ['N/A', ''];

    return [
      getPlayerName(zonePosition.couples.players_player1, 'Jugador 1'),
      getPlayerName(zonePosition.couples.players_player2, 'Jugador 2')
    ];
  };

  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-slate-400" />;
      case 3:
        return <Award className="h-5 w-5 text-orange-500" />;
      default:
        return null;
    }
  };

  const getPositionBadgeColor = (position: number) => {
    switch (position) {
      case 1:
        return 'bg-gradient-to-br from-yellow-100 to-amber-100 text-yellow-800 border-yellow-300 shadow-sm';
      case 2:
        return 'bg-gradient-to-br from-slate-100 to-gray-100 text-slate-800 border-slate-300 shadow-sm';
      case 3:
        return 'bg-gradient-to-br from-orange-100 to-amber-100 text-orange-800 border-orange-300 shadow-sm';
      default:
        return 'bg-white text-slate-700 border-slate-300';
    }
  };

  const getRowBackground = (position: number) => {
    switch (position) {
      case 1:
        return 'bg-gradient-to-r from-yellow-50/50 to-amber-50/30 hover:from-yellow-50 hover:to-amber-50';
      case 2:
        return 'bg-gradient-to-r from-slate-50/50 to-gray-50/30 hover:from-slate-50 hover:to-gray-50';
      case 3:
        return 'bg-gradient-to-r from-orange-50/50 to-amber-50/30 hover:from-orange-50 hover:to-amber-50';
      default:
        return 'hover:bg-slate-50';
    }
  };

  const handleConfirmDisqualification = async () => {
    if (!pendingDisqualification) return;

    const { zonePosition, action } = pendingDisqualification;
    const shouldRevert = action === 'revert';
    setUpdatingCoupleId(zonePosition.couple_id);

    try {
      const response = await fetch(`/api/tournaments/${tournament.id}/couples/${zonePosition.couple_id}/disqualify`, {
        method: shouldRevert ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: shouldRevert ? undefined : JSON.stringify({ reason: 'Descalificacion administrativa desde Qually' }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'No se pudo actualizar la descalificacion');
      }

      toast({
        title: shouldRevert ? 'Descalificacion revertida' : 'Pareja descalificada',
        description: shouldRevert
          ? 'La pareja vuelve a quedar habilitada.'
          : 'La pareja no avanzara a la llave y sus partidos pendientes fueron cancelados.',
      });

      setPendingDisqualification(null);
      await fetchZonePositions();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo actualizar la descalificacion',
        variant: 'destructive',
      });
    } finally {
      setUpdatingCoupleId(null);
    }
  };

  const pendingCoupleName = pendingDisqualification
    ? getCoupleDisplayName(pendingDisqualification.zonePosition)
    : '';
  const pendingIsRevert = pendingDisqualification?.action === 'revert';

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-purple-600" />
      </div>
    );
  }

  if (standings.length === 0) {
    return (
      <div className="py-8 text-center text-slate-500">
        No hay datos para mostrar la tabla de posiciones.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-elevated border border-slate-200 bg-card md:hidden">
        <div className="grid grid-cols-[1.75rem_minmax(7.5rem,1fr)_repeat(5,minmax(1.75rem,2rem))] items-center gap-1 bg-slate-950 px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-white">
          <span className="text-center">#</span>
          <span>Pareja</span>
          <span className="text-center">PJ</span>
          <span className="text-center">PG</span>
          <span className="text-center">PP</span>
          <span className="text-center">DS</span>
          <span className="text-center">DG</span>
        </div>

        <div className="divide-y divide-slate-200">
          {standings.map((zonePosition) => {
            const isCurrentCouple = zonePosition.couple_id === playerCoupleId;
            const isDisqualified = disqualificationsByCouple.has(zonePosition.couple_id);

            return (
              <div
                key={zonePosition.couple_id}
                className={`grid grid-cols-[1.75rem_minmax(7.5rem,1fr)_repeat(5,minmax(1.75rem,2rem))] items-center gap-1 px-2 py-2.5 ${isCurrentCouple ? 'bg-primary/10 ring-1 ring-inset ring-primary/20' : isDisqualified ? 'bg-red-50/70' : 'bg-card'}`}
              >
                <span className="text-center text-sm font-semibold text-slate-700">
                  {zonePosition.position}
                </span>
                <div className="min-w-0 space-y-1">
                  <PlayerNameLine player={zonePosition.couples.players_player1} fallback="Jugador 1" />
                  <PlayerNameLine player={zonePosition.couples.players_player2} fallback="Jugador 2" />
                  {showPublicResults && (
                    <Link
                      href={`/tournaments/${tournament.id}/resultados/${zonePosition.couple_id}`}
                      className="inline-flex text-[10px] font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Ver resultados
                    </Link>
                  )}
                  {(isCurrentCouple || isDisqualified) && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {isCurrentCouple && <Badge variant="outline" className="h-4 border-primary/30 px-1 text-[9px] leading-none text-primary">Tu pareja</Badge>}
                      {isDisqualified && <Badge variant="destructive" className="h-4 px-1 text-[9px] leading-none">Desc.</Badge>}
                    </div>
                  )}
                </div>
                <TableStat value={zonePosition.wins + zonePosition.losses} />
                <TableStat value={zonePosition.wins} />
                <TableStat value={zonePosition.losses} />
                <TableStat value={isSingleSetFormat ? 0 : zonePosition.sets_difference} signed={!isSingleSetFormat} />
                <TableStat value={zonePosition.games_difference} signed />
              </div>
            );
          })}
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-surface border border-slate-200 shadow-sm md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-gradient-to-r from-slate-50 to-slate-100 hover:from-slate-50 hover:to-slate-100">
              <TableHead className="w-[100px] font-semibold text-slate-700">Pos</TableHead>
              <TableHead className="min-w-[280px] font-semibold text-slate-700">Pareja</TableHead>
              <TableHead className="w-[70px] text-center font-semibold text-slate-700">PJ</TableHead>
              <TableHead className="w-[70px] text-center font-semibold text-slate-700">PG</TableHead>
              <TableHead className="w-[70px] text-center font-semibold text-slate-700">PP</TableHead>
              <TableHead className="w-[80px] text-center font-semibold text-slate-700">DS</TableHead>
              <TableHead className="w-[80px] text-center font-semibold text-slate-700">DG</TableHead>
              {showPublicResults && (
                <TableHead className="w-[170px] text-right font-semibold text-slate-700">Resultados</TableHead>
              )}
              {canUpdateDisqualifications && (
                <TableHead className="w-[130px] text-right font-semibold text-slate-700">Accion</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {standings.map((zonePosition, index) => {
              const isTopThree = zonePosition.position <= 3;
              const isDisqualified = disqualificationsByCouple.has(zonePosition.couple_id);
              const [player1Name, player2Name] = getCouplePlayerNames(zonePosition);

              return (
                <React.Fragment key={zonePosition.couple_id}>
                  <TableRow className={`transition-colors ${zonePosition.couple_id === playerCoupleId ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : isDisqualified ? 'bg-red-50/70 hover:bg-red-50' : getRowBackground(zonePosition.position)}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`flex h-9 w-9 items-center justify-center text-sm font-bold ${getPositionBadgeColor(zonePosition.position)}`}
                        >
                          {zonePosition.position}
                        </Badge>
                        {getPositionIcon(zonePosition.position)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-4">
                        <div className="flex min-w-0 flex-col">
                          <PlayerNameLine player={zonePosition.couples.players_player1} fallback={player1Name} size="md" />
                          <PlayerNameLine player={zonePosition.couples.players_player2} fallback={player2Name} size="md" />
                          {isDisqualified && (
                            <Badge variant="destructive" className="mt-1 w-fit text-[10px]">
                              Descalificada
                            </Badge>
                          )}
                          {isTopThree && (
                            <span className="mt-0.5 text-xs text-slate-500">
                              {zonePosition.position === 1 ? 'Primero' : zonePosition.position === 2 ? 'Segundo' : 'Tercero'}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-slate-50">
                        {zonePosition.wins + zonePosition.losses}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm font-medium text-slate-800">{zonePosition.wins}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm font-medium text-slate-800">{zonePosition.losses}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <DiffBadge value={isSingleSetFormat ? 0 : zonePosition.sets_difference} />
                    </TableCell>
                    <TableCell className="text-center">
                      <DiffBadge value={zonePosition.games_difference} />
                    </TableCell>
                    {showPublicResults && (
                      <TableCell className="text-right">
                        <Button asChild type="button" variant="outline" size="sm" className="gap-1.5">
                          <Link href={`/tournaments/${tournament.id}/resultados/${zonePosition.couple_id}`}>
                            Ver resultados
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </TableCell>
                    )}
                    {canUpdateDisqualifications && (
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={updatingCoupleId === zonePosition.couple_id}
                              aria-label={`Acciones para ${getCoupleDisplayName(zonePosition)}`}
                            >
                              {updatingCoupleId === zonePosition.couple_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem
                              className={isDisqualified ? 'text-slate-700' : 'text-red-700 focus:text-red-700'}
                              onClick={() => setPendingDisqualification({
                                zonePosition,
                                action: isDisqualified ? 'revert' : 'disqualify',
                              })}
                            >
                              {isDisqualified ? (
                                <RotateCcw className="mr-2 h-4 w-4" />
                              ) : (
                                <Ban className="mr-2 h-4 w-4" />
                              )}
                              {isDisqualified ? 'Revertir descalificacion' : 'Descalificar pareja'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                  {zonePosition.position === 3 && index < standings.length - 1 && (
                    <TableRow>
                      <TableCell colSpan={columnsCount} className="p-0">
                        <Separator className="bg-amber-200" />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-surface border border-slate-200 bg-slate-50 p-3 text-xs md:grid-cols-5">
        <div className="text-slate-700">
          <strong className="text-slate-900">PJ:</strong> Partidos Jugados
        </div>
        <div className="text-slate-700">
          <strong className="text-slate-900">PG:</strong> Partidos Ganados
        </div>
        <div className="text-slate-700">
          <strong className="text-slate-900">PP:</strong> Partidos Perdidos
        </div>
        <div className="text-slate-700">
          <strong className="text-slate-900">DS:</strong> Dif. Sets
        </div>
        <div className="text-slate-700">
          <strong className="text-slate-900">DG:</strong> Dif. Games
        </div>
      </div>

      <AlertDialog
        open={pendingDisqualification !== null}
        onOpenChange={(open) => {
          if (!open && !updatingCoupleId) {
            setPendingDisqualification(null);
          }
        }}
      >
        <AlertDialogContent className="max-w-md bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {pendingIsRevert ? (
                <RotateCcw className="h-5 w-5 text-slate-600" />
              ) : (
                <Ban className="h-5 w-5 text-red-600" />
              )}
              {pendingIsRevert ? 'Revertir descalificacion' : 'Descalificar pareja'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div className={pendingIsRevert ? 'rounded-surface border border-slate-200 bg-slate-50 p-3' : 'rounded-surface border border-red-200 bg-red-50 p-3'}>
                  <p className={pendingIsRevert ? 'font-medium text-slate-800' : 'font-medium text-red-800'}>
                    {pendingIsRevert
                      ? `La pareja ${pendingCoupleName} volvera a quedar habilitada.`
                      : `Confirmas descalificar a ${pendingCoupleName}?`}
                  </p>
                  <p className={pendingIsRevert ? 'mt-1 text-xs text-slate-600' : 'mt-1 text-xs text-red-700'}>
                    {pendingIsRevert
                      ? 'Esto solo se permite mientras no exista una llave generada.'
                      : 'No avanzara a la llave y se cancelaran sus partidos pendientes. Los resultados ya cargados no se modifican.'}
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(updatingCoupleId)}>
              Volver
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDisqualification();
              }}
              disabled={Boolean(updatingCoupleId)}
              className={pendingIsRevert ? undefined : 'bg-red-600 hover:bg-red-700'}
            >
              {updatingCoupleId ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : pendingIsRevert ? (
                'Revertir'
              ) : (
                'Descalificar pareja'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PositionsTable;

const formatSignedValue = (value: number): string => {
  return value > 0 ? `+${value}` : String(value);
};

const getDiffClassName = (value: number): string => {
  if (value > 0) return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (value < 0) return 'border-rose-300 bg-rose-50 text-rose-700';
  return 'border-slate-300 bg-slate-50 text-slate-700';
};

const DiffBadge = ({ value }: { value: number }) => (
  <Badge variant="outline" className={`font-bold ${getDiffClassName(value)}`}>
    {formatSignedValue(value)}
  </Badge>
);

const PlayerNameLine = ({
  player,
  fallback,
  size = 'sm'
}: {
  player: PlayerSummary | null;
  fallback: string;
  size?: 'sm' | 'md';
}) => {
  const name = getPlayerName(player, fallback);
  const avatarSizeClassName = size === 'md' ? 'h-7 w-7 text-[10px]' : 'h-5 w-5 text-[9px]';
  const textClassName = size === 'md' ? 'text-sm' : 'text-[11px]';

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Avatar className={`${avatarSizeClassName} border border-slate-200`}>
        {player?.profile_image_url && (
          <AvatarImage src={player.profile_image_url} alt={name} className="object-cover" />
        )}
        <AvatarFallback className="bg-slate-100 text-slate-700">
          {getInitials(player)}
        </AvatarFallback>
      </Avatar>
      <span className={`min-w-0 truncate font-semibold leading-tight text-slate-900 ${textClassName}`}>
        {name}
      </span>
    </div>
  );
};

const TableStat = ({
  value,
  signed = false
}: {
  value: number;
  signed?: boolean;
}) => (
  <span className={`justify-self-center rounded-control px-1 py-1 text-center text-[11px] font-bold leading-none ${signed ? getDiffClassName(value) : 'text-slate-800'}`}>
    {signed ? formatSignedValue(value) : value}
  </span>
);
