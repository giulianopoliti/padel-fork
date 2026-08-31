import Image from "next/image"
import Link from "next/link"
import { ChevronRight, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import BrandLogo from "@/components/ui/brand-logo"
import { getTenantBranding } from "@/config/tenant"
import { getTenantHomeData, type TenantRankingPlayer } from "@/lib/services/tenant-home.service"
import { HomeTournamentTabs } from "@/components/tournaments/home-tournament-tabs"
import PublicTournamentList from "@/components/public/public-tournament-list"
import { RecentWinnersSection } from "@/components/home/RecentWinnersSection"
import type { PublicTournamentSummary } from "@/types/public-tournament"

export async function HomeContent() {
  const branding = getTenantBranding()
  const { organization, upcomingTournaments, inProgressTournaments, ranking, recentWinners } = await getTenantHomeData()

  if (branding.home.variant === "padel-elite") {
    return <PadelEliteHomeContent branding={branding} upcomingTournaments={upcomingTournaments} inProgressTournaments={inProgressTournaments} ranking={ranking} />
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#162545_0%,#192b50_42%,#152340_100%)] text-white">
      <section id="proximos-torneos" className="border-b border-white/12 bg-[linear-gradient(180deg,rgba(31,50,89,0.94)_0%,rgba(28,46,82,0.92)_100%)]">
        <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
          <div className="mb-6 sm:mb-8">
            <div className="mx-auto max-w-3xl">
              <div className="flex justify-center">
                <div className="rounded-[28px] border border-white/10 bg-[#182b52]/68 px-5 py-4 shadow-[0_18px_45px_rgba(7,12,28,0.16)] backdrop-blur-sm sm:px-6 sm:py-5">
                  <div className="relative h-[56px] w-[180px] overflow-hidden sm:h-[72px] sm:w-[244px] lg:h-[88px] lg:w-[300px]">
                    <Image src={branding.logo.onDark} alt={`${branding.siteName} logo`} fill priority sizes="(max-width: 640px) 180px, (max-width: 1024px) 244px, 300px" className="object-cover object-center" />
                  </div>
                </div>
              </div>

              <div className="mt-8 border-t border-white/10 pt-8 text-center sm:mt-10 sm:pt-10">
                <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-5xl">Proximos torneos</h1>
                <div className="mt-6 flex justify-center">
                  <Button asChild className="h-11 bg-court-500 px-6 text-base font-semibold text-brand-900 hover:bg-court-400">
                    <Link href="/tournaments">Ver todos <ChevronRight className="ml-1 h-4 w-4" /></Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {upcomingTournaments.length === 0 ? (
            <SetupEmptyState title="Todavia no hay torneos publicados" description="En cuanto Padel FV cargue nuevos torneos, van a aparecer aca automaticamente." />
          ) : <HomeTournamentTabs tournaments={upcomingTournaments} />}
        </div>
      </section>

      <section className="border-b border-white/12 bg-[#13203d] py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6">
          <SectionHeader title="Torneos en curso" dark />
          {inProgressTournaments.length === 0 ? (
            <SetupEmptyState title="No hay torneos en curso" description="Los torneos que ya esten en competencia apareceran aca." />
          ) : <HomeTournamentTabs tournaments={inProgressTournaments} />}
        </div>
      </section>

      <RecentWinnersSection winners={recentWinners} />
      {branding.features.publicRanking && <HomeRanking ranking={ranking} dark />}
      <HomeFooter organizationName={organization?.name || branding.siteName} branding={branding} dark />
    </div>
  )
}

function PadelEliteHomeContent({
  branding,
  upcomingTournaments,
  inProgressTournaments,
  ranking,
}: {
  branding: ReturnType<typeof getTenantBranding>
  upcomingTournaments: PublicTournamentSummary[]
  inProgressTournaments: PublicTournamentSummary[]
  ranking: TenantRankingPlayer[]
}) {
  return (
    <div className="tpe-page min-h-screen">
      <section className="container mx-auto px-4 pb-10 pt-8 sm:px-6 lg:pt-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="tpe-kicker mb-4">TPE Padel</p>
                <BrandLogo variant="hero" />
                <h1 className="mt-6 text-4xl font-black text-[var(--tpe-night)] sm:text-5xl">{branding.home.title}</h1>
                <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-slate-700 sm:text-lg">{branding.home.subtitle}</p>
              </div>
              <Button asChild size="lg" className="rounded-full bg-[var(--tpe-night)] px-8 py-6 text-sm font-black uppercase tracking-[0.16em] text-[var(--tpe-paper)] hover:bg-[var(--tpe-night-soft)]">
                <Link href="/tournaments">Ver torneos</Link>
              </Button>
            </div>
          </div>

          <SectionHeader title="Proximos torneos" />
          <PublicTournamentList tournaments={upcomingTournaments} emptyTitle="Todavia no hay torneos publicados" emptyDescription="Cuando TPE Padel cargue la proxima fecha, vas a verla aca con categoria, horario, sede e inscripcion directa." showRegistration />
        </div>
      </section>

      <section className="container mx-auto px-4 pb-12 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeader title="Torneos en curso" />
          <PublicTournamentList tournaments={inProgressTournaments} emptyTitle="No hay torneos en curso" emptyDescription="Los torneos que ya esten en competencia apareceran aca." showRegistration />
        </div>
      </section>

      <HomeRanking ranking={ranking} />
      <HomeFooter organizationName={branding.siteName} branding={branding} />
    </div>
  )
}

function SectionHeader({ title, dark = false }: { title: string; dark?: boolean }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <p className={dark ? "mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-court-300" : "tpe-kicker mb-2"}>Agenda</p>
        <h2 className={dark ? "text-2xl font-black text-white sm:text-3xl" : "text-3xl font-black text-[var(--tpe-night)] sm:text-4xl"}>{title}</h2>
      </div>
      <Button asChild variant="ghost" className={dark ? "text-court-300 hover:bg-white/10 hover:text-court-200" : "rounded-full px-0 text-sm font-black uppercase tracking-[0.14em] text-[var(--tpe-night)] hover:bg-transparent hover:text-[var(--tpe-night-soft)]"}>
        <Link href="/tournaments">Ver todos <ChevronRight className="ml-1 h-4 w-4" /></Link>
      </Button>
    </div>
  )
}

