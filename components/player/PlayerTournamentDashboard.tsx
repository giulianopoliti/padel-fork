'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  BarChart3,
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  MapPin,
  Swords,
  Trophy,
  Users,
} from 'lucide-react'

import CancelRegistrationButton from '@/components/tournament/player/cancel-registration-button'
import NotRegisteredView from '@/components/tournament/NotRegisteredView'
import PublicRegistrationLauncher from '@/components/tournament/public-registration-launcher'
import TournamentHeroDetails from '@/components/tournament/TournamentHeroDetails'
import TournamentPublicInfoCard from '@/components/tournament/TournamentPublicInfoCard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { LongPlayerOverview, LongPlayerOverviewMatch } from '@/lib/services/long-player-overview.shared'
import type { TournamentPublicInfo } from '@/lib/tournaments/public-tournament-details'
import { PLAYER_INSCRIPTION_COPY } from '@/lib/tournaments/player-inscription-copy'
import { cn } from '@/lib/utils'
import { Gender } from '@/types'

interface PlayerTournamentDashboardProps {
  tournamentId: string
  tournament: {
    id: string
    name: string
    category?: string
    type?: string | null
    status?: string
    gender?: Gender
    price?: number | string | null
    start_date?: string | null
    enable_transfer_proof?: boolean
    enable_public_inscriptions?: boolean | null
    registration_locked?: boolean | null
    bracket_status?: string | null
    transfer_alias?: string | null
    transfer_amount?: number | null
    is_full?: boolean
    has_few_slots?: boolean
    publicInfo?: TournamentPublicInfo
  }
  overview: LongPlayerOverview
}

const roundLabels: Record<string, string> = {
  ZONE: 'Fase de posiciones',
  '32VOS': '32avos de final',
  '16VOS': '16avos de final',
  '8VOS': 'Octavos de final',
  '4TOS': 'Cuartos de final',
  SEMIFINAL: 'Semifinal',
  FINAL: 'Final',
}

const formatDate = (date: string | null) => {
  if (!date) return null
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

export default function PlayerTournamentDashboard({ tournamentId, tournament, overview }: PlayerTournamentDashboardProps) {
  const [registrationCancelled, setRegistrationCancelled] = useState(false)

  if (registrationCancelled || overview.registrationStatus === 'NOT_REGISTERED') {
    return <div className="mx-auto max-w-5xl p-4 sm:p-6"><NotRegisteredView tournamentId={tournamentId} tournament={tournament} /></div>
  }

  if (overview.registrationStatus === 'PENDING') {
    return (
      <PendingRegistrationView
        tournamentId={tournamentId}
        tournament={tournament}
        overview={overview}
        onCancelled={() => setRegistrationCancelled(true)}
      />
    )
  }

  if (overview.registrationStatus === 'INDIVIDUAL') {
    return <AwaitingPartnerView tournamentId={tournamentId} tournament={tournament} />
  }

  const isEliminated = overview.registrationStatus === 'ELIMINATED'

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:space-y-6 sm:p-6">
      <header className="rounded-3xl bg-primary px-5 py-6 text-primary-foreground shadow-xl shadow-primary/15 sm:px-7">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-accent p-2.5 text-accent-foreground"><Trophy className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-foreground/70">Tu torneo</p>
            <h1 className="mt-1 truncate text-2xl font-bold sm:text-3xl">{tournament.name}</h1>
            <p className="mt-1 text-sm text-primary-foreground/75">{overview.coupleName || tournament.category || 'Torneo LONG'}</p>
          </div>
        </div>
        {tournament.publicInfo && <TournamentHeroDetails publicInfo={tournament.publicInfo} variant="dark" className="mt-4" />}
      </header>

      {isEliminated ? (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-700" />
          <AlertDescription className="text-amber-900">
            Tu participacion finalizo en <strong>{roundLabels[overview.eliminatedInRound || ''] || overview.eliminatedInRound || 'el torneo'}</strong>. Todavia podes consultar tu posicion, resultados y llave.
          </AlertDescription>
        </Alert>
      ) : <AvailabilityCard tournamentId={tournamentId} overview={overview} />}

      <section className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <NextMatchSummary match={overview.nextMatch} />
        <StandingCard tournamentId={tournamentId} overview={overview} />
      </section>

      <FinishedMatches matches={overview.finishedMatches} />

      <div className="flex justify-end border-t border-border/70 pt-4">
        <CancelRegistrationButton
          tournamentId={tournamentId}
          tournamentName={tournament.name}
          coupleId={overview.coupleId}
          tournamentType={tournament.type}
          tournamentStartDate={tournament.start_date}
          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onCancelled={() => setRegistrationCancelled(true)}
        />
      </div>
    </div>
  )
}

