"use client"

import Link from "next/link"
import PublicRegistrationLauncher from "@/components/tournament/public-registration-launcher"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Gender } from "@/types"
import { getTenantBranding } from "@/config/tenant"
import { buildGoogleMapsSearchUrl } from "@/lib/maps/google-maps"
import { canShowPublicRegistration, getPublicRegistrationClosedLabel } from "@/lib/tournaments/registration-availability"
import { shouldTreatTournamentRegistrationAsPublic } from "@/lib/tournaments/tenant-registration-policy"
import { shouldShowFewSlotsAlert } from "@/lib/tournaments/few-slots-visibility"
import { CalendarDays, Clock3, MapPin, Navigation, Tag, Trophy } from "lucide-react"

export interface PublicTournamentSummary {
  id: string
  name: string
  status: string
  category?: string | null
  categoryName?: string | null
  gender?: string | null
  type?: "LONG" | "AMERICAN" | string | null
  startDate?: string | null
  endDate?: string | null
  price?: number | string | null
  award?: string | null
  enablePublicInscriptions?: boolean
  registrationLocked?: boolean | null
  bracketStatus?: string | null
  currentParticipants?: number
  maxParticipants?: number | null
  remainingSlots?: number | null
  isFull?: boolean
  hasFewSlots?: boolean
  showFewSlotsAlert?: boolean
  hideVenue?: boolean
  club?: {
    id?: string | null
    name?: string | null
    address?: string | null
    formattedAddress?: string | null
    googlePlaceId?: string | null
    latitude?: number | string | null
    longitude?: number | string | null
    mapsUrl?: string | null
  } | null
  enableTransferProof?: boolean
  transferAlias?: string | null
  transferAmount?: number | null
}

interface PublicTournamentCardsProps {
  tournaments: PublicTournamentSummary[]
  emptyTitle: string
  emptyDescription: string
  showParticipantStats?: boolean
}

const typeLabel = {
  LONG: "Liga",
  AMERICAN: "Americano",
}

const genderLabel = {
  MALE: "Masculino",
  FEMALE: "Femenino",
  MIXED: "Mixto",
}

const hasExplicitTime = (dateString: string | null | undefined) => {
  return Boolean(dateString && dateString.includes("T"))
}

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) {
    return "Fecha a confirmar"
  }

  const date = new Date(dateString)

  return date.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

