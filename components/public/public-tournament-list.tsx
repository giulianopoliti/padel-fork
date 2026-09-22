"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarDays, ChevronRight, Clock3, MapPin, Ticket } from "lucide-react"
import PublicRegistrationLauncher from "@/components/tournament/public-registration-launcher"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getTenantBranding } from "@/config/tenant"
import { Gender } from "@/types"
import type { PublicTournamentSummary } from "@/types/public-tournament"
import { canShowPublicRegistration, getPublicRegistrationClosedLabel } from "@/lib/tournaments/registration-availability"
import { shouldTreatTournamentRegistrationAsPublic } from "@/lib/tournaments/tenant-registration-policy"
import { shouldShowFewSlotsAlert } from "@/lib/tournaments/few-slots-visibility"
import { getPublicTournamentHref } from "@/lib/tournaments/public-tournament-url"
import { buildGoogleMapsSearchUrl } from "@/lib/maps/google-maps"
import { Navigation } from "lucide-react"

interface PublicTournamentListProps {
  tournaments: PublicTournamentSummary[]
  emptyTitle: string
  emptyDescription: string
  showRegistration?: boolean
  variant?: "default" | "editorial"
}

const statusLabels: Record<string, string> = {
  NOT_STARTED: "Inscripciones abiertas",
  IN_PROGRESS: "En juego",
  ZONE_PHASE: "Fase de zonas",
  BRACKET_PHASE: "Llaves",
  FINISHED: "Finalizado",
  FINISHED_POINTS_PENDING: "Finalizado",
  FINISHED_POINTS_CALCULATED: "Finalizado",
}

const genderLabels: Partial<Record<Gender, string>> = {
  [Gender.MALE]: "Caballeros",
  [Gender.FEMALE]: "Damas",
  [Gender.MIXED]: "Mixto",
}

const capitalizeWords = (value: string) => value.replace(/\b\w/g, (char) => char.toUpperCase())

const formatDateLabel = (value: string | null | undefined) => {
  if (!value) return "Fecha a confirmar"

  return capitalizeWords(
    new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(value)),
  )
}

const formatTimeLabel = (value: string | null | undefined) => {
  if (!value) return "Horario a confirmar"

  return `${new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value))} hs`
}

const formatPrice = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return null

  if (typeof value === "number") {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(value)
  }

  return value
}

const getCategoryLabel = (tournament: PublicTournamentSummary) =>
  tournament.categoryName || tournament.category || tournament.name

