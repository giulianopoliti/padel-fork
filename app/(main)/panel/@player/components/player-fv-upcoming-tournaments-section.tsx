"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Ticket, Users } from "lucide-react"
import type { UpcomingTournament } from "@/app/api/panel/actions"
import PublicRegistrationLauncher from "@/components/tournament/public-registration-launcher"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Gender } from "@/types"
import { isTournamentGenderFilter } from "@/lib/tournaments/gender-filtering"
import { canShowPublicRegistration, getPublicRegistrationClosedLabel } from "@/lib/tournaments/registration-availability"
import { shouldShowFewSlotsAlert } from "@/lib/tournaments/few-slots-visibility"
import { buildGoogleMapsSearchUrl } from "@/lib/maps/google-maps"
import { formatFvDateLabel as formatDateLabel, formatPrice, formatTimeLabel } from "./panel-formatters"

interface PlayerFvUpcomingTournamentsSectionProps {
  tournaments: UpcomingTournament[]
  tournamentType: "LONG" | "AMERICAN"
}

const ITEMS_PER_PAGE = 6

const statusLabels: Record<string, string> = {
  NOT_STARTED: "Inscripciones abiertas",
  IN_PROGRESS: "En juego",
  ZONE_PHASE: "Fase de zonas",
  BRACKET_PHASE: "Llaves",
  FINISHED: "Finalizado",
  FINISHED_POINTS_PENDING: "Finalizado",
  FINISHED_POINTS_CALCULATED: "Finalizado",
}

const typeLabels: Record<string, string> = {
  LONG: "Liga",
  AMERICAN: "Americano",
}

