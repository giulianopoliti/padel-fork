import Link from "next/link"
import { CalendarDays, ChevronRight, MapPin, Users } from "lucide-react"
import type { InscribedTournament } from "@/app/api/panel/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDateLabel } from "./panel-formatters"

interface PlayerInscribedTournamentsSectionProps {
  tournaments: InscribedTournament[]
}

const statusLabels: Record<string, string> = {
  NOT_STARTED: "Proximo",
  ZONE_REGISTRATION: "Proximo",
  IN_PROGRESS: "En juego",
  ZONE_PHASE: "Fase de zonas",
  BRACKET_PHASE: "Llaves",
  FINISHED: "Finalizado",
}

export default function PlayerInscribedTournamentsSection({
  tournaments,
}: PlayerInscribedTournamentsSectionProps) {
  if (tournaments.length === 0) {
    return (
      <div className="tpe-shell rounded-[2rem] p-8 text-center text-white">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/8">
          <Users className="h-8 w-8 text-[var(--tpe-cyan)]" />
        </div>
        <h2 className="text-2xl font-black">Todavia no estas inscripto en torneos</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-white/72 sm:text-base">
          Cuando confirmes una inscripcion, la vas a tener a mano aca con sede, fecha y compañero.
        </p>
        <Button
          asChild
          className="mt-6 rounded-full bg-[var(--tpe-lime)] px-6 text-sm font-black uppercase tracking-[0.16em] text-[var(--tpe-night)] hover:bg-[#e6ff63]"
        >
          <Link href="/tournaments">Buscar torneos</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="tpe-shell overflow-hidden rounded-[2rem]">
      <div className="tpe-banner border-b-4 border-[var(--tpe-forest)] px-5 py-4 sm:px-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--tpe-forest)]">Tu agenda</p>
        <h2 className="text-2xl font-black uppercase tracking-[-0.03em] sm:text-3xl">Mis torneos inscriptos</h2>
      </div>

      <div className="p-4 sm:p-6">
        {tournaments.map((inscription) => {
          const tournament = inscription.tournament
          const partnerName = `${inscription.partner.first_name} ${inscription.partner.last_name}`.trim()
          const hideVenue = Boolean(tournament.hide_venue)
          const venueName = tournament.club?.name || tournament.club?.address || null

          return (
            <article
              key={tournament.id}
              className="grid gap-5 border-b px-1 py-5 text-white last:border-b-0 sm:px-2 lg:grid-cols-[minmax(0,180px)_minmax(0,1fr)_220px]"
              style={{ borderColor: "rgba(255,255,255,0.18)" }}
            >
              <div className="space-y-2">
                <p className="text-[1.75rem] font-black uppercase leading-none text-[var(--tpe-lime)] sm:text-[2.2rem]">
                  {tournament.category_name || "Categoria abierta"}
                </p>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/72">{tournament.name}</p>
                <Badge className="w-fit border-0 bg-[var(--tpe-night-soft)] px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[var(--tpe-paper)]">
                  {tournament.gender || "Abierto"}
                </Badge>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge className="tpe-chip rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]">
                    {statusLabels[tournament.status] || tournament.status}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm font-semibold uppercase tracking-[0.04em] text-white/88">
                  <p className="inline-flex items-center gap-2 text-[var(--tpe-paper)]">
                    <CalendarDays className="h-4 w-4 text-[var(--tpe-lime)]" />
                    {formatDateLabel(tournament.start_date)}
                  </p>
                  {!hideVenue && venueName ? (
                    <>
                      <p className="inline-flex items-center gap-2 text-[var(--tpe-cyan)]">
                        <MapPin className="h-4 w-4" />
                        {venueName}
                      </p>
                      {tournament.club?.address && tournament.club.address !== venueName ? (
                        <p className="pl-6 text-xs font-bold uppercase tracking-[0.16em] text-white/66">
                          {tournament.club.address}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                  <p className="inline-flex items-center gap-2 text-[var(--tpe-paper)]">
                    <Users className="h-4 w-4 text-[var(--tpe-lime)]" />
                    Pareja con {partnerName}
                  </p>
                </div>
              </div>

              <div className="flex items-end">
                <Button
                  asChild
                  variant="outline"
                  className="w-full rounded-full border-white/20 bg-white/5 text-sm font-bold uppercase tracking-[0.14em] text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href={`/tournaments/${tournament.id}`}>
                    Ver torneo
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
