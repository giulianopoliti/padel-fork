import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { getClubTournamentsWithMetrics } from "@/app/api/tournaments/actions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Trophy, BarChart3, TrendingUp, Calendar, Target, CheckCircle2, XCircle } from "lucide-react"
import Link from "next/link"
import TournamentCard from "@/app/(main)/panel/@organizador/components/tournament-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DuplicateTournamentDialog } from "./components/duplicate-tournament-dialog"
import { RestoreTournamentButton } from "./components/restore-tournament-button"

// Componente de carga para usar con Suspense
function TournamentsLoading() {
  return (
    <div className="space-y-8">
      <div className="bg-white rounded-elevated border border-gray-200 p-8">
        <div className="flex justify-between items-center">
          <div className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-12 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-[200px] w-full" />
        ))}
      </div>
    </div>
  )
}

function TournamentCardWithDuplicate({
  tournament,
  priority,
}: {
  tournament: NonNullable<Awaited<ReturnType<typeof getClubTournamentsWithMetrics>>["tournaments"]>[number]
  priority: boolean
}) {
  return (
    <div className="relative">
      <TournamentCard
        tournament={tournament}
        priority={priority}
      />
      {(tournament.type === "LONG" || tournament.type === "AMERICAN") && (
        <div className="absolute bottom-4 right-4 z-20">
          <DuplicateTournamentDialog
            tournamentId={tournament.id}
            tournamentName={tournament.name}
          />
        </div>
      )}
      {tournament.status === "CANCELED" && (
        <div className="absolute bottom-4 left-4 z-20">
          <RestoreTournamentButton
            tournamentId={tournament.id}
            tournamentName={tournament.name}
          />
        </div>
      )}
    </div>
  )
}

