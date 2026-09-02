"use client"

import { useState, useEffect, useCallback } from "react"
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDraggable, useDroppable } from "@dnd-kit/core"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Loader2, 
  Users, 
  Plus, 
  X, 
  Save, 
  Clock,
  CheckCircle,
  AlertTriangle,
  Eye
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import CourtSelector from "./court-selector"
import ZoneMatrixTable from "./zone-matrix-table"

interface Couple {
  id: string
  player1_name: string
  player2_name: string
  stats: {
    played: number
    won: number
    lost: number
    scored: number
    conceded: number
    points: number
  }
}

interface Zone {
  id: string
  name: string | null
  capacity?: number | null
  couples: Couple[]
}

interface Match {
  id: string
  couple1_id: string
  couple2_id: string
  result_couple1?: number
  result_couple2?: number
  status: string
  winner_id?: string
  zone_id: string
}

interface PendingMatch {
  id: string
  couple1: Couple
  couple2: Couple
  court?: string
  zoneId: string
}

interface StagingMatch {
  id: string
  couple1: Couple
  couple2: Couple
  court?: string
  zoneId: string
  zoneName?: string
  status: 'pending' | 'ready' | 'creating'
}

interface EnhancedMatchCreationProps {
  tournamentId: string
  clubCourts: number
  isOwner?: boolean
  onMatchesCreated?: () => void
  onStagingChange?: (matches: StagingMatch[]) => void
  refreshTrigger?: number
}

