"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Trophy, Medal, Star, ChevronRight, Shield, Crown, Zap, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { getCategoryColor } from "@/lib/utils/category-colors"

export default function TopPlayersSection() {
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null)

  const topPlayers = [
    {
      id: "1",
      firstName: "Carlos",
      lastName: "Martínez",
      category: "1ª",
      score: 980,
      club: "Club Padel Madrid",
      trend: 2,
      winRate: 92,
      avatar: "/placeholder.svg?height=80&width=80",
    },
    {
      id: "2",
      firstName: "Laura",
      lastName: "Sánchez",
      category: "1ª",
      score: 965,
      club: "Padel Indoor Barcelona",
      trend: 1,
      winRate: 89,
      avatar: "/placeholder.svg?height=80&width=80",
    },
    {
      id: "3",
      firstName: "Javier",
      lastName: "Rodríguez",
      category: "1ª",
      score: 940,
      club: "Club Padel Valencia",
      trend: -1,
      winRate: 86,
      avatar: "/placeholder.svg?height=80&width=80",
    },
    {
      id: "4",
      firstName: "Ana",
      lastName: "García",
      category: "2ª",
      score: 920,
      club: "Padel Club Sevilla",
      trend: 3,
      winRate: 84,
      avatar: "/placeholder.svg?height=80&width=80",
    },
    {
      id: "5",
      firstName: "Miguel",
      lastName: "López",
      category: "2ª",
      score: 905,
      club: "Madrid Padel Center",
      trend: 0,
      winRate: 82,
      avatar: "/placeholder.svg?height=80&width=80",
    },
  ]

  const topPairs = [
    {
      id: "1",
      player1: "Carlos Martínez",
      player2: "Miguel López",
      points: 1250,
      trend: "+15",
      club: "Madrid Elite",
      matches: 24,
      chemistry: 95,
    },
    {
      id: "2",
      player1: "Laura Sánchez",
      player2: "Ana García",
      points: 1180,
      trend: "+8",
      club: "Barcelona Pro",
      matches: 18,
      chemistry: 92,
    },
    {
      id: "3",
      player1: "Javier Torres",
      player2: "Pablo Ruiz",
      points: 1145,
      trend: "+12",
      club: "Valencia Center",
      matches: 21,
      chemistry: 88,
    },
  ]


  const getMedalIcon = (index: number) => {
    switch (index) {
      case 0:
        return (
          <div className="relative">
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
            <div className="bg-gradient-to-br from-yellow-400 via-yellow-500 to-amber-600 w-12 h-12 rounded-display flex items-center justify-center shadow-xl">
              <Crown className="h-6 w-6 text-white drop-shadow-sm" />
            </div>
          </div>
        )
      case 1:
        return (
          <div className="bg-gradient-to-br from-slate-300 via-slate-400 to-slate-500 w-10 h-10 rounded-elevated flex items-center justify-center shadow-lg">
            <Medal className="h-5 w-5 text-white" />
          </div>
        )
      case 2:
        return (
          <div className="bg-gradient-to-br from-amber-600 via-amber-700 to-amber-800 w-9 h-9 rounded-surface flex items-center justify-center shadow-md">
            <Medal className="h-4 w-4 text-white" />
          </div>
        )
      default:
        return (
          <div className="w-8 h-8 rounded-surface bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-700 font-bold text-sm border border-gray-300">
            {index + 1}
          </div>
        )
    }
  }

  const getTrendIcon = (trend: number | string) => {
    if (typeof trend === "number") {
      if (trend > 0) {
        return (
          <div className="flex items-center text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
            <TrendingUp className="h-3 w-3 mr-1" />
            <span className="text-xs font-bold">+{trend}</span>
          </div>
        )
      } else if (trend < 0) {
        return (
          <div className="flex items-center text-rose-600 bg-rose-50 px-2 py-1 rounded-full">
            <TrendingUp className="h-3 w-3 mr-1 rotate-180" />
            <span className="text-xs font-bold">{trend}</span>
          </div>
        )
      } else {
        return (
          <div className="text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
            <span className="text-xs">-</span>
          </div>
        )
      }
    } else {
      return (
        <div className="flex items-center text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
          <TrendingUp className="h-3 w-3 mr-1" />
          <span className="text-xs font-bold">{trend}</span>
        </div>
      )
    }
  }

  return (
    <section className="py-20 md:py-28 bg-white relative overflow-hidden">
      {/* Efectos de fondo */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-100/20 via-transparent to-blue-200/20"></div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <Badge className="mb-6 px-4 py-2 bg-blue-100 text-blue-600 border-blue-200">
            <Trophy className="mr-2 h-4 w-4" />
            Ranking Elite
          </Badge>
          <h2 className="text-4xl md:text-6xl font-black text-gray-800 mb-6">Los Mejores del Pádel</h2>
          <p className="text-gray-600 text-xl max-w-3xl mx-auto leading-relaxed">
            Conoce a los jugadores y parejas que están redefiniendo los límites del pádel profesional.
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          <Tabs
            defaultValue="individual"
            className="bg-white rounded-display-lg shadow-xl border border-gray-200 overflow-hidden"
          >
            <TabsList className="w-full border-b border-gray-200 bg-gray-50 p-2">
              <TabsTrigger
                value="individual"
                className="flex-1 py-4 px-6 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-display transition-all duration-300"
              >
                <Trophy className="mr-3 h-5 w-5" />
                <span className="font-semibold">Ranking Individual</span>
              </TabsTrigger>
              <TabsTrigger
                value="pairs"
                className="flex-1 py-4 px-6 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-display transition-all duration-300"
              >
                <Shield className="mr-3 h-5 w-5" />
                <span className="font-semibold">Ranking de Parejas</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="individual" className="p-0">
              <div className="divide-y divide-gray-100">
                {topPlayers.map((player, index) => (
                  <Link
                    key={player.id}
                    href={`/players/${player.id}`}
                    className="block transition-all duration-300"
                    onMouseEnter={() => setHoveredPlayer(player.id)}
                    onMouseLeave={() => setHoveredPlayer(null)}
                  >
                    <div
                      className={`p-6 flex items-center justify-between transition-all duration-300 ${
                        hoveredPlayer === player.id ? "bg-blue-50" : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center space-x-6">
                        <div className="flex-shrink-0">{getMedalIcon(index)}</div>

                        <div className="flex items-center space-x-4">
                          <div className="relative">
                            <img
                              src={player.avatar || "/placeholder.svg"}
                              alt={`${player.firstName} ${player.lastName}`}
                              className="w-16 h-16 rounded-display object-cover border-2 border-white shadow-lg"
                            />
                            {index < 3 && (
                              <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center">
                                <Star className="h-3 w-3 text-white fill-white" />
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center space-x-3">
                              <h3 className="text-xl font-bold text-gray-800">
                                {player.firstName} {player.lastName}
                              </h3>
                              {index === 0 && (
                                <Badge className="bg-gradient-to-r from-amber-400 to-amber-500 text-white shadow-md">
                                  <Crown className="h-3 w-3 mr-1" />
                                  Líder
                                </Badge>
                              )}
                            </div>
                            <p className="text-gray-600 font-medium">{player.club}</p>
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge variant="outline" className="bg-gray-50 text-gray-700 text-xs">
                                Win Rate: {player.winRate}%
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <Badge className={`${getCategoryColor(player.category, 'gradient')} text-white shadow-md`}>{player.category}</Badge>

                        <div className="text-center">
                          <div className="bg-blue-600 text-white font-black text-lg rounded-display w-16 h-16 flex items-center justify-center shadow-lg">
                            {player.score}
                          </div>
                          <div className="mt-2 flex justify-center">{getTrendIcon(player.trend)}</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-center">
                <Button
                  asChild
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 rounded-elevated px-6 py-3"
                >
                  <Link href="/ranking" className="flex items-center">
                    <Zap className="mr-2 h-4 w-4" />
                    Ver Ranking Completo
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="pairs" className="p-0">
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-gray-800 mb-4">Duplas Legendarias</h2>
                <p className="text-gray-600">Las parejas que han encontrado la química perfecta en la pista</p>
              </div>

              <div className="max-w-4xl mx-auto">
                <Card className="bg-white border-gray-200 shadow-sm">
                  <CardContent className="p-0">
                    {topPairs.map((pair, index) => (
                      <div
                        key={pair.id}
                        className="flex items-center justify-between p-6 border-b border-gray-100 last:border-b-0 hover:bg-blue-50/30 transition-colors"
                      >
                        <div className="flex items-center space-x-4">
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center font-medium text-white ${
                              index === 0 ? "bg-blue-600" : index === 1 ? "bg-blue-500" : "bg-blue-400"
                            }`}
                          >
                            {index + 1}
                          </div>
                          <div>
                            <h3 className="text-lg font-medium text-gray-800">
                              {pair.player1} & {pair.player2}
                            </h3>
                            <div className="flex items-center space-x-4 text-gray-500 text-sm">
                              <span>{pair.club}</span>
                              <span>•</span>
                              <span>{pair.matches} partidos juntos</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-4">
                          <div className="text-center">
                            <div className="text-sm font-medium text-gray-800">{pair.chemistry}%</div>
                            <div className="text-xs text-gray-500">Química</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-bold text-gray-800">{pair.points}</div>
                            <div className="text-xs text-gray-500">puntos</div>
                          </div>
                          <Badge className="bg-blue-100 text-blue-600 border-0">{pair.trend}</Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <div className="text-center mt-8">
                  <Button
                    variant="outline"
                    className="border-blue-200 text-blue-600 hover:bg-blue-50 px-6 py-3 text-base"
                  >
                    Ver ranking de duplas
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </section>
  )
}