// Componente principal (renderizado en el servidor)
export default async function MyTournamentsPage() {
  const result = await getClubTournamentsWithMetrics(undefined, 999)
  const tournaments = (result.tournaments || []) as NonNullable<typeof result.tournaments>

  // Agrupar torneos por estado según el orden definido
  const upcomingTournaments = tournaments.filter((t) =>
    t.status === "NOT_STARTED" || t.status === "ZONE_REGISTRATION"
  )
  const zonePhaseTournaments = tournaments.filter((t) => t.status === "ZONE_PHASE")
  const bracketPhaseTournaments = tournaments.filter((t) => t.status === "BRACKET_PHASE")
  const finishedTournaments = tournaments.filter((t) =>
    t.status === "FINISHED" ||
    t.status === "FINISHED_POINTS_PENDING" ||
    t.status === "FINISHED_POINTS_CALCULATED"
  )
  const canceledTournaments = tournaments.filter((t) => t.status === "CANCELED")

  const totalTournaments = tournaments.length
  const activeTournaments = zonePhaseTournaments.length + bracketPhaseTournaments.length

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-8">
        <Suspense fallback={<TournamentsLoading />}>
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Header Section */}
            <div className="bg-white rounded-elevated border border-gray-200 shadow-sm">
              <div className="p-8">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                  {/* Left side: Title and Description */}
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="bg-slate-100 p-3 rounded-elevated">
                        <Trophy className="h-7 w-7 text-slate-600" />
                      </div>
                      <div>
                        <h1 className="text-3xl font-bold text-slate-900">Mis Torneos</h1>
                        <p className="text-slate-600 mt-1">Gestiona todos tus torneos desde un solo lugar</p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-6 mt-6">
                      <div className="flex items-center gap-2">
                        <div className="bg-blue-100 p-2 rounded-surface">
                          <BarChart3 className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm text-slate-500">Total de torneos</p>
                          <p className="text-lg font-semibold text-slate-900">{totalTournaments}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="bg-emerald-100 p-2 rounded-surface">
                          <TrendingUp className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm text-slate-500">Activos</p>
                          <p className="text-lg font-semibold text-slate-900">{activeTournaments}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right side: Create Tournament Button */}
                  <div className="flex-shrink-0">
                    <Button
                      asChild
                      className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-elevated shadow-sm"
                    >
                      <Link href="/tournaments/create" className="flex items-center gap-2">
                        <Plus className="h-5 w-5" />
                        Crear Nuevo Torneo
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs Section */}
            <Tabs defaultValue="upcoming" className="w-full">
              <div className="w-full overflow-x-auto scrollbar-hide">
                <TabsList className="inline-flex w-full lg:w-auto">
                  <TabsTrigger value="upcoming" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0 data-[state=active]:border-b-2 data-[state=active]:border-blue-600">
                    <Calendar className="h-4 w-4" />
                    <span className="hidden sm:inline">Próximos</span>
                    <span className="sm:hidden">Próx.</span>
                    <Badge variant="secondary" className="ml-1">{upcomingTournaments.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="zones" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0 data-[state=active]:border-b-2 data-[state=active]:border-cyan-600">
                    <Target className="h-4 w-4" />
                    <span className="hidden sm:inline">Zonas</span>
                    <Badge variant="secondary" className="ml-1">{zonePhaseTournaments.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="brackets" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0 data-[state=active]:border-b-2 data-[state=active]:border-purple-600">
                    <Trophy className="h-4 w-4" />
                    <span className="hidden sm:inline">Llaves</span>
                    <Badge variant="secondary" className="ml-1">{bracketPhaseTournaments.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="finished" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0 data-[state=active]:border-b-2 data-[state=active]:border-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Finalizados</span>
                    <span className="sm:hidden">Final.</span>
                    <Badge variant="secondary" className="ml-1">{finishedTournaments.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="canceled" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0 data-[state=active]:border-b-2 data-[state=active]:border-red-600">
                    <XCircle className="h-4 w-4" />
                    <span className="hidden sm:inline">Cancelados</span>
                    <span className="sm:hidden">Canc.</span>
                    <Badge variant="secondary" className="ml-1">{canceledTournaments.length}</Badge>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Próximos Torneos */}
              <TabsContent value="upcoming" className="mt-8 space-y-4">
                {upcomingTournaments.length > 0 ? (
                  upcomingTournaments.map((tournament, index) => (
                    <TournamentCardWithDuplicate
                      key={tournament.id}
                      tournament={tournament}
                      priority={index === 0}
                    />
                  ))
                ) : (
                  <div className="bg-white rounded-surface border border-gray-200 p-12 text-center">
                    <Calendar className="h-12 w-12 text-blue-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay torneos programados</h3>
                    <p className="text-gray-500 mb-6">Crea un nuevo torneo para empezar a gestionar inscripciones y partidos</p>
                    <Button asChild>
                      <Link href="/tournaments/create" className="inline-flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Crear Torneo
                      </Link>
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Fase de Zonas */}
              <TabsContent value="zones" className="mt-8 space-y-4">
                {zonePhaseTournaments.length > 0 ? (
                  zonePhaseTournaments.map((tournament, index) => (
                    <TournamentCardWithDuplicate
                      key={tournament.id}
                      tournament={tournament}
                      priority={index === 0}
                    />
                  ))
                ) : (
                  <div className="bg-white rounded-surface border border-gray-200 p-12 text-center">
                    <Target className="h-12 w-12 text-cyan-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay torneos en fase de zonas</h3>
                    <p className="text-gray-500">Los torneos en fase de zonas aparecerán aquí</p>
                  </div>
                )}
              </TabsContent>

              {/* Fase de Llaves */}
              <TabsContent value="brackets" className="mt-8 space-y-4">
                {bracketPhaseTournaments.length > 0 ? (
                  bracketPhaseTournaments.map((tournament, index) => (
                    <TournamentCardWithDuplicate
                      key={tournament.id}
                      tournament={tournament}
                      priority={index === 0}
                    />
                  ))
                ) : (
                  <div className="bg-white rounded-surface border border-gray-200 p-12 text-center">
                    <Trophy className="h-12 w-12 text-purple-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay torneos en fase de llaves</h3>
                    <p className="text-gray-500">Los torneos en fase eliminatoria aparecerán aquí</p>
                  </div>
                )}
              </TabsContent>

              {/* Finalizados */}
              <TabsContent value="finished" className="mt-8 space-y-4">
                {finishedTournaments.length > 0 ? (
                  finishedTournaments.map((tournament, index) => (
                    <TournamentCardWithDuplicate
                      key={tournament.id}
                      tournament={tournament}
                      priority={index === 0}
                    />
                  ))
                ) : (
                  <div className="bg-white rounded-surface border border-gray-200 p-12 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay torneos finalizados</h3>
                    <p className="text-gray-500">Los torneos completados aparecerán aquí</p>
                  </div>
                )}
              </TabsContent>

              {/* Cancelados */}
              <TabsContent value="canceled" className="mt-8 space-y-4">
                {canceledTournaments.length > 0 ? (
                  canceledTournaments.map((tournament, index) => (
                    <TournamentCardWithDuplicate
                      key={tournament.id}
                      tournament={tournament}
                      priority={index === 0}
                    />
                  ))
                ) : (
                  <div className="bg-white rounded-surface border border-gray-200 p-12 text-center">
                    <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay torneos cancelados</h3>
                    <p className="text-gray-500">Los torneos cancelados aparecerán aquí</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </Suspense>
      </div>
    </div>
  )
}