// Componente para la staging area
const MatchStagingArea = ({ 
  stagingMatches,
  onRemoveMatch,
  onCourtChange,
  onCreateAll,
  clubCourts,
  creating
}: {
  stagingMatches: StagingMatch[]
  onRemoveMatch: (matchId: string) => void
  onCourtChange: (matchId: string, court?: string) => void
  onCreateAll: () => void
  clubCourts: number
  creating: boolean
}) => {
  const readyMatches = stagingMatches.filter(m => m.status === 'ready')
  const pendingMatches = stagingMatches.filter(m => m.status === 'pending')

  return (
    <Card className="border-dashed border-2 border-emerald-300 bg-emerald-25">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5 text-emerald-600" />
            Cola de Partidos ({stagingMatches.length})
          </CardTitle>
          {stagingMatches.length > 0 && (
            <Badge 
              variant={readyMatches.length === stagingMatches.length ? "default" : "secondary"}
              className={readyMatches.length === stagingMatches.length ? "bg-green-600" : "bg-amber-500"}
            >
              {readyMatches.length}/{stagingMatches.length} listos
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {stagingMatches.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Users className="h-12 w-12 mx-auto mb-3 text-slate-400" />
            <p className="font-medium">Zona de preparación de partidos</p>
            <p className="text-sm mt-1">Arrastra parejas aquí para crear partidos en lote</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {stagingMatches.map((match) => (
                <Card key={match.id} className="border border-emerald-200">
                  <CardContent className="p-3">
                    <div className="space-y-3">
                      {/* Match Info */}
                      <div className="flex items-center justify-between">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="outline" className="text-xs">
                              {match.zoneName || 'Zona'}
                            </Badge>
                            <span className="text-slate-500">
                              {match.status === 'ready' ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <Clock className="h-4 w-4 text-amber-500" />
                              )}
                            </span>
                          </div>
                          <div className="text-sm font-medium">
                            {match.couple1.player1_name} / {match.couple1.player2_name}
                            <span className="mx-2 text-slate-400">VS</span>
                            {match.couple2.player1_name} / {match.couple2.player2_name}
                          </div>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemoveMatch(match.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {/* Court Selector */}
                      <CourtSelector
                        maxCourts={clubCourts}
                        selectedCourt={match.court}
                        onCourtSelect={(court) => {
                          onCourtChange(match.id, court)
                        }}
                        className="mt-2"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Create All Button */}
            <div className="border-t pt-4">
              <Button
                onClick={onCreateAll}
                disabled={creating || readyMatches.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                size="lg"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creando partidos...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Crear {readyMatches.length} Partido{readyMatches.length !== 1 ? 's' : ''} Lista{readyMatches.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
              
              {pendingMatches.length > 0 && (
                <div className="flex items-center gap-2 mt-2 text-sm text-amber-700 bg-amber-50 p-2 rounded">
                  <AlertTriangle className="h-4 w-4" />
                  {pendingMatches.length} partido{pendingMatches.length !== 1 ? 's' : ''} necesita{pendingMatches.length === 1 ? '' : 'n'} cancha asignada
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// Zona de drop mejorada
const EnhancedMatchDropZone = ({ selectedCouples, onCoupleAdded }: { 
  selectedCouples: Couple[]
  onCoupleAdded: (couple: Couple) => void
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: 'enhanced-match-zone'
  })

  return (
    <Card 
      ref={setNodeRef}
      className={`border-dashed border-2 transition-all ${
        isOver 
          ? 'border-emerald-500 bg-emerald-50 scale-105' 
          : selectedCouples.length === 0 
            ? 'border-slate-300 bg-slate-50'
            : 'border-emerald-300 bg-emerald-25'
      }`}
    >
      <CardContent className="p-4">
        <div className="text-center space-y-2">
          <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${
            selectedCouples.length === 2 ? 'bg-green-100' : 'bg-slate-100'
          }`}>
            <Users className={`h-6 w-6 ${
              selectedCouples.length === 2 ? 'text-green-600' : 'text-slate-400'
            }`} />
          </div>
          
          <div>
            <p className="font-medium text-slate-700">
              {selectedCouples.length === 0 && "Arrastra parejas aquí"}
              {selectedCouples.length === 1 && "Necesitas una pareja más"}
              {selectedCouples.length === 2 && "¡Listo! Arrastra más parejas"}
            </p>
            <p className="text-xs text-slate-500">
              Parejas: {selectedCouples.length}/2 para próximo partido
            </p>
          </div>
          
          {selectedCouples.length > 0 && (
            <div className="space-y-1 mt-3">
              {selectedCouples.map((couple, index) => (
                <div key={couple.id} className="bg-white rounded p-2 text-xs border">
                  <span className="font-medium">
                    {couple.player1_name} / {couple.player2_name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function EnhancedMatchCreation({ 
  tournamentId, 
  clubCourts, 
  isOwner = false,
  onMatchesCreated,
  onStagingChange,
  refreshTrigger = 0
}: EnhancedMatchCreationProps) {
  const [zones, setZones] = useState<Zone[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [couplesWithFinishedMatches, setCouplesWithFinishedMatches] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [selectedCouples, setSelectedCouples] = useState<Couple[]>([])
  const [stagingMatches, setStagingMatches] = useState<StagingMatch[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const { toast } = useToast()

  // Notificar cambios en staging
  useEffect(() => {
    if (onStagingChange) {
      onStagingChange(stagingMatches)
    }
  }, [stagingMatches, onStagingChange])

  // Cargar datos (reutilizar lógica existente)
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        
        const [zonesResponse, matchesResponse] = await Promise.all([
          fetch(`/api/tournaments/${tournamentId}?endpoint=zones`),
          fetch(`/api/tournaments/${tournamentId}`)
        ])
        
        const [zonesResult, matchesResult] = await Promise.all([
          zonesResponse.json(),
          matchesResponse.json()
        ])
        
        if (zonesResult.success && zonesResult.zones) {
          setZones(zonesResult.zones)
          
          // Cargar parejas con partidos terminados
          const couplesWithFinished: Record<string, string[]> = {}
          for (const zone of zonesResult.zones) {
            try {
              const res = await fetch(`/api/tournaments/${tournamentId}/couples-with-active-matches?zoneId=${zone.id}`)
              const finishedResult = await res.json()
              if (finishedResult.success && finishedResult.coupleIds) {
                couplesWithFinished[zone.id] = finishedResult.coupleIds
              } else {
                couplesWithFinished[zone.id] = []
              }
            } catch (err) {
              console.error(`Error loading finished matches for zone ${zone.id}:`, err)
              couplesWithFinished[zone.id] = []
            }
          }
          setCouplesWithFinishedMatches(couplesWithFinished)
        } else {
          setError(zonesResult.error || "Error loading zones")
        }
        
        if (matchesResult.success && matchesResult.matches) {
          setMatches(matchesResult.matches)
        } else {
          console.warn("Error loading matches:", matchesResult.error)
          setMatches([])
        }
      } catch (err) {
        console.error("Error loading data:", err)
        setError("Error inesperado al cargar los datos")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [tournamentId, refreshTrigger])

  // Handlers de drag and drop
  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)

    if (!over) return

    if (over.id === 'enhanced-match-zone') {
      const draggedData = active.data.current as { couple: Couple; zoneId: string }
      
      if (selectedCouples.length < 2) {
        if (!selectedCouples.find(c => c.id === draggedData.couple.id)) {
          const newSelection = [...selectedCouples, draggedData.couple]
          setSelectedCouples(newSelection)
          
          // Auto-agregar a staging cuando hay 2 parejas
          if (newSelection.length === 2) {
            const zoneName = zones.find(z => z.id === draggedData.zoneId)?.name || 'Zona'
            const newStagingMatch: StagingMatch = {
              id: `staging-${Date.now()}`,
              couple1: newSelection[0],
              couple2: newSelection[1],
              zoneId: draggedData.zoneId,
              zoneName,
              status: 'pending'
            }
            setStagingMatches(prev => [...prev, newStagingMatch])
            setSelectedCouples([]) // Reset selection
            
            toast({
              title: "Partido agregado a la cola",
              description: "Asigna una cancha para completar la preparación",
              variant: "default"
            })
          }
        }
      }
    }
  }

  // Handlers de staging
  const handleRemoveFromStaging = (matchId: string) => {
    setStagingMatches(prev => prev.filter(m => m.id !== matchId))
  }

  const handleCourtChangeInStaging = (matchId: string, court?: string) => {
    setStagingMatches(prev => 
      prev.map(match => 
        match.id === matchId 
          ? { ...match, court, status: court ? 'ready' as const : 'pending' as const }
          : match
      )
    )
  }

  // Crear todos los partidos de staging
  const handleCreateAllStaging = async () => {
    const readyMatches = stagingMatches.filter(m => m.status === 'ready')
    if (readyMatches.length === 0) return

    setCreating(true)
    let successCount = 0
    let errorCount = 0
    let lastError = ''

    try {
      // Marcar como creando
      setStagingMatches(prev => 
        prev.map(match => 
          match.status === 'ready' 
            ? { ...match, status: 'creating' as const }
            : match
        )
      )

      for (const match of readyMatches) {
        try {
          const response = await fetch(`/api/tournaments/${tournamentId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              zoneId: match.zoneId,
              couple1Id: match.couple1.id,
              couple2Id: match.couple2.id,
              court: match.court ? parseInt(match.court) : null,
            }),
          })

          const result = await response.json()

          if (response.ok && result.success) {
            successCount++
          } else {
            console.error("Error creating match:", result.error)
            lastError = result.error || 'Error desconocido'
            errorCount++
          }
        } catch (err) {
          console.error("Error creating individual match:", err)
          lastError = 'Error de conexión'
          errorCount++
        }
      }

      // Limpiar staging de partidos exitosos
      setStagingMatches(prev => prev.filter(m => m.status !== 'creating'))

      if (successCount > 0) {
        toast({
          title: `✅ ${successCount} partidos creados`,
          description: "Los partidos aparecen en la tabla de gestión",
          variant: "default"
        })
        
        if (onMatchesCreated) {
          onMatchesCreated()
        }
      }

      if (errorCount > 0) {
        toast({
          title: `❌ ${errorCount} partidos fallaron`,
          description: lastError,
          variant: "destructive"
        })
      }
    } catch (err) {
      console.error("Error in batch creation:", err)
      toast({
        title: "Error inesperado",
        description: "Problema al conectar con el servidor",
        variant: "destructive"
      })
    } finally {
      setCreating(false)
    }
  }

  if (!isOwner) {
    return (
      <div className="text-center py-8">
        <Users className="h-12 w-12 text-slate-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Acceso Restringido</h3>
        <p className="text-slate-500">Solo el dueño del torneo puede crear partidos.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 text-slate-600 animate-spin" />
        <span className="ml-3 text-slate-500">Cargando zonas...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-surface border border-red-200">
        <div className="font-semibold mb-1">Error al cargar zonas</div>
        <div className="text-sm">{error}</div>
      </div>
    )
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-6">
        {/* Staging Area */}
        <MatchStagingArea
          stagingMatches={stagingMatches}
          onRemoveMatch={handleRemoveFromStaging}
          onCourtChange={handleCourtChangeInStaging}
          onCreateAll={handleCreateAllStaging}
          clubCourts={clubCourts}
          creating={creating}
        />

        {/* Creation Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Drop Zone */}
          <div>
            <EnhancedMatchDropZone 
              selectedCouples={selectedCouples}
              onCoupleAdded={(couple) => {
                if (selectedCouples.length < 2 && !selectedCouples.find(c => c.id === couple.id)) {
                  setSelectedCouples(prev => [...prev, couple])
                }
              }}
            />
          </div>

          {/* Zones Matrix */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Zonas del Torneo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {zones.map((zone) => {
                    const zoneMatches = matches.filter(match => match.zone_id === zone.id)
                    const couplesWithFinished = couplesWithFinishedMatches[zone.id] || []
                    
                    return (
                      <ZoneMatrixTable
                        key={zone.id}
                        zone={zone}
                        matches={zoneMatches}
                        onCoupleClick={(couple, zoneId) => {
                          // Implementar click handler si es necesario
                        }}
                        selectedCouples={selectedCouples}
                        couplesWithFinishedMatches={couplesWithFinished}
                      />
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeDragId ? (
          <Card className="opacity-90 shadow-lg border-emerald-300">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-600" />
                <div className="text-sm font-medium text-slate-900">
                  Arrastrando pareja...
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}