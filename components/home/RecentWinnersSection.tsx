import Link from "next/link"
import Image from "next/image"
import { CalendarDays, ChevronRight, MapPin, Trophy } from "lucide-react"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { getPublicTournamentHref } from "@/lib/tournaments/public-tournament-url"
import type { TenantRecentWinner } from "@/lib/services/tenant-home.service"

interface RecentWinnersSectionProps {
  winners: TenantRecentWinner[]
}

const formatEndDate = (date: string) => new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
}).format(new Date(date))

const getInitials = (name: string) => name
  .split(" ")
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join("")
  .toUpperCase()

export function RecentWinnersSection({ winners }: RecentWinnersSectionProps) {
  return (
    <section className="border-b border-white/12 bg-[#182b52] py-12 sm:py-16">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex items-end gap-4 sm:mb-8">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-court-300">Ultimo mes</p>
              <h2 className="text-2xl font-black text-white sm:text-3xl">Ultimos ganadores</h2>
            </div>
          </div>

          {winners.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/20 bg-white/5 px-6 py-10 text-center text-slate-300">
              Aun no hay torneos finalizados con ganadores en los ultimos 30 dias.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {winners.map((winner) => {
                const showPlayerPhotos = Boolean(winner.player1.profileImageUrl && winner.player2.profileImageUrl)

                return (
                  <Link
                    key={winner.id}
                    href={getPublicTournamentHref(winner)}
                    aria-label={`Ver resultados de ${winner.tournamentName}`}
                    className="group flex overflow-hidden rounded-3xl border border-white/10 bg-[#13203d] shadow-[0_16px_36px_rgba(7,12,28,0.18)] transition hover:-translate-y-1 hover:border-court-300/70 hover:bg-[#1b2d53] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-court-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#182b52]"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="relative aspect-[16/8] overflow-hidden bg-[radial-gradient(circle_at_50%_0%,#2e4d87_0%,#182b52_48%,#101a31_100%)]">
                        {winner.winnerImageUrl ? (
                          <Image
                            src={winner.winnerImageUrl}
                            alt={`Campeones del torneo ${winner.tournamentName}`}
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            className="object-cover transition duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            {showPlayerPhotos ? (
                              <div className="flex -space-x-5" aria-label="Fotos de los campeones">
                                <Avatar className="h-20 w-20 border-4 border-[#182b52] shadow-lg">
                                  <AvatarImage src={winner.player1.profileImageUrl!} alt={`Foto de ${winner.player1.name}`} />
                                </Avatar>
                                <Avatar className="h-20 w-20 border-4 border-[#182b52] shadow-lg">
                                  <AvatarImage src={winner.player2.profileImageUrl!} alt={`Foto de ${winner.player2.name}`} />
                                </Avatar>
                              </div>
                            ) : (
                              <div className="flex items-center">
                                <span className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#182b52] bg-court-500 text-lg font-black text-brand-900 shadow-lg">
                                  {getInitials(winner.player1.name)}
                                </span>
                                <span className="-ml-4 flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#182b52] bg-white text-lg font-black text-brand-900 shadow-lg">
                                  {getInitials(winner.player2.name)}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#101a31]/80 to-transparent" />
                        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-court-500 px-3 py-1 text-xs font-black uppercase tracking-wide text-brand-900 shadow-sm">
                          <Trophy className="h-3.5 w-3.5" /> Campeones
                        </span>
                        <span className="absolute bottom-3 right-4 inline-flex items-center gap-1.5 text-xs font-bold text-white">
                          <CalendarDays className="h-3.5 w-3.5 text-court-300" /> {formatEndDate(winner.endDate)}
                        </span>
                      </div>

                      <div className="flex min-h-[196px] flex-1 flex-col p-5">
                        <h3 className="line-clamp-2 text-xl font-black leading-tight text-white group-hover:text-court-300">
                          {winner.tournamentName}
                        </h3>
                        <p className="mt-1 text-sm font-semibold text-court-300">{winner.category || "Categoria no informada"}</p>

                        <div className="mt-5 min-w-0 text-sm font-bold leading-5 text-white">
                          <p className="truncate">{winner.player1.name}</p>
                          <p className="truncate">{winner.player2.name}</p>
                        </div>

                        <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-sm">
                          <span className="flex min-w-0 items-center gap-1.5 truncate text-slate-300">
                            <MapPin className="h-4 w-4 shrink-0 text-court-300" />
                            {winner.clubName || "Club no informado"}
                          </span>
                          <span className="inline-flex shrink-0 items-center font-bold text-court-300">
                            Ver torneo <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
