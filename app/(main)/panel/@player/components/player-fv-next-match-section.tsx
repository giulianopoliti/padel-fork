import type { ReactNode } from "react"
import Link from "next/link"
import { CalendarDays, ChevronRight, MapPin, Navigation, Swords, Users } from "lucide-react"
import type { PlayerNextMatch } from "@/app/api/panel/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buildGoogleMapsSearchUrl } from "@/lib/maps/google-maps"
import { formatMatchDateTime, formatRoundLabel } from "./panel-formatters"

interface PlayerFvNextMatchSectionProps {
  nextMatches: PlayerNextMatch[]
}

export default function PlayerFvNextMatchSection({ nextMatches }: PlayerFvNextMatchSectionProps) {
  const title = nextMatches.length > 1 ? "Mis proximos partidos" : "Mi proximo partido"

  if (nextMatches.length === 0) {
    return (
      <section className="flex items-start gap-3 rounded-display border border-white/15 bg-brand-600 px-4 py-4 sm:px-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-court-500/10 text-court-300">
          <Swords className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">Todavía no tenés un cruce programado</h2>
          <p className="mt-1 text-sm leading-5 text-brand-200">
            Cuando se confirme, vas a ver acá rival, compañero, horario y sede.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-display-lg border border-white/15 bg-brand-500 shadow-lg">
      <div className="border-b border-white/10  px-5 py-5 sm:px-8">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-court-300">Agenda inmediata</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-black text-white sm:text-3xl">{title}</h2>
          </div>
          {nextMatches.length > 1 ? (
            <Badge className="w-fit border-court-400/30 bg-court-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-court-200 hover:bg-court-500/15">
              {nextMatches.length} partidos pendientes
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        {nextMatches.map((match, index) => {
          const roundLabel = formatRoundLabel(match.round)
          const isPrimary = index === 0
          const venueLabel = [match.club_name, match.club_address, match.scheduled_info.court].filter(Boolean).join(" - ")
          const mapsUrl = match.club_maps_url || buildGoogleMapsSearchUrl({
            name: match.club_name,
            address: match.club_address,
          })

          return (
            <article
              key={match.match_id}
              className={[
                "overflow-hidden rounded-display border transition-colors",
                isPrimary
                  ? "border-court-500/40 bg-brand-600"
                  : "border-white/10 bg-white/5 hover:bg-white/[0.07]",
              ].join(" ")}
            >
              <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-stretch lg:justify-between">
                <div className="min-w-0 flex-1 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-court-500 text-brand-900 hover:bg-court-500">
                      {isPrimary ? "Sigue ahora" : "En cola"}
                    </Badge>
                    {roundLabel ? (
                      <Badge variant="outline" className="border-white/15 text-slate-200">
                        {roundLabel}
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="border-white/15 text-slate-200">
                      {match.status === "IN_PROGRESS" ? "En progreso" : "Pendiente"}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-lg font-black tracking-tight text-white sm:text-xl">{match.tournament_name}</h3>
                    {match.club_name ? <p className="text-sm font-medium text-court-200">{match.club_name}</p> : null}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <InfoBlock
                      icon={<Users className="h-4 w-4 text-court-300" />}
                      label="Companero"
                      value={match.partner_name}
                    />
                    <InfoBlock
                      icon={<Swords className="h-4 w-4 text-court-300" />}
                      label="Rivales"
                      value={match.opponent_names.join(" / ")}
                    />
                    <InfoBlock
                      icon={<CalendarDays className="h-4 w-4 text-court-300" />}
                      highlight
                      label="Fecha y hora"
                      value={formatMatchDateTime(match.scheduled_info.date, match.scheduled_info.time)}
                    />
                    {venueLabel ? (
                      <InfoBlock
                        icon={<MapPin className="h-4 w-4 text-court-300" />}
                        label="Sede"
                        value={venueLabel}
                      />
                    ) : null}
                  </div>
                </div>

                <div className="flex w-full flex-col justify-end gap-2 lg:w-48">
                  <Button asChild className="h-10 bg-court-500 text-sm font-semibold text-brand-900 hover:bg-court-400">
                    <Link href={`/tournaments/${match.tournament_id}`}>
                      Ver torneo
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                  {mapsUrl ? (
                    <Button
                      asChild
                      variant="outline"
                      className="h-10 border-white/20 bg-white/5 text-sm font-semibold text-white hover:bg-white/10 hover:text-white"
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
    </section>
  )
}

function InfoBlock({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: ReactNode
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className={highlight ? "rounded-display bg-court-500/10 px-3 py-3" : "border-t border-white/10 px-1 py-3"}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court-200">{label}</p>
          <p className={highlight ? "mt-1 text-base font-bold leading-6 text-white" : "mt-1 text-sm font-medium leading-5 text-white"}>{value}</p>
        </div>
      </div>
    </div>
  )
}
