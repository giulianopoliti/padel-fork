"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Trophy,
  Medal,
  Search,
  Filter,
  Users,
  ChevronUp,
  ChevronDown,
  Star,
  MapPin,
  Shield,
  TrendingUp,
  Award,
  Zap,
  Info,
  Crown,
  ArrowRight,
  Loader2,
} from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import PlayerAvatar from "@/components/player-avatar"
import WeeklyPointsBadge from "@/components/ui/weekly-points-badge"
import { Pagination } from "@/components/ui/pagination"
import { PaginationControl } from "@/components/ui/pagination"
import { searchRankingPlayers } from "@/lib/api/supabase-edge"
import { useDebounce } from "@/hooks/use-debounce"
import { useToast } from "@/components/ui/use-toast"
import { getCategoryColor } from "@/lib/utils/category-colors"

interface Player {
  id: string
  firstName: string
  lastName: string
  category: string
  score: number
  club_name?: string
  club?: string
  organizador_name?: string
  trend?: number
  winRate?: number
  matchesPlayed?: number
  profileImage?: string
  weeklyPoints?: number
}

interface Category {
  name: string
}

interface RankingClientProps {
  initialPlayers: Player[]
  initialCategories: Category[]
  totalPlayers: number
  currentPage: number
  currentCategory: string | null
  currentClubId: string | null
  currentGender: 'male' | 'female'
  pageSize?: number
  totalPages?: number
  error?: string
}

