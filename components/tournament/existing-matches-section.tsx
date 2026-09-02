"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Trophy, Loader2, CheckCircle, Clock, Edit, ArrowRight, Users, Filter, Save, X, AlertCircle, Trash2, MoreVertical, Settings } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
// Remove server action import - we'll use fetch instead
import Link from "next/link"
import { validatePadelScoreInput } from "@/utils/padel-score-validation"

interface Match {
  id: string
  tournament_id: string
  zone_id: string
  couple1_id: string
  couple2_id: string
  court: string | null
  status: string
  result_couple1: number | null
  result_couple2: number | null
  winner_id: string | null
  created_at: string
  updated_at: string
  zone_name: string | null
  couple1_player1_name: string
  couple1_player2_name: string
  couple2_player1_name: string
  couple2_player2_name: string
}

interface ExistingMatchesSectionProps {
  tournamentId: string
  isOwner?: boolean
  isPublicView?: boolean
  refreshTrigger?: number
  onMatchUpdated?: () => void
  tournamentStatus?: string
}

// Componente para nombres de jugadores clickeables
const PlayerName = ({ playerId, playerName }: { playerId: string; playerName: string }) => {
  if (!playerId || !playerName) {
    return <span className="text-slate-500">Por determinar</span>
  }
  
  return (
    <Link 
      href={`/ranking/${playerId}`} 
      className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
    >
      {playerName}
    </Link>
  )
}

// Componente para badge de estado
const MatchStatusBadge = ({ status }: { status: string }) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { variant: 'secondary' as const, text: 'Pendiente', icon: Clock }
      case 'IN_PROGRESS':
        return { variant: 'default' as const, text: 'En Progreso', icon: ArrowRight }
      case 'FINISHED':
        return { variant: 'default' as const, text: 'Finalizado', icon: CheckCircle }
      default:
        return { variant: 'outline' as const, text: status, icon: Clock }
    }
  }

  const config = getStatusConfig(status)
  const Icon = config.icon

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.text}
    </Badge>
  )
}

// Componente para edición inline de resultados - Improved UI
const InlineScoreEditor = ({ 
  match, 
  onSave, 
  onCancel 
}: { 
  match: Match
  onSave: (couple1Score: number, couple2Score: number) => void
  onCancel: () => void
}) => {
  const [couple1Score, setCouple1Score] = useState(match.result_couple1?.toString() || "")
  const [couple2Score, setCouple2Score] = useState(match.result_couple2?.toString() || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Validación de pádel en tiempo real
  const validation = validatePadelScoreInput(couple1Score, couple2Score)

  const handleSave = async () => {
    setError(null)
    
    // Usar la validación de pádel
    if (!validation.canSubmit) {
      setError(validation.errorMessage || "Resultado inválido")
      return
    }
    
    const score1 = parseInt(couple1Score)
    const score2 = parseInt(couple2Score)

    setSaving(true)
    try {
      await onSave(score1, score2)
    } catch (err) {
      setError("Error al guardar")
      setSaving(false)
    }
  }

  const isEditingFinishedMatch = match.status === 'FINISHED'

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="space-y-2">
      {isEditingFinishedMatch && (
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-surface">
          <div className="flex items-center gap-2 text-amber-800">
            <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold">!</span>
            </div>
            <span className="text-sm font-medium">
              Editando partido finalizado - Se recalcularán las posiciones de zona
            </span>
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-surface border-2 border-blue-200">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={couple1Score}
            onChange={(e) => setCouple1Score(e.target.value)}
            onKeyDown={handleKeyPress}
            className={`w-20 h-10 text-center text-lg font-bold ${
              validation.isValid 
                ? 'border-green-400 focus:border-green-500' 
                : validation.errorMessage 
                  ? 'border-red-400 focus:border-red-500' 
                  : 'border-blue-300 focus:border-blue-500'
            }`}
            min="0"
            max="7"
            placeholder="0"
            autoFocus
          />
          <span className="text-lg font-bold text-slate-600">-</span>
          <Input
            type="number"
            value={couple2Score}
            onChange={(e) => setCouple2Score(e.target.value)}
            onKeyDown={handleKeyPress}
            className={`w-20 h-10 text-center text-lg font-bold ${
              validation.isValid 
                ? 'border-green-400 focus:border-green-500' 
                : validation.errorMessage 
                  ? 'border-red-400 focus:border-red-500' 
                  : 'border-blue-300 focus:border-blue-500'
            }`}
            min="0"
            max="7"
            placeholder="0"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !validation.canSubmit}
            className={`h-10 gap-2 ${
              validation.canSubmit 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-gray-400 cursor-not-allowed text-white'
            }`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="h-10 gap-2"
            disabled={saving}
          >
            <X className="h-4 w-4" />
            Cancelar
          </Button>
        </div>
      </div>
      
      {/* Indicador de ganador */}
      {validation.isValid && validation.winner && (
        <div className="bg-green-50 border border-green-200 p-2 rounded-surface">
          <div className="flex items-center gap-2 text-green-800 text-sm">
            <CheckCircle className="h-4 w-4" />
            <span>
              Ganador: {validation.winner === 'couple1' ? 'Pareja 1' : 'Pareja 2'} ({couple1Score}-{couple2Score})
            </span>
          </div>
        </div>
      )}
      
      {/* Error de validación */}
      {(error || validation.errorMessage) && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error || validation.errorMessage}
        </div>
      )}
      
      <div className="text-xs text-slate-500">
        Presiona Enter para guardar, Escape para cancelar • 6-5 y 7-5 son ambos válidos
      </div>
    </div>
  )
}

