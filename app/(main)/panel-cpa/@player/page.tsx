import { createClient } from "@/utils/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { User, Trophy, Calendar, MapPin, Users, Edit, Clock, Swords, Target, Navigation } from "lucide-react"
import Link from "next/link"
import { getPlayerDashboardData, getPlayerInscribedTournaments, getPlayerUpcomingTournaments } from "@/app/api/panel/actions"
import { InscribedTournamentsCard } from "./components/inscribed-tournaments-card"
import { getCategoryColor } from "@/lib/utils/category-colors"
import { isTournamentGenderFilter } from "@/lib/tournaments/gender-filtering"
import { buildGoogleMapsSearchUrl } from "@/lib/maps/google-maps"

interface PlayerDashboardPageProps {
  searchParams?: Promise<{
    upcomingGender?: string
  }>
}

export default async function PlayerDashboard({ searchParams }: PlayerDashboardPageProps) {
  const supabase = await createClient()
  const params = searchParams ? await searchParams : {}
  const upcomingGenderFilter = isTournamentGenderFilter(params.upcomingGender)
    ? params.upcomingGender
    : undefined

  // Use getUser() for secure authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <div>No autorizado</div>
  }

  // Verificar que el usuario sea PLAYER antes de ejecutar queries
  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()

  // Early return si no es PLAYER - evita queries innecesarias en otros roles
  if (userData?.role !== "PLAYER") {
    return null
  }

  // 🚀 OPTIMIZACIÓN FASE 5: Todas las consultas via Edge Functions
  const { playerData, playerRanking, nextMatches, error } = await getPlayerDashboardData(user.id)

  // Obtener torneos inscritos usando Edge Function optimizada
  const { inscribedTournaments } = playerData?.id
    ? await getPlayerInscribedTournaments(playerData.id)
    : { inscribedTournaments: [] }

  // Obtener próximos torneos usando Edge Function optimizada
  const { upcomingTournaments } = playerData?.id
    ? await getPlayerUpcomingTournaments(playerData.id, {
        genderFilter: upcomingGenderFilter,
        playerGender: playerData.gender ?? null,
      })
    : { upcomingTournaments: [] }

  // Format date with day of week and time
  const formatDateWithTime = (dateString: string, timeString?: string) => {
    // Parse date in local timezone to avoid UTC conversion issues
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number)
    const date = new Date(year, month - 1, day)

    const dayName = date.toLocaleDateString("es-ES", { weekday: 'long' })
    const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1)
    const dateStr = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}`

    if (timeString) {
      // Extract hour and minutes from time string (format: "HH:MM:SS")
      const [hour, minute] = timeString.split(':')
      return `${capitalizedDay} ${dateStr} ${hour}:${minute}hs`
    }

    return `${capitalizedDay} ${dateStr}`
  }

  // Format date function for DATE fields (without time)
  const formatDate = (dateString: string) => {
    // Parse date in local timezone to avoid UTC conversion issues
    // DATE fields come as "YYYY-MM-DD" without timezone info
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number)
    const date = new Date(year, month - 1, day)

    return date.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric"
    })
  }

  // Format round name
  const formatRound = (round?: string) => {
    if (!round) return null
    const roundNames: Record<string, string> = {
      'ZONE': 'Zona',
      '32VOS': '32vos',
      '16VOS': '16vos',
      '8VOS': 'Octavos',
      '4TOS': 'Cuartos',
      'SEMIFINAL': 'Semifinal',
      'FINAL': 'Final'
    }
    return roundNames[round] || round
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-3">Mi Panel</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Bienvenido, <span className="font-semibold text-green-600">{playerData?.first_name || "Jugador"}</span>. 
            Gestiona tu perfil y mantente al día con los torneos.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* MI PERFIL */}
        <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-t-surface">
            <CardTitle className="flex items-center text-white text-lg font-bold">
              <User className="mr-3 h-6 w-6" />
              Mi Perfil
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            <div className="flex items-center space-x-3">
              <Avatar className="h-12 w-12">
                <AvatarImage 
                  src={playerData?.profile_image_url || ""} 
                  alt={`${playerData?.first_name || "Usuario"} ${playerData?.last_name || ""}`}
                />
                <AvatarFallback className="bg-padel-green-100 text-padel-green-700">
                  {playerData?.first_name?.[0] || "U"}
                  {playerData?.last_name?.[0] || ""}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-gray-900">
                  {playerData?.first_name || "Nombre"} {playerData?.last_name || "Apellido"}
                </p>
                <p className="text-sm text-gray-600">
                  {playerData?.clubes?.[0]?.name || "Sin club"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {playerData?.category_name && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Categoria:</span>
                  <Badge variant="outline" className={getCategoryColor(playerData.category_name)}>
                    {playerData.category_name}
                  </Badge>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Puntaje:</span>
                {playerData?.score && playerData.score > 0 ? (
                  <span className="font-semibold text-padel-green-700">{playerData.score} pts</span>
                ) : (
                  <span className="text-sm text-gray-500 italic">Todavía no tenés puntos</span>
                )}
              </div>
            </div>

            <Link href="/edit-profile" className="block">
              <Button className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold py-3 rounded-surface shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105">
                <Edit className="mr-2 h-5 w-5" />
                Editar Perfil
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* MI RANKING */}
        <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-t-surface">
            <CardTitle className="flex items-center text-white text-lg font-bold">
              <Trophy className="mr-3 h-6 w-6" />
              Mi Ranking
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            {playerData?.score && playerData.score > 0 && playerRanking ? (
              <>
                <div className="text-center bg-gradient-to-br from-yellow-50 to-orange-50 p-6 rounded-elevated border border-yellow-200">
                  <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-600 to-orange-600">
                    #{playerRanking.position}
                  </div>
                  <p className="text-sm text-gray-600 font-medium">
                    de {playerRanking.total} jugadores
                  </p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Puntaje actual:</span>
                    <span className="font-semibold text-padel-green-700">{playerData.score} pts</span>
                  </div>
                  {playerData.category_name && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Categoría:</span>
                      <Badge variant="outline" className="bg-padel-green-50 text-padel-green-700 border-padel-green-200">
                        {playerData.category_name}
                      </Badge>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-elevated border border-gray-200">
                <Trophy className="mx-auto h-16 w-16 text-gray-300 mb-4" />
                <p className="text-gray-600 text-sm font-medium">
                  Juega un torneo para aparecer en el ranking
                </p>
              </div>
            )}

            <Link href="/ranking" className="block">
              <Button 
                variant="outline" 
                className="w-full border-2 border-yellow-400 text-yellow-700 hover:bg-gradient-to-r hover:from-yellow-400 hover:to-orange-400 hover:text-white font-semibold py-3 rounded-surface shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105"
              >
                <Trophy className="mr-2 h-5 w-5" />
                Ver Ranking Completo
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* MIS PRÓXIMOS PARTIDOS */}
        <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-4 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-t-surface">
            <CardTitle className="flex items-center text-white text-lg font-bold">
              <Swords className="mr-3 h-6 w-6" />
              {nextMatches && nextMatches.length > 1 ? 'Mis Próximos Partidos' : 'Mi Próximo Partido'}
              {nextMatches && nextMatches.length > 0 && (
                <Badge variant="outline" className="ml-2 bg-white/20 text-white border-white/40">
                  {nextMatches.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            {nextMatches && nextMatches.length > 0 ? (
              <div className="space-y-4">
                {nextMatches.map((match, index) => (
                  <div key={match.match_id} className="bg-gradient-to-br from-red-50 to-pink-50 border border-red-200 rounded-elevated p-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-semibold text-gray-900">{match.tournament_name}</h4>
                          {index === 0 && nextMatches.length > 1 && (
                            <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 text-xs">
                              Próximo
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {match.round && (
                            <Badge
                              variant="outline"
                              className="bg-purple-50 text-purple-700 border-purple-200"
                            >
                              {formatRound(match.round)}
                            </Badge>
                          )}
                          {match.status === 'IN_PROGRESS' && (
                            <Badge
                              variant="outline"
                              className="bg-green-50 text-green-700 border-green-200"
                            >
                              En Progreso
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center text-sm">
                          <Users className="mr-2 h-4 w-4 text-gray-500" />
                          <span className="text-gray-600">Compañero:</span>
                          <span className="ml-2 font-medium text-gray-900">{match.partner_name}</span>
                        </div>

                        <div className="flex items-center text-sm">
                          <Swords className="mr-2 h-4 w-4 text-gray-500" />
                          <span className="text-gray-600">Rivales:</span>
                          <span className="ml-2 font-medium text-gray-900">
                            {match.opponent_names.join(' & ')}
                          </span>
                        </div>

                        {match.scheduled_info.date && (
                          <div className="flex items-center text-sm">
                            <Calendar className="mr-2 h-4 w-4 text-gray-500" />
                            <span className="text-gray-600">Fecha:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {formatDateWithTime(match.scheduled_info.date, match.scheduled_info.time)}
                            </span>
                          </div>
                        )}

                        {match.scheduled_info.court && (
                          <div className="flex items-center text-sm">
                            <MapPin className="mr-2 h-4 w-4 text-gray-500" />
                            <span className="text-gray-600">Cancha:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {match.scheduled_info.court}
                            </span>
                          </div>
                        )}

                        {match.club_name && (
                          <div className="flex items-center text-sm">
                            <MapPin className="mr-2 h-4 w-4 text-gray-500" />
                            <span className="text-gray-600">Club:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {match.club_name}
                            </span>
                          </div>
                        )}

                        {match.club_address && (
                          <div className="flex items-center text-sm">
                            <MapPin className="mr-2 h-4 w-4 text-gray-500" />
                            <span className="text-gray-600">Dirección:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {match.club_address}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <Link href={`/tournaments/${match.tournament_id}`} className="block mt-4">
                        <Button className="w-full bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white font-semibold py-2 rounded-surface shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105">
                          <Trophy className="mr-2 h-4 w-4" />
                          Ver Torneo
                        </Button>
                      </Link>
                      {(match.club_maps_url || buildGoogleMapsSearchUrl({ name: match.club_name, address: match.club_address })) ? (
                        <Button asChild variant="outline" className="w-full border-red-200 text-red-700 hover:bg-red-50">
                          <a
                            href={match.club_maps_url || buildGoogleMapsSearchUrl({ name: match.club_name, address: match.club_address }) || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Navigation className="mr-2 h-4 w-4" />
                            Como llegar
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gradient-to-br from-red-50 to-pink-50 rounded-elevated border border-red-200">
                <Swords className="mx-auto h-16 w-16 text-red-300 mb-4" />
                <p className="text-gray-700 text-sm font-medium mb-2">
                  No tenés partidos pendientes
                </p>
                <p className="text-gray-500 text-xs">
                  Inscribite a un torneo para ver tus próximos partidos
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* PRÓXIMOS TORNEOS */}
        <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-t-surface">
            <CardTitle className="flex items-center text-white text-lg font-bold">
              <Calendar className="mr-3 h-6 w-6" />
              Próximos Torneos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            {upcomingTournaments && upcomingTournaments.length > 0 ? (
              <div className="space-y-3">
                {upcomingTournaments.map((tournament) => {
                  return (
                    <Link key={tournament.id} href={`/tournaments/${tournament.id}`} className="block">
                      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-elevated p-4 hover:shadow-md transition-all duration-300 hover:scale-102 cursor-pointer hover:bg-gradient-to-r hover:from-blue-100 hover:to-purple-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-gray-900 text-sm">{tournament.name}</h4>
                          {tournament.is_inscribed && (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                              Inscrito
                            </Badge>
                          )}
                          {tournament.is_full && !tournament.is_inscribed && (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                              Completo
                            </Badge>
                          )}
                        </div>

                        <div className="space-y-1 text-xs text-gray-600">
                          {tournament.start_date && (
                            <div className="flex items-center">
                              <Calendar className="mr-1 h-3 w-3" />
                              {formatDate(tournament.start_date)}
                            </div>
                          )}
                          {tournament.club?.name && (
                            <div className="flex items-center">
                              <MapPin className="mr-1 h-3 w-3" />
                              {tournament.club.name}
                            </div>
                          )}
                          {tournament.category_name && (
                            <div className="flex items-center">
                              <Trophy className="mr-1 h-3 w-3" />
                              Categoría {tournament.category_name}
                            </div>
                          )}
                          {tournament.max_participants && (
                            <div className="flex items-center">
                              <Users className="mr-1 h-3 w-3" />
                              {tournament.current_inscriptions}/{tournament.max_participants} inscritos
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
                         ) : (
               <div className="text-center py-8 bg-gradient-to-br from-blue-50 to-purple-50 rounded-elevated border border-blue-200">
                 <Calendar className="mx-auto h-16 w-16 text-blue-300 mb-4" />
                 <p className="text-gray-700 text-sm font-medium mb-2">
                   No hay torneos próximos disponibles
                 </p>
                 <p className="text-gray-500 text-xs">
                   Revisa la sección de torneos para encontrar competencias
                 </p>
               </div>
             )}

            <Link href="/torneos" className="block">
              <Button className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3 rounded-surface shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105">
                <Users className="mr-2 h-5 w-5" />
                Buscar Torneos
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* MIS TORNEOS INSCRITOS */}
        <InscribedTournamentsCard
          inscribedTournaments={inscribedTournaments}
        />
      </div>
      </div>
    </div>
  )
}
