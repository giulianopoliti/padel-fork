import { Trophy, ArrowRight, Users, CalendarDays } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import PanelTournamentCard from "./panel-tournament-card"
import type { PanelTournamentWithMetrics } from "@/lib/services/organizer-panel-metrics"
import PlayersSectionClient from "./players-section-client"
import TournamentClubSelector from '@/components/tournament/tournament-club-selector'
import type { ActiveTournamentClub } from '@/lib/services/tournament-club-filter.service'
import { getOrganizerPanelHref, getTournamentListHref } from '@/lib/tournaments/tournament-list-filters'
import TournamentSortDialog from '@/components/tournament/tournament-sort-dialog'
import { describeTournamentSort, type TournamentSortSettings } from '@/lib/tournaments/tournament-sort'

interface PlayerData {
  id: string
  first_name: string
  last_name: string
  dni: string | null
  phone: string | null
  score: number | null
  profile_image_url: string | null
  category_name: string | null
  user_id?: string | null
  email?: string | null
  users?: { email: string | null } | Array<{ email: string | null }> | null
}

interface Category {
  name: string
  lower_range: number
  upper_range: number | null
}

interface OrganizadorDashboardProps {
  tournaments: PanelTournamentWithMetrics[]
  players: PlayerData[]
  categories: Category[]
  totalPlayers: number
  organizationId: string
  canResolvePlayerIdentity: boolean
  tournamentsError?: boolean
  playersError?: boolean
  prioritizesUpcoming?: boolean
  clubs: ActiveTournamentClub[]
  clubId?: string
  tournamentPage: number
  tournamentPages: number
  totalTournaments: number
  sortSettings?: TournamentSortSettings
  tenantName: string
}

export default function OrganizadorDashboard({
  tournaments,
  players,
  categories,
  totalPlayers,
  organizationId,
  canResolvePlayerIdentity,
  tournamentsError = false,
  playersError = false,
  prioritizesUpcoming = false,
  clubs,
  clubId,
  tournamentPage,
  tournamentPages,
  totalTournaments,
  sortSettings,
  tenantName,
}: OrganizadorDashboardProps) {

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <section aria-labelledby="matches-heading">
        <div className="rounded-display border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-sky-50 p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-elevated bg-amber-100 p-3">
                <CalendarDays className="h-6 w-6 text-amber-700" aria-hidden="true" />
              </div>
              <div>
                <h2 id="matches-heading" className="text-xl font-bold">
                  Agenda global de partidos
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Consultá en una sola vista los partidos programados de todos los torneos de tu organización y exportalos por fecha, horario o club.
                </p>
              </div>
            </div>
            <Button asChild>
              <Link href="/panel/matches" className="flex items-center gap-2">
                Ver agenda
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Sección: Mis Torneos */}
      <section aria-labelledby="tournaments-heading">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-surface bg-amber-100 dark:bg-amber-900/20">
              <Trophy className="h-6 w-6 text-amber-600 dark:text-amber-500" aria-hidden="true" />
            </div>
            <div>
              <h2 id="tournaments-heading" className="text-2xl font-bold">
                Mis Torneos
              </h2>
              <p className="text-sm text-muted-foreground">
                {sortSettings?.configured ? describeTournamentSort(sortSettings.rules) : prioritizesUpcoming ? "Próximos primero; luego zonas y llaves" : "Próximos, zonas y llaves por fecha de inicio"}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={getTournamentListHref('upcoming', 1, clubId)} prefetch={false} className="flex items-center gap-2">
              Ver todos
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TournamentClubSelector clubs={clubs} clubId={clubId} path="/panel" />
          {sortSettings && <TournamentSortDialog surface="panel" settings={sortSettings} tenantName={tenantName} />}
        </div>
        {!tournamentsError && totalTournaments > 0 && <p className="mb-3 text-sm text-muted-foreground" role="status">{totalTournaments} torneos · página {tournamentPage} de {tournamentPages}</p>}
        {tournamentsError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No pudimos cargar los torneos</AlertTitle>
            <AlertDescription>Recargá la página para volver a intentarlo.</AlertDescription>
          </Alert>
        ) : tournaments.length === 0 ? (
          <div className="text-center py-16 bg-muted/50 rounded-surface border-2 border-dashed">
            <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mb-4">
              <Trophy className="h-8 w-8 text-amber-600 dark:text-amber-500" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              No hay torneos próximos ni en juego
            </h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Los torneos finalizados y cancelados están en Ver todos. Podés crear un torneo para comenzar.
            </p>
            <Button asChild>
              <Link href="/tournaments/create">Crear torneo</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {tournaments.map((tournament) => (
              <PanelTournamentCard
                key={tournament.id}
                tournament={tournament}
              />
            ))}
          </div>
        )}
        {!tournamentsError && tournamentPages > 1 && (
          <nav aria-label="Paginación de torneos del panel" className="mt-4 flex items-center justify-between gap-3">
            {tournamentPage > 1 ? <Button variant="outline" size="sm" asChild><Link prefetch={false} href={getOrganizerPanelHref(tournamentPage - 1, clubId)}>Anterior</Link></Button> : <Button variant="outline" size="sm" disabled>Anterior</Button>}
            <span className="text-sm text-muted-foreground">{tournamentPage} / {tournamentPages}</span>
            {tournamentPage < tournamentPages ? <Button variant="outline" size="sm" asChild><Link prefetch={false} href={getOrganizerPanelHref(tournamentPage + 1, clubId)}>Siguiente</Link></Button> : <Button variant="outline" size="sm" disabled>Siguiente</Button>}
          </nav>
        )}
      </section>

      <Separator className="my-8" />

      {/* Sección: Directorio de jugadores */}
      <section aria-labelledby="players-heading">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-surface bg-blue-100 dark:bg-blue-900/20">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-500" aria-hidden="true" />
            </div>
            <div>
              <h2 id="players-heading" className="text-2xl font-bold">
                Jugadores
              </h2>
              <p className="text-sm text-muted-foreground">
                {playersError ? 'Directorio no disponible' : totalPlayers > 0
                  ? `${totalPlayers} jugadores en el directorio`
                  : 'No hay jugadores registrados'
                }
              </p>
            </div>
          </div>
          {totalPlayers > 10 && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/my-players" className="flex items-center gap-2">
                Ver todos
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>

        {playersError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No pudimos cargar el directorio de jugadores</AlertTitle>
            <AlertDescription>Recargá la página para volver a intentarlo.</AlertDescription>
          </Alert>
        ) : <PlayersSectionClient
          initialPlayers={players}
          categories={categories}
          organizationId={organizationId}
          canResolvePlayerIdentity={canResolvePlayerIdentity}
          totalPlayers={totalPlayers}
        />}
      </section>
    </div>
  )
}
