"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Trophy, Users } from "lucide-react"
import type { InscribedTournament } from "@/app/api/panel/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDateLabel } from "./panel-formatters"

interface PlayerFvInscribedTournamentsSectionProps {
  tournaments: InscribedTournament[]
}

const ITEMS_PER_PAGE = 4

const statusLabels: Record<string, string> = {
  NOT_STARTED: "Proximo",
  ZONE_REGISTRATION: "Proximo",
  IN_PROGRESS: "En juego",
  ZONE_PHASE: "Fase de zonas",
  BRACKET_PHASE: "Llaves",
  FINISHED: "Finalizado",
}

export default function PlayerFvInscribedTournamentsSection({
  tournaments,
}: PlayerFvInscribedTournamentsSectionProps) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(tournaments.length / ITEMS_PER_PAGE))
  const paginatedTournaments = useMemo(() => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE
    return tournaments.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [page, tournaments])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  if (tournaments.length === 0) {
    return (
      <section className="rounded-[2rem] border border-dashed border-white/20 bg-white/5 px-6 py-10 text-center shadow-sm backdrop-blur-sm sm:px-8 sm:py-12">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-court-500/10 text-court-300">
          <Trophy className="h-8 w-8" />
        </div>
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-court-300">Mis torneos inscriptos</p>
        <h2 className="text-2xl font-black text-white sm:text-3xl">Todavia no tenes inscripciones confirmadas</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
          Cuando te anotes en un torneo, aca vas a ver rapido la fecha, la sede y con quien jugas.
        </p>
        <Button asChild className="mt-6 h-11 rounded-full bg-court-500 px-6 text-base font-semibold text-brand-900 hover:bg-court-400">
          <Link href="/torneos">Buscar torneos</Link>
        </Button>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-brand-800/75 shadow-[0_18px_45px_rgba(7,12,28,0.18)] backdrop-blur-sm">
      <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06)_0%,rgba(18,29,57,0)_100%)] px-5 py-5 sm:px-8">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-court-300">Tu calendario activo</p>
        <h2 className="text-2xl font-black text-white sm:text-3xl">Mis torneos inscriptos</h2>
      </div>

      <div className="space-y-3 p-4 sm:p-6">
        {paginatedTournaments.map((inscription) => {
          const tournament = inscription.tournament
          const partnerName = `${inscription.partner.first_name} ${inscription.partner.last_name}`.trim()
          const tournamentType = tournament.type || null
          const hideVenue = Boolean(tournament.hide_venue)
          const venueLabel = [tournament.club?.name, tournament.club?.address].filter(Boolean).join(" - ")

          return (
            <article
              key={tournament.id}
              className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/[0.07] sm:p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
                <div className="min-w-0 flex-1 space-y-4">
                  {tournamentType ? (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-court-500 text-brand-900 hover:bg-court-500">
                        {tournamentType === "AMERICAN" ? "Americano" : tournamentType === "LONG" ? "Torneo largo" : tournamentType}
                      </Badge>
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <h3 className="text-lg font-black tracking-tight text-white sm:text-xl">{tournament.name}</h3>
                    <p className="text-sm font-medium text-court-200">
                      {tournament.category_name || "Categoria abierta"}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <InfoBlock
                      icon={<CalendarDays className="h-4 w-4 text-court-300" />}
                      label="Fecha"
                      value={formatDateLabel(tournament.start_date)}
                    />
                    <InfoBlock
                      icon={<Users className="h-4 w-4 text-court-300" />}
                      label="Pareja"
                      value={partnerName}
                    />
                    {!hideVenue && venueLabel ? (
                      <InfoBlock
                        icon={<MapPin className="h-4 w-4 text-court-300" />}
                        label="Sede"
                        value={venueLabel}
                      />
                    ) : null}
                    <InfoBlock
                      icon={<Trophy className="h-4 w-4 text-court-300" />}
                      label="Estado"
                      value={statusLabels[tournament.status] || tournament.status}
                    />
                  </div>
                </div>

                <div className="flex w-full flex-col justify-end gap-2 lg:w-48">
                  <Button asChild variant="outline" className="h-10 border-white/20 bg-white/5 text-sm font-semibold text-white hover:bg-white/10">
                    <Link href={`/tournaments/${tournament.id}`}>
                      Ver torneo
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
            Mostrando {paginatedTournaments.length} de {tournaments.length} inscripciones
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
