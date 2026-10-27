'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/components/ui/use-toast'
import { 
  ArrowLeft, 
  Users, 
  Search, 
  Save, 
  RefreshCw,
  Filter,
  AlertCircle,
  CheckCircle2,
  Info
} from 'lucide-react'
import { CategoryInfoCard } from './components/CategoryInfoCard'
import { ConfirmationDialog } from './components/ConfirmationDialog'
import { RecategorizationHistory } from './components/RecategorizationHistory'
import { getCategoryColor } from '@/lib/utils/category-colors'

interface TournamentPlayer {
  id: string
  first_name: string
  last_name: string
  score: number
  category_name: string
  club_name?: string
}

interface Category {
  name: string
  lower_range: number
  upper_range: number | null
}

interface PlayerUpdate {
  playerId: string
  newCategory: string
  expectedScore: number
  expectedCategory: string | null
}

interface UpdateDetail {
  playerId: string
  oldCategory: string
  newCategory: string
  oldScore: number
  newScore: number
}

const RecategorizePlayersPage: React.FC = () => {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const tournamentId = params.id as string

  // States
  const [players, setPlayers] = useState<TournamentPlayer[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, string>>(new Map())
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set())
  const [showHistory, setShowHistory] = useState(false)

  // Fetch data on mount
  useEffect(() => {
    fetchData()
  }, [tournamentId])

  const fetchData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/tournaments/${tournamentId}/recategorize-players`)
      const data = await response.json()

      if (!response.ok || !data.success) {
        if (response.status === 401) {
          toast({
            title: "No autorizado",
            description: "Debes iniciar sesión para acceder a esta página.",
            variant: "destructive"
          })
          router.push('/login')
          return
        }
        
        if (response.status === 403) {
          toast({
            title: "Acceso denegado",
            description: "Solo el propietario del torneo puede recategorizar jugadores.",
            variant: "destructive"
          })
          router.push(`/tournaments/${tournamentId}`)
          return
        }
        
        throw new Error(data.error || 'Error al cargar los datos')
      }

      setPlayers(data.players || [])
      setCategories(data.categories || [])
      
    } catch (error) {
      console.error('Error fetching data:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al cargar los datos",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  // Filter players based on search and category
  const filteredPlayers = players.filter(player => {
    const matchesSearch = searchTerm === '' || 
      `${player.first_name} ${player.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      player.club_name?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCategory = categoryFilter === 'all' || player.category_name === categoryFilter

    return matchesSearch && matchesCategory
  })

  // Handle category change for a player
  const handleCategoryChange = (playerId: string, newCategory: string) => {
    const newUpdates = new Map(pendingUpdates)
    const currentPlayer = players.find(p => p.id === playerId)
    
    if (currentPlayer && currentPlayer.category_name === newCategory) {
      // Remove update if reverting to original
      newUpdates.delete(playerId)
    } else {
      // Add/update the pending change
      newUpdates.set(playerId, newCategory)
    }
    
    setPendingUpdates(newUpdates)
  }

  // Get effective category for a player (considering pending updates)
  const getEffectiveCategory = (playerId: string, originalCategory: string): string => {
    return pendingUpdates.get(playerId) || originalCategory
  }

  // Category decisions never replace the player's sporting score.
  const getScorePreview = (_playerId: string, originalScore: number): { newScore: number; hasChange: boolean } => ({ newScore: originalScore, hasChange: false })

  // Show confirmation dialog
  const handleSaveClick = () => {
    if (pendingUpdates.size === 0) {
      toast({
        title: "Sin cambios",
        description: "No hay cambios pendientes para guardar.",
        variant: "default"
      })
      return
    }
    setShowConfirmDialog(true)
  }

  // Save all pending updates (after confirmation)
  const handleConfirmedSave = async () => {
    setShowConfirmDialog(false)

    try {
      setSaving(true)
      
      const updates: PlayerUpdate[] = Array.from(pendingUpdates.entries()).map(([playerId, newCategory]) => ({
        playerId,
        newCategory,
        expectedScore: players.find(player => player.id === playerId)!.score,
        expectedCategory: players.find(player => player.id === playerId)!.category_name || null,
      }))

      const response = await fetch(`/api/tournaments/${tournamentId}/recategorize-players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Error al guardar los cambios')
      }

      // Update local state with both category and score changes
      if (data.updateDetails && data.updateDetails.length > 0) {
        // Use server response details for accurate updates
        setPlayers(prev => prev.map(player => {
          const updateDetail = data.updateDetails.find((detail: UpdateDetail) => detail.playerId === player.id)
          
          if (updateDetail) {
            return {
              ...player,
              category_name: updateDetail.newCategory,
              score: updateDetail.newScore
            }
          }
          
          return player
        }))
      } else {
        // Fallback: update only categories and calculate scores locally
        setPlayers(prev => prev.map(player => {
          const newCategory = pendingUpdates.get(player.id)
          if (newCategory) {
            const newScore = player.score
            return {
              ...player,
              category_name: newCategory,
              score: newScore
            }
          }
          return player
        }))
      }

      // Clear pending updates and mark as recently updated
      const updatedPlayerIds = new Set(Array.from(pendingUpdates.keys()))
      setPendingUpdates(new Map())
      setRecentlyUpdated(updatedPlayerIds)
      
      // Clear "recently updated" indicator after 3 seconds
      setTimeout(() => {
        setRecentlyUpdated(new Set())
      }, 3000)

      // Mostrar detalles de los cambios si están disponibles
      if (data.updateDetails && data.updateDetails.length > 0) {
        toast({
          title: "Cambios guardados exitosamente",
          description: `Se actualizaron ${data.updated} jugadores conservando sus puntajes.`,
          variant: "default"
        })
      } else {
        toast({
          title: "Cambios guardados",
          description: `Se actualizaron ${data.updated} jugadores exitosamente.`,
          variant: "default"
        })
      }

    } catch (error) {
      console.error('Error saving changes:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al guardar los cambios",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  // Reset all pending changes
  const handleResetChanges = () => {
    setPendingUpdates(new Map())
    toast({
      title: "Cambios descartados",
      description: "Se han descartado todos los cambios pendientes.",
      variant: "default"
    })
  }

  // Get category badge color

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="space-y-4">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
              
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Users className="h-6 w-6 text-blue-600" />
                  Recategorizar Jugadores
                </h1>
                <p className="text-gray-600 mt-1">
                  Elegí las categorías manualmente. Cada jugador conservará su puntaje actual.
                </p>
              </div>
              
              <Button
                variant="outline"
                onClick={() => setShowHistory(!showHistory)}
                className="text-gray-600"
              >
                {showHistory ? (
                  <>
                    <Users className="h-4 w-4 mr-2" />
                    Ocultar Historial
                  </>
                ) : (
                  <>
                    <Info className="h-4 w-4 mr-2" />
                    Ver Historial
                  </>
                )}
              </Button>
            </div>

            {pendingUpdates.size > 0 && (
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  {pendingUpdates.size} cambios pendientes
                </Badge>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetChanges}
                  className="text-gray-600"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Descartar
                </Button>
                
                <Button
                  onClick={handleSaveClick}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {saving ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Guardar Cambios
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6">
        
        {/* Info Banner */}
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-blue-900 mb-1">Información importante</h3>
                <p className="text-blue-800 text-sm">
                  Los cambios de categoría se aplicarán inmediatamente a los jugadores. 
                  Asegúrate de revisar cuidadosamente antes de guardar los cambios.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Category Information */}
        <CategoryInfoCard categories={categories} />

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Filtros y Búsqueda</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por nombre o club..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div className="w-full md:w-64">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filtrar por categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {categories.map(category => (
                      <SelectItem key={category.name} value={category.name}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Players Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Jugadores del Torneo ({filteredPlayers.length})</span>
              {pendingUpdates.size > 0 && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {pendingUpdates.size} pendientes
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Jugador</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead>Puntaje Actual</TableHead>
                    <TableHead>Nuevo Puntaje</TableHead>
                    <TableHead>Categoría Actual</TableHead>
                    <TableHead>Nueva Categoría</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPlayers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        No se encontraron jugadores con los filtros aplicados
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPlayers.map(player => {
                      const effectiveCategory = getEffectiveCategory(player.id, player.category_name)
                      const hasChanges = pendingUpdates.has(player.id)
                      const scorePreview = getScorePreview(player.id, player.score)
                      const isRecentlyUpdated = recentlyUpdated.has(player.id)
                      
                      return (
                        <TableRow 
                          key={player.id} 
                          className={
                            hasChanges 
                              ? 'bg-blue-50' 
                              : isRecentlyUpdated 
                              ? 'bg-green-50 border-green-200' 
                              : ''
                          }
                        >
                          <TableCell>
                            <div>
                              <div className="font-medium text-gray-900">
                                {player.first_name} {player.last_name}
                              </div>
                            </div>
                          </TableCell>
                          
                          <TableCell>
                            <span className="text-gray-600">{player.club_name}</span>
                          </TableCell>
                          
                          <TableCell>
                            <Badge variant="outline" className="font-mono">
                              {player.score}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            {scorePreview.hasChange ? (
                              <div className="flex items-center gap-2">
                                <Badge 
                                  variant="outline" 
                                  className="font-mono bg-amber-50 border-amber-200 text-amber-800"
                                >
                                  {scorePreview.newScore}
                                </Badge>
                                <span className="text-xs text-amber-600">
                                  ({scorePreview.newScore > player.score ? '+' : ''}{scorePreview.newScore - player.score})
                                </span>
                              </div>
                            ) : (
                              <Badge variant="outline" className="font-mono text-gray-500">
                                {player.score}
                              </Badge>
                            )}
                          </TableCell>
                          
                          <TableCell>
                            <Badge className={getCategoryColor(player.category_name)}>
                              {player.category_name}
                            </Badge>
                          </TableCell>
                          
                          <TableCell>
                            <Select
                              value={effectiveCategory}
                              onValueChange={(value) => handleCategoryChange(player.id, value)}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {categories.map(category => (
                                  <SelectItem key={category.name} value={category.name}>
                                    {category.name}
                                    <span className="text-xs text-gray-500 ml-2">
                                      ({category.lower_range}{category.upper_range ? `-${category.upper_range}` : '+'})
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          
                          <TableCell>
                            {hasChanges ? (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Pendiente
                              </Badge>
                            ) : isRecentlyUpdated ? (
                              <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 animate-pulse">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Actualizado
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-green-100 text-green-800">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Sin cambios
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Recategorization History */}
        <RecategorizationHistory
          tournamentId={tournamentId}
          isVisible={showHistory}
          categories={categories}
        />

        {/* Confirmation Dialog */}
        <ConfirmationDialog
          isOpen={showConfirmDialog}
          onClose={() => setShowConfirmDialog(false)}
          onConfirm={handleConfirmedSave}
          players={players}
          categories={categories}
          pendingUpdates={pendingUpdates}
          loading={saving}
        />
      </div>
    </div>
  )
}

export default RecategorizePlayersPage
