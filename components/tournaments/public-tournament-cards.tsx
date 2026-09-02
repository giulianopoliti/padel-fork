"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
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
import { getPublicTournamentHref } from "@/lib/tournaments/public-tournament-url"
import { CalendarDays, Clock3, MapPin, Navigation, Tag, Trophy } from "lucide-react"

export interface PublicTournamentSummary {
  id: string
  seoSlug?: string | null
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
  showPublicInscriptions?: boolean
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
}

const typeLabel = {
  LONG: "Liga",
  AMERICAN: "Americano",
}

const genderLabel = {
  MALE: "Caballeros",
  FEMALE: "Damas",
  MIXED: "Mixto",
}

const TOURNAMENT_DISPLAY_TIME_ZONE = "America/Argentina/Buenos_Aires"

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
    timeZone: TOURNAMENT_DISPLAY_TIME_ZONE,
  })
}

const formatCompactTime = (dateString: string | null | undefined) => {
  if (!dateString || !hasExplicitTime(dateString)) {
    return null
  }

  const parts = new Intl.DateTimeFormat("es-AR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
    timeZone: TOURNAMENT_DISPLAY_TIME_ZONE,
  }).formatToParts(new Date(dateString))

  const hourPart = parts.find((part) => part.type === "hour")?.value
  const minutePart = parts.find((part) => part.type === "minute")?.value
  const hour = hourPart ? Number.parseInt(hourPart, 10) : Number.NaN

  if (Number.isNaN(hour)) {
    return null
  }

  if (!minutePart || minutePart === "00") {
    return `${hour}hs`
  }

  return `${hour}:${minutePart}hs`
}