const formatTime = (dateString: string | null | undefined) => {
  if (!dateString || !hasExplicitTime(dateString)) {
    return "Horario a confirmar"
  }

  const date = new Date(dateString)

  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

const formatSchedule = (tournament: PublicTournamentSummary) => {
  if (!tournament.startDate) {
    return "Fecha a confirmar"
  }

  if (tournament.type === "AMERICAN") {
    const timeLabel = formatTime(tournament.startDate)
    return timeLabel === "Horario a confirmar"
      ? formatDate(tournament.startDate)
      : `${formatDate(tournament.startDate)} - ${timeLabel} hs`
  }

  if (!tournament.endDate || tournament.endDate === tournament.startDate) {
    return formatDate(tournament.startDate)
  }

  return `${formatDate(tournament.startDate)} al ${formatDate(tournament.endDate)}`
}

const formatPrice = (price: number | string | null | undefined) => {
  if (price === null || price === undefined || price === "") {
    return null
  }

  if (typeof price === "number") {
    return `$${price.toLocaleString("es-AR")}`
  }

  return price
}

const resolveTournamentGender = (gender: string | null | undefined): Gender => {
  if (gender === Gender.FEMALE) {
    return Gender.FEMALE
  }

  if (gender === Gender.MIXED) {
    return Gender.MIXED
  }

  return Gender.MALE
}

export function PublicTournamentCards({
  tournaments,
  emptyTitle,
  emptyDescription,
  showParticipantStats = false,
}: PublicTournamentCardsProps) {
  const branding = getTenantBranding()
  const isElite = branding.key === "padel-elite"
  const allowActivePhaseRegistration = branding.key === "padel-fv"

  const emptyStateClassName = isElite
    ? "tpe-shell rounded-[2rem] px-5 py-10 text-center text-white sm:px-6 sm:py-12"
    : "rounded-3xl border border-dashed border-white/20 bg-white/5 px-5 py-10 text-center shadow-sm backdrop-blur-sm sm:px-6 sm:py-12"
  const emptyTitleClassName = isElite ? "text-2xl font-black text-white" : "text-xl font-bold text-white"
  const emptyDescriptionClassName = isElite
    ? "mx-auto mt-3 max-w-2xl text-sm text-white/72 sm:text-base"
    : "mx-auto mt-3 max-w-2xl text-slate-300"
  const cardClassName = isElite
    ? "overflow-hidden rounded-[2rem] border-2 border-[var(--tpe-forest)] bg-[linear-gradient(180deg,#2f3169_0%,#2b2e62_100%)] shadow-[0_20px_50px_rgba(16,24,40,0.24)]"
    : "overflow-hidden border-white/10 bg-brand-800/70 shadow-sm transition-shadow hover:border-court-500/40 hover:shadow-md"
  const primaryBadgeClassName = isElite
    ? "rounded-full border-0 bg-[var(--tpe-lime)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--tpe-night)] hover:bg-[var(--tpe-lime)]"
    : "bg-court-500 text-brand-900 hover:bg-court-500"
  const secondaryBadgeClassName = isElite
    ? "tpe-chip rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]"
    : "border-court-500/30 bg-court-500/10 text-court-200"
  const mutedBadgeClassName = isElite
    ? "rounded-full border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/80"
    : "border-white/10 text-slate-300"
  const titleClassName = isElite
    ? "text-2xl font-black uppercase tracking-tight text-[var(--tpe-paper)] sm:text-3xl"
    : "text-xl font-black tracking-tight text-white sm:text-2xl"
  const bodyTextClassName = isElite
    ? "text-sm font-semibold uppercase tracking-[0.03em] text-white"
    : "text-sm text-slate-300"
  const infoBoxClassName = isElite
    ? "flex items-start gap-3 rounded-2xl border border-white/20 bg-[rgba(16,25,50,0.86)] px-4 py-3 sm:px-5"
    : "flex items-start gap-3 rounded-2xl bg-white/5 px-3 py-3 sm:px-4"
  const infoIconClassName = isElite ? "mt-0.5 h-4 w-4 text-[var(--tpe-lime)]" : "mt-0.5 h-4 w-4 text-court-300"
  const infoLabelClassName = isElite ? "text-[11px] font-black uppercase tracking-[0.14em] text-white/88" : "font-semibold text-white"
  const infoValueClassName = isElite ? "font-semibold text-white" : ""
  const pricePillClassName = isElite
    ? "inline-flex items-center gap-2 rounded-full bg-[var(--tpe-lime)] px-3 py-1 text-sm font-black uppercase tracking-[0.12em] text-[var(--tpe-night)]"
    : "inline-flex items-center gap-2 rounded-full bg-court-500 px-3 py-1 text-sm font-semibold text-brand-900"
  const awardPillClassName = isElite
    ? "inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm font-bold uppercase tracking-[0.12em] text-[var(--tpe-paper)]"
    : "inline-flex items-center gap-2 rounded-full bg-court-500/15 px-3 py-1 text-sm font-semibold text-court-200"
  const registrationButtonClassName = isElite
    ? "h-11 rounded-full bg-[var(--tpe-lime)] text-sm font-black uppercase tracking-[0.16em] text-[var(--tpe-night)] hover:bg-[#e6ff63]"
    : "h-11 bg-court-500 text-base font-semibold text-brand-900 hover:bg-court-400"
  const detailsButtonClassName = isElite
    ? "h-11 rounded-full border-white/24 bg-white/8 text-sm font-bold uppercase tracking-[0.14em] text-white hover:bg-white/14 hover:text-white"
    : "h-11 border-white/20 bg-white/5 text-base font-semibold text-white hover:bg-white/10"
  const statsPanelClassName = isElite
    ? "rounded-2xl border border-white/20 bg-[rgba(16,25,50,0.86)] px-4 py-3"
    : "rounded-2xl bg-white/5 px-4 py-3"
  const progressTrackClassName = isElite ? "bg-white/10" : "bg-white/10"
  const progressFillClassName = isElite ? "bg-[var(--tpe-lime)]" : "bg-court-500"

  if (tournaments.length === 0) {
    return (
      <div className={emptyStateClassName}>
        <h3 className={emptyTitleClassName}>{emptyTitle}</h3>
        <p className={emptyDescriptionClassName}>{emptyDescription}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {tournaments.map((tournament) => {
        const priceLabel = formatPrice(tournament.price)
        const hideVenue = Boolean(tournament.hideVenue)
        const venueName = tournament.club?.name || tournament.club?.address || null
        const venueMapsUrl = hideVenue
          ? null
          : tournament.club?.mapsUrl ||
            buildGoogleMapsSearchUrl({
              name: tournament.club?.name,
              address: tournament.club?.address,
              formattedAddress: tournament.club?.formattedAddress,
              googlePlaceId: tournament.club?.googlePlaceId,
              latitude: tournament.club?.latitude,
              longitude: tournament.club?.longitude,
            })
        const canShowParticipantStats =
          showParticipantStats &&
          Boolean(tournament.enablePublicInscriptions) &&
          typeof tournament.maxParticipants === "number" &&
          tournament.maxParticipants > 0
        const enablePublicRegistration = shouldTreatTournamentRegistrationAsPublic({
          tenantKey: branding.key,
          tournamentType: tournament.type,
          enablePublicInscriptions: tournament.enablePublicInscriptions,
        })
        const canRegister = canShowPublicRegistration({
          status: tournament.status,
          enablePublicInscriptions: enablePublicRegistration,
          registrationLocked: tournament.registrationLocked,
          bracketStatus: tournament.bracketStatus,
          isFull: tournament.isFull,
          allowActivePhaseRegistration,
        })
        const registrationStatusLabel = canRegister ? "Inscripciones abiertas" : "Inscripciones cerradas"
        const registrationBadgeClassName = canRegister
          ? "rounded-full border border-emerald-200/90 bg-emerald-600 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-[0_0_18px_rgba(16,185,129,0.28)]"
          : "rounded-full border border-white/[0.15] bg-white/[0.08] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/80"
        const currentParticipants = tournament.currentParticipants || 0
        const progressWidth = canShowParticipantStats
          ? `${Math.min((currentParticipants / tournament.maxParticipants!) * 100, 100)}%`
          : "0%"
        const timeLabel = tournament.startDate
          ? hasExplicitTime(tournament.startDate)
            ? `${formatTime(tournament.startDate)} hs`
            : "A confirmar"
          : "A confirmar"

        return (
          <Card key={tournament.id} className={cardClassName}>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-stretch lg:justify-between">
                <div className="min-w-0 flex-1 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={primaryBadgeClassName}>
                      {typeLabel[(tournament.type || "LONG") as keyof typeof typeLabel] || tournament.type || "Torneo"}
                    </Badge>
                    {tournament.category || tournament.categoryName ? (
                      <Badge variant="outline" className={secondaryBadgeClassName}>
                        {tournament.category || tournament.categoryName}
                      </Badge>
                    ) : null}
                    {tournament.gender ? (
                      <Badge variant="outline" className={mutedBadgeClassName}>
                        {genderLabel[tournament.gender as keyof typeof genderLabel] || tournament.gender}
                      </Badge>
                    ) : null}
                    {!isElite ? (
                      <Badge className={registrationBadgeClassName}>
                        {registrationStatusLabel}
                      </Badge>
                    ) : null}
                    {tournament.isFull ? (
                      <Badge className="rounded-full border border-red-200/90 bg-red-700 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-[0_0_22px_rgba(220,38,38,0.38)]">
                        Completo
                      </Badge>
                    ) : null}
                    {shouldShowFewSlotsAlert(tournament.showFewSlotsAlert, tournament.hasFewSlots) ? (
                      <Badge className="animate-pulse rounded-full border border-red-200/90 bg-red-600 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-[0_0_24px_rgba(220,38,38,0.45)]">
                        Pocos cupos
                      </Badge>
                    ) : null}
                  </div>

                  <div>
                    <h3 className={titleClassName}>{tournament.name}</h3>
                    <p className={`mt-1 ${bodyTextClassName}`}>
                      {tournament.type === "AMERICAN"
                        ? "Formato rapido con horario puntual y registro simple."
                        : "Liga con fechas programadas y seguimiento durante la semana."}
                    </p>
                  </div>

                  <div className={`grid gap-3 text-sm ${isElite ? "text-white" : "text-slate-200"} sm:grid-cols-2`}>
                    <div className={infoBoxClassName}>
                      <CalendarDays className={infoIconClassName} />
                      <div className="min-w-0">
                        <p className={infoLabelClassName}>Fecha</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <p className={infoValueClassName}>{formatSchedule(tournament)}</p>
                          <p className="inline-flex items-center gap-1 font-semibold text-white">
                            <Clock3 className={`h-3.5 w-3.5 ${isElite ? "text-[var(--tpe-lime)]" : "text-court-300"}`} />
                            {timeLabel}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-white/82">
                          {tournament.type === "AMERICAN" ? "Partido único con horario definido." : "Fecha principal del torneo."}
                        </p>
                      </div>
                    </div>

                    {!hideVenue && venueName ? (
                      <div className={infoBoxClassName}>
                        <MapPin className={infoIconClassName} />
                        <div className="min-w-0">
                          <p className={infoLabelClassName}>Sede</p>
                          <p className={infoValueClassName}>{venueName}</p>
                          {tournament.club?.address && tournament.club.address !== venueName ? (
                            <p className="mt-1 text-xs text-white/82">{tournament.club.address}</p>
                          ) : null}
                          {venueMapsUrl ? (
                            <a
                              href={venueMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.1em] text-white underline-offset-4 hover:underline"
                            >
                              <Navigation className="h-3.5 w-3.5" />
                              Como llegar
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {(priceLabel || tournament.award) ? (
                    <div className="flex flex-wrap gap-2">
                      {priceLabel ? (
                        <div className={pricePillClassName}>
                          <Tag className="h-3.5 w-3.5" />
                          Inscripción {priceLabel}
                        </div>
                      ) : null}
                      {tournament.award ? (
                        <div className={awardPillClassName}>
                          <Trophy className="h-3.5 w-3.5" />
                          {tournament.award}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {canShowParticipantStats ? (
                    <div className={statsPanelClassName}>
                      <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.12em] text-white/88">
                        <span>Inscriptos</span>
                        <span>
                          {currentParticipants}/{tournament.maxParticipants}
                        </span>
                      </div>
                      <div className={`mt-3 h-2 overflow-hidden rounded-full ${progressTrackClassName}`}>
                        <div className={`h-full rounded-full ${progressFillClassName}`} style={{ width: progressWidth }} />
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex w-full flex-col justify-end gap-3 lg:w-56 lg:items-center">
                  {canRegister ? (
                    <PublicRegistrationLauncher
                      tournamentId={tournament.id}
                      tournamentName={tournament.name}
                      tournamentGender={resolveTournamentGender(tournament.gender)}
                      tournamentPrice={tournament.price ?? null}
                      enableTransferProof={tournament.enableTransferProof || false}
                      transferAlias={tournament.transferAlias || null}
                      transferAmount={tournament.transferAmount || null}
                      buttonClassName={`${registrationButtonClassName} lg:max-w-[220px]`}
                      fullWidth
                    />
                  ) : !isElite || tournament.status === "NOT_STARTED" ? (
                    <div className="rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-white/80">
                      {getPublicRegistrationClosedLabel({
                        isFull: tournament.isFull,
                      })}
                    </div>
                  ) : null}
                  <Button asChild variant="outline" className={`${detailsButtonClassName} lg:max-w-[220px]`}>
                    <Link href={`/tournaments/${tournament.id}`}>Ver detalles</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
