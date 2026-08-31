"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CalendarDays, ChevronRight, Clock3, MapPin, Ticket, Users } from "lucide-react"
import type { UpcomingTournament } from "@/app/api/panel/actions"
import PublicRegistrationLauncher from "@/components/tournament/public-registration-launcher"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Gender } from "@/types"
import { isTournamentGenderFilter } from "@/lib/tournaments/gender-filtering"
import { shouldShowFewSlotsAlert } from "@/lib/tournaments/few-slots-visibility"
import { buildGoogleMapsSearchUrl } from "@/lib/maps/google-maps"
import { formatDateLabel, formatPrice, formatTimeLabel } from "./panel-formatters"

interface PlayerUpcomingTournamentsSectionProps {
  tournaments: UpcomingTournament[]
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

export default function PlayerUpcomingTournamentsSection({
  tournaments,
}: PlayerUpcomingTournamentsSectionProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const upcomingGenderParam = searchParams.get("upcomingGender")
  const selectedGenderFilter: "all" | Gender.MALE | Gender.FEMALE | Gender.MIXED = isTournamentGenderFilter(upcomingGenderParam)
    ? upcomingGenderParam
    : "all"
  const tournamentsHref = (() => {
    const params = new URLSearchParams()

    if (selectedGenderFilter !== "all") {
      params.set("gender", selectedGenderFilter)
    }

    const queryString = params.toString()
    return queryString ? `/torneos?${queryString}` : "/torneos"
  })()

  const handleGenderFilterChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())

    if (value === "all") {
      params.delete("upcomingGender")
    } else {
      params.set("upcomingGender", value)
    }

