import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { createClient } from "@/utils/supabase/server"
import { getTenantBranding } from "@/config/tenant"
import {
  getPlayerDashboardData,
  getPlayerInscribedTournaments,
  getPlayerUpcomingTournaments,
  type InscribedTournament,
  type PlayerNextMatch,
  type UpcomingTournament,
} from "@/app/api/panel/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import PlayerInscribedTournamentsSection from "./components/player-inscribed-tournaments-section"
import PlayerNextMatchSection from "./components/player-next-match-section"
import PlayerUpcomingTournamentsSection from "./components/player-upcoming-tournaments-section"
import PlayerFvInscribedTournamentsSection from "./components/player-fv-inscribed-tournaments-section"
import PlayerFvNextMatchSection from "./components/player-fv-next-match-section"
import PlayerFvUpcomingTournamentsSection from "./components/player-fv-upcoming-tournaments-section"
import LegacyPlayerDashboard from "@/app/(main)/panel-cpa/@player/page"
import { isTournamentGenderFilter } from "@/lib/tournaments/gender-filtering"
import SponsorMarquee from "@/components/sponsor-marquee"

export const dynamic = "force-dynamic"

interface PlayerPanelProps {
  firstName: string
  categoryName?: string | null
  nextMatches: PlayerNextMatch[]
  inscribedTournaments: InscribedTournament[]
  upcomingTournaments: UpcomingTournament[]
}

interface PlayerDashboardPageProps {
  searchParams: Promise<{
    upcomingGender?: string
  }>
}

export default async function PlayerDashboard({ searchParams }: PlayerDashboardPageProps) {
  const branding = getTenantBranding()
  const supabase = await createClient()
  const params = await searchParams
  const upcomingGenderFilter = isTournamentGenderFilter(params.upcomingGender)
    ? params.upcomingGender
    : undefined

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <div>No autorizado</div>
  }

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()

  if (userData?.role !== "PLAYER") {
    return null
  }

  const { playerData, nextMatches } = await getPlayerDashboardData(user.id)

  const { inscribedTournaments } = playerData?.id
    ? await getPlayerInscribedTournaments(playerData.id)
    : { inscribedTournaments: [] }

  const { upcomingTournaments } = playerData?.id
    ? await getPlayerUpcomingTournaments(playerData.id, {
        genderFilter: upcomingGenderFilter,
        playerGender: playerData.gender ?? null,
      })
    : { upcomingTournaments: [] }

  const playerPanelProps: PlayerPanelProps = {
    firstName: playerData?.first_name || "Jugador",
    categoryName: playerData?.category_name,
    nextMatches: nextMatches || [],
    inscribedTournaments,
    upcomingTournaments,
  }

  if (branding.features.playerPanelVariant === "padel-elite") {
    return <PadelElitePlayerPanel {...playerPanelProps} />
  }

  if (branding.features.playerPanelVariant === "padel-fv") {
    return <PadelFvPlayerPanel {...playerPanelProps} />
  }

  return <LegacyPlayerDashboard searchParams={searchParams} />
}

function PadelElitePlayerPanel({
  firstName,
  categoryName,
  nextMatches,
  inscribedTournaments,
  upcomingTournaments,
}: PlayerPanelProps) {
  return (
    <div className="tpe-page min-h-screen">
      <section className="container mx-auto px-4 pb-14 pt-6 sm:px-6 lg:pt-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="tpe-kicker mb-4">Panel jugador</p>
                <h1 className="text-4xl font-black tracking-[-0.04em] text-[var(--tpe-night)] sm:text-5xl">
                  Inscribite rapido y segui tu agenda
                </h1>
                <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-slate-700 sm:text-lg">
                  Hola {firstName}. Priorizamos tus proximos torneos para que puedas anotarte en pocos toques y ver
                  enseguida lo que ya tenes confirmado.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {categoryName ? (
                  <Badge className="rounded-full border-0 bg-[var(--tpe-night)] px-4 py-2 text-sm font-black uppercase tracking-[0.16em] text-[var(--tpe-paper)]">
                    Categoria {categoryName}
                  </Badge>
                ) : null}
                <Button
                  asChild
                  size="lg"
                  className="rounded-full bg-[var(--tpe-night)] px-8 py-6 text-sm font-black uppercase tracking-[0.16em] text-[var(--tpe-paper)] hover:bg-[var(--tpe-night-soft)]"
                >
                  <Link href="/tournaments">
                    Ver torneos
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <PlayerUpcomingTournamentsSection tournaments={upcomingTournaments} />
            <PlayerInscribedTournamentsSection tournaments={inscribedTournaments} />
            <PlayerNextMatchSection nextMatches={nextMatches} />
          </div>
        </div>
      </section>
    </div>
  )
}

function PadelFvPlayerPanel({
  firstName,
  categoryName,
  nextMatches,
  inscribedTournaments,
  upcomingTournaments,
}: PlayerPanelProps) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#162545_0%,#192b50_42%,#152340_100%)] text-white">
      <section className="container mx-auto px-4 py-6 sm:px-6 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 overflow-hidden rounded-[2rem] border border-white/12 bg-[linear-gradient(135deg,rgba(32,51,93,0.98)_0%,rgba(23,36,71,0.98)_100%)] shadow-[0_24px_70px_rgba(7,12,28,0.22)]">
            <div className="flex flex-col gap-5 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-court-300">
                  Panel jugador
                </p>
                <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                  Mi agenda competitiva
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
                  Hola {firstName}. Aca tenes primero lo urgente: tu proximo partido, los torneos en los que ya estas
                  anotado y las proximas fechas para inscribirte.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {categoryName ? (
                  <Badge className="border-court-400/30 bg-court-500/15 px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-court-200 hover:bg-court-500/15">
                    Categoria {categoryName}
                  </Badge>
                ) : null}
                <Button
                  asChild
                  className="h-11 rounded-full bg-court-500 px-6 text-base font-semibold text-brand-900 hover:bg-court-400"
                >
                  <Link href="/tournaments">
                    Ver torneos
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <SponsorMarquee className="mb-6 rounded-[1.5rem] border-white/10 bg-white/[0.035]" />

          <div className="space-y-6">
            <PlayerFvNextMatchSection nextMatches={nextMatches} />
            <PlayerFvInscribedTournamentsSection tournaments={inscribedTournaments} />
            <PlayerFvUpcomingTournamentsSection tournaments={upcomingTournaments} />
          </div>
        </div>
      </section>
    </div>
  )
}
