"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Trophy,
  Search,
  Users,
  TrendingUp,
  Star,
  MapPin,
  Settings,
  ChevronLeft,
  Crown,
  Award,
  BarChart3,
} from "lucide-react"
import Link from "next/link"
import PlayerAvatar from "@/components/player-avatar"
import { getCategoryColor } from "@/lib/utils/category-colors"

interface Player {
  id: string
  firstName: string
  lastName: string
  category: string
  score: number
  club_name?: string
  trend?: number
  winRate?: number
  matchesPlayed?: number
  profileImage?: string
  position: number
  preferredHand?: string
  gender?: string
}

interface Club {
  id: string
  name: string
  address?: string
  phone?: string
  email?: string
  courts?: number
}

interface ClubPlayersClientProps {
  club: Club
  players: Player[]
  totalScore: number
  isOwner: boolean
}

export default function ClubPlayersClient({ club, players, totalScore, isOwner }: ClubPlayersClientProps) {
  const [filteredPlayers, setFilteredPlayers] = useState(players)
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")

  const handleSearch = (term: string) => {
    setSearchTerm(term)
    applyFilters(term, categoryFilter)
  }

  const handleCategoryFilter = (category: string) => {
    setCategoryFilter(category)
    applyFilters(searchTerm, category)
  }

  const applyFilters = (term: string, category: string) => {
    let filtered = players

    if (term) {
      filtered = filtered.filter(
        (player) =>
          `${player.firstName} ${player.lastName}`.toLowerCase().includes(term.toLowerCase())
      )
    }

    if (category !== "all") {
      filtered = filtered.filter((player) => player.category === category)
    }

    setFilteredPlayers(filtered)
  }


  const getMedalIcon = (index: number) => {
    switch (index) {
      case 0:
        return (
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shadow-sm bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-200">
            <Crown className="h-4 w-4" />
          </div>
        )
      case 1:
        return (
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shadow-sm bg-gradient-to-br from-slate-400 to-slate-600 shadow-slate-200">
            <Trophy className="h-4 w-4" />
          </div>
        )
      case 2:
        return (
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shadow-sm bg-gradient-to-br from-amber-500 to-amber-700 shadow-amber-100">
            <Award className="h-4 w-4" />
          </div>
        )
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center text-slate-600 font-bold text-sm">
            {index + 1}
          </div>
        )
    }
  }

  const getTrendIcon = (trend: number) => {
    if (trend > 0) {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-0">
          <TrendingUp className="h-3 w-3 mr-1" />
          +{trend}
        </Badge>
      )
    } else if (trend < 0) {
      return (
        <Badge className="bg-red-100 text-red-700 border-0">
          <TrendingUp className="h-3 w-3 mr-1 rotate-180" />
          {trend}
        </Badge>
      )
    }
    return (
      <Badge className="bg-gray-100 text-gray-600 border-0">
        <span className="h-3 w-3 mr-1 inline-block">-</span>
        0
      </Badge>
    )
  }

  // Get unique categories
  const categories = Array.from(new Set(players.map(p => p.category))).filter(Boolean)

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Link href="/clubes" className="hover:text-slate-900">
          Clubes
        </Link>
        <span>/</span>
        <Link href={`/clubes/${club.id}`} className="hover:text-slate-900">
          {club.name}
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-medium">Jugadores</span>
      </div>

      {/* Header Section */}
      <div className="bg-white rounded-elevated border border-gray-200 shadow-sm">
        <div className="p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Left side: Club info */}
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-slate-100 p-3 rounded-elevated">
                  <Users className="h-7 w-7 text-slate-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">Jugadores de {club.name}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <MapPin className="h-4 w-4 text-slate-500" />
                    <p className="text-slate-600">{club.address || "Dirección no disponible"}</p>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="bg-blue-100 p-2 rounded-surface">
                    <Users className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Total jugadores</p>
                    <p className="text-lg font-semibold text-slate-900">{players.length}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-emerald-100 p-2 rounded-surface">
                    <BarChart3 className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Puntos totales</p>
                    <p className="text-lg font-semibold text-slate-900">{totalScore.toLocaleString()}</p>
                  </div>
                </div>
                {players.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="bg-amber-100 p-2 rounded-surface">
                      <Trophy className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Promedio</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {Math.round(totalScore / players.length).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right side: Admin button (only for club owners) */}
            {isOwner && (
              <div className="flex-shrink-0">
                <Button
                  asChild
                  className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-elevated shadow-sm"
                >
                  <Link href={`/clubes/${club.id}/players`} className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Administrar Jugadores
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-elevated border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Buscar jugadores..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={handleCategoryFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Players List */}
      <div className="space-y-3">
        {filteredPlayers.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {searchTerm || categoryFilter !== "all" ? "No se encontraron jugadores" : "Sin jugadores registrados"}
              </h3>
              <p className="text-gray-600">
                {searchTerm || categoryFilter !== "all" 
                  ? "Intenta ajustar los filtros de búsqueda"
                  : `${club.name} aún no tiene jugadores registrados.`
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredPlayers.map((player, index) => (
            <Card key={player.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    {/* Position */}
                    <div className="flex-shrink-0">
                      {getMedalIcon(index)}
                    </div>

                    {/* Player Avatar */}
                    <div className="flex-shrink-0">
                      <PlayerAvatar
                        src={player.profileImage}
                        alt={`${player.firstName} ${player.lastName}`}
                        size={40}   
                      />
                    </div>

                    {/* Player Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <Link 
                          href={`/ranking/${player.id}`}
                          className="text-lg font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                        >
                          {player.firstName} {player.lastName}
                        </Link>
                        <Badge className={getCategoryColor(player.category)}>{player.category}</Badge>
                        {player.preferredHand && (
                          <Badge variant="outline" className="text-xs">
                            {player.preferredHand === "RIGHT" ? "Diestro" : "Zurdo"}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-600">
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          {player.winRate || 0}% victorias
                        </span>
                        <span>{player.matchesPlayed || 0} partidos</span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-2xl font-bold text-slate-900">{player.score.toLocaleString()}</div>
                        <div className="text-sm text-slate-500">puntos</div>
                      </div>
                      <div className="flex-shrink-0">
                        {getTrendIcon(player.trend || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Results summary */}
      {filteredPlayers.length > 0 && (
        <div className="text-center text-sm text-slate-600">
          Mostrando {filteredPlayers.length} de {players.length} jugadores
        </div>
      )}
    </div>
  )
} 