export default function PlayerFvUpcomingTournamentsSection({
  tournaments: allTournaments,
  tournamentType,
}: PlayerFvUpcomingTournamentsSectionProps) {
  const tournaments = useMemo(
    () => allTournaments.filter((tournament) => tournament.type === tournamentType),
    [allTournaments, tournamentType],
  )
  const isAmerican = tournamentType === "AMERICAN"
  const sectionTitle = isAmerican ? "Americanos activos" : "Ligas activas"
  const emptyTitle = isAmerican ? "No hay americanos activos publicados" : "No hay ligas activas publicadas"
  const viewAllLabel = isAmerican ? "Ver todos los americanos" : "Ver todas las ligas"
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [page, setPage] = useState(1)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const upcomingGenderParam = searchParams.get("upcomingGender")
  const selectedGenderFilter: "all" | Gender.MALE | Gender.FEMALE | Gender.MIXED = isTournamentGenderFilter(upcomingGenderParam)
    ? upcomingGenderParam
    : "all"
  const totalPages = Math.max(1, Math.ceil(tournaments.length / ITEMS_PER_PAGE))
  const displayedTournaments = useMemo(() => {
    if (!isAmerican) {
      return tournaments.slice(0, page * ITEMS_PER_PAGE)
    }

    const startIndex = (page - 1) * ITEMS_PER_PAGE
    return tournaments.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [isAmerican, page, tournaments])
  const hasMoreLeagues = !isAmerican && displayedTournaments.length < tournaments.length
  const tournamentsHref = (() => {
    const params = new URLSearchParams({ type: tournamentType })

    if (selectedGenderFilter !== "all") {
      params.set("gender", selectedGenderFilter)
    }

    const queryString = params.toString()
    return queryString ? `/torneos?${queryString}` : "/torneos"
  })()

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  useEffect(() => {
    const loadMoreNode = loadMoreRef.current

    if (isAmerican || !hasMoreLeagues || !loadMoreNode) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPage((currentPage) => Math.min(totalPages, currentPage + 1))
        }
      },
      { rootMargin: "240px 0px" },
    )

    observer.observe(loadMoreNode)
    return () => observer.disconnect()
  }, [hasMoreLeagues, isAmerican, totalPages])

  const handleGenderFilterChange = (value: string) => {
    setPage(1)
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
      <section className="flex items-center gap-3 rounded-display border border-white/10 bg-white/[0.035] px-4 py-3 sm:px-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-court-500/10 text-court-300">
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white sm:text-base">{emptyTitle}</h2>
          <p className="mt-0.5 text-sm text-brand-200">Las próximas fechas van a aparecer acá.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-display-lg border border-white/10 bg-brand-800/75">
      <div className="border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold text-court-300">Circuito FV</p>
            <h2 className="text-xl font-bold text-white sm:text-2xl">{sectionTitle}</h2>
          </div>
          <div className="flex items-center gap-3 sm:w-auto">
            <div className="min-w-0 flex-1 sm:w-48 sm:flex-none">
              <Select value={selectedGenderFilter} onValueChange={handleGenderFilterChange}>
                <SelectTrigger className="h-9 border-white/20 bg-brand-600 text-sm font-medium text-white">
                  <SelectValue placeholder="Genero" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los generos</SelectItem>
                  <SelectItem value="MALE">Caballeros</SelectItem>
                  <SelectItem value="FEMALE">Damas</SelectItem>
                  <SelectItem value="MIXED">Mixto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button asChild variant="ghost" className="h-9 shrink-0 rounded-full px-2 text-xs font-semibold text-brand-100 hover:bg-white/5 hover:text-white sm:text-sm">
              <Link href={tournamentsHref}>
                {viewAllLabel}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-2">
        {displayedTournaments.map((tournament) => {
          const priceLabel = formatPrice(tournament.price)
          const statusLabel = statusLabels[tournament.status] || tournament.status
          const tournamentType = tournament.type || "LONG"
          const registrationAvailable = canShowPublicRegistration({
            status: tournament.status,
            enablePublicInscriptions: tournament.enable_public_inscriptions,
            registrationLocked: tournament.registration_locked,
            bracketStatus: tournament.bracket_status,
            isFull: tournament.is_full,
            allowActivePhaseRegistration: true,
          })
          const canRegister = !tournament.is_inscribed && registrationAvailable
          const hideVenue = Boolean(tournament.hide_venue)
          const venueLabel = [tournament.club?.name, tournament.club?.address].filter(Boolean).join(" - ")
          const mapsUrl = buildGoogleMapsSearchUrl({
            name: tournament.club?.name,
            address: tournament.club?.address,
          })
          return (
            <article
              key={tournament.id}
              className="relative flex flex-col overflow-hidden rounded-display border border-court-500/20 bg-white/5 p-4 pt-5 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-court-500"
            >
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className="h-6 border-court-400/30 bg-court-500/10 px-2 text-[11px] font-semibold text-court-200 hover:bg-court-500/10">
                      {typeLabels[tournamentType] || tournamentType}
                    </Badge>
                    <Badge variant="outline" className="h-6 border-white/15 px-2 text-[11px] text-brand-200">
                      {statusLabel}
                    </Badge>
                    {tournament.is_full && !tournament.is_inscribed ? (
                      <Badge className="h-6 border-red-300/30 bg-red-950/40 px-2 text-[11px] font-semibold text-red-200">
                        Completo
                      </Badge>
                    ) : null}
                    {shouldShowFewSlotsAlert(tournament.show_few_slots_alert, tournament.has_few_slots) ? (
                      <Badge className="h-6 border-amber-300/30 bg-amber-950/40 px-2 text-[11px] font-semibold text-amber-200">
                        Pocos cupos
                      </Badge>
                    ) : null}
                  </div>

                  <div className="space-y-0.5">
                    <h3 className="text-base font-semibold leading-6 text-white sm:text-lg">{tournament.name}</h3>
                    <p className="text-xs font-semibold text-brand-200">
                      {tournament.category_name || "Categoria abierta"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <InfoBlock
                      icon={<CalendarDays className="h-4 w-4 text-court-300" />}
                      label={isAmerican ? "Fecha y hora" : "Inicio"}
                      value={isAmerican
                        ? `${formatDateLabel(tournament.start_date)} · ${formatTimeLabel(tournament.start_date)}`
                        : formatDateLabel(tournament.start_date)}
                    />
                    {!hideVenue && venueLabel ? (
                      <InfoBlock
                        icon={<MapPin className="h-4 w-4 text-court-300" />}
                        label="Sede"
                        value={venueLabel}
                        href={mapsUrl}
                        className="col-span-2"
                      />
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {tournament.show_public_inscriptions && typeof tournament.max_participants === "number" ? (
                      <Badge variant="outline" className="h-6 border-court-400/20 bg-court-500/5 px-2 text-[11px] text-court-100">
                        <Users className="mr-1 h-3.5 w-3.5" />
                        {tournament.current_inscriptions}/{tournament.max_participants} parejas
                      </Badge>
                    ) : null}
                    {priceLabel ? (
                      <Badge className="h-6 border-court-400/20 bg-court-500/5 px-2 text-[11px] text-court-100 hover:bg-court-500/5">
                        <Ticket className="mr-1 h-3.5 w-3.5 text-court-300" />
                        {priceLabel}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  {canRegister ? (
                    <PublicRegistrationLauncher
                      tournamentId={tournament.id}
                      tournamentName={tournament.name}
                      tournamentGender={(tournament.gender as Gender) || Gender.MALE}
                      tournamentPrice={tournament.price ?? null}
                      enableTransferProof={tournament.enable_transfer_proof || false}
                      transferAlias={tournament.transfer_alias || null}
                      transferAmount={tournament.transfer_amount || null}
                      buttonClassName="h-10 bg-court-500 px-3 text-xs font-semibold text-brand-900 hover:bg-court-400 sm:text-sm"
                      fullWidth
                    />
                  ) : (
                    <div className="flex h-10 items-center rounded-control border border-white/10 bg-white/5 px-3 text-xs text-brand-200">
                      <p className="line-clamp-2 font-semibold leading-4 text-white">
                        {tournament.is_inscribed
                          ? "Ya estas anotado."
                          : getPublicRegistrationClosedLabel({ isFull: tournament.is_full })}
                      </p>
                    </div>
                  )}

                  <Button asChild variant="outline" className="h-10 border-white/20 bg-transparent px-3 text-xs font-semibold text-white hover:bg-white/10 hover:text-white sm:text-sm">
                    <Link href={`/tournaments/${tournament.id}`}>
                      Ver detalles
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {!isAmerican ? (
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
          <p className="text-xs text-brand-200 sm:text-sm">
            Mostrando {displayedTournaments.length} de {tournaments.length} ligas
          </p>
          {hasMoreLeagues ? (
            <div ref={loadMoreRef} className="h-4 w-10" aria-hidden="true" />
          ) : (
            <span className="text-xs font-medium text-court-200">Todas cargadas</span>
          )}
        </div>
      ) : totalPages > 1 ? (
        <div className="flex flex-col gap-2 border-t border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-brand-200 sm:text-sm">
            Mostrando {displayedTournaments.length} de {tournaments.length} torneos
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </Button>
            <span className="text-sm font-medium text-brand-200">
              Pagina {page} de {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page === totalPages}
              className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              Siguiente
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function InfoBlock({
  icon,
  label,
  value,
  href,
  className,
}: {
  icon: ReactNode
  label: string
  value: string
  href?: string | null
  className?: string
}) {
  return (
    <div className={className}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-brand-200">{label}</p>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir ${value} en Google Maps`}
              className="mt-0.5 block text-sm font-semibold leading-5 text-white underline decoration-court-400/50 underline-offset-4 transition-colors hover:text-court-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-court-400"
            >
              {value}
            </a>
          ) : (
            <p className="mt-0.5 text-sm font-semibold leading-5 text-white">{value}</p>
          )}
        </div>
      </div>
    </div>
  )
}