const AvailabilityCard = ({ tournamentId, overview }: { tournamentId: string; overview: LongPlayerOverview }) => {
  const summary = overview.availability
  const pending = summary ? Math.max(summary.totalSlots - summary.respondedSlots, 0) : 0
  const complete = Boolean(summary && summary.totalSlots > 0 && pending === 0)
  const progress = summary && summary.totalSlots > 0 ? (summary.respondedSlots / summary.totalSlots) * 100 : 0
  const href = summary ? `/tournaments/${tournamentId}/schedules?fecha_id=${summary.fechaId}` : `/tournaments/${tournamentId}/schedules`

  return (
    <Card className="overflow-hidden border-primary/20 shadow-lg shadow-primary/5">
      <div className="h-1.5 bg-accent" />
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <div className={cn('h-fit rounded-2xl p-3', complete ? 'bg-emerald-100 text-emerald-700' : 'bg-primary/10 text-primary')}>
              {complete ? <CheckCircle2 className="h-6 w-6" /> : <CalendarCheck2 className="h-6 w-6" />}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Accion principal</p>
              <h2 className="mt-1 text-xl font-bold">{!summary ? 'Disponibilidad horaria' : complete ? 'Disponibilidad completa' : 'Completa tu disponibilidad'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {!summary ? 'El organizador todavia no publico fechas con horarios.' : `${summary.fechaName}: ${summary.respondedSlots} de ${summary.totalSlots} horarios respondidos`}
              </p>
              {summary && summary.totalSlots > 0 && <Progress value={progress} className="mt-3 h-2 max-w-sm" />}
            </div>
          </div>
          <Button asChild size="lg" className="min-h-12 shrink-0 bg-accent font-bold text-accent-foreground hover:bg-accent/85">
            <Link href={href}>{complete ? 'Revisar disponibilidad' : 'Cargar disponibilidad'}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

const NextMatchSummary = ({ match }: { match: LongPlayerOverviewMatch | null }) => (
  <Card className="border-border/80">
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Swords className="h-5 w-5 text-primary" />Proximo partido</CardTitle></CardHeader>
    <CardContent>
      {!match ? (
        <div className="rounded-2xl bg-muted/70 p-5 text-sm text-muted-foreground">Todavia no tenes un partido pendiente programado.</div>
      ) : (
        <div className="space-y-4">
          <div>
            <Badge variant="secondary">{roundLabels[match.round] || match.round}</Badge>
            <p className="mt-3 text-sm text-muted-foreground">Rival</p>
            <p className="text-lg font-bold">{match.opponentName}</p>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <InfoLine icon={Clock3} text={formatDate(match.scheduledDate) ? `${formatDate(match.scheduledDate)} ${match.scheduledStartTime?.slice(0, 5) || ''}` : 'Horario a confirmar'} />
            <InfoLine icon={MapPin} text={match.court ? `Cancha ${match.court}` : 'Cancha a confirmar'} />
          </div>
        </div>
      )}
    </CardContent>
  </Card>
)

const StandingCard = ({ tournamentId, overview }: { tournamentId: string; overview: LongPlayerOverview }) => (
  <Card className="border-border/80">
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-primary" />Mi posicion</CardTitle></CardHeader>
    <CardContent>
      {overview.standing ? (
        <div className="space-y-4">
          <div className="flex items-end gap-2"><span className="text-5xl font-black text-primary">{overview.standing.position}</span><span className="pb-1 text-sm font-semibold text-muted-foreground">puesto</span></div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat value={overview.standing.wins + overview.standing.losses} label="PJ" />
            <Stat value={overview.standing.wins} label="PG" />
            <Stat value={overview.standing.losses} label="PP" />
          </div>
        </div>
      ) : <p className="rounded-xl bg-muted/70 p-4 text-sm text-muted-foreground">La tabla todavia no esta disponible.</p>}
      <Button asChild variant="outline" className="mt-4 w-full"><Link href={`/tournaments/${tournamentId}/qually`}>Ver tabla completa</Link></Button>
    </CardContent>
  </Card>
)

const FinishedMatches = ({ matches }: { matches: LongPlayerOverviewMatch[] }) => {
  const [showAll, setShowAll] = useState(false)
  const visibleMatches = showAll ? matches : matches.slice(0, 4)
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" />Mis partidos</span><Badge variant="secondary">{matches.length} jugados</Badge></CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {visibleMatches.length === 0 ? <p className="rounded-xl bg-muted/70 p-5 text-sm text-muted-foreground">Todavia no jugaste partidos en este torneo.</p> : visibleMatches.map(match => {
          const won = match.winnerId === match.playerCoupleId
          const playerIsCouple1 = match.couple1Id === match.playerCoupleId
          const playerResult = playerIsCouple1 ? match.resultCouple1 : match.resultCouple2
          const opponentResult = playerIsCouple1 ? match.resultCouple2 : match.resultCouple1
          return (
            <article key={match.id} className="flex items-center gap-3 rounded-2xl border border-border/80 p-3 sm:p-4">
              <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black', won ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>{won ? 'G' : 'P'}</div>
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{match.opponentName}</p><p className="text-xs text-muted-foreground">{roundLabels[match.round] || match.round}{formatDate(match.scheduledDate) ? ` · ${formatDate(match.scheduledDate)}` : ''}</p></div>
              <div className="text-right"><p className="font-bold">{playerResult ?? '-'} / {opponentResult ?? '-'}</p><p className={cn('text-xs font-semibold', won ? 'text-emerald-700' : 'text-rose-700')}>{won ? 'Victoria' : 'Derrota'}</p></div>
            </article>
          )
        })}
        {matches.length > 4 && <Button type="button" variant="ghost" className="w-full" onClick={() => setShowAll(value => !value)}>{showAll ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}{showAll ? 'Ver menos' : 'Ver historial completo'}</Button>}
      </CardContent>
    </Card>
  )
}

