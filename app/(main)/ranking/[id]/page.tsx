import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Calendar,
  MapPin,
  Instagram,
  User,
  Clock,
  Swords,
  Activity,
  Hand,
  CircleUser,
  ChevronLeft,
  Zap,
  MessageCircle,
} from "lucide-react"
import { notFound } from "next/navigation"
import { getPlayerProfile } from "@/app/api/users"
import { getPlayerWeeklyPoints } from "@/app/api/tournaments/actions"
import { getCategoryColor } from "@/lib/utils/category-colors"

export default async function PlayerProfilePage({ params }: { params: { id: string } }) {
  const resolvedParams = await params;
  const [playerData, weeklyPointsResult] = await Promise.all([
    getPlayerProfile(resolvedParams.id),
    getPlayerWeeklyPoints(resolvedParams.id)
  ]);

  console.log("🎯 PlayerProfilePage - Received playerData:", playerData);
  console.log("🖼️ PlayerProfilePage - profileImage value:", playerData?.profileImage);
  console.log("📊 PlayerProfilePage - Weekly points:", weeklyPointsResult);

  if (!playerData) {
    notFound()
  }

  const weeklyPoints = weeklyPointsResult.success ? weeklyPointsResult.pointsThisWeek : 0;

  // Default gallery images for fallback
  const defaultGallery = [
    "/placeholder.svg?height=200&width=300",
    "/placeholder.svg?height=200&width=300",
    "/placeholder.svg?height=200&width=300",
  ]

  const galleryImages = playerData.gallery && playerData.gallery.length > 0 ? playerData.gallery : defaultGallery

  return (
    <div className="min-h-screen bg-white">
      {/* Header space */}
      <div className="h-4"></div>

      <div className="container mx-auto px-6 py-2">
        <div className="mb-6">
          <Link
            href="/ranking"
            className="inline-flex items-center text-gray-600 hover:text-blue-600 transition-colors"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Volver al ranking
          </Link>
        </div>

        {/* Player Header */}
        <div className="relative mb-8 items-center justify-center">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="relative">
              <img
                src={playerData.profileImage || "/placeholder.svg?height=128&width=128"}
                alt={playerData.name}
                className="w-32 h-32 rounded-surface object-cover shadow-sm border border-gray-200"
              />
              <Badge
                className={`absolute -top-3 -right-3 ${
                  playerData.status === "active" ? "bg-green-500" : "bg-gray-500"
                }`}
              >
                {playerData.status === "active" ? "Activo" : "Inactivo"}
              </Badge>
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Badge className="px-3 py-1 bg-blue-600 text-white">
                  Ranking #{playerData.ranking.current || "N/A"}
                </Badge>
                {playerData.ranking.variation !== 0 && (
                  <Badge
                    className={`px-3 py-1 ${
                      playerData.ranking.isPositive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {playerData.ranking.isPositive ? (
                      <TrendingUp className="h-4 w-4 mr-1" />
                    ) : (
                      <TrendingDown className="h-4 w-4 mr-1" />
                    )}
                    {Math.abs(playerData.ranking.variation)} posiciones
                  </Badge>
                )}
              </div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">{playerData.name}</h1>
              <div className="flex flex-wrap gap-4 text-gray-600">
                {playerData.age && (
                  <span className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {playerData.age} años
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Hand className="h-4 w-4" />
                  {playerData.dominantHand === "LEFT" ? "Zurdo" : "Derecho"}
                </span>
                {playerData.preferredSide && (
                  <span className="flex items-center gap-1">
                    <Swords className="h-4 w-4" />
                    {playerData.preferredSide === "DRIVE" ? "Drive" : "Revés"}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Desde {new Date(playerData.circuitJoinDate).toLocaleDateString()}
                </span>
                {playerData.score && (
                  <span className="flex items-center gap-1">
                    <Trophy className="h-4 w-4" />
                    {playerData.score} puntos
                  </span>
                )}
              </div>
              
              {/* Player Description */}
              {playerData.description && (
                <div className="mt-4 p-4 bg-blue-50 rounded-surface border border-blue-200">
                  <div className="flex items-start gap-2">
                    <MessageCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-gray-700 text-sm italic leading-relaxed">
                      "{playerData.description}"
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Stats Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Weekly Points Card */}
              <Card className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-green-600 text-white p-2 rounded-surface">
                    <Zap className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-gray-800">Esta Semana</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Puntos ganados</span>
                    <span className={`font-bold text-lg ${weeklyPoints > 0 ? 'text-green-600' : weeklyPoints < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      {weeklyPoints > 0 ? '+' : ''}{weeklyPoints}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {weeklyPoints > 0 ? '¡Excelente semana!' : weeklyPoints < 0 ? 'Sigue intentando' : 'Sin actividad esta semana'}
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-white border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-blue-600 text-white p-2 rounded-surface">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-gray-800">Torneos</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Disputados</span>
                    <span className="font-semibold text-gray-800">{playerData.stats.tournamentsPlayed}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Inscripto a</span>
                    <span className="font-semibold text-blue-600">{playerData.stats.upcomingTournaments}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Finales jugadas</span>
                    <span className="font-semibold text-gray-800">{playerData.stats.finals.played}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Finales ganadas</span>
                    <span className="font-semibold text-gray-800">{playerData.stats.finals.won}</span>
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-white border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-blue-600 text-white p-2 rounded-surface">
                    <Activity className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-gray-800">Rendimiento</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Partidos jugados</span>
                    <span className="font-semibold text-gray-800">{playerData.stats.matchesPlayed}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">% Victorias</span>
                    <span className="font-semibold text-gray-800">{playerData.stats.winRate}%</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Last Tournament */}
            {playerData.lastTournament && (
              <Card className="p-6 bg-white border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-800">Último Torneo</h3>
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-medium text-gray-800">{playerData.lastTournament.name}</p>
                  <p className="text-gray-600">{new Date(playerData.lastTournament.date).toLocaleDateString()}</p>
                </div>
              </Card>
            )}

            {/* Head to Head Section */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Swords className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-gray-800">Head to Head</h3>
              </div>
              <Card className="p-6 bg-white border-gray-200 shadow-sm">
                <p className="text-gray-600">Historial contra otros jugadores próximamente...</p>
              </Card>
            </div>
          </div>

          {/* Side Column */}
          <div className="space-y-8">
            {/* Contact Information */}
            <Card className="p-6 bg-white border-gray-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <CircleUser className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-gray-800">Información de Contacto</h3>
              </div>
              <div className="space-y-4">
                {playerData.contact.instagram && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <Instagram className="h-4 w-4" />
                    <span>{playerData.contact.instagram}</span>
                  </div>
                )}
                {playerData.contact.address && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <MapPin className="h-4 w-4" />
                    <span>{playerData.contact.address}</span>
                  </div>
                )}
                {playerData.club && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <Trophy className="h-4 w-4" />
                    <span>Club: {playerData.club.name}</span>
                  </div>
                )}
                {playerData.category && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <span>Categoria:</span>
                    <Badge variant="outline" className={getCategoryColor(playerData.category)}>
                      {playerData.category}
                    </Badge>
                  </div>
                )}
              </div>
            </Card>

            {/* Gallery Preview */}
            <Card className="p-6 bg-white border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">Galería</h3>
                <Button variant="ghost" className="text-blue-600 hover:text-blue-700">
                  Ver todas
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {galleryImages.slice(0, 3).map((image: string, index: number) => (
                  <img
                    key={index}
                    src={image || "/placeholder.svg"}
                    alt={`Galería ${index + 1}`}
                    className="w-full h-24 object-cover rounded-surface"
                  />
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
