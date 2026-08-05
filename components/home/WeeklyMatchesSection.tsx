import Link from "next/link"
import { CalendarDays, Clock, MapPin, Trophy } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type {
  TenantWeeklyMatch,
  TenantWeeklyMatchCouple,
  TenantWeeklyMatchesClubGroup,
  TenantWeeklyMatchPlayer,
} from "@/lib/services/tenant-home.service"
import { cn } from "@/lib/utils"

interface WeeklyMatchesSectionProps {
  groups: TenantWeeklyMatchesClubGroup[]
}

const dayFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
})

const formatDateLabel = (date: string) => {
  const parsedDate = new Date(`${date}T12:00:00-03:00`)
  const label = dayFormatter.format(parsedDate).replace(".", "")

  return label.charAt(0).toUpperCase() + label.slice(1)
}

const formatTime = (time: string | null) => {
  if (!time) return "A confirmar"

  return time.slice(0, 5)
}

const getPlayerName = (player: TenantWeeklyMatchPlayer) => {
  const name = `${player.firstName} ${player.lastName}`.trim()
  return name || "Jugador"
}

const getInitials = (name: string) => {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

  return initials || "J"
}

const getCoupleName = (couple: TenantWeeklyMatchCouple) => {
  if (couple.players.length === 0) {
    return couple.placeholderLabel || "Por definir"
  }

  return couple.players.map(getPlayerName).join(" / ")
}

function PlayerAvatarStack({ players }: { players: TenantWeeklyMatchPlayer[] }) {
  if (players.length === 0) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/8 text-[10px] font-black text-white/70">
        PD
      </div>
    )
  }

  return (
    <div className="flex min-w-[54px] -space-x-2">
      {players.slice(0, 2).map((player) => {
        const name = getPlayerName(player)

        return (
          <Avatar key={player.id || name} className="h-9 w-9 border-2 border-[#10213d] bg-[#182d51]">
            {player.imageUrl ? <AvatarImage src={player.imageUrl} alt={name} className="object-cover" /> : null}
            <AvatarFallback className="bg-court-500 text-[10px] font-black text-brand-900">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
        )
      })}
    </div>
  )
}

function CoupleCell({
  couple,
  align = "left",
}: {
  couple: TenantWeeklyMatchCouple
  align?: "left" | "right"
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3",
        align === "right" ? "justify-end text-right md:flex-row-reverse md:text-left" : "justify-start",
      )}
    >
      <PlayerAvatarStack players={couple.players} />
      <p className="min-w-0 truncate text-sm font-bold text-white">{getCoupleName(couple)}</p>
    </div>
  )
}

function MatchRow({ match }: { match: TenantWeeklyMatch }) {
  return (
    <Link
      href={`/tournaments/${match.tournamentId}`}
      className="grid gap-3 border-t border-white/10 px-4 py-3 transition hover:bg-white/6 md:grid-cols-[112px_minmax(0,1fr)_44px_minmax(0,1fr)_190px] md:items-center md:px-5"
    >
      <div className="flex items-center justify-between gap-3 md:block">
        <div className="inline-flex items-center gap-2 rounded-md bg-white/7 px-2.5 py-1 text-xs font-black uppercase text-court-300">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatDateLabel(match.scheduledDate)}
        </div>
        <div className="mt-0 flex items-center gap-1.5 text-sm font-black text-white md:mt-2">
          <Clock className="h-3.5 w-3.5 text-white/55" />
          {formatTime(match.scheduledStartTime)}
        </div>
      </div>

      <CoupleCell couple={match.couple1} />

      <div className="hidden text-center text-xs font-black uppercase text-white/45 md:block">vs</div>

      <CoupleCell couple={match.couple2} align="right" />

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {match.category ? (
          <span className="rounded-md border border-court-300/25 bg-court-300/10 px-2.5 py-1 text-xs font-black text-court-200">
            {match.category}
          </span>
        ) : null}
        <span className="rounded-md border border-white/10 bg-white/7 px-2.5 py-1 text-xs font-bold text-slate-200">
          {match.stage}
        </span>
      </div>
    </Link>
  )
}

export function WeeklyMatchesSection({ groups }: WeeklyMatchesSectionProps) {
  return (
    <section className="border-y border-white/12 bg-[linear-gradient(180deg,rgba(13,26,49,0.98)_0%,rgba(17,34,61,0.96)_100%)] py-12 sm:py-14">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-court-300">
              Fixture
            </p>
            <h2 className="text-2xl font-black text-white sm:text-3xl">Partidos de la semana</h2>
            <p className="mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
              Todos los partidos publicados de lunes a domingo, separados por club.
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-md border border-white/10 bg-white/7 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white/75">
            <Trophy className="h-4 w-4 text-court-300" />
            Padel FV
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/20 bg-white/5 px-6 py-10 text-center">
            <h3 className="text-lg font-black text-white">No hay partidos publicados esta semana</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
              Cuando haya partidos confirmados y fuera de borrador, van a aparecer aca.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <div
                key={group.clubId}
                className="overflow-hidden rounded-lg border border-white/10 bg-[#0e2440]/88 shadow-[0_20px_45px_rgba(2,8,23,0.22)]"
              >
                <div className="flex flex-col gap-2 border-b border-white/10 bg-white/6 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-black uppercase text-white">{group.clubName}</h3>
                    {group.clubAddress ? (
                      <p className="mt-1 flex items-center gap-1.5 truncate text-xs font-medium text-slate-300">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-court-300" />
                        <span className="truncate">{group.clubAddress}</span>
                      </p>
                    ) : null}
                  </div>
                  <span className="w-fit rounded-md bg-court-500 px-2.5 py-1 text-xs font-black text-brand-900">
                    {group.matches.length} {group.matches.length === 1 ? "partido" : "partidos"}
                  </span>
                </div>

                <div>
                  {group.matches.map((match) => (
                    <MatchRow key={match.id} match={match} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