const AwaitingPartnerView = ({ tournamentId, tournament }: Omit<PlayerTournamentDashboardProps, 'overview'>) => (
  <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
    <Card className="border-primary/20"><CardContent className="p-6 text-center">
      <Users className="mx-auto h-12 w-12 text-primary" /><h1 className="mt-4 text-2xl font-bold">Completa tu pareja</h1><p className="mt-2 text-muted-foreground">Ya estas inscripto individualmente. Falta asociar a tu compañero para participar.</p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <PublicRegistrationLauncher tournamentId={tournamentId} tournamentName={tournament.name} tournamentGender={tournament.gender || Gender.MALE} tournamentPrice={tournament.price || null} enableTransferProof={tournament.enable_transfer_proof || false} transferAlias={tournament.transfer_alias || null} transferAmount={tournament.transfer_amount || null} buttonLabel="Completar pareja" />
        <CancelRegistrationButton tournamentId={tournamentId} tournamentName={tournament.name} tournamentType={tournament.type} tournamentStartDate={tournament.start_date} />
      </div>
    </CardContent></Card>
  </div>
)

const PendingRegistrationView = ({
  tournamentId,
  tournament,
  overview,
  onCancelled,
}: PlayerTournamentDashboardProps & { onCancelled: () => void }) => (
  <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl bg-primary px-5 py-6 text-primary-foreground shadow-xl shadow-primary/15">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-foreground/70">Tu torneo</p>
      <h1 className="mt-1 text-2xl font-bold">{tournament.name}</h1>
      {overview.coupleName && <p className="mt-2 text-sm text-primary-foreground/80">{overview.coupleName}</p>}
    </header>
    <Card className="border-amber-300 bg-amber-50">
      <CardContent className="p-6">
        <div className="flex items-start gap-3">
          <Clock3 className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />
          <div>
            <h2 className="text-xl font-bold text-amber-950">{PLAYER_INSCRIPTION_COPY.pendingTitle}</h2>
            <p className="mt-2 text-sm text-amber-900">
              El organizador recibio tu solicitud. Cuando la apruebe vas a poder cargar disponibilidad y acceder a todas las funciones de jugador.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
    {tournament.publicInfo && (
      <TournamentPublicInfoCard publicInfo={tournament.publicInfo} showSchedule={false} />
    )}
    <div className="flex justify-end">
      <CancelRegistrationButton
        tournamentId={tournamentId}
        tournamentName={tournament.name}
        coupleId={overview.coupleId}
        tournamentType={tournament.type}
        tournamentStartDate={tournament.start_date}
        onCancelled={onCancelled}
      />
    </div>
  </div>
)

const InfoLine = ({ icon: Icon, text }: { icon: typeof Clock3; text: string }) => <div className="flex items-center gap-2 rounded-xl bg-muted/70 px-3 py-2"><Icon className="h-4 w-4 text-primary" /><span>{text}</span></div>
const Stat = ({ value, label }: { value: number; label: string }) => <div className="rounded-xl bg-muted/70 p-2"><p className="text-lg font-bold">{value}</p><p className="text-[10px] font-bold text-muted-foreground">{label}</p></div>
