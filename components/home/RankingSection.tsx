import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Trophy, ArrowRight } from "lucide-react"
import Link from "next/link"
import { getTopPlayers } from "@/app/api/users"
import PlayerAvatar from "@/components/player-avatar"
import WeeklyPointsBadge from "@/components/ui/weekly-points-badge"
import { Player } from "@/types"
import { getCategoryColor } from "@/lib/utils/category-colors"

interface TopPlayer {
  id: string
  name: string
  points: number
  category: string
  club: string
  position: number
  profileImage?: string
  weeklyPoints: number
}

export async function RankingSection() {
  const players = await getTopPlayers(5) // Solo traer los 5 mejores

  // Ya vienen ordenados y limitados a 5 desde la DB, solo mapeamos
  const topPlayers: TopPlayer[] = players.map((player: any, index: number) => ({
    id: player.id,
    name: `${player.firstName} ${player.lastName}`,
    points: player.score,
    category: player.category,
    club: player.club_name || "Sin Club",
    position: index + 1,
    profileImage: player.profileImage,
    weeklyPoints: player.weeklyPoints || 0
  }))

  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Ranking Nacional en Tiempo Real</h2>
          <p className="text-slate-600">Registrate, participá de torneos y empezá a sumar puntos para subir de categoría.
          Competí con jugadores de tu nivel y seguí tu progreso en el ranking.</p>
        </div>

        <div className="max-w-4xl mx-auto">
          <Card className="border-slate-200 shadow-lg">
            <CardContent className="p-0">
              <div className="bg-slate-900 text-white p-4 rounded-t-surface">
                <h3 className="text-lg font-bold flex items-center">
                  <Trophy className="mr-2 h-5 w-5 text-amber-400" />
                  Top 5 Nacional
                </h3>
              </div>

              <div className="divide-y divide-slate-100">
                {topPlayers.map((player: TopPlayer, index: number) => (
                  <Link key={player.id} href={`/ranking/${player.id}`} className="block">
                    <div
                      className={`p-4 flex items-center justify-between hover:bg-slate-50 transition-all duration-300 cursor-pointer ${
                        index < 3 ? "hover:shadow-md" : ""
                      }`}
                    >
                      <div className="flex items-center space-x-4">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shadow-sm ${
                            index === 0
                              ? "bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-200"
                              : index === 1
                                ? "bg-gradient-to-br from-slate-400 to-slate-600 shadow-slate-200"
                                : index === 2
                                  ? "bg-gradient-to-br from-amber-500 to-amber-700 shadow-amber-100"
                                  : "bg-slate-300"
                          }`}
                        >
                          {index < 3 ? <Trophy className="h-4 w-4" /> : index + 1}
                        </div>

                        <PlayerAvatar
                          src={player.profileImage}
                          alt={player.name}
                          className={`w-10 h-10 ${index < 3 ? "ring-2 ring-blue-200" : ""}`}
                        />

                        <div>
                          <div className="font-semibold text-slate-900">{player.name}</div>
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline" className={`text-xs ${getCategoryColor(player.category)}`}>
                              {player.category && player.category !== "Sin categoria" 
                                ? `${player.category}` 
                                : "Sin categoria"
                              }
                            </Badge>
                            <span className="text-xs text-slate-500">{player.club}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <WeeklyPointsBadge points={player.weeklyPoints} />
                            <div className="font-bold text-slate-900">{player.points}</div>
                          </div>
                          <div className="text-xs text-slate-500">puntos</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="p-4 bg-slate-50 border-t">
                <Button asChild variant="outline" className="w-full border-blue-200 text-blue-600 hover:bg-blue-50">
                  <Link href="/ranking">
                    Ver Ranking Completo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
} 