    const queryString = params.toString()
    router.push(queryString ? `${pathname}?${queryString}` : pathname)
  }

  if (tournaments.length === 0) {
    return (
      <div className="tpe-shell rounded-[2rem] p-8 text-center text-white">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/8">
          <CalendarDays className="h-8 w-8 text-[var(--tpe-lime)]" />
        </div>
        <h2 className="text-2xl font-black">No hay torneos listos para inscribirte</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-white/72 sm:text-base">
          Apenas aparezcan nuevas fechas para tu categoria, las vas a ver primero aca.
        </p>
      </div>
    )
  }

  return (
    <div className="tpe-shell overflow-hidden rounded-[2rem]">
      <div className="tpe-banner border-b-4 border-[var(--tpe-forest)] px-5 py-4 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--tpe-forest)]">Agenda semanal</p>
            <h2 className="text-2xl font-black uppercase tracking-[-0.03em] sm:text-3xl">Proximos torneos</h2>
          </div>
          <div className="flex flex-col gap-3 sm:w-auto sm:min-w-[240px] sm:items-end">
            <div className="w-full sm:w-56">
              <Select value={selectedGenderFilter} onValueChange={handleGenderFilterChange}>
                <SelectTrigger className="rounded-full border-[var(--tpe-forest)]/20 bg-white/80 text-sm font-semibold text-[var(--tpe-night)]">
                  <SelectValue placeholder="Genero" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los generos</SelectItem>
                  <SelectItem value="MALE">Masculino</SelectItem>
                  <SelectItem value="FEMALE">Femenino</SelectItem>
                  <SelectItem value="MIXED">Mixto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              asChild
              variant="ghost"
              className="h-auto justify-start rounded-full px-0 text-xs font-black uppercase tracking-[0.16em] text-[var(--tpe-night)] hover:bg-transparent hover:text-[var(--tpe-night-soft)] sm:text-sm"
            >
              <Link href={tournamentsHref}>
                Ver todos
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {tournaments.map((tournament) => {
          const priceLabel = formatPrice(tournament.price)
          const statusLabel = statusLabels[tournament.status] || tournament.status
          const canRegister = !tournament.is_inscribed && !tournament.is_full && tournament.status === "NOT_STARTED"
          const hideVenue = Boolean(tournament.hide_venue)
          const venueName = tournament.club?.name || tournament.club?.address || null
          const venueMapsUrl = hideVenue
            ? null
            : buildGoogleMapsSearchUrl({
                name: tournament.club?.name,
                address: tournament.club?.address,
              })

          return (
            <article
              key={tournament.id}
              className="grid gap-5 border-b px-1 py-5 text-white last:border-b-0 sm:px-2 lg:grid-cols-[minmax(0,180px)_minmax(0,1fr)_240px]"
              style={{ borderColor: "rgba(255,255,255,0.18)" }}
            >
              <div className="space-y-3">
                <p className="text-[2rem] font-black uppercase leading-none text-[var(--tpe-lime)] sm:text-[2.5rem]">
                  {tournament.category_name || "Categoria abierta"}
                </p>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/72">{tournament.name}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge className="w-fit border-0 bg-[var(--tpe-night-soft)] px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[var(--tpe-paper)]">
                    {tournament.gender || "Abierto"}
                  </Badge>
                  {tournament.is_inscribed ? (
                    <Badge className="rounded-full border-0 bg-[var(--tpe-lime)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--tpe-night)]">
                      Ya inscripto
                    </Badge>
                  ) : null}
                  {tournament.is_full && !tournament.is_inscribed ? (
                    <Badge className="rounded-full border border-red-200/90 bg-red-700 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-[0_0_22px_rgba(220,38,38,0.38)]">
                      Completo
                    </Badge>
                  ) : null}
                  {shouldShowFewSlotsAlert(tournament.show_few_slots_alert, tournament.has_few_slots) ? (
                    <Badge className="animate-pulse rounded-full border border-red-200/90 bg-red-600 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-[0_0_24px_rgba(220,38,38,0.45)]">
                      Pocos cupos
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-sm font-bold uppercase tracking-[0.12em] text-[var(--tpe-paper)] sm:text-base">
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-[var(--tpe-lime)]" />
                    {formatDateLabel(tournament.start_date)}
                  </span>
                  <span className="hidden text-white/40 sm:inline">-</span>
                  <span className="inline-flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-[var(--tpe-lime)]" />
                    {formatTimeLabel(tournament.start_date)}
                  </span>
                </div>

                {!hideVenue && venueName ? (
                  <div className="space-y-2">
                    {venueMapsUrl ? (
                      <a
                        href={venueMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-start gap-2 text-sm font-black uppercase tracking-[0.04em] text-[var(--tpe-cyan)] sm:text-lg hover:underline"
                        aria-label={`Abrir ${venueName} en Google Maps`}
                      >
                        <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span>{venueName}</span>
                      </a>
                    ) : (
                      <p className="inline-flex items-start gap-2 text-sm font-black uppercase tracking-[0.04em] text-[var(--tpe-cyan)] sm:text-lg">
                        <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span>{venueName}</span>
                      </p>
                    )}
                    {tournament.club?.address && tournament.club.address !== venueName ? (
                      venueMapsUrl ? (
                        <a
                          href={venueMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block pl-6 text-sm font-semibold uppercase tracking-[0.03em] text-white/82 hover:underline"
                          aria-label={`Abrir ${tournament.club.address} en Google Maps`}
                        >
                          {tournament.club.address}
                        </a>
                      ) : (
                        <p className="pl-6 text-sm font-semibold uppercase tracking-[0.03em] text-white/82">
                          {tournament.club.address}
                        </p>
                      )
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Badge className="tpe-chip rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]">
                    {statusLabel}
                  </Badge>
                  {tournament.enable_public_inscriptions && typeof tournament.max_participants === "number" ? (
                    <Badge className="rounded-full border border-white/15 bg-white/6 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/90">
                      <Users className="mr-1 h-3.5 w-3.5" />
                      {tournament.current_inscriptions}/{tournament.max_participants} parejas
                    </Badge>
                  ) : null}
                  {priceLabel ? (
                    <Badge className="rounded-full border-0 bg-[var(--tpe-lime)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--tpe-night)]">
                      <Ticket className="mr-1 h-3.5 w-3.5" />
                      {priceLabel}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col justify-between gap-3">
                {canRegister ? (
                  <PublicRegistrationLauncher
                    tournamentId={tournament.id}
                    tournamentName={tournament.name}
                    tournamentGender={(tournament.gender as Gender) || Gender.MALE}
                    tournamentPrice={tournament.price ?? null}
                    enableTransferProof={tournament.enable_transfer_proof || false}
                    transferAlias={tournament.transfer_alias || null}
                    transferAmount={tournament.transfer_amount || null}
                    buttonClassName="w-full rounded-full bg-[var(--tpe-lime)] text-sm font-black uppercase tracking-[0.16em] text-[var(--tpe-night)] hover:bg-[#e6ff63]"
                    fullWidth
                  />
                ) : (
                  <div className="rounded-[1.25rem] border border-white/12 bg-white/6 px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-white/80">
                    {tournament.is_inscribed ? "Segui tu inscripcion abajo" : "Mira los detalles del torneo"}
                  </div>
                )}

                <Button
                  asChild
                  variant="outline"
                  className="w-full rounded-full border-white/20 bg-white/5 text-sm font-bold uppercase tracking-[0.14em] text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href={`/tournaments/${tournament.id}`}>
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
