"use client";

import React from 'react';
import {
  CheckCircle2,
  Clock,
  Calendar,
  Users,
  Trophy,
  Shield,
  XCircle
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import InitiateTournamentButton from '@/components/tournament/club/initiate-tournament-button';
import BuildZonesButton from '@/components/tournament/club/build-zones-button';
import { formatDateArgentina, formatTimeArgentina } from '@/lib/utils';
import type { AccessLevel, TournamentPermission } from '@/utils/tournament-permissions';

interface AmericanOrganizerViewProps {
  tournamentId: string;
  tournament: any; // Tournament from Supabase
  accessLevel: AccessLevel;
  permissions: TournamentPermission[];
  metadata: {
    userRole?: 'ADMIN' | 'CLUB' | 'ORGANIZADOR' | 'PLAYER' | 'COACH';
    isInscribed?: boolean;
    coupleId?: string;
    playerId?: string;
    source?: 'admin' | 'club_owner' | 'organization_member' | 'player' | 'public';
  };
  coupleInscriptions?: any[];
  individualInscriptions?: any[];
}

/**
 * 🏢 VISTA DE GESTIÓN PARA TORNEO AMERICANO
 *
 * Responsabilidades:
 * ✅ Mostrar vista completa de gestión
 * ✅ Botones "Armar Zonas" e "Iniciar Torneo"
 * ✅ Estadísticas completas
 * ✅ Controles de administración
 *
 * Usuarios:
 * - ADMIN
 * - CLUB (owner del torneo)
 * - ORGANIZADOR (owner del torneo)
 */
export default function AmericanOrganizerView({
  tournamentId,
  tournament,
  accessLevel,
  permissions,
  metadata,
  coupleInscriptions = [],
  individualInscriptions = []
}: AmericanOrganizerViewProps) {

  const pendingInscriptionsCount = coupleInscriptions.filter((c: any) => c.is_pending).length;
  const approvedCouplesCount = coupleInscriptions.filter((c: any) => !c.is_pending).length;
  
  const stats = {
    couples: coupleInscriptions.length,
    players: individualInscriptions.length,
  };

  const isActive = tournament.status !== 'NOT_STARTED';
  const isCanceled = tournament.status === 'CANCELED';

  // Determinar badge según fuente
  const getRoleBadge = () => {
    if (metadata.source === 'admin') {
      return { text: 'ADMIN', variant: 'default' as const, icon: Shield };
    }
    if (metadata.source === 'club_owner') {
      return { text: 'CLUB OWNER', variant: 'default' as const, icon: Trophy };
    }
    return { text: 'ORGANIZADOR', variant: 'default' as const, icon: Users };
  };

  const roleBadge = getRoleBadge();
  const RoleIcon = roleBadge.icon;
  const tournamentDateLabel = tournament.start_date
    ? formatDateArgentina(tournament.start_date, {
        day: 'numeric',
        month: 'short',
      })
    : 'Por definir';
  const tournamentTimeLabel = tournament.start_date
    ? formatTimeArgentina(tournament.start_date, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : 'Por definir';

  return (
    <div className="bg-slate-50">
      {/* Hero Section - Versión Organizador */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="container mx-auto px-4 py-12 lg:py-16">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge de Rol */}
            <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
              <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                Torneo Americano
              </Badge>
              <Badge className="bg-white/20 text-white border-white/30 gap-2">
                <RoleIcon className="h-3 w-3" />
                {roleBadge.text}
              </Badge>
              {isCanceled && (
                <Badge variant="destructive" className="bg-red-600 text-white border-red-700 gap-2">
                  <XCircle className="h-3 w-3" />
                  CANCELADO
                </Badge>
              )}
            </div>

            <h1 className="text-4xl lg:text-5xl font-bold mb-4">
              {tournament.name}
            </h1>

            {tournament.clubes?.name && (
              <p className="text-xl text-blue-100 mb-6">
                {tournament.clubes.name}
              </p>
            )}

            {/* Quick Stats - Versión Completa */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8">
              <div className="bg-white/10 backdrop-blur-sm rounded-surface p-4">
                <div className="text-3xl font-bold">{stats.couples}</div>
                <div className="text-blue-100 text-sm mt-1">Parejas</div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-surface p-4">
                <div className="text-3xl font-bold">{stats.players}</div>
                <div className="text-blue-100 text-sm mt-1">Jugadores</div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-surface p-4">
                <div className="text-3xl font-bold">
                  {isActive ? (
                    <CheckCircle2 className="h-8 w-8 mx-auto" />
                  ) : (
                    <Clock className="h-8 w-8 mx-auto" />
                  )}
                </div>
                <div className="text-blue-100 text-sm mt-1">
                  {isActive ? 'En curso' : 'Próximamente'}
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-surface p-4">
                <div className="text-3xl font-bold">
                  <Calendar className="h-8 w-8 mx-auto" />
                </div>
                <div className="text-blue-100 text-sm mt-1">
                  {tournamentDateLabel}
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-surface p-4">
                <div className="text-3xl font-bold">
                  <Clock className="h-8 w-8 mx-auto" />
                </div>
                <div className="text-blue-100 text-sm mt-1">
                  {tournamentTimeLabel === 'Por definir' ? tournamentTimeLabel : `${tournamentTimeLabel} hs`}
                </div>
              </div>
            </div>

            {/* Mensaje de Cancelación */}
            {isCanceled && (
              <div className="mt-8 max-w-md mx-auto">
                <div className="bg-red-100/20 border border-red-300/30 rounded-surface p-4 backdrop-blur-sm">
                  <div className="flex items-center justify-center gap-2 text-red-100">
                    <XCircle className="h-5 w-5" />
                    <p className="font-medium">Este torneo ha sido cancelado</p>
                  </div>
                  <p className="text-sm text-red-200 mt-2 text-center">
                    No se pueden realizar modificaciones ni inscripciones
                  </p>
                </div>
              </div>
            )}

            {/* Tournament Action Buttons - Solo si NO está iniciado y NO está cancelado */}
            {tournament.status === 'NOT_STARTED' && !isCanceled && (
              <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
                <BuildZonesButton
                  tournamentId={tournament.id}
                  tournament={tournament as any}
                  couplesCount={approvedCouplesCount}
                  playersCount={stats.players}
                  pendingInscriptionsCount={pendingInscriptionsCount}
                />
                <InitiateTournamentButton
                  tournamentId={tournament.id}
                  tournament={tournament as any}
                  couplesCount={approvedCouplesCount}
                  playersCount={stats.players}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info Section - Versión Organizador */}
      <div className="container mx-auto px-4 py-8 lg:py-12">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">
                Información del Torneo
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Inscripciones */}
                <div>
                  <h3 className="text-sm font-medium text-slate-500 mb-2">
                    Inscripciones
                  </h3>
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    <span className="text-2xl font-bold text-slate-900">
                      {stats.couples}
                    </span>
                    <span className="text-slate-600">parejas</span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    {stats.players} jugadores en total
                  </p>
                </div>

                {/* Estado */}
                <div>
                  <h3 className="text-sm font-medium text-slate-500 mb-2">Estado</h3>
                  <div className="flex items-center gap-2">
                    {isCanceled ? (
                      <>
                        <XCircle className="h-5 w-5 text-red-600" />
                        <span className="text-lg font-semibold text-red-600">
                          Cancelado
                        </span>
                      </>
                    ) : isActive ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span className="text-lg font-semibold text-green-600">
                          En curso
                        </span>
                      </>
                    ) : (
                      <>
                        <Clock className="h-5 w-5 text-orange-600" />
                        <span className="text-lg font-semibold text-orange-600">
                          Próximamente
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Nota informativa - Solo si NO está iniciado */}
              {!isActive && (
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-surface">
                  <p className="text-sm text-blue-800 mb-3">
                    <strong>Nota:</strong> Una vez iniciado el torneo, podrás acceder
                    a las secciones de Zonas, Partidos y Llaves desde la sidebar lateral.
                  </p>
                  <p className="text-sm text-blue-700">
                    <strong>Dos opciones para comenzar:</strong>
                  </p>
                  <ul className="text-sm text-blue-700 mt-2 space-y-1 ml-4">
                    <li>
                      • <strong>Armar Zonas Automáticamente:</strong> Crea zonas y
                      distribuye parejas usando algoritmo serpentino
                    </li>
                    <li>
                      • <strong>Iniciar Torneo:</strong> Solo cambia el estado, permite
                      distribución manual posterior
                    </li>
                  </ul>
                </div>
              )}

              {/* Info adicional si está activo */}
              {isActive && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-surface">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-900 mb-1">
                        Torneo en Curso
                      </p>
                      <p className="text-sm text-green-700">
                        Podés gestionar las zonas, partidos y llaves desde la sidebar
                        lateral. Los jugadores ya pueden ver sus matches y posiciones.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
