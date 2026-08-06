"use client"

import { Trophy, ArrowRight, Users, CalendarDays, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import TournamentCard from "./tournament-card"
import PlayersSectionClient from "./players-section-client"

interface TournamentData {
  id: string
  name: string
  status: string
  pre_tournament_image_url: string | null
  start_date: string
  end_date: string | null
  category_name: string
  gender: string
  type: string
  price: number | string | null
  clubes?: {
    id: string
    name: string
  } | null
  inscriptions: number
  matchesFinished: number
  matchesPending: number
  totalMatches: number
  is_draft?: boolean
}

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

interface PlayerHistoryMarkData {
  id: string
  mark_type: string
  note: string
  created_at: string
  players?: {
    id: string
    first_name: string | null
    last_name: string | null
    dni: string | null
    phone: string | null
    category_name: string | null
  } | null
  tournaments?: {
    id: string
    name: string | null
  } | null
}

interface OrganizadorDashboardProps {
  tournaments: TournamentData[]
  players: PlayerData[]
  categories: Category[]
  playerHistoryMarks: PlayerHistoryMarkData[]
  totalPlayers: number
  organizationId: string
  canResolvePlayerIdentity: boolean
  hasError?: boolean
}

export default function OrganizadorDashboard({
  tournaments,
  players,
  categories,
  playerHistoryMarks,
  totalPlayers,
  organizationId,
  canResolvePlayerIdentity,
  hasError = false
}: OrganizadorDashboardProps) {
  const formatPlayerName = (mark: PlayerHistoryMarkData) => {
    const firstName = mark.players?.first_name || ""
    const lastName = mark.players?.last_name || ""
    return `${firstName} ${lastName}`.trim() || "Jugador sin nombre"
  }

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value))

  if (hasError) {
    return (
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            No pudimos cargar los torneos. Por favor, intenta recargar la página.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <section aria-labelledby="matches-heading">
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-sky-50 p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-amber-100 p-3">
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
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/20">
              <Trophy className="h-6 w-6 text-amber-600 dark:text-amber-500" aria-hidden="true" />
            </div>
            <div>
              <h2 id="tournaments-heading" className="text-2xl font-bold">
                Mis Torneos
              </h2>
              <p className="text-sm text-muted-foreground">
                Últimos {tournaments.length} torneos activos
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/my-tournaments" className="flex items-center gap-2">
              Ver todos
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {tournaments.length === 0 ? (
          <div className="text-center py-16 bg-muted/50 rounded-lg border-2 border-dashed">
            <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mb-4">
              <Trophy className="h-8 w-8 text-amber-600 dark:text-amber-500" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              No tienes torneos todavía
            </h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Comienza creando tu primer torneo de pádel y gestiona inscripciones, partidos y mucho más.
            </p>
            <Button asChild>
              <Link href="/tournaments/create">Crear torneo</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {tournaments.map((tournament, index) => (
              <TournamentCard
                key={tournament.id}
                tournament={tournament}
                priority={index === 0}
              />
            ))}
          </div>
        )}
      </section>

      <Separator className="my-8" />

      <section aria-labelledby="history-heading">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/20">
              <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-500" aria-hidden="true" />
            </div>
            <div>
              <h2 id="history-heading" className="text-2xl font-bold">
                Jugadores con historial
              </h2>
              <p className="text-sm text-muted-foreground">
                {playerHistoryMarks.length > 0
                  ? `Ultimas ${playerHistoryMarks.length} marcas amarillas registradas`
                  : "Todavia no hay marcas registradas"
                }
              </p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit border-amber-200 bg-amber-50 text-amber-800">
            Lista de bloqueados: pendiente
          </Badge>
        </div>

        {playerHistoryMarks.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed bg-muted/40 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Cuando marques una pareja o jugador desde inscripciones, va a aparecer aca.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-white">
            <div className="divide-y">
              {playerHistoryMarks.map((mark) => (
                <div key={mark.id} className="grid gap-3 p-4 sm:grid-cols-[1.2fr_1fr_auto] sm:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{formatPlayerName(mark)}</p>
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                        Mancha amarilla
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{mark.note}</p>
                  </div>
                  <div className="text-sm text-slate-600">
                    <p>{mark.tournaments?.name || "Sin torneo asociado"}</p>
                    <p>DNI: {mark.players?.dni || "pendiente"}</p>
                  </div>
                  <div className="text-sm text-muted-foreground sm:text-right">
                    {formatDate(mark.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <Separator className="my-8" />

      {/* Sección: Mis Jugadores */}
      <section aria-labelledby="players-heading">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-500" aria-hidden="true" />
            </div>
            <div>
              <h2 id="players-heading" className="text-2xl font-bold">
                Mis Jugadores
              </h2>
              <p className="text-sm text-muted-foreground">
                {totalPlayers > 0
                  ? `Mostrando top 10 de ${totalPlayers} jugadores por puntos`
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

        <PlayersSectionClient
          initialPlayers={players}
          categories={categories}
          organizationId={organizationId}
          canResolvePlayerIdentity={canResolvePlayerIdentity}
          totalPlayers={totalPlayers}
        />
      </section>
    </div>
  )
}