export default function RankingClient({
  initialPlayers,
  initialCategories,
  totalPlayers,
  currentPage,
  currentCategory,
  currentClubId,
  currentGender,
  pageSize = 50,
  totalPages,
  error
}: RankingClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  // Estado local
  const [searchTerm, setSearchTerm] = useState("")
  const [localPlayers, setLocalPlayers] = useState(initialPlayers)
  const [total, setTotal] = useState(totalPlayers)
  const [currentPageState, setCurrentPageState] = useState(currentPage)
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [hasSearchResults, setHasSearchResults] = useState(false)
  
  // Referencia para mantener el foco en el input
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Debounce del searchTerm (500ms para ranking público)
  const debouncedSearch = useDebounce(searchTerm, 500)

  // Efecto para inicializar el estado del Select después del montaje
  useEffect(() => {
    setSelectedCategory(currentCategory || "all")
  }, [currentCategory])

  // Efecto para actualizar jugadores locales cuando cambian los iniciales (solo si no hay búsqueda activa)
  useEffect(() => {
    if (!searchTerm && !hasSearchResults) {
      setLocalPlayers(initialPlayers)
      setTotal(totalPlayers)
      setCurrentPageState(currentPage)
      setIsLoading(false)
    }
    // Solo actualizar cuando cambian initialPlayers, no cuando cambia searchTerm para evitar bucles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPlayers])

  // Función de búsqueda via Edge Function
  const performSearch = useCallback(async (
    search: string,
    page: number,
    category: string | null,
    gender: 'male' | 'female'
  ) => {
    try {
      setIsSearching(true)
      setHasSearchResults(true)

      const result = await searchRankingPlayers({
        searchTerm: search,
        page,
        pageSize: 50,
        category,
        clubId: currentClubId,
        gender: gender === 'female' ? 'FEMALE' : 'MALE'
      })

      if (result.success) {
        setLocalPlayers(result.players || [])
        setTotal(result.total || 0)
        setCurrentPageState(page)
      } else {
        toast({
          title: 'Error',
          description: result.error || 'No se pudieron cargar los jugadores',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Error searching ranking players:', error)
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los jugadores',
        variant: 'destructive'
      })
    } finally {
      setIsSearching(false)
    }
  }, [currentClubId, toast])

  // Effect para búsqueda en tiempo real cuando hay término de búsqueda
  useEffect(() => {
    if (debouncedSearch) {
      performSearch(debouncedSearch, 1, currentCategory, currentGender)
    }
  }, [debouncedSearch, currentCategory, currentGender, performSearch])

  /**
   * Actualiza la URL con los nuevos parámetros de filtro
   * @param newParams - Nuevos parámetros a aplicar
   */
  const updateFilters = (newParams: { 
    page?: number; 
    category?: string | null; 
    clubId?: string | null;
    gender?: 'male' | 'female';
  }) => {
    setIsLoading(true)
    const params = new URLSearchParams(searchParams.toString())
    
    // Actualizar parámetros
    if (newParams.page) {
      params.set("page", newParams.page.toString())
    } else if (newParams.page === undefined && (newParams.category !== undefined || newParams.clubId !== undefined)) {
      // Si cambiamos filtros pero no página, volver a página 1
      params.set("page", "1")
    }

    if (newParams.category !== undefined) {
      if (newParams.category) {
        params.set("category", newParams.category)
      } else {
        params.delete("category")
      }
    }

    if (newParams.clubId !== undefined) {
      if (newParams.clubId) {
        params.set("clubId", newParams.clubId)
      } else {
        params.delete("clubId")
      }
    }

    if (newParams.gender !== undefined) {
      params.set("gender", newParams.gender)
      // Al cambiar género, volver a página 1
      params.set("page", "1")
    }

    // Actualizar la URL y esperar la navegación
    router.push(`/ranking?${params.toString()}`)
  }

  // Manejadores de eventos
  const handlePageChange = (page: number) => {
    updateFilters({ page })
  }

  const handleCategoryChange = (category: string) => {
    // Limpiar búsqueda al cambiar filtros
    setSearchTerm("")
    updateFilters({ 
      category: category === "all" ? null : category,
      page: undefined // Esto forzará volver a página 1
    })
  }

  const handleSearch = (term: string) => {
    setSearchTerm(term)
    if (!term) {
      setHasSearchResults(false)
    }
    // La búsqueda ahora se maneja con el debounce y la Edge Function
  }

  const handleSearchPageChange = (page: number) => {
    if (debouncedSearch) {
      performSearch(debouncedSearch, page, currentCategory, currentGender)
    }
  }

  const handleGenderToggle = () => {
    const newGender = currentGender === 'male' ? 'female' : 'male'
    updateFilters({ gender: newGender })
  }

  // Funciones auxiliares para la UI
  const getCategoryName = (categoryName: string) => {
    return categoryName
  }


  const getMedalIcon = (index: number) => {
    switch (index) {
      case 0:
        return (
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shadow-sm bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-200">
            <Trophy className="h-4 w-4" />
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
            <Trophy className="h-4 w-4" />
          </div>
        )
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center text-white font-bold text-sm">
            {index + 1}
          </div>
        )
    }
  }

  // Calcular el índice base para la numeración
  const baseIndex = (currentPageState - 1) * pageSize

  return (
    <div className="container mx-auto py-8 space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" />
            <h1 className="text-2xl font-bold">
              {currentGender === 'female' ? 'Ranking Damas' : 'Ranking Caballeros'}
            </h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenderToggle}
            className="flex items-center gap-2"
            disabled={isLoading || isSearching}
            aria-label={`Cambiar a ranking ${currentGender === 'male' ? 'damas' : 'caballeros'}`}
          >
            <ArrowRight className="h-4 w-4" />
            {currentGender === 'male' ? 'Ver Ranking Damas' : 'Ver Ranking Caballeros'}
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              ref={searchInputRef}
              placeholder="Buscar jugador o club..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
            )}
          </div>

          <Select
            value={selectedCategory}
            onValueChange={handleCategoryChange}
            disabled={isLoading || isSearching}
          >
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Filtrar por categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {initialCategories.map((category) => (
                <SelectItem key={category.name} value={category.name}>
                  {getCategoryName(category.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4">
        {isSearching && !localPlayers.length && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        {localPlayers.map((player, index) => (
          <Link key={player.id} href={`/ranking/${player.id}`}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {getMedalIcon(baseIndex + index)}
                    
                    <PlayerAvatar
                      src={player.profileImage}
                      alt={`${player.firstName} ${player.lastName}`}
                      className={`w-10 h-10 ${index < 3 ? "ring-2 ring-blue-200" : ""}`}
                    />

                    <div>
                      <div className="font-semibold">
                        {player.firstName} {player.lastName}
                      </div>
                      <div className="flex items-center flex-wrap gap-2 text-sm text-gray-600">
                        <Badge
                          variant="outline"
                          className={`${getCategoryColor(player.category)}`}
                        >
                          {player.category}
                        </Badge>
                        {player.club_name && player.club_name.trim() && (
                          <span className="flex items-center">
                            <MapPin className="h-3 w-3 mr-1" />
                            {player.club_name}
                          </span>
                        )}
                        {player.organizador_name && player.organizador_name.trim() && (
                          <span className="flex items-center text-xs text-muted-foreground">
                            <Users className="h-3 w-3 mr-1" />
                            {player.organizador_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <WeeklyPointsBadge points={player.weeklyPoints || 0} />
                      <div className="font-bold text-lg">{player.score}</div>
                    </div>
                    <div className="text-sm text-gray-600">puntos</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        {localPlayers.length === 0 && !error && (
          <div className="text-center py-8 text-gray-500">
            No se encontraron jugadores que coincidan con los criterios de búsqueda
          </div>
        )}
      </div>

      <div className="flex justify-center mt-8">
        <PaginationControl
          total={total}
          pageSize={pageSize}
          currentPage={currentPageState}
          onPageChange={searchTerm ? handleSearchPageChange : handlePageChange}
          disabled={isLoading || isSearching}
        />
      </div>
    </div>
  )
}
