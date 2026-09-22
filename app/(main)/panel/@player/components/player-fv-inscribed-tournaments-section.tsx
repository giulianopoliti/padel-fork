"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Swords, Trophy, Users } from "lucide-react"
import type { InscribedTournament } from "@/app/api/panel/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buildGoogleMapsSearchUrl } from "@/lib/maps/google-maps"
import { formatFvDateLabel as formatDateLabel, formatMatchDateTime, formatRoundLabel, formatTimeLabel } from "./panel-formatters"

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
      <section className="flex items-center gap-3 rounded-display border border-white/10 bg-white/[0.035] px-4 py-3 sm:px-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-court-500/10 text-court-300">
          <Trophy className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white sm:text-base">Todavía no tenés torneos inscriptos</h2>
          <p className="mt-0.5 text-sm text-brand-200">Tus próximas inscripciones van a aparecer acá.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-display-lg border border-white/10 bg-brand-800/75">
      <div className="border-b border-white/10 px-5 py-4 sm:px-6">
        <h2 className="text-xl font-bold text-white sm:text-2xl">Mis torneos inscriptos</h2>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        {paginatedTournaments.map((inscription) => {
          const tournament = inscription.tournament
          const partnerName = `${inscription.partner.first_name} ${inscription.partner.last_name}`.trim()
          const tournamentType = tournament.type || null
          const hideVenue = Boolean(tournament.hide_venue)
          const venueLabel = [tournament.club?.name, tournament.club?.address].filter(Boolean).join(" - ")
          const mapsUrl = buildGoogleMapsSearchUrl({
            name: tournament.club?.name,
            address: tournament.club?.address,
          })
          const agenda = inscription.agenda
          const scheduledMatch = agenda?.scheduled_matches[0]
          const availability = agenda?.availability

          return (
            <article
              key={tournament.id}
              className="rounded-display border border-white/10 bg-white/5 p-4 sm:p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
                <div className="min-w-0 flex-1 space-y-4">
                  {tournamentType ? (
                    <div className="flex items-center gap-2">
                      <Badge className="border-white/15 bg-white/5 text-brand-100 hover:bg-white/5">
                        {tournamentType === "AMERICAN" ? "Americano" : tournamentType === "LONG" ? "Torneo largo" : tournamentType}
                      </Badge>
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold tracking-tight text-white sm:text-xl">{tournament.name}</h3>
                    <p className="text-sm font-semibold text-brand-200">
                      {tournament.category_name || "Categoria abierta"}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <InfoBlock
                      icon={<CalendarDays className="h-4 w-4 text-white" />}
                      label={tournamentType === "AMERICAN" ? "Fecha y hora" : "Fecha"}
                      value={tournamentType === "AMERICAN"
                        ? `${formatDateLabel(tournament.start_date)} · ${formatTimeLabel(tournament.start_date)}`
                        : formatDateLabel(tournament.start_date)}
                    />
                    <InfoBlock
                      icon={<Users className="h-4 w-4 text-white" />}
                      label="Pareja"
                      value={partnerName}
                    />
                    {!hideVenue && venueLabel ? (
                      <InfoBlock
                        icon={<MapPin className="h-4 w-4 text-white" />}
                        label="Sede"
                        value={venueLabel}
                        href={mapsUrl}
                      />
                    ) : null}
                    <InfoBlock
                      icon={<Trophy className="h-4 w-4 text-white" />}
                      label="Estado"
                      value={statusLabels[tournament.status] || tournament.status}
                    />
                  </div>

                  {agenda?.state === "MATCH_SCHEDULED" && scheduledMatch ? (
                    <div className="rounded-display border border-white/10 bg-brand-700 p-4 text-white sm:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className="border-0 bg-court-500 text-brand-900 hover:bg-court-500">
                              Partido programado
                            </Badge>
                            {scheduledMatch.round ? (
                              <Badge variant="outline" className="border-white/20 text-white">
                                {formatRoundLabel(scheduledMatch.round)}
                              </Badge>
                            ) : null}
                            {agenda.scheduled_matches.length > 1 ? (
                              <Badge variant="outline" className="border-white/20 text-white">
                                +{agenda.scheduled_matches.length - 1} programado{agenda.scheduled_matches.length > 2 ? "s" : ""}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                            <AgendaLine
                              icon={<Swords className="h-4 w-4 text-court-300" />}
                              label="Rivales"
                              value={scheduledMatch.opponent_names.join(" / ")}
                            />
                            <AgendaLine
                              icon={<Clock3 className="h-4 w-4 text-court-300" />}
                              label="Fecha y hora"
                              value={formatMatchDateTime(
                                scheduledMatch.scheduled_info.date,
                                scheduledMatch.scheduled_info.time,
                              )}
                            />
                            {scheduledMatch.scheduled_info.court ? (
                              <AgendaLine
                                icon={<MapPin className="h-4 w-4 text-court-300" />}
                                label="Cancha"
                                value={scheduledMatch.scheduled_info.court}
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {agenda?.state === "AVAILABILITY_REQUIRED" && availability ? (
                    <div className="rounded-display border border-brand-300/25 bg-brand-500/40 p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 rounded-elevated bg-brand-200/10 p-2.5 text-brand-100">
                          <CalendarDays className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white">Disponibilidad horaria</p>
                          <p className="mt-1 text-sm leading-5 text-brand-100">
                            {availability.fecha_name}
                            {availability.start_date ? ` · ${formatDateLabel(availability.start_date)}` : ""}
                            {availability.end_date && availability.end_date !== availability.start_date
                              ? ` al ${formatDateLabel(availability.end_date)}`
                              : ""}
                          </p>
                          <p className="mt-2 text-sm leading-5 text-brand-200">
                            Indicá en qué horarios puede jugar tu pareja para esta fecha.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex w-full flex-col justify-end gap-2 lg:w-48">
                  {agenda?.state === "AVAILABILITY_REQUIRED" && availability ? (
                    <Button asChild className="h-11 bg-brand-100 text-sm font-semibold text-brand-900 hover:bg-brand-200">
                      <Link href={availability.href}>
                        Cargar horarios
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" className="h-11 border-white/25 bg-transparent text-sm font-semibold text-white hover:bg-white/10 hover:text-white">
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
          <p className="text-sm text-brand-200">
            Mostrando {paginatedTournaments.length} de {tournaments.length} inscripciones
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

function AgendaLine({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-brand-200">{label}</p>
        <p className="mt-0.5 text-sm font-semibold leading-5 text-white">{value}</p>
      </div>
    </div>
  )
}

function InfoBlock({
  icon,
  label,
  value,
  href,
}: {
  icon: ReactNode
  label: string
  value: string
  href?: string | null
}) {
  return (
    <div className="border-t border-white/10 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <p className="text-xs font-medium text-brand-200">{label}</p>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir ${value} en Google Maps`}
              className="mt-1 block text-sm font-semibold leading-5 text-white underline decoration-court-400/50 underline-offset-4 transition-colors hover:text-court-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-court-400"
            >
              {value}
            </a>
          ) : (
            <p className="mt-1 text-sm font-semibold leading-5 text-white">{value}</p>
          )}
        </div>
      </div>
    </div>
  )
}
