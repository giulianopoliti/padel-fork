"use client";

import React from "react";
import { Calendar, CheckCircle2, MapPin, Trophy, Users, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PublicRegistrationLauncher from "@/components/tournament/public-registration-launcher";
import TournamentHeroDetails from "@/components/tournament/TournamentHeroDetails";
import TournamentPublicInfoCard from "@/components/tournament/TournamentPublicInfoCard";
import { getTenantBranding } from "@/config/tenant";
import type { TournamentPublicInfo } from "@/lib/tournaments/public-tournament-details";
import { Gender } from "@/types";
import type { AccessLevel, TournamentPermission } from "@/utils/tournament-permissions";
import { canShowPublicRegistration } from "@/lib/tournaments/registration-availability";
import { shouldTreatTournamentRegistrationAsPublic } from "@/lib/tournaments/tenant-registration-policy";
import { shouldShowFewSlotsAlert } from "@/lib/tournaments/few-slots-visibility";
import { PLAYER_INSCRIPTION_COPY } from "@/lib/tournaments/player-inscription-copy";

interface AmericanPublicViewProps {
  tournamentId: string;
  tournament: any;
  accessLevel: AccessLevel;
  permissions: TournamentPermission[];
  metadata: {
    userRole?: "ADMIN" | "CLUB" | "ORGANIZADOR" | "PLAYER" | "COACH";
    isInscribed?: boolean;
    isPending?: boolean;
    coupleId?: string;
    playerId?: string;
    source?: "admin" | "club_owner" | "organization_member" | "player" | "public";
  };
  publicInfo: TournamentPublicInfo;
  coupleInscriptions?: any[];
  individualInscriptions?: any[];
}

export default function AmericanPublicView({
  tournamentId,
  tournament,
  accessLevel,
  permissions,
  metadata,
  publicInfo,
  coupleInscriptions = [],
  individualInscriptions = [],
}: AmericanPublicViewProps) {
  void accessLevel;
  void permissions;

  const stats = {
    couples: coupleInscriptions.length,
    players: individualInscriptions.length,
  };
  const canShowParticipantStats = Boolean(tournament.show_public_inscriptions);

  const isCanceled = tournament.status === "CANCELED";
  const isAuthenticated = !!metadata.userRole;
  const canRegister = metadata.userRole === "PLAYER";
  const isGuest = !isAuthenticated;
  const isInscribed = Boolean(metadata.isInscribed);
  const isPending = Boolean(metadata.isPending);
  const isFull = Boolean(tournament.is_full);
  const branding = getTenantBranding();
  const hasFewSlots = Boolean(tournament.has_few_slots);
  const showFewSlotsAlert = tournament.show_few_slots_alert !== false;
  const enablePublicRegistration = shouldTreatTournamentRegistrationAsPublic({
    tenantKey: branding.key,
    tournamentType: tournament.type,
    enablePublicInscriptions: tournament.enable_public_inscriptions,
  });
  const registrationAvailable = canShowPublicRegistration({
    status: tournament.status,
    enablePublicInscriptions: enablePublicRegistration,
    registrationLocked: tournament.registration_locked,
    bracketStatus: tournament.bracket_status,
    isFull,
    allowActivePhaseRegistration: branding.key === "padel-fv",
  });
  const canShowRegistration = (isGuest || canRegister) && !isInscribed && !isCanceled && registrationAvailable;

  const registrationLauncher = (
    <PublicRegistrationLauncher
      tournamentId={tournamentId}
      tournamentName={tournament.name}
      tournamentGender={tournament.gender || Gender.MALE}
      tournamentPrice={tournament.price ?? null}
      enableTransferProof={tournament.enable_transfer_proof || false}
      transferAlias={tournament.transfer_alias || null}
      transferAmount={tournament.transfer_amount || null}
      buttonLabel="Inscribirme"
      buttonClassName="bg-white text-blue-600 hover:bg-blue-50 font-semibold"
    />
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="container mx-auto px-4 py-12 lg:py-16">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
              <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                Torneo Americano
              </Badge>
              {shouldShowFewSlotsAlert(showFewSlotsAlert, hasFewSlots) ? (
                <Badge className="animate-pulse border border-red-200/70 bg-red-600 text-white shadow-[0_0_24px_rgba(220,38,38,0.45)]">
                  Pocos cupos
                </Badge>
              ) : null}
              {isFull ? (
                <Badge className="border border-red-200/80 bg-red-700 text-white shadow-[0_0_28px_rgba(220,38,38,0.55)]">
                  Completo
                </Badge>
              ) : null}
              {isCanceled && (
                <Badge variant="destructive" className="bg-red-600 text-white border-red-700 gap-2">
                  <XCircle className="h-3 w-3" />
                  CANCELADO
                </Badge>
              )}
            </div>

            <h1 className="text-4xl lg:text-5xl font-bold mb-4">{tournament.name}</h1>

            {publicInfo.clubName && (
              <div className="flex items-center justify-center gap-2 text-xl text-blue-100 mb-6">
                <MapPin className="h-5 w-5" />
                <span>{publicInfo.clubName}</span>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-8">
              {canShowParticipantStats ? (
                <>
                  <div className="bg-white/10 backdrop-blur-sm rounded-surface p-4">
                    <Users className="h-8 w-8 mx-auto mb-2" />
                    <div className="text-3xl font-bold">{stats.couples}</div>
                    <div className="text-blue-100 text-sm mt-1">Parejas inscriptas</div>
                  </div>

                  <div className="bg-white/10 backdrop-blur-sm rounded-surface p-4">
                    <Trophy className="h-8 w-8 mx-auto mb-2" />
                    <div className="text-3xl font-bold">{stats.players}</div>
                    <div className="text-blue-100 text-sm mt-1">Jugadores</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-white/10 backdrop-blur-sm rounded-surface p-4">
                    <Trophy className="h-8 w-8 mx-auto mb-2" />
                    <div className="text-lg font-bold mt-1">{publicInfo.typeLabel}</div>
                    <div className="text-blue-100 text-sm mt-1">Formato</div>
                  </div>

                  <div className="bg-white/10 backdrop-blur-sm rounded-surface p-4">
                    <Users className="h-8 w-8 mx-auto mb-2" />
                    <div className="text-lg font-bold mt-1">
                      {publicInfo.category || publicInfo.genderLabel}
                    </div>
                    <div className="text-blue-100 text-sm mt-1">
                      {publicInfo.category ? "Categoría" : "Género"}
                    </div>
                  </div>
                </>
              )}

              <div className="bg-white/10 backdrop-blur-sm rounded-surface p-4 col-span-2 md:col-span-1">
                <Calendar className="h-8 w-8 mx-auto mb-2" />
                <div className="text-lg font-bold mt-1">
                  {publicInfo.startDateLabel || "Fecha por definir"}
                </div>
                <div className="text-blue-100 text-sm mt-1">Fecha de inicio</div>
              </div>
            </div>

            <TournamentHeroDetails publicInfo={publicInfo} className="mt-6 text-left" />

            {isCanceled && (
              <div className="mt-8 max-w-md mx-auto">
                <div className="bg-red-100/20 border border-red-300/30 rounded-surface p-4 backdrop-blur-sm">
                  <div className="flex items-center justify-center gap-2 text-red-100">
                    <XCircle className="h-5 w-5" />
                    <p className="font-medium">Este torneo ha sido cancelado</p>
                  </div>
                  <p className="text-sm text-red-200 mt-2 text-center">Las inscripciones estan cerradas</p>
                </div>
              </div>
            )}

            {canShowRegistration && (
              <div className="mt-8 space-y-4">
                <p className="text-blue-100 text-lg">Queres participar en este torneo?</p>
                <div className="flex justify-center">{registrationLauncher}</div>
              </div>
            )}

            {isInscribed && !isCanceled ? (
              <div className="mx-auto mt-8 max-w-md rounded-surface border border-emerald-200/70 bg-emerald-600/90 p-4 text-white shadow-lg backdrop-blur-sm">
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="text-base font-semibold">
                    {isPending
                      ? PLAYER_INSCRIPTION_COPY.pendingTitle
                      : PLAYER_INSCRIPTION_COPY.confirmedTitle}
                  </p>
                </div>
                <p className="mt-2 text-sm text-emerald-50">
                  {isPending
                    ? "Los organizadores deben aprobarla antes de confirmar tu participación."
                    : "Tu inscripción fue confirmada correctamente."}
                </p>
              </div>
            ) : null}

            {isFull && !isCanceled ? (
              <div className="mt-8 max-w-md mx-auto">
                <div className="rounded-surface border border-red-200/70 bg-red-600/90 p-4 text-white shadow-[0_0_28px_rgba(220,38,38,0.45)] backdrop-blur-sm">
                  <p className="text-base font-semibold">Cupo completo</p>
                  <p className="mt-2 text-sm text-red-50">Ya no se aceptan nuevas inscripciones para este torneo.</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 lg:py-12">
        <div className="max-w-4xl mx-auto space-y-6">
          <TournamentPublicInfoCard publicInfo={publicInfo} />

          {isGuest && registrationAvailable ? (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <Trophy className="h-12 w-12 mx-auto text-blue-600" />
                  <h3 className="text-xl font-semibold text-slate-900">Listo para competir?</h3>
                  <p className="text-slate-600 max-w-md mx-auto">
                    Registrate o inicia sesion y completa la inscripcion sin salir del torneo.
                  </p>
                  <div className="flex justify-center pt-2">{registrationLauncher}</div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {canRegister && !isGuest && !isInscribed && registrationAvailable && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <Trophy className="h-12 w-12 mx-auto text-blue-600" />
                  <h3 className="text-xl font-semibold text-slate-900">Listo para competir?</h3>
                  <p className="text-slate-600 max-w-md mx-auto">
                    Inscribite en este torneo y empeza a jugar.
                  </p>
                  <div className="flex justify-center pt-2">{registrationLauncher}</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
