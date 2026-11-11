import Link from "next/link"
import { CheckCircle2, Clock3, Minus, Trophy } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type {
  PublicLongCouple,
  PublicLongMatch,
  PublicLongPlayer,
  PublicLongResultsData,
} from "@/lib/services/public-long-results.service"

interface PublicResultsMatrixProps {
  results: PublicLongResultsData
  tournamentId: string
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

const CoupleLabel = ({
  couple,
  tournamentId,
}: {
  couple: PublicLongCouple | undefined
  tournamentId: string
}) => {
  if (!couple) return <span className="text-muted-foreground">Pareja pendiente</span>

  const player1Name = getPlayerName(couple.player1, "Jugador 1")
  const player2Name = getPlayerName(couple.player2, "Jugador 2")

  return (
    <Link
      href={`/tournaments/${tournamentId}/resultados/${couple.id}`}
      aria-label={`${player1Name} / ${player2Name}`}
      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-1.5 gap-y-1 rounded-control text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring md:flex md:gap-2"
    >
      <div aria-hidden="true" className="contents md:flex md:shrink-0 md:-space-x-2">
        {[couple.player1, couple.player2].map((player, index) => (
          <Avatar
            key={index}
            className={`col-start-1 h-5 w-5 border border-slate-200 text-[9px] md:h-7 md:w-7 md:border-2 md:border-background md:text-xs ${index === 0 ? 'row-start-1' : 'row-start-2'}`}
          >
            <AvatarImage src={player?.profileImageUrl || undefined} alt="" className="object-cover" />
            <AvatarFallback className={index === 0 ? "bg-primary/10 text-primary" : "bg-slate-200 text-slate-700"}>
              {getInitials(player)}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span className="contents text-[11px] font-semibold leading-tight md:block md:min-w-0 md:truncate md:text-sm">
        <span className="col-start-2 row-start-1 break-words">{player1Name}</span>
        <span className="hidden md:inline"> / </span>
        <span className="col-start-2 row-start-2 break-words">{player2Name}</span>
      </span>
    </Link>
  )
}

const isFinished = (match: PublicLongMatch) =>
  match.status === "FINISHED" || match.status === "COMPLETED"

const getMatchBetweenCouples = (
  matches: PublicLongMatch[],
  zoneId: string,
  firstCoupleId: string,
  secondCoupleId: string,
) => matches.find(
  (match) =>
    match.zoneId === zoneId &&
    ((match.couple1Id === firstCoupleId && match.couple2Id === secondCoupleId) ||
      (match.couple1Id === secondCoupleId && match.couple2Id === firstCoupleId)),
)

const MatchCell = ({ match, viewingCoupleId }: { match?: PublicLongMatch; viewingCoupleId: string }) => {
  if (!match) {
    return <Minus className="mx-auto h-4 w-4 text-slate-300" aria-label="Sin partido" />
  }

  if (!isFinished(match)) {
    return <Clock3 className="mx-auto h-4 w-4 text-blue-500" aria-label="Partido pendiente" />
  }

  const viewingCoupleIsFirst = match.couple1Id === viewingCoupleId
  const setScores = match.sets.map((set) => viewingCoupleIsFirst
    ? `${set.couple1Games}-${set.couple2Games}`
    : `${set.couple2Games}-${set.couple1Games}`)
  const summary = viewingCoupleIsFirst
    ? `${match.resultCouple1 ?? "-"}-${match.resultCouple2 ?? "-"}`
    : `${match.resultCouple2 ?? "-"}-${match.resultCouple1 ?? "-"}`
  const isWinner = match.winnerId === viewingCoupleId

  return (
    <div
      className={`rounded-control px-1.5 py-1 text-center text-[10px] font-bold leading-tight sm:text-xs ${
        isWinner ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
      }`}
      title={setScores.length ? `Sets: ${summary}. Games: ${setScores.join(", ")}` : `Sets: ${summary}`}
    >
      <span className="flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3" />{summary}</span>
      {setScores.length > 0 && <span className="mt-0.5 block whitespace-nowrap text-[9px] font-medium opacity-80">{setScores.join(" · ")}</span>}
    </div>
  )
}

export default function PublicResultsMatrix({ results, tournamentId }: PublicResultsMatrixProps) {
  const zonesWithCouples = results.zones.filter((zone) => zone.standings.length > 0)

  if (zonesWithCouples.length === 0) {
    return (
      <div className="rounded-elevated border border-dashed border-slate-300 bg-card p-10 text-center text-sm text-muted-foreground">
        Todavía no hay parejas ubicadas en las zonas.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {zonesWithCouples.map((zone) => (
        <section key={zone.id} className="overflow-hidden rounded-elevated border border-slate-200 bg-card shadow-sm">
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-slate-900">{zone.name}</h2>
            </div>
            <span className="text-xs text-muted-foreground">{zone.standings.length} parejas</span>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm md:min-w-[680px]">
              <thead className="bg-slate-50/80">
                <tr className="border-b border-slate-200">
                  <th className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50 px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 md:min-w-60 md:px-3">
                    Pareja
                  </th>
                  {zone.standings.map((standing, index) => (
                    <th key={standing.coupleId} className="w-20 px-2 py-3 text-center text-xs font-semibold text-slate-600">
                      {standing.position ?? index + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zone.standings.map((standing, rowIndex) => {
                  const couple = results.couples[standing.coupleId]
                  return (
                    <tr key={standing.coupleId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <th scope="row" className="sticky left-0 z-10 border-r border-slate-200 bg-card px-2 py-2 font-normal md:p-3">
                        <div className="flex w-40 items-center gap-1.5 md:w-auto md:gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 md:h-6 md:w-6 md:text-xs">
                            {standing.position ?? rowIndex + 1}
                          </span>
                          <CoupleLabel couple={couple} tournamentId={tournamentId} />
                        </div>
                      </th>
                      {zone.standings.map((opponent) => (
                        <td key={opponent.coupleId} className="min-w-20 border-r border-slate-100 px-2 py-2 text-center last:border-r-0">
                          {standing.coupleId === opponent.coupleId ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <MatchCell
                              match={getMatchBetweenCouples(results.matches, zone.id, standing.coupleId, opponent.coupleId)}
                              viewingCoupleId={standing.coupleId}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
