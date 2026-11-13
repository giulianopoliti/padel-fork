"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { getPublicTournamentHref } from "@/lib/tournaments/public-tournament-url"
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Trophy, Users } from "lucide-react"
import type { InscribedTournament, PlayerSubstituteTournament } from "@/app/api/panel/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buildGoogleMapsSearchUrl } from "@/lib/maps/google-maps"
import { formatFvDateLabel as formatDateLabel, formatTimeLabel } from "./panel-formatters"
import { PlayerSubstituteTournaments } from './player-substitute-fechas'
import { PlayerTournamentAgenda } from './player-tournament-agenda'

interface PlayerFvInscribedTournamentsSectionProps {
  tournaments: InscribedTournament[]
  substituteTournaments?: PlayerSubstituteTournament[]
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
  substituteTournaments = [],
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

  if (tournaments.length === 0 && substituteTournaments.length === 0) {
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

      <PlayerSubstituteTournaments tournaments={substituteTournaments.filter(item => !tournaments.some(entry => entry.tournament.id === item.id))} />

      {paginatedTournaments.length > 0 && <div className="space-y-3 p-4 sm:p-5">
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
          const substitute = substituteTournaments.find(item => item.id === tournament.id)

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

                  <PlayerTournamentAgenda agenda={inscription.agenda} />
                  {substitute && <div className="space-y-2">
                    <Badge variant="outline" className="border-white/25 text-white">Suplente</Badge>
                    {substitute.lineup && substitute.agenda.state !== 'MATCH_SCHEDULED' && <p className="text-sm text-white/80">{substitute.lineup}</p>}
                    <PlayerTournamentAgenda agenda={substitute.agenda} />
                  </div>}
                </div>

                <div className="flex w-full flex-col justify-end gap-2 lg:w-48">
                  <p className="text-center text-sm font-semibold text-court-100">{inscription.payment?.registrationLabel || 'Inscripción guardada'}</p>
                  <Button asChild variant="outline" className="h-11 border-white/25 bg-transparent text-sm font-semibold text-white hover:bg-white/10 hover:text-white">
                    <Link href={getPublicTournamentHref(tournament)}>
                      Ver detalles
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </article>
          )
        })}
      </div>}

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
