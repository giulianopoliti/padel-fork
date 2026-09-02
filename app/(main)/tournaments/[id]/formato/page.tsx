import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { ArrowLeft, BookOpen, CheckCircle2, GitFork, Layers3, Trophy } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import { getTenantBranding } from '@/config/tenant'

interface FormatPageProps {
  params: Promise<{ id: string }>
}

const formatNumber = (value: number | null) => value ? `${value}` : 'la cantidad definida por la organización'

export default async function TournamentFormatPage({ params }: FormatPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('id, name, type, format_type, format_config')
    .eq('id', id)
    .single()

  if (error || !tournament) notFound()

  const resolved = TournamentFormatResolver.getResolvedFormat(tournament)
  const branding = getTenantBranding()
  const isAmerican = resolved.baseType === 'AMERICAN'
  const isPadelFvLong = !isAmerican && branding.key === 'padel-fv'
  const advancement = resolved.effectiveAdvancementConfig
  const stageText = resolved.effectiveZoneStage === 'ROUND_ROBIN'
    ? 'todos contra todos'
    : `${formatNumber(resolved.effectiveTargetMatchesPerCouple)} partidos de clasificación por pareja`

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href={`/tournaments/${id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Volver al torneo
        </Link>
        <header className="rounded-display border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-3">
            <div className="rounded-elevated bg-primary/10 p-3 text-primary"><BookOpen className="h-6 w-6" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Formato de juego</p>
              <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">{tournament.name}</h1>
              <p className="mt-2 text-muted-foreground">{resolved.display.name}</p>
            </div>
          </div>
          <p className="mt-6 text-base leading-7 text-foreground/85">{resolved.display.description}</p>
          <p className="mt-3 text-base leading-7 text-foreground/85">
            {isAmerican
              ? 'El Americano se juega en una sola jornada y cada partido es a un set. Si el formato incluye llave, esos partidos son eliminatorios: la pareja que pierde queda afuera.'
              : isPadelFvLong
                ? 'Cada partido de la Liga se juega al mejor de tres sets. Primero se juega la clasificación y después comienzan los partidos eliminatorios.'
                : 'La Liga de PadelElite se desarrolla durante varias jornadas, con cada partido asignado a un día y horario determinado por la organización.'}
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <GuideCard icon={Layers3} title="Primera etapa">
            {isAmerican && resolved.zoneMode === 'MULTI_ZONE' ? 'Las parejas se distribuyen en varias zonas.' : 'Las parejas comparten una zona única.'}
            {' '}En esta etapa cada pareja juega {stageText}.
            {isPadelFvLong ? ' Generalmente son 3 partidos de qually.' : ''}
          </GuideCard>
          <GuideCard icon={Trophy} title="Clasificación">
            {advancement.kind === 'NONE' && 'La tabla final define directamente al campeón.'}
            {advancement.kind === 'SINGLE' && `Avanzan las mejores ${advancement.advanceCount} parejas a la llave. Esto puede ser modificado más adelante según la organización.`}
            {advancement.kind === 'PER_ZONE_TOP' && (advancement.couplesPerZone === 'ALL' ? 'Las posiciones de las zonas ordenan la llave.' : `Avanzan ${advancement.couplesPerZone} parejas por zona.`)}
            {advancement.kind === 'GOLD_SILVER' && `Se forman Copa de Oro (${advancement.goldCount}) y Copa de Plata (${advancement.silverCount}).`}
          </GuideCard>
        </section>

        <section className="rounded-display border bg-card p-6 shadow-sm sm:p-8">
          <h2 className="flex items-center gap-2 text-xl font-semibold"><GitFork className="h-5 w-5 text-primary" /> Desarrollo</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />Los resultados se reflejan en la tabla de posiciones según el reglamento del torneo.</li>
            {isAmerican ? <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />El Americano se juega en una sola jornada, a un set por partido. La llave se arma con las posiciones obtenidas y cada cruce de llave es eliminatorio.</li> : isPadelFvLong ? <>
              <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />En la Liga normalmente hay 3 partidos de qually y luego partidos eliminatorios.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />Como jugador tenés que cargar tu preferencia horaria para que la organización pueda coordinar los partidos. Generalmente se juega una fecha por fin de semana.</li>
            </> : <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />La Liga se desarrolla durante varias jornadas. Cada partido tiene un día y horario determinado por la organización y no depende de una preferencia horaria del jugador.</li>}
            {resolved.appliedNotes.map((note) => <li key={note} className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />{note}</li>)}
          </ul>
        </section>
      </div>
    </div>
  )
}

function GuideCard({ icon: Icon, title, children }: { icon: typeof Trophy; title: string; children: ReactNode }) {
  return <div className="rounded-display border bg-card p-5 shadow-sm"><Icon className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{children}</p></div>
}