export default function PublicTournamentList({
  tournaments,
  emptyTitle,
  emptyDescription,
  showRegistration = false,
  variant = "default",
}: PublicTournamentListProps) {
  const isEditorial = variant === "editorial"
  const branding = getTenantBranding()
  const router = useRouter()
  const allowActivePhaseRegistration = branding.key === "padel-fv"

  if (tournaments.length === 0) {
    return (
      <div className={isEditorial ? "rounded-3xl border border-[#19214f]/10 bg-[#e8eff8] px-6 py-12 font-elite-body text-center text-[#19214f]" : "tpe-shell rounded-[2rem] p-8 text-center text-white"}>
        <div className={isEditorial ? "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#eef2e0]" : "mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/8"}>
          <CalendarDays className={isEditorial ? "h-6 w-6 text-[#19214f]" : "h-8 w-8 text-[var(--tpe-lime)]"} />
        </div>
        <h3 className={isEditorial ? "font-elite-display text-3xl font-semibold" : "text-2xl font-black"}>{emptyTitle}</h3>
        <p className={isEditorial ? "mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600" : "mx-auto mt-3 max-w-2xl text-sm text-white/72 sm:text-base"}>{emptyDescription}</p>
      </div>
    )
  }

  return (
    <div className={isEditorial ? "space-y-4 font-elite-body" : "tpe-shell overflow-hidden rounded-[2rem]"}>
      <div className={isEditorial ? "border-b border-[#19214f]/15 pb-3" : "tpe-banner border-b-4 border-[var(--tpe-forest)] px-5 py-4 sm:px-8"}>
        <p className={isEditorial ? "font-elite-display text-lg font-semibold tracking-[0.04em] text-[#273170]" : "text-center text-lg font-black uppercase tracking-[0.14em] sm:text-2xl"}>Torneos americanos</p>
      </div>

      <div className={isEditorial ? "space-y-4" : "p-4 sm:p-6"}>
        {tournaments.map((tournament) => {
          const tournamentHref = getPublicTournamentHref(tournament)
          const statusLabel = statusLabels[tournament.status] || tournament.status
          const hideVenue = Boolean(tournament.hideVenue)
          const venueName = tournament.club?.name || tournament.club?.address || null
          const venueMapsUrl = hideVenue
            ? null
            : tournament.club?.mapsUrl || buildGoogleMapsSearchUrl({
                name: tournament.club?.name,
                address: tournament.club?.address,
                formattedAddress: tournament.club?.formattedAddress,
                googlePlaceId: tournament.club?.googlePlaceId,
                latitude: tournament.club?.latitude,
                longitude: tournament.club?.longitude,
              })
          const genderLabel =
            typeof tournament.gender === "string"
              ? genderLabels[tournament.gender as Gender] || tournament.gender
              : "Categoria abierta"
          const priceLabel = formatPrice(tournament.price)
          const categoryLabel = getCategoryLabel(tournament)
          const enablePublicRegistration = shouldTreatTournamentRegistrationAsPublic({
            tenantKey: branding.key,
            tournamentType: tournament.type,
            enablePublicInscriptions: tournament.enablePublicInscriptions,
          })
          const canRegister = showRegistration && canShowPublicRegistration({
            status: tournament.status,
            enablePublicInscriptions: enablePublicRegistration,
            registrationLocked: tournament.registrationLocked,
            bracketStatus: tournament.bracketStatus,
            isFull: tournament.isFull,
            allowActivePhaseRegistration,
          })

          return (
            <article
              key={tournament.id}
              className={isEditorial ? "group grid cursor-pointer overflow-hidden rounded-3xl border border-[#343b70] bg-[#292e60] text-white shadow-sm transition-colors hover:border-[#707aa5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19214f] focus-visible:ring-offset-4 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)_220px]" : "grid cursor-pointer gap-5 border-b border-white/[0.18] px-1 py-5 text-white last:border-b-0 sm:px-2 lg:grid-cols-[minmax(0,180px)_minmax(0,1fr)_220px]"}

              role="link"
              tabIndex={0}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return
                router.push(tournamentHref)
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  router.push(tournamentHref)
                }
              }}
            >
              <div className={isEditorial ? "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-white/10 bg-white/[0.025] p-5 sm:p-6 lg:flex lg:flex-col lg:items-start lg:justify-center lg:border-b-0 lg:border-r" : "space-y-2"}>
                <p className={isEditorial ? "break-words font-elite-display text-6xl font-semibold uppercase leading-none tracking-tight text-[#c7dc77] lg:text-7xl" : "text-[2rem] font-black uppercase leading-none text-[var(--tpe-lime)] sm:text-[2.5rem]"}>
                  {categoryLabel}
                </p>
                {tournament.name !== categoryLabel ? (
                  <p className={isEditorial ? "col-start-1 row-start-2 max-w-xs text-sm font-medium leading-5 text-white/85" : "text-xs font-bold uppercase tracking-[0.22em] text-white/72"}>{tournament.name}</p>
                ) : null}
                <Badge className={isEditorial ? "w-fit rounded-full border border-white/15 bg-white/[0.07] px-3 py-1 text-xs font-medium text-white hover:bg-white/10" : "w-fit border-0 bg-[var(--tpe-night-soft)] px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[var(--tpe-paper)]"}>
                  {genderLabel}
                </Badge>
              </div>

              <div className={isEditorial ? "min-w-0 space-y-3 p-5 sm:px-7 sm:py-6" : "space-y-3"}>
                <div className={isEditorial ? "flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-white sm:text-base" : "flex flex-wrap items-center gap-3 text-sm font-bold uppercase tracking-[0.12em] text-[var(--tpe-paper)] sm:text-base"}>
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className={isEditorial ? "h-4 w-4 shrink-0 text-[#a6c9dc]" : "h-4 w-4 text-[var(--tpe-lime)]"} />
                    {formatDateLabel(tournament.startDate)}
                  </span>
                  <span className={isEditorial ? "hidden" : "hidden text-white/40 sm:inline"}>-</span>
                  <span className="inline-flex items-center gap-2">
                    <Clock3 className={isEditorial ? "h-4 w-4 shrink-0 text-[#a6c9dc]" : "h-4 w-4 text-[var(--tpe-lime)]"} />
                    {formatTimeLabel(tournament.startDate)}
                  </span>
                </div>

                {!hideVenue && venueName ? (
                  <div className={isEditorial ? "min-w-0 space-y-2" : "space-y-2"}>
                    <p className={isEditorial ? "inline-flex items-start gap-2 text-base font-medium text-white [&>svg]:text-[#a6c9dc]" : "inline-flex items-start gap-2 text-sm font-black uppercase tracking-[0.04em] text-[var(--tpe-cyan)] sm:text-lg"}>
                      <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      {venueMapsUrl ? (
                        <a href={venueMapsUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline" aria-label={`Abrir ${venueName} en Google Maps`}>
                          {venueName}
                        </a>
                      ) : <span>{venueName}</span>}
                    </p>
                    {tournament.club?.address && tournament.club.address !== venueName ? (
                      venueMapsUrl ? (
                        <a href={venueMapsUrl} target="_blank" rel="noopener noreferrer" className={isEditorial ? "block pl-6 text-sm leading-6 text-slate-300 underline-offset-4 hover:underline" : "block pl-6 text-sm font-semibold uppercase tracking-[0.03em] text-white/82 underline-offset-4 hover:underline"} aria-label={`Abrir ${tournament.club.address} en Google Maps`}>
                          {tournament.club.address}
                        </a>
                      ) : <p className={isEditorial ? "pl-6 text-sm leading-6 text-slate-300" : "pl-6 text-sm font-semibold uppercase tracking-[0.03em] text-white/82"}>{tournament.club.address}</p>
                    ) : null}
                    {venueMapsUrl ? (
                      <a href={venueMapsUrl} target="_blank" rel="noopener noreferrer" className={isEditorial ? "inline-flex min-h-8 items-center gap-1 pl-6 text-xs font-medium text-slate-200 underline decoration-white/30 underline-offset-4 hover:decoration-white" : "inline-flex items-center gap-1 pl-6 text-xs font-bold uppercase tracking-[0.1em] text-white underline-offset-4 hover:underline"} aria-label={`Como llegar a ${venueName}`}>
                        <Navigation className="h-3.5 w-3.5" /> Como llegar
                      </a>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Badge className={isEditorial ? "rounded-full border-white/15 bg-white/[0.07] px-3 py-1 text-xs font-medium text-slate-200 hover:bg-white/10" : "tpe-chip rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]"}>
                    {statusLabel}
                  </Badge>
                  {tournament.isFull ? (
                    <Badge className={isEditorial ? "rounded-full border-rose-300/30 bg-rose-400/10 px-3 py-1 text-xs font-medium text-rose-100 hover:bg-rose-400/15" : "rounded-full border border-red-200/90 bg-red-700 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-[0_0_22px_rgba(220,38,38,0.38)]"}>
                      Completo
                    </Badge>
                  ) : null}
                  {shouldShowFewSlotsAlert(tournament.showFewSlotsAlert, tournament.hasFewSlots) ? (
                    <Badge className={isEditorial ? "rounded-full border-amber-300/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-100 hover:bg-amber-400/15" : "animate-pulse rounded-full border border-red-200/90 bg-red-600 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-[0_0_24px_rgba(220,38,38,0.45)]"}>
                      Pocos cupos
                    </Badge>
                  ) : null}
                  {priceLabel && !isEditorial ? (
                    <Badge className="rounded-full border-0 bg-[var(--tpe-lime)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--tpe-night)]">
                      <Ticket className="mr-1 h-3.5 w-3.5" />
                      {priceLabel}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className={isEditorial ? "flex flex-col justify-center gap-2 border-t border-white/10 p-5 lg:border-l lg:border-t-0 lg:p-6" : "flex flex-col justify-between gap-3"}>
                {isEditorial && priceLabel ? (
                  <p className="mb-1 text-2xl font-semibold tabular-nums tracking-tight text-white lg:text-right">{priceLabel}</p>
                ) : null}
                {canRegister ? (
                  <PublicRegistrationLauncher
                    tournamentId={tournament.id}
                    tournamentName={tournament.name}
                    tournamentGender={(tournament.gender as Gender) || Gender.MALE}
                    tournamentPrice={tournament.price || null}
                    enableTransferProof={tournament.enableTransferProof || false}
                    transferAlias={tournament.transferAlias || null}
                    transferAmount={tournament.transferAmount || null}
                    fullWidth
                    buttonClassName={isEditorial ? "h-12 w-full rounded-full bg-[#c7dc77] text-sm font-semibold text-[#19214f] hover:bg-[#d4e985] focus-visible:ring-white focus-visible:ring-offset-[#292e60]" : "w-full rounded-full bg-[var(--tpe-lime)] text-sm font-black uppercase tracking-[0.16em] text-[var(--tpe-night)] hover:bg-[#e6ff63]"}
                  />
                ) : showRegistration && (allowActivePhaseRegistration || tournament.status === "NOT_STARTED") ? (
                  <div className={isEditorial ? "rounded-full border border-white/15 bg-white/[0.06] px-4 py-3 text-center text-xs font-medium text-slate-200" : "rounded-[1.25rem] border border-white/12 bg-white/6 px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-white/80"}>
                    {getPublicRegistrationClosedLabel({
                      isFull: tournament.isFull,
                    })}
                  </div>
                ) : null}

                <Button
                  asChild
                  variant="outline"
                  className={isEditorial ? "h-11 w-full rounded-full border-white/15 bg-white/[0.04] text-sm font-medium text-white hover:bg-white/10 hover:text-white focus-visible:ring-white focus-visible:ring-offset-[#292e60]" : "w-full rounded-full border-white/20 bg-white/5 text-sm font-bold uppercase tracking-[0.14em] text-white hover:bg-white/10 hover:text-white"}
                >
                  <Link href={tournamentHref}>
                    Ver detalles
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
