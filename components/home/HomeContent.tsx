import Image from "next/image"
import Link from "next/link"
import { Building2, ChevronRight, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import BrandLogo from "@/components/ui/brand-logo"
import { getTenantBranding } from "@/config/tenant"
import { getTenantHomeData, getTenantWeeklyMatchesByClub } from "@/lib/services/tenant-home.service"
import { HomeTournamentTabs } from "@/components/tournaments/home-tournament-tabs"
import PublicTournamentList from "@/components/public/public-tournament-list"
import SponsorMarquee from "@/components/sponsor-marquee"
import { WeeklyMatchesSection } from "@/components/home/WeeklyMatchesSection"

export async function HomeContent() {
  const branding = getTenantBranding()
  const isPadelFv = branding.key === "padel-fv"
  const [{ organization, tournaments, clubs }, weeklyMatchesByClub] = await Promise.all([
    getTenantHomeData(),
    isPadelFv ? getTenantWeeklyMatchesByClub() : Promise.resolve([]),
  ])

  if (branding.home.variant === "padel-elite") {
    return <PadelEliteHomeContent branding={branding} tournaments={tournaments} clubs={clubs} />
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#162545_0%,#192b50_42%,#152340_100%)] text-white">
      <section
        id="proximos-torneos"
        className="border-b border-white/12 bg-[linear-gradient(180deg,rgba(31,50,89,0.94)_0%,rgba(28,46,82,0.92)_100%)]"
      >
        <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
          <div className="mb-6 sm:mb-8">
            <div className="mx-auto max-w-3xl">
              <div className="flex justify-center">
                <div className="rounded-[28px] border border-white/10 bg-[#182b52]/68 px-5 py-4 shadow-[0_18px_45px_rgba(7,12,28,0.16)] backdrop-blur-sm sm:px-6 sm:py-5">
                  <div className="relative h-[56px] w-[180px] overflow-hidden sm:h-[72px] sm:w-[244px] lg:h-[88px] lg:w-[300px]">
                    <Image
                      src={branding.logo.onDark}
                      alt={`${branding.siteName} logo`}
                      fill
                      priority
                      sizes="(max-width: 640px) 180px, (max-width: 1024px) 244px, 300px"
                      className="object-cover object-center"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 border-t border-white/10 pt-8 text-center sm:mt-10 sm:pt-10">
                <div className="space-y-4">
                  <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-5xl">
                    {isPadelFv ? "Torneos activos y proximos" : "Proximos torneos"}
                  </h1>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                asChild
                className="h-11 w-full bg-court-500 px-6 text-base font-semibold text-brand-900 hover:bg-court-400 sm:w-auto"
              >
                <Link href="/tournaments">
                  Ver todos
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 w-full border-white/20 bg-white/5 px-6 text-base font-semibold text-white hover:bg-white/10 sm:w-auto"
              >
                <Link href="/clubes">
                  <MapPin className="mr-2 h-4 w-4" />
                  Ver clubes
                </Link>
              </Button>
                </div>
              </div>
            </div>
          </div>

          {tournaments.length === 0 ? (
            <SetupEmptyState
              title="Todavia no hay torneos publicados"
              description={
                isPadelFv
                  ? "En cuanto Padel FV tenga torneos activos o proximos publicados, van a aparecer aca automaticamente con su informacion principal."
                  : "En cuanto Padel FV cargue nuevos torneos, van a aparecer aca automaticamente con su informacion principal."
              }
            />
          ) : (
            <HomeTournamentTabs tournaments={tournaments} />
          )}
        </div>
      </section>

      <SponsorMarquee />

      {isPadelFv ? <WeeklyMatchesSection groups={weeklyMatchesByClub} /> : null}

      <section
        className="border-y border-white/12 bg-[linear-gradient(180deg,rgba(17,29,54,0.94)_0%,rgba(14,24,46,0.96)_100%)] py-12 sm:py-16"
      >
        <div className="container mx-auto px-4 sm:px-6">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-court-300">Sedes</p>
              <h2 className="text-2xl font-black text-white sm:text-3xl">Clubes donde organiza</h2>
              <p className="mt-3 max-w-2xl text-slate-200">
                Referencias rapidas para ubicar cada sede del circuito Padel FV.
              </p>
            </div>
            <Button asChild variant="ghost" className="justify-start text-court-300 hover:bg-white/10 hover:text-court-200 sm:justify-center">
              <Link href="/clubes">
                Ver clubes
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>

          {clubs.length === 0 ? (
            <SetupEmptyState
              title="No hay clubes asociados"
              description="Cuando Padel FV vincule clubes a la organizacion, apareceran aca automaticamente."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {clubs.map((club) => (
                <Card key={club.id} className="border-white/10 bg-[#1b2d52]/78 shadow-sm">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-court-500/15 p-3 text-court-300">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-bold text-white">{club.name}</h3>
                        <p className="mt-1 text-sm text-slate-300">{club.address || "Direccion no informada"}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-200">
                      <span>Canchas disponibles</span>
                      <span className="font-semibold text-white">{club.courts || 0}</span>
                    </div>

                    <Button asChild variant="outline" className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10">
                      <Link href={`/clubes/${club.id}`}>Ver club</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="bg-[#101a31] py-10 text-slate-300">
        <div className="container mx-auto flex flex-col gap-6 px-4 text-sm sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <BrandLogo variant="navbar" surface="dark" className="h-10 w-auto" priority={false} />
              <p className="font-semibold text-white">{organization?.name || branding.siteName}</p>
              <p>{branding.seo.description}</p>
            </div>
            <div className="text-slate-400">
              <p>{branding.supportEmail}</p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 border-t border-white/10 pt-5 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="https://circuitopadelamateur.com"
              className="transition hover:text-white"
            >
              Desarrollado por Circuito Padel Amateur
            </Link>
            <Link
              href="https://circuitopadelamateur.com"
              aria-label="Ir a Circuito Padel Amateur"
              className="transition hover:opacity-100"
            >
              <Image
                src="/logo navbar.svg"
                alt="Circuito Padel Amateur logo"
                width={150}
                height={64}
                className="h-10 w-auto opacity-90"
                priority={false}
              />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function PadelEliteHomeContent({
  branding,
  tournaments,
  clubs,
}: {
  branding: ReturnType<typeof getTenantBranding>
  tournaments: Awaited<ReturnType<typeof getTenantHomeData>>["tournaments"]
  clubs: Awaited<ReturnType<typeof getTenantHomeData>>["clubs"]
}) {
  return (
    <div className="tpe-page min-h-screen">
      <section className="container mx-auto px-4 pb-10 pt-8 sm:px-6 lg:pt-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="tpe-kicker mb-4">PadelElite</p>
                <BrandLogo variant="hero" />
                <h1 className="mt-6 text-4xl font-black text-[var(--tpe-night)] sm:text-5xl">
                  {branding.home.title}
                </h1>
                <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-slate-700 sm:text-lg">
                  {branding.home.subtitle}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full bg-[var(--tpe-night)] px-8 py-6 text-sm font-black uppercase tracking-[0.16em] text-[var(--tpe-paper)] hover:bg-[var(--tpe-night-soft)]"
                >
                  <Link href="/tournaments">Ver torneos</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-[var(--tpe-night)] bg-transparent px-8 py-6 text-sm font-black uppercase tracking-[0.16em] text-[var(--tpe-night)] hover:bg-[var(--tpe-night)] hover:text-[var(--tpe-paper)]"
                >
                  <Link href="/clubes">
                    <Building2 className="mr-2 h-5 w-5" />
                    Ver clubes
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="tpe-kicker mb-2">Agenda semanal</p>
              <h2 className="text-3xl font-black text-[var(--tpe-night)] sm:text-4xl">
                Proximos torneos
              </h2>
            </div>
            <Button
              asChild
              variant="ghost"
              className="rounded-full px-0 text-sm font-black uppercase tracking-[0.14em] text-[var(--tpe-night)] hover:bg-transparent hover:text-[var(--tpe-night-soft)]"
            >
              <Link href="/tournaments">
                Ver todos
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <PublicTournamentList
            tournaments={tournaments}
            emptyTitle="Todavia no hay torneos publicados"
            emptyDescription="Cuando PadelElite cargue la proxima fecha, vas a verla aca con categoria, horario, sede e inscripcion directa."
            showRegistration
          />
        </div>
      </section>

      <section className="container mx-auto px-4 pb-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="tpe-kicker mb-2">Sedes</p>
              <h2 className="text-3xl font-black text-[var(--tpe-night)] sm:text-4xl">
                Clubes donde organiza
              </h2>
            </div>
            <Button
              asChild
              variant="ghost"
              className="rounded-full px-0 text-sm font-black uppercase tracking-[0.14em] text-[var(--tpe-night)] hover:bg-transparent hover:text-[var(--tpe-night-soft)]"
            >
              <Link href="/clubes">
                Ver clubes
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>

          {clubs.length === 0 ? (
            <div className="tpe-shell rounded-[2rem] p-8 text-center text-white">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/8">
                <MapPin className="h-8 w-8 text-[var(--tpe-cyan)]" />
              </div>
              <h3 className="text-2xl font-black">No hay clubes asociados</h3>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-white/72 sm:text-base">
                Cuando las sedes de PadelElite esten vinculadas, apareceran en esta seccion.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {clubs.map((club) => (
                <div key={club.id} className="tpe-shell rounded-[1.75rem] p-6 text-white">
                  <p className="mb-3 inline-flex rounded-full bg-[var(--tpe-lime)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--tpe-night)]">
                    Sede activa
                  </p>
                  <h3 className="text-2xl font-black uppercase text-[var(--tpe-paper)]">
                    {club.name}
                  </h3>
                  <p className="mt-3 flex items-start gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-[var(--tpe-cyan)]">
                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{club.address || "Direccion a confirmar"}</span>
                  </p>
                  <div className="mt-6 flex items-center justify-between gap-3">
                    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white/80">
                      {club.courts || 0} canchas
                    </span>
                    <Button
                      asChild
                      variant="outline"
                      className="rounded-full border-white/20 bg-transparent text-xs font-black uppercase tracking-[0.14em] text-white hover:bg-white/10 hover:text-white"
                    >
                      <Link href={`/clubes/${club.id}`}>Ver club</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-[var(--tpe-paper)] py-10 text-slate-600">
        <div className="container mx-auto flex flex-col gap-6 px-4 text-sm sm:px-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <BrandLogo variant="navbar" surface="light" className="h-10 w-auto" priority={false} />
              <p className="font-semibold text-[var(--tpe-night)]">{branding.siteName}</p>
              <p>{branding.seo.description}</p>
            </div>
            <div className="text-slate-500">
              <p>{branding.supportEmail}</p>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-3 border-t border-slate-200 pt-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="https://circuitopadelamateur.com"
              className="transition hover:text-[var(--tpe-night)]"
            >
              Desarrollado por Circuito Padel Amateur
            </Link>
            <Link
              href="https://circuitopadelamateur.com"
              aria-label="Ir a Circuito Padel Amateur"
              className="transition hover:opacity-100"
            >
              <Image
                src="/logo favicon.svg"
                alt="Circuito Padel Amateur logo"
                width={56}
                height={56}
                className="h-12 w-12 opacity-90"
                priority={false}
              />
            </Link>
          </div>
        </div>
      </footer>
    </div>
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