export default function ExistingMatchesSection({
  tournamentId,
  isOwner = false,
  isPublicView = false,
  refreshTrigger = 0,
  onMatchUpdated,
  tournamentStatus = "UNKNOWN"
}: ExistingMatchesSectionProps) {
  const [matches, setMatches] = useState<Match[]>([])
  const [filteredMatches, setFilteredMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null)
  const [changingCourtMatchId, setChangingCourtMatchId] = useState<string | null>(null)
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [zoneFilter, setZoneFilter] = useState<string>('all')
  const [courtFilter, setCourtFilter] = useState<string>('all')

  const { toast } = useToast()

  // Load matches data
  const loadMatches = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/tournaments/${tournamentId}`)
      const result = await response.json()

      if (result.success && result.matches) {
        setMatches(result.matches)
        setFilteredMatches(result.matches)
      } else {
        setError(result.error || "Error al cargar partidos")
      }
    } catch (err) {
      console.error("Error loading matches:", err)
      setError("Error inesperado al cargar los partidos")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tournamentId) {
      loadMatches()
    }
  }, [tournamentId, refreshTrigger])

  // Apply filters
  useEffect(() => {
    let filtered = matches

    if (statusFilter !== 'all') {
      filtered = filtered.filter(match => match.status === statusFilter)
    }

    if (zoneFilter !== 'all') {
      filtered = filtered.filter(match => match.zone_name === zoneFilter)
    }

    if (courtFilter !== 'all') {
      filtered = filtered.filter(match => match.court === courtFilter)
    }

    setFilteredMatches(filtered)
  }, [matches, statusFilter, zoneFilter, courtFilter])

  // Get unique values for filters
  const uniqueZones = Array.from(new Set(matches.map(m => m.zone_name).filter(Boolean)))
  const uniqueCourts = Array.from(new Set(matches.map(m => m.court).filter(Boolean)))

  const handleSaveScore = async (matchId: string, couple1Score: number, couple2Score: number) => {
    try {
      const match = matches.find(m => m.id === matchId)
      if (!match) return

      const response = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          couple1Score,
          couple2Score,
          couple1Id: match.couple1_id,
          couple2Id: match.couple2_id
        }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        const isEditingFinished = result.isEditingFinishedMatch
        const positionUpdate = result.positionUpdate
        
        let description = isEditingFinished 
          ? "Se ha editado el partido finalizado" 
          : "El resultado del partido se ha actualizado exitosamente"
        
        if (positionUpdate?.positionsUpdated) {
          description += " y se han recalculado las posiciones de zona"
        }
        
        toast({
          title: "Resultado guardado",
          description,
          variant: "default"
        })
        
        setEditingMatchId(null)
        loadMatches() // Reload matches
        if (onMatchUpdated) {
          onMatchUpdated()
        }
      } else {
        toast({
          title: "Error",
          description: result.error || "No se pudo guardar el resultado",
          variant: "destructive"
        })
        throw new Error(result.error || "Failed to save")
      }
    } catch (err) {
      console.error("Error saving match result:", err)
      toast({
        title: "Error",
        description: "Error inesperado al guardar el resultado",
        variant: "destructive"
      })
      throw err // Re-throw so the editor component can handle it
    }
  }

  const handleChangeCourt = async (match: Match, newCourt: number) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/matches/${match.id}/court`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ court: newCourt })
      })

      const result = await response.json()

      if (result.success) {
        toast({
          title: "✅ Cancha actualizada",
          description: `Partido movido a cancha ${newCourt}`,
        })
        loadMatches() // Refresh data
        setChangingCourtMatchId(null)
      } else {
        toast({
          title: "Error",
          description: result.error || "Error al cambiar cancha",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error de conexión al cambiar cancha",
        variant: "destructive"
      })
    }
  }

  const handleStatusChange = async (matchId: string, newStatus: string) => {
    // TODO: Implement status change functionality
    toast({
      title: "Función pendiente",
      description: "El cambio de estado estará disponible pronto",
      variant: "default"
    })
  }

  const handleDeleteMatch = async (match: Match) => {
    // Validar que el torneo esté en ZONE_PHASE
    if (tournamentStatus !== 'ZONE_PHASE') {
      toast({
        title: "No se puede borrar",
        description: "Solo se pueden borrar partidos durante la fase de zonas",
        variant: "destructive"
      })
      return
    }



    // Confirmar la acción
    const confirmed = window.confirm(
      `¿Estás seguro de que quieres borrar este partido?\n\n` +
      `Partido: ${match.couple1_player1_name} / ${match.couple1_player2_name} vs ${match.couple2_player1_name} / ${match.couple2_player2_name}\n` +
      `Zona: ${match.zone_name || 'Sin zona'}\n` +
      `Cancha: ${match.court || 'Sin asignar'}\n\n` +
      `⚠️ Esta acción no se puede deshacer y eliminará el partido permanentemente.`
    )

    if (!confirmed) return

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/matches/${match.id}`, {
        method: "DELETE"
      })

      const result = await response.json()

      if (response.ok && result.success) {
        toast({
          title: "Partido borrado",
          description: "El partido ha sido eliminado exitosamente",
          variant: "default"
        })
        
        loadMatches() // Reload matches
        if (onMatchUpdated) {
          onMatchUpdated()
        }
      } else {
        toast({
          title: "Error",
          description: result.error || "No se pudo borrar el partido",
          variant: "destructive"
        })
      }
    } catch (err) {
      console.error("Error deleting match:", err)
      toast({
        title: "Error",
        description: "Error inesperado al borrar el partido",
        variant: "destructive"
      })
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2 className="h-8 w-8 text-slate-600 animate-spin" />
        <span className="ml-3 text-slate-500">Cargando partidos...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-surface border border-red-200">
        <div className="font-semibold mb-1">Error al cargar partidos</div>
        <div className="text-sm">{error}</div>
      </div>
    )
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Trophy className="h-10 w-10 text-slate-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900 mb-2">No hay partidos creados</h3>
        <p className="text-slate-500 max-w-md mx-auto">
          {isOwner 
            ? "Aún no se han creado partidos para este torneo. Usa la pestaña 'Crear Partidos' para empezar."
            : "Aún no se han creado partidos para este torneo."
          }
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Estado</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="PENDING">Pendiente</SelectItem>
                  <SelectItem value="IN_PROGRESS">En Progreso</SelectItem>
                  <SelectItem value="FINISHED">Finalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {uniqueZones.length > 0 && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Zona</label>
                <Select value={zoneFilter} onValueChange={setZoneFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas las zonas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las zonas</SelectItem>
                    {uniqueZones.map(zone => (
                      <SelectItem key={zone} value={zone || ""}>{zone}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {uniqueCourts.length > 0 && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Cancha</label>
                <Select value={courtFilter} onValueChange={setCourtFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas las canchas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las canchas</SelectItem>
                    {uniqueCourts.map(court => (
                      <SelectItem key={court} value={court || ""}>Cancha {court}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Matches Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Partidos ({filteredMatches.length})
            </div>
            {isOwner && (
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-xs">
                  Click en los puntajes para editar
                </Badge>
                {tournamentStatus === 'ZONE_PHASE' && (
                  <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                    Fase de zonas: Se pueden borrar partidos sin resultado
                  </Badge>
                )}
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zona</TableHead>
                  <TableHead>Pareja 1</TableHead>
                  <TableHead>Pareja 2</TableHead>
                  <TableHead className="text-center">Resultado</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Cancha</TableHead>
                  {isOwner && <TableHead className="text-center">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMatches.map((match) => (
                  <TableRow key={match.id} className="hover:bg-slate-50">
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {match.zone_name || 'Sin zona'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-slate-900">
                          {match.couple1_player1_name} / {match.couple1_player2_name}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-slate-900">
                          {match.couple2_player1_name} / {match.couple2_player2_name}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {editingMatchId === match.id && isOwner ? (
                        <InlineScoreEditor
                          match={match}
                          onSave={(score1, score2) => handleSaveScore(match.id, score1, score2)}
                          onCancel={() => setEditingMatchId(null)}
                        />
                      ) : (
                        <div 
                          className={`flex items-center justify-center gap-2 rounded-control transition-colors ${
                            isOwner 
                              ? 'cursor-pointer hover:bg-blue-50 border-2 border-dashed border-transparent hover:border-blue-300 px-3 py-2' 
                              : 'px-3 py-2'
                          }`}
                          onClick={() => {
                            if (isOwner) {
                              setEditingMatchId(match.id)
                            }
                          }}
                          title={isOwner ? 'Click para editar resultado' : ''}
                        >
                          <span className={`font-mono text-lg font-bold ${
                            match.result_couple1 == null ? 'text-slate-400' : 'text-slate-900'
                          }`}>
                            {match.result_couple1 ?? '-'}
                          </span>
                          <span className="text-slate-400 font-bold">-</span>
                          <span className={`font-mono text-lg font-bold ${
                            match.result_couple2 == null ? 'text-slate-400' : 'text-slate-900'
                          }`}>
                            {match.result_couple2 ?? '-'}
                          </span>
                          {isOwner && (
                            <Edit className="h-4 w-4 text-blue-500 ml-2" />
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {isOwner ? (
                        <Select
                          value={match.status}
                          onValueChange={(newStatus) => handleStatusChange(match.id, newStatus)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue>
                              <MatchStatusBadge status={match.status} />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PENDING">Pendiente</SelectItem>
                            <SelectItem value="IN_PROGRESS">En Progreso</SelectItem>
                            <SelectItem value="FINISHED">Finalizado</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <MatchStatusBadge status={match.status} />
                      )}
                    </TableCell>
                    <TableCell>
                      {match.court ? (
                        <Badge variant="secondary" className="text-xs">
                          Cancha {match.court}
                        </Badge>
                      ) : (
                        <span className="text-slate-400 text-sm">Sin asignar</span>
                      )}
                    </TableCell>
                    {isOwner && (
                      <TableCell className="text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setEditingMatchId(match.id)}
                              className="cursor-pointer"
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Editar resultado
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setChangingCourtMatchId(match.id)}
                              className="cursor-pointer"
                            >
                              <Settings className="h-4 w-4 mr-2" />
                              Cambiar cancha
                            </DropdownMenuItem>
                            {/* Botón Borrar - solo si está en ZONE_PHASE */}
                            {tournamentStatus === 'ZONE_PHASE' && (
                              <DropdownMenuItem
                                onClick={() => handleDeleteMatch(match)}
                                className="cursor-pointer text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Borrar partido
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal para cambiar cancha */}
      {changingCourtMatchId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-surface shadow-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Cambiar Cancha</h3>
            <p className="text-sm text-gray-600 mb-4">
              Selecciona la nueva cancha para este partido:
            </p>
            <div className="grid grid-cols-5 gap-2 mb-6">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((court) => {
                const currentMatch = matches.find(m => m.id === changingCourtMatchId)
                return (
                  <Button
                    key={court}
                    variant={Number(currentMatch?.court) === court ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (currentMatch) {
                        handleChangeCourt(currentMatch, court)
                      }
                    }}
                    className="h-12"
                  >
                    {court}
                  </Button>
                )
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setChangingCourtMatchId(null)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}