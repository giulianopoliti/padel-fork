import Link from "next/link"
import { ArrowLeft, CalendarDays, MapPin, Trophy } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type {
  PublicLongCouple,
  PublicLongMatch,
  PublicLongPlayer,
} from "@/lib/services/public-long-results.service"

interface PublicCoupleResultsProps {
  tournamentId: string
  tournamentName: string
  couple: PublicLongCouple
  couples: Record<string, PublicLongCouple>
  matches: PublicLongMatch[]
}

const getPlayerName = (player: PublicLongPlayer | null, fallback: string) => {
  if (!player) return fallback
  return `${player.firstName || ""} ${player.lastName || ""}`.trim() || fallback
}

const getInitials = (player: PublicLongPlayer | null) => {
  const firstInitial = player?.firstName?.charAt(0)?.toUpperCase() || ""
  const lastInitial = player?.lastName?.charAt(0)?.toUpperCase() || ""
  return firstInitial + lastInitial || "?"
}

const CoupleProfile = ({ player, index }: { player: PublicLongPlayer | null; index: number }) => {
  const name = getPlayerName(player, `Jugador ${index + 1}`)

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-card p-3 sm:p-4">
      <Avatar className="h-14 w-14 shrink-0 border-2 border-slate-100 sm:h-16 sm:w-16">
        <AvatarImage src={player?.profileImageUrl || undefined} alt={name} className="object-cover" />
        <AvatarFallback className={index === 0 ? "bg-primary/10 text-primary" : "bg-slate-200 text-slate-700"}>
          {getInitials(player)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Jugador {index + 1}</p>
        <p className="truncate font-semibold text-slate-900">{name}</p>
      </div>
    </div>
  )
}

const isFinished = (match: PublicLongMatch) =>
  match.status === "FINISHED" || match.status === "COMPLETED"

const getStatusLabel = (match: PublicLongMatch) => {
  if (isFinished(match)) return "Finalizado"
  if (match.status === "SCHEDULED") return "Programado"
  if (match.status === "IN_PROGRESS") return "En curso"
  if (match.status === "CANCELED") return "Cancelado"
  return "Pendiente"
}

const getRoundLabel = (round: string | null) => {
  if (!round || round === "ZONE") return "Fase de zonas"

  return round.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase())
}

const formatSchedule = (scheduledAt: string | null) => {
  if (!scheduledAt) return null

  const date = new Date(scheduledAt)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

const MatchCard = ({
  match,
  coupleId,
  couples,
}: {
  match: PublicLongMatch
  coupleId: string
  couples: Record<string, PublicLongCouple>
}) => {
  const coupleIsFirst = match.couple1Id === coupleId
  const opponentId = coupleIsFirst ? match.couple2Id : match.couple1Id
  const hasOpponent = Boolean(opponentId)
  const opponent = opponentId ? couples[opponentId] : null
  const opponentName = opponent
    ? `${getPlayerName(opponent.player1, "Jugador 1")} / ${getPlayerName(opponent.player2, "Jugador 2")}`
    : null
  const summary = coupleIsFirst
    ? `${match.resultCouple1 ?? "-"}-${match.resultCouple2 ?? "-"}`
    : `${match.resultCouple2 ?? "-"}-${match.resultCouple1 ?? "-"}`
  const setScores = match.sets.map((set) => coupleIsFirst
    ? `${set.couple1Games}-${set.couple2Games}`
    : `${set.couple2Games}-${set.couple1Games}`)
  const isWinner = match.winnerId === coupleId
  const schedule = formatSchedule(match.scheduledAt)

  return (
    <article className="rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{getRoundLabel(match.round)}</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {hasOpponent ? opponentName || "Partido confirmado" : "Rival por definir"}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
          isFinished(match)
            ? isWinner ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            : "bg-blue-50 text-blue-700"
        }`}>
          {isFinished(match) && isWinner ? "Victoria" : getStatusLabel(match)}
        </span>
      </div>

      {isFinished(match) ? (
        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sets</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{summary}</p>
          {setScores.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {setScores.map((score, index) => (
                <span key={`${match.id}-${index}`} className="rounded-md border border-slate-200 bg-card px-2 py-1 text-xs font-semibold text-slate-700">
                  S{index + 1} {score}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No hay detalle de games cargado para este partido.</p>
          )}
        </div>
      ) : null}

      {(schedule || match.court) ? (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {schedule ? <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{schedule}</span> : null}
          {match.court ? <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Cancha {match.court}</span> : null}
        </div>
      ) : null}
    </article>
  )
}

export default function PublicCoupleResults({
  tournamentId,
  tournamentName,
  couple,
  couples,
  matches,
}: PublicCoupleResultsProps) {
  const zoneMatches = matches.filter((match) => match.type === "ZONE" || match.round === "ZONE")
  const bracketMatches = matches.filter((match) => !zoneMatches.includes(match))

  const renderSection = (title: string, sectionMatches: PublicLongMatch[]) => (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Trophy className="h-4 w-4 text-primary" />{title}</h2>
      {sectionMatches.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {sectionMatches.map((match) => <MatchCard key={match.id} match={match} coupleId={couple.id} couples={couples} />)}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 bg-card p-5 text-sm text-muted-foreground">
          No hay partidos para mostrar en esta fase.
        </p>
      )}
    </section>
  )

  return (
    <div className="min-h-full bg-background/70">
      <header className="border-b border-border/70 bg-card/90 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Link href={`/tournaments/${tournamentId}/resultados`} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />Volver a resultados
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">Resultados de la pareja</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tournamentName}</p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
        <section className="grid gap-3 sm:grid-cols-2">
          <CoupleProfile player={couple.player1} index={0} />
          <CoupleProfile player={couple.player2} index={1} />
        </section>
        {renderSection("Fase de zonas", zoneMatches)}
        {renderSection("Llaves", bracketMatches)}
      </main>
    </div>
  )
}
