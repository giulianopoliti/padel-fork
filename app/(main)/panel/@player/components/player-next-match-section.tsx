import Link from "next/link"
import { CalendarDays, ChevronRight, MapPin, Navigation, Swords, Users } from "lucide-react"
import { buildGoogleMapsSearchUrl } from "@/lib/maps/google-maps"
import type { PlayerNextMatch } from "@/app/api/panel/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatMatchDateTime, formatRoundLabel } from "./panel-formatters"

interface PlayerNextMatchSectionProps {
  nextMatches: PlayerNextMatch[]
}

export default function PlayerNextMatchSection({ nextMatches }: PlayerNextMatchSectionProps) {
  const title = nextMatches.length > 1 ? "Mis proximos partidos" : "Mi proximo partido"

  if (nextMatches.length === 0) {
    return (
      <div className="tpe-shell rounded-[2rem] p-8 text-center text-white">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/8">
          <Swords className="h-8 w-8 text-[var(--tpe-lime)]" />
        </div>
        <h2 className="text-2xl font-black">{title}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-white/72 sm:text-base">
          Cuando se programe tu siguiente cruce lo vas a ver aca con rival, sede y horario.
        </p>
      </div>
    )
  }

  return (
    <div className="tpe-shell overflow-hidden rounded-[2rem]">
      <div className="tpe-banner border-b-4 border-[var(--tpe-forest)] px-5 py-4 sm:px-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--tpe-forest)]">En juego</p>
        <h2 className="text-2xl font-black uppercase tracking-[-0.03em] sm:text-3xl">{title}</h2>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        {nextMatches.map((match, index) => {
          const roundLabel = match.fecha_name || formatRoundLabel(match.round)
          const isFirst = index === 0
          const mapsUrl = match.club_maps_url || buildGoogleMapsSearchUrl({
            name: match.club_name,
            address: match.club_address,
          })

          return (
            <article
              key={match.match_id}
              className={[
                "rounded-[1.5rem] border p-5 text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)]",
                isFirst
                  ? "border-[rgba(199,220,119,0.35)] bg-[rgba(199,220,119,0.08)]"
                  : "border-white/15 bg-white/6",
              ].join(" ")}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full border-0 bg-[var(--tpe-lime)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--tpe-night)]">
                        {isFirst ? "Sigue ahora" : "Despues"}
                      </Badge>
                      {roundLabel ? (
                        <Badge className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white">
                          {roundLabel}
                        </Badge>
                      ) : null}
                      <Badge className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white">
                        {match.status === "IN_PROGRESS" ? "En progreso" : "Pendiente"}
                      </Badge>
                      {match.is_substitute && <Badge variant="outline" className="border-white/15 text-white">Suplente</Badge>}
                    </div>
                    <h3 className="text-2xl font-black uppercase tracking-[-0.03em] text-[var(--tpe-paper)]">
                      {match.tournament_name}
                    </h3>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <p className="inline-flex items-start gap-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--tpe-paper)]">
                      <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--tpe-lime)]" />
                      <span>Pareja con {match.partner_name}</span>
                    </p>
                    <p className="inline-flex items-start gap-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--tpe-cyan)]">
                      <Swords className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>Vs. {match.opponent_names.join(" / ")}</span>
                    </p>
                    <p className="inline-flex items-start gap-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--tpe-paper)]">
                      <CalendarDays className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--tpe-lime)]" />
                      <span>{formatMatchDateTime(match.scheduled_info.date, match.scheduled_info.time)}</span>
                    </p>
                    {match.scheduled_info.court ? (
                      <p className="inline-flex items-start gap-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--tpe-paper)]">
                        <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--tpe-lime)]" />
                        <span>Cancha: {match.scheduled_info.court}</span>
                      </p>
                    ) : null}
                    {match.club_name ? (
                      <p className="inline-flex items-start gap-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--tpe-paper)]">
                        <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--tpe-lime)]" />
                        <span>Club: {match.club_name}</span>
                      </p>
                    ) : null}
                  </div>

                  {match.club_address ? (
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/68">
                      Direccion: {match.club_address}
                    </p>
                  ) : null}
                </div>

                <div className="flex w-full flex-col gap-3 lg:max-w-[220px]">
                  {match.availability_href && <Button asChild variant="outline" className="border-white/20 bg-white/8 text-white">
                    <Link href={match.availability_href}>Votar horarios</Link>
                  </Button>}
                  <Button
                    asChild
                    className="w-full rounded-full bg-[var(--tpe-lime)] text-sm font-black uppercase tracking-[0.16em] text-[var(--tpe-night)] hover:bg-[#e6ff63]"
                  >
                    <Link href={`/tournaments/${match.tournament_id}`}>
                      Ver torneo
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  {mapsUrl ? (
                    <Button
                      asChild
                      variant="outline"
                      className="w-full rounded-full border-white/20 bg-white/8 text-sm font-black uppercase tracking-[0.16em] text-white hover:bg-white/14 hover:text-white"
                    >
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                        <Navigation className="mr-2 h-4 w-4" />
                        Como llegar
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
