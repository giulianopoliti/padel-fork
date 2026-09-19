"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Ticket, Trophy, Users } from "lucide-react"
import type { UpcomingTournament } from "@/app/api/panel/actions"
import PublicRegistrationLauncher from "@/components/tournament/public-registration-launcher"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Gender } from "@/types"
import { isTournamentGenderFilter } from "@/lib/tournaments/gender-filtering"
import { canShowPublicRegistration, getPublicRegistrationClosedLabel } from "@/lib/tournaments/registration-availability"
import { shouldShowFewSlotsAlert } from "@/lib/tournaments/few-slots-visibility"
import { formatFvDateLabel as formatDateLabel, formatPrice } from "./panel-formatters"

interface PlayerFvUpcomingTournamentsSectionProps {
  tournaments: UpcomingTournament[]
}

const ITEMS_PER_PAGE = 4

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
}

export default function PlayerFvUpcomingTournamentsSection({
  tournaments: allTournaments,
}: PlayerFvUpcomingTournamentsSectionProps) {
  const tournaments = useMemo(
    () => allTournaments.filter((tournament) => tournament.type === "LONG"),
    [allTournaments],
  )
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [page, setPage] = useState(1)
  const upcomingGenderParam = searchParams.get("upcomingGender")
  const selectedGenderFilter: "all" | Gender.MALE | Gender.FEMALE | Gender.MIXED = isTournamentGenderFilter(upcomingGenderParam)
    ? upcomingGenderParam
    : "all"
  const totalPages = Math.max(1, Math.ceil(tournaments.length / ITEMS_PER_PAGE))
  const paginatedTournaments = useMemo(() => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE
    return tournaments.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [page, tournaments])
  const tournamentsHref = (() => {
    const params = new URLSearchParams({ type: "LONG" })

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
      <section className="rounded-display-lg border border-dashed border-white/20 bg-brand-600 px-5 py-6 text-center sm:px-8">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-court-500/10 text-court-300">
          <CalendarDays className="h-8 w-8" />
        </div>
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-court-300">Ligas activas</p>
        <h2 className="text-2xl font-black text-white sm:text-3xl">No hay ligas activas publicadas</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-brand-200 sm:text-base">
          En cuanto aparezcan nuevas competencias del circuito, vas a verlas aca primero.
        </p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-display-lg border border-white/10 bg-brand-800/75">
      <div className="border-b border-white/10 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-medium text-brand-200">Circuito FV</p>
            <h2 className="text-xl font-bold text-white sm:text-2xl">Ligas activas</h2>
          </div>
          <div className="flex flex-col gap-3 sm:w-auto sm:min-w-[240px] sm:items-end">
            <div className="w-full sm:w-56">
              <Select value={selectedGenderFilter} onValueChange={handleGenderFilterChange}>
                <SelectTrigger className="h-11 border-white/20 bg-brand-600 text-sm font-medium text-white">
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
            <Button asChild variant="ghost" className="h-auto justify-start rounded-full px-0 text-sm font-bold text-brand-100 hover:bg-white/5 hover:text-white">
              <Link href={tournamentsHref}>
                Ver todas las ligas
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        {paginatedTournaments.map((tournament) => {
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
          return (
            <article
              key={tournament.id}
              className="rounded-display border border-white/10 bg-white/5 p-4 sm:p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
                <div className="min-w-0 flex-1 space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge className="border-white/15 bg-white/5 text-brand-200 hover:bg-white/5">
                      {typeLabels[tournamentType] || tournamentType}
                    </Badge>
                    {tournament.is_full && !tournament.is_inscribed ? (
                      <Badge className="border-red-300/30 bg-red-950/40 text-xs font-semibold text-red-200">
                        Completo
                      </Badge>
                    ) : null}
                    {shouldShowFewSlotsAlert(tournament.show_few_slots_alert, tournament.has_few_slots) ? (
                      <Badge className="border-amber-300/30 bg-amber-950/40 text-xs font-semibold text-amber-200">
                        Pocos cupos
                      </Badge>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold tracking-tight text-white sm:text-xl">{tournament.name}</h3>
                    <p className="text-sm font-semibold text-brand-200">
                      {tournament.category_name || "Categoria abierta"}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    <InfoBlock
                      icon={<CalendarDays className="h-4 w-4 text-white" />}
                      label="Inicio"
                      value={formatDateLabel(tournament.start_date)}
                    />
                    {!hideVenue && venueLabel ? (
                      <InfoBlock
                        icon={<MapPin className="h-4 w-4 text-white" />}
                        label="Sede"
                        value={venueLabel}
                      />
                    ) : null}
                    <InfoBlock icon={<Trophy className="h-4 w-4 text-white" />} label="Estado" value={statusLabel} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {tournament.show_public_inscriptions && typeof tournament.max_participants === "number" ? (
                      <Badge variant="outline" className="border-white/15 bg-transparent text-brand-200">
                        <Users className="mr-1 h-3.5 w-3.5" />
                        {tournament.current_inscriptions}/{tournament.max_participants} parejas
                      </Badge>
                    ) : null}
                    {priceLabel ? (
                      <Badge className="border-white/15 bg-white/5 text-brand-200 hover:bg-white/5">
                        <Ticket className="mr-1 h-3.5 w-3.5" />
                        {priceLabel}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <div className="flex w-full flex-col justify-end gap-2 lg:w-52">
                  {canRegister ? (
                    <PublicRegistrationLauncher
                      tournamentId={tournament.id}
                      tournamentName={tournament.name}
                      tournamentGender={(tournament.gender as Gender) || Gender.MALE}
                      tournamentPrice={tournament.price ?? null}
                      enableTransferProof={tournament.enable_transfer_proof || false}
                      transferAlias={tournament.transfer_alias || null}
                      transferAmount={tournament.transfer_amount || null}
                      buttonClassName="h-10 bg-court-500 text-sm font-semibold text-brand-900 hover:bg-court-400"
                      fullWidth
                    />
                  ) : (
                    <div className="rounded-elevated border border-white/10 bg-white/5 px-4 py-3 text-sm text-brand-200">
                      <p className="font-semibold text-white">
                        {tournament.is_inscribed
                          ? "Ya estas anotado."
                          : getPublicRegistrationClosedLabel({ isFull: tournament.is_full })}
                      </p>
                    </div>
                  )}

                  <Button asChild variant="outline" className="h-11 border-white/20 bg-transparent text-sm font-semibold text-white hover:bg-white/10 hover:text-white">
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

      {totalPages > 1 ? (
        <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-brand-200">
            Mostrando {paginatedTournaments.length} de {tournaments.length} torneos
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
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="border-t border-white/10 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <p className="text-xs font-medium text-brand-200">{label}</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-white">{value}</p>
        </div>
      </div>
    </div>
  )
}