function HomeRanking({ ranking, dark = false }: { ranking: TenantRankingPlayer[]; dark?: boolean }) {
  const sectionClassName = dark ? "border-b border-white/12 bg-[#182b52] py-12 sm:py-16" : "border-t border-slate-200 bg-[var(--tpe-paper)] py-12 sm:py-16"
  const cardClassName = dark ? "border border-white/10 bg-white/5" : "border border-slate-200 bg-white"
  const textClassName = dark ? "text-white" : "text-[var(--tpe-night)]"
  const mutedClassName = dark ? "text-slate-300" : "text-slate-500"

  return (
    <section className={sectionClassName}>
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className={dark ? "mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-court-300" : "tpe-kicker mb-2"}>Ranking</p>
              <h2 className={`text-2xl font-black sm:text-3xl ${textClassName}`}>Top 5</h2>
            </div>
            <Button asChild variant="ghost" className={dark ? "text-court-300 hover:bg-white/10 hover:text-court-200" : "rounded-full px-0 text-sm font-black uppercase tracking-[0.14em] text-[var(--tpe-night)] hover:bg-transparent hover:text-[var(--tpe-night-soft)]"}>
              <Link href="/ranking?page=1">Ver ranking</Link>
            </Button>
          </div>

          <div className={`overflow-hidden rounded-[1.5rem] ${cardClassName}`}>
            {ranking.length === 0 ? <p className={`px-6 py-10 text-center ${mutedClassName}`}>Todavia no hay jugadores rankeados.</p> : ranking.map((player, index) => (
              <Link key={player.id} href={`/ranking/${player.id}`} className={`flex items-center justify-between gap-4 border-b px-5 py-4 transition hover:bg-black/5 last:border-b-0 ${dark ? "border-white/10" : "border-slate-100"}`}>
                <div className="flex min-w-0 items-center gap-4">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${index < 3 ? "bg-court-500 text-brand-900" : dark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}>
                    {index < 3 ? <Trophy className="h-4 w-4" /> : index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className={`truncate font-bold ${textClassName}`}>{[player.first_name, player.last_name].filter(Boolean).join(" ") || "Jugador"}</p>
                    <p className={`truncate text-sm ${mutedClassName}`}>{player.category_name || "Sin categoria"}{player.club_name ? ` · ${player.club_name}` : ""}</p>
                  </div>
                </div>
                <div className={`shrink-0 text-right ${textClassName}`}>
                  <p className="font-black">{Number(player.score || 0).toLocaleString("es-AR")}</p>
                  <p className={`text-xs ${mutedClassName}`}>puntos</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function HomeFooter({ organizationName, branding, dark = false }: { organizationName: string; branding: ReturnType<typeof getTenantBranding>; dark?: boolean }) {
  return (
    <footer className={dark ? "bg-[#101a31] py-10 text-slate-300" : "border-t border-slate-200 bg-white py-10 text-slate-600"}>
      <div className="container mx-auto flex flex-col gap-4 px-4 text-sm sm:px-6">
        <BrandLogo variant="navbar" surface={dark ? "dark" : "light"} className="h-10 w-auto" priority={false} />
        <p className={dark ? "font-semibold text-white" : "font-semibold text-[var(--tpe-night)]"}>{organizationName}</p>
        <p>{branding.seo.description}</p>
        <p className={dark ? "text-slate-400" : "text-slate-500"}>{branding.supportEmail}</p>
      </div>
    </footer>
  )
}

function SetupEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/20 bg-white/5 px-6 py-12 text-center shadow-sm backdrop-blur-sm">
      <h3 className="text-xl font-bold text-white">{title}</h3>
      <p className="mx-auto mt-3 max-w-2xl text-slate-300">{description}</p>
    </div>
  )
}