const formatSchedule = (
  tournament: PublicTournamentSummary,
  { showLongDateRange }: { showLongDateRange: boolean },
) => {
  if (!tournament.startDate) {
    return "Fecha a confirmar"
  }

  if (tournament.type === "AMERICAN" || !showLongDateRange) {
    return formatDate(tournament.startDate)
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
}: PublicTournamentCardsProps) {
  const router = useRouter()
  const branding = getTenantBranding()
  const isElite = branding.key === "padel-elite"
  const allowActivePhaseRegistration = branding.key === "padel-fv"
  const emptyStateClassName = isElite
    ? "tpe-shell rounded-[2rem] px-5 py-10 text-center text-white sm:px-6 sm:py-12"
    : "rounded-display-lg border border-dashed border-white/20 bg-white/5 px-5 py-10 text-center shadow-sm backdrop-blur-sm sm:px-6 sm:py-12"
  const emptyTitleClassName = isElite ? "text-2xl font-black text-white" : "text-xl font-bold text-white"
  const emptyDescriptionClassName = isElite
    ? "mx-auto mt-3 max-w-2xl text-sm text-white/72 sm:text-base"
    : "mx-auto mt-3 max-w-2xl text-slate-300"
  const cardClassName = isElite
    ? "overflow-hidden rounded-display-lg border-2 border-[var(--tpe-forest)] bg-[linear-gradient(180deg,#2f3169_0%,#2b2e62_100%)] shadow-[0_16px_36px_rgba(16,24,40,0.22)]"
    : "overflow-hidden border-white/10 bg-brand-800/70 shadow-sm transition-shadow hover:border-court-500/40 hover:shadow-md"
  const primaryBadgeClassName = isElite
    ? "rounded-full border-0 bg-[var(--tpe-lime)] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--tpe-night)] hover:bg-[var(--tpe-lime)]"
    : "bg-court-500 text-brand-900 hover:bg-court-500"
  const secondaryBadgeClassName = isElite
    ? "tpe-chip rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]"
    : "border-court-500/30 bg-court-500/10 text-court-200"
  const mutedBadgeClassName = isElite
    ? "rounded-full border-white/15 bg-white/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/80"
    : "border-white/10 text-slate-300"
  const titleClassName = isElite
    ? "text-xl font-black uppercase tracking-tight text-[var(--tpe-paper)] sm:text-2xl"
    : "text-lg font-black tracking-tight text-white sm:text-xl"
  const bodyTextClassName = isElite
    ? "text-xs font-semibold uppercase tracking-[0.03em] text-white"
    : "text-xs text-slate-300 sm:text-sm"
  const infoBoxClassName = isElite
    ? "flex items-start gap-2.5 rounded-elevated border border-white/20 bg-[rgba(16,25,50,0.86)] px-3 py-2 sm:px-4"
    : "flex items-start gap-2.5 rounded-elevated bg-white/5 px-3 py-2 sm:px-3.5"
  const infoIconClassName = isElite ? "mt-0.5 h-3.5 w-3.5 text-[var(--tpe-lime)]" : "mt-0.5 h-3.5 w-3.5 text-court-300"
  const infoLabelClassName = isElite ? "text-[10px] font-black uppercase tracking-[0.14em] text-white/88" : "text-sm font-semibold text-white"
  const infoValueClassName = isElite ? "text-sm font-semibold text-white" : "text-sm"
  const pricePillClassName = isElite
    ? "inline-flex items-center gap-1.5 rounded-full bg-[var(--tpe-lime)] px-2.5 py-0.5 text-xs font-black uppercase tracking-[0.12em] text-[var(--tpe-night)]"
    : "inline-flex items-center gap-1.5 rounded-full bg-court-500 px-2.5 py-0.5 text-xs font-semibold text-brand-900 sm:text-sm"
  const awardPillClassName = isElite
    ? "inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--tpe-paper)]"
    : "inline-flex items-center gap-1.5 rounded-full bg-court-500/15 px-2.5 py-0.5 text-xs font-semibold text-court-200 sm:text-sm"
  const registrationButtonClassName = isElite
    ? "h-9 rounded-full bg-[var(--tpe-lime)] text-xs font-black uppercase tracking-[0.16em] text-[var(--tpe-night)] hover:bg-[#e6ff63] sm:h-10"
    : "h-9 bg-court-500 text-sm font-semibold text-brand-900 hover:bg-court-400 sm:h-10 sm:text-base"
  const detailsButtonClassName = isElite
    ? "h-9 rounded-full border-white/24 bg-white/8 text-xs font-bold uppercase tracking-[0.14em] text-white hover:bg-white/14 hover:text-white sm:h-10"
    : "h-9 border-white/20 bg-white/5 text-sm font-semibold text-white hover:bg-white/10 sm:h-10 sm:text-base"
  if (tournaments.length === 0) {
    return (
      <div className={emptyStateClassName}>
        <h3 className={emptyTitleClassName}>{emptyTitle}</h3>
        <p className={emptyDescriptionClassName}>{emptyDescription}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
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
          ? "rounded-full border border-emerald-200/90 bg-emerald-600 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[0_0_18px_rgba(16,185,129,0.28)]"
          : "rounded-full border border-white/[0.15] bg-white/[0.08] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/80"
        const isLongTournament = tournament.type === "LONG"
        const shouldShowTime = !isLongTournament
        const timeLabel = shouldShowTime
          ? formatCompactTime(tournament.startDate) || "A confirmar"
          : null

        return (
          <Card
            key={tournament.id}
            className={`${cardClassName} cursor-pointer`}
            role="link"
            tabIndex={0}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return
              router.push(getPublicTournamentHref(tournament))
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                router.push(getPublicTournamentHref(tournament))
              }
            }}
          >
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:gap-3.5 lg:flex-row lg:items-stretch lg:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
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
                      <Badge className="rounded-full border border-red-200/90 bg-red-700 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[0_0_22px_rgba(220,38,38,0.38)]">
                        Completo
                      </Badge>
                    ) : null}
                    {shouldShowFewSlotsAlert(tournament.showFewSlotsAlert, tournament.hasFewSlots) ? (
                      <Badge className="animate-pulse rounded-full border border-red-200/90 bg-red-600 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-[0_0_24px_rgba(220,38,38,0.45)]">
                        Pocos cupos
                      </Badge>
                    ) : null}
                  </div>

                  <div>
                    <h3 className={titleClassName}>{tournament.name}</h3>
                    {isLongTournament ? (
                      <p className={`mt-1 ${bodyTextClassName}`}>
                        Liga con fechas programadas y seguimiento durante la semana.
                      </p>
                    ) : null}
                  </div>

                  <div className={`grid gap-2 text-sm ${isElite ? "text-white" : "text-slate-200"} sm:grid-cols-2 sm:gap-3`}>
                    <div className={infoBoxClassName}>
                      <CalendarDays className={infoIconClassName} />
                      <div className="min-w-0">
                        <p className={infoLabelClassName}>Fecha</p>
                        <div className="mt-0.5 flex flex-col gap-0.5">
                          <p className={infoValueClassName}>
                            {formatSchedule(tournament, { showLongDateRange: isElite })}
                          </p>
                          {shouldShowTime && timeLabel ? (
                            <p
                              className="inline-flex items-center gap-1 text-sm font-semibold text-white"
                              aria-label={`Horario ${timeLabel}`}
                            >
                              <Clock3 className={`h-3.5 w-3.5 ${isElite ? "text-[var(--tpe-lime)]" : "text-court-300"}`} />
                              {timeLabel}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {!hideVenue && venueName ? (
                      <div className={infoBoxClassName}>
                        <MapPin className={infoIconClassName} />
                        <div className="min-w-0">
                          <p className={infoLabelClassName}>Sede</p>
                          <p className={infoValueClassName}>{venueName}</p>
                          {tournament.club?.address && tournament.club.address !== venueName ? (
                            venueMapsUrl ? (
                              <a
                                href={venueMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 block text-xs text-white/82 underline-offset-4 hover:underline"
                                aria-label={`Abrir ${tournament.club.address} en Google Maps`}
                                tabIndex={0}
                              >
                                {tournament.club.address}
                              </a>
                            ) : (
                              <p className="mt-1 text-xs text-white/82">{tournament.club.address}</p>
                            )
                          ) : venueMapsUrl ? (
                            <a
                              href={venueMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`${infoValueClassName} underline-offset-4 hover:underline`}
                              aria-label={`Abrir ${venueName} en Google Maps`}
                              tabIndex={0}
                            >
                              {venueName}
                            </a>
                          ) : (
                            <p className={infoValueClassName}>{venueName}</p>
                          )}
                          {venueMapsUrl ? (
                            <a
                              href={venueMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.1em] text-white underline-offset-4 hover:underline"
                              aria-label={`Como llegar a ${venueName}`}
                              tabIndex={0}
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

                </div>

                <div className="flex w-full flex-col justify-end gap-2 lg:w-52 lg:items-center">
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
                    <div className="rounded-elevated border border-white/12 bg-white/6 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-white/80">
                      {getPublicRegistrationClosedLabel({
                        isFull: tournament.isFull,
                      })}
                    </div>
                  ) : null}
                  <Button asChild variant="outline" className={`${detailsButtonClassName} lg:max-w-[220px]`}>
                    <Link href={getPublicTournamentHref(tournament)}>Ver detalles</Link>
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
