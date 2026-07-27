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
import { shouldShowFewSlotsAlert } from "@/lib/tournaments/few-slots-visibility"
import { formatDateLabel, formatPrice, formatTimeLabel } from "./panel-formatters"

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
  AMERICAN: "Americano",
  LONG: "Torneo largo",
}

export default function PlayerFvUpcomingTournamentsSection({
  tournaments,
}: PlayerFvUpcomingTournamentsSectionProps) {
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
    const params = new URLSearchParams()

    if (selectedGenderFilter !== "all") {
      params.set("gender", selectedGenderFilter)
    }

    const queryString = params.toString()
    return queryString ? `/tournaments?${queryString}` : "/tournaments"
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
      <section className="rounded-[2rem] border border-dashed border-white/20 bg-white/5 px-6 py-10 text-center shadow-sm backdrop-blur-sm sm:px-8 sm:py-12">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-court-500/10 text-court-300">
          <CalendarDays className="h-8 w-8" />
        </div>
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-court-300">Proximos torneos</p>
        <h2 className="text-2xl font-black text-white sm:text-3xl">No hay fechas listas para anotarte</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
          En cuanto aparezcan nuevas competencias para tu categoria, vas a verlas aca primero.
        </p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-brand-800/75 shadow-[0_18px_45px_rgba(7,12,28,0.18)] backdrop-blur-sm">
      <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(198,222,6,0.12)_0%,rgba(18,29,57,0)_100%)] px-5 py-5 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-court-300">Inscripciones abiertas</p>
            <h2 className="text-2xl font-black text-white sm:text-3xl">Proximos torneos</h2>
          </div>
          <div className="flex flex-col gap-3 sm:w-auto sm:min-w-[240px] sm:items-end">
            <div className="w-full sm:w-56">
              <Select value={selectedGenderFilter} onValueChange={handleGenderFilterChange}>
                <SelectTrigger className="border-white/15 bg-white/8 text-sm font-medium text-white">
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
            <Button asChild variant="ghost" className="h-auto justify-start rounded-full px-0 text-sm font-semibold text-court-300 hover:bg-transparent hover:text-court-200">
              <Link href={tournamentsHref}>
                Ver todos
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-6">
        {paginatedTournaments.map((tournament) => {
          const priceLabel = formatPrice(tournament.price)
          const statusLabel = statusLabels[tournament.status] || tournament.status
          const tournamentType = tournament.type || "LONG"
          const canRegister = !tournament.is_inscribed && !tournament.is_full && tournament.status === "NOT_STARTED"
          const hideVenue = Boolean(tournament.hide_venue)
          const venueLabel = [tournament.club?.name, tournament.club?.address].filter(Boolean).join(" - ")
          const timeLabel = formatTimeLabel(tournament.start_date)
          const dateTimeLabel =
            timeLabel === "Horario a confirmar"
              ? formatDateLabel(tournament.start_date)
              : `${formatDateLabel(tournament.start_date)} - ${timeLabel}`

          return (
            <article
              key={tournament.id}
              className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/[0.07] sm:p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
                <div className="min-w-0 flex-1 space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-court-500 text-brand-900 hover:bg-court-500">
                      {typeLabels[tournamentType] || tournamentType}
                    </Badge>
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

                  <div className="space-y-1">
                    <h3 className="text-lg font-black tracking-tight text-white sm:text-xl">{tournament.name}</h3>
                    <p className="text-sm font-medium text-court-200">
                      {tournament.category_name || "Categoria abierta"}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    <InfoBlock
                      icon={<CalendarDays className="h-4 w-4 text-court-300" />}
                      label={tournamentType === "AMERICAN" ? "Fecha y hora" : "Inicio"}
                      value={dateTimeLabel}
                    />
                    {!hideVenue && venueLabel ? (
                      <InfoBlock
                        icon={<MapPin className="h-4 w-4 text-court-300" />}
                        label="Sede"
                        value={venueLabel}
                      />
                    ) : null}
                    <InfoBlock icon={<Trophy className="h-4 w-4 text-court-300" />} label="Estado" value={statusLabel} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {tournament.enable_public_inscriptions && typeof tournament.max_participants === "number" ? (
                      <Badge variant="outline" className="border-white/15 text-slate-200">
                        <Users className="mr-1 h-3.5 w-3.5" />
                        {tournament.current_inscriptions}/{tournament.max_participants} parejas
                      </Badge>
                    ) : null}
                    {priceLabel ? (
                      <Badge className="bg-court-500 text-brand-900 hover:bg-court-500">
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
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                      <p className="font-medium text-white">
                        {tournament.is_inscribed ? "Ya estas anotado." : "Ver detalles del torneo."}
                      </p>
                    </div>
                  )}

                  <Button asChild variant="outline" className="h-10 border-white/20 bg-white/5 text-sm font-semibold text-white hover:bg-white/10">
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
        <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-slate-300">
            Mostrando {paginatedTournaments.length} de {tournaments.length} torneos
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </Button>
            <span className="text-sm font-medium text-slate-300">
              Pagina {page} de {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page === totalPages}
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
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
    <div className="rounded-2xl bg-white/5 px-3 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court-200">{label}</p>
          <p className="mt-1 text-sm font-medium leading-5 text-white">{value}</p>
        </div>
      </div>
    </div>
  )
}
