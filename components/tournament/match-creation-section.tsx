"use client"

import { useEffect, useState } from "react"
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDraggable, useDroppable } from "@dnd-kit/core"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Users, Plus, X, Save } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
// Avoid importing server actions inside client components
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

interface MatchCreationSectionProps {
  tournamentId: string
  clubCourts: number
  isOwner?: boolean
  onMatchesCreated?: () => void
  refreshTrigger?: number
}

const DraggableCouple = ({ couple, zoneId, isSelected }: { 
  couple: Couple; 
  zoneId: string;
  isSelected: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `couple-${couple.id}`,
    data: { couple, zoneId }
  })

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined

  return (
    <Card 
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab active:cursor-grabbing hover:shadow-md transition-all border-slate-200 ${
        isDragging ? 'opacity-50 shadow-lg' : 'bg-white'
      } ${isSelected ? 'ring-2 ring-emerald-500 bg-emerald-50' : ''}`}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-900 truncate">
              {couple.player1_name}
            </div>
            <div className="text-sm font-medium text-slate-900 truncate">
              {couple.player2_name}
            </div>
          </div>
          <Badge 
            variant={couple.stats.points >= 0 ? "default" : "secondary"} 
            className={`text-xs ${couple.stats.points >= 0 ? 'bg-green-600 text-white' : 'bg-red-100 text-red-700'}`}
          >
            {couple.stats.points >= 0 ? '+' : ''}{couple.stats.points}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}

const MatchCreationZone = ({ selectedCouples }: { selectedCouples: Couple[] }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: 'match-creation-zone'
  })

  return (
    <Card 
      ref={setNodeRef}
      className={`border-dashed border-2 transition-colors ${
        isOver 
          ? 'border-emerald-500 bg-emerald-50' 
          : selectedCouples.length === 0 
            ? 'border-slate-300 bg-slate-50'
            : 'border-emerald-300 bg-emerald-25'
      }`}
    >
      <CardContent className="p-6 text-center">
        <div className="space-y-3">
          <Users className="h-8 w-8 text-slate-400 mx-auto" />
          <div>
            <p className="font-medium text-slate-700">
              {selectedCouples.length === 0 && "Arrastra parejas aquí para crear un partido"}
              {selectedCouples.length === 1 && "Necesitas una pareja más"}
              {selectedCouples.length === 2 && "¡Listo para crear el partido!"}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Parejas seleccionadas: {selectedCouples.length}/2
            </p>
          </div>
          
          {selectedCouples.length > 0 && (
            <div className="space-y-2 mt-4">
              {selectedCouples.map((couple, index) => (
                <div key={couple.id} className="bg-white rounded-surface p-2 border">
                  <div className="text-sm font-medium">
                    {couple.player1_name} / {couple.player2_name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const MatchBuilder = ({ 
  pendingMatches, 
  onRemoveMatch, 
  onCourtChange,
  clubCourts,
  selectedCouples
}: {
  pendingMatches: PendingMatch[]
  onRemoveMatch: (matchId: string) => void
  onCourtChange: (matchId: string, court?: string) => void
  clubCourts: number
  selectedCouples: Couple[]
}) => {
  return (
    <div className="space-y-4">
      {/* Match Creation Zone */}
      <MatchCreationZone selectedCouples={selectedCouples} />
      
      <div className="flex items-center gap-2 mb-4">
        <Plus className="h-5 w-5 text-slate-600" />
        <h3 className="text-lg font-semibold text-slate-900">
          Partidos a Crear ({pendingMatches.length})
        </h3>
      </div>
      
      {pendingMatches.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-300 bg-slate-50">
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-500 mb-2">No hay partidos pendientes</p>
            <p className="text-sm text-slate-400">
              Arrastra parejas de las zonas para crear partidos
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pendingMatches.map((match) => (
            <Card key={match.id} className="border-emerald-200 bg-emerald-50">
              <CardContent className="p-4">
                <div className="space-y-3">
                  {/* Match details */}
                  <div className="flex items-center justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-emerald-600" />
                        <span className="font-medium text-emerald-900">
                          {match.couple1.player1_name} / {match.couple1.player2_name}
                        </span>
                      </div>
                      <div className="text-center text-emerald-700 font-medium">VS</div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-emerald-600" />
                        <span className="font-medium text-emerald-900">
                          {match.couple2.player1_name} / {match.couple2.player2_name}
                        </span>
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
                  
                  {/* Court selector */}
                  <CourtSelector
                    maxCourts={clubCourts}
                    selectedCourt={match.court}
                    onCourtSelect={(court) => onCourtChange(match.id, court)}
                    className="mt-3"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MatchCreationSection({ 
  tournamentId, 
  clubCourts, 
  isOwner = false,
  onMatchesCreated,
  refreshTrigger = 0
}: MatchCreationSectionProps) {
  const [zones, setZones] = useState<Zone[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [couplesWithFinishedMatches, setCouplesWithFinishedMatches] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [selectedCouples, setSelectedCouples] = useState<Couple[]>([])
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const { toast } = useToast()

  // Load zones and matches data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        
        // Load zones and matches data using the new serialized API endpoints
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
          
          // For each zone, get couples with finished matches
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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)

    if (!over) return

    if (over.id === 'match-creation-zone') {
      const draggedData = active.data.current as { couple: Couple; zoneId: string }
      
      if (selectedCouples.length < 2) {
        if (!selectedCouples.find(c => c.id === draggedData.couple.id)) {
          const newSelection = [...selectedCouples, draggedData.couple]
          setSelectedCouples(newSelection)
          
          // Auto-create match when 2 couples selected
          if (newSelection.length === 2) {
            const newMatch: PendingMatch = {
              id: `temp-${Date.now()}`,
              couple1: newSelection[0],
              couple2: newSelection[1],
              zoneId: draggedData.zoneId,
            }
            setPendingMatches(prev => [...prev, newMatch])
            setSelectedCouples([]) // Reset selection
          }
        }
      }
    }
  }

  const handleCoupleClick = (couple: Couple, zoneId: string) => {
    // Check if couple has finished matches and cannot be moved
    const couplesWithFinished = couplesWithFinishedMatches[zoneId] || []
    if (couplesWithFinished.includes(couple.id)) {
      toast({
        title: "No se puede seleccionar",
        description: "Esta pareja ya ha jugado partidos en esta zona y no se puede mover.",
        variant: "destructive"
      })
      return
    }

    if (selectedCouples.length < 2) {
      if (!selectedCouples.find(c => c.id === couple.id)) {
        const newSelection = [...selectedCouples, couple]
        setSelectedCouples(newSelection)
        
        // Auto-create match when 2 couples selected
        if (newSelection.length === 2) {
          const newMatch: PendingMatch = {
            id: `temp-${Date.now()}`,
            couple1: newSelection[0],
            couple2: newSelection[1],
            zoneId: zoneId,
          }
          setPendingMatches(prev => [...prev, newMatch])
          setSelectedCouples([]) // Reset selection
        }
      }
    }
  }

  const handleRemoveMatch = (matchId: string) => {
    setPendingMatches(prev => prev.filter(m => m.id !== matchId))
  }

  const handleCourtChange = (matchId: string, court?: string) => {
    setPendingMatches(prev => 
      prev.map(match => 
        match.id === matchId ? { ...match, court } : match
      )
    )
  }

  const parseMatchCreationError = (errorMessage: string) => {
    // Split multiple error messages that are joined with ". "
    const errors = errorMessage.split('. ').filter(msg => msg.trim().length > 0)
    
    // Group similar errors and format them nicely
    const duplicateErrors = errors.filter(msg => msg.includes('ya tienen un partido creado'))
    const limitErrors = errors.filter(msg => msg.includes('ya jugó') && msg.includes('partidos permitidos'))
    const otherErrors = errors.filter(msg => 
      !msg.includes('ya tienen un partido creado') && 
      !msg.includes('ya jugó') && 
      !msg.includes('partidos permitidos')
    )

    let formattedMessage = ''
    
    if (duplicateErrors.length > 0) {
      formattedMessage += '❌ **Partido duplicado:** Estas parejas ya tienen un partido programado en esta zona.\n\n'
    }
    
    if (limitErrors.length > 0) {
      const limitErrorsText = limitErrors.map(err => `• ${err}`).join('\n')
      formattedMessage += `⚠️ **Límite de partidos alcanzado:**\n${limitErrorsText}\n\n`
    }
    
    if (otherErrors.length > 0) {
      const otherErrorsText = otherErrors.map(err => `• ${err}`).join('\n')
      formattedMessage += `❗ **Otros errores:**\n${otherErrorsText}\n\n`
    }
    
    formattedMessage += '💡 **Solución:** Verifica las parejas seleccionadas y asegúrate de que no hayan alcanzado su límite de partidos en esta zona.'
    
    return formattedMessage.trim()
  }

  const handleCreateMatches = async () => {
    if (pendingMatches.length === 0) return

    setCreating(true)
    let successCount = 0
    let errorCount = 0
    let lastError = ''

    try {
      for (const match of pendingMatches) {
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

      if (successCount > 0) {
        const successMessage = errorCount > 0 
          ? `${successCount} partidos creados exitosamente. ${errorCount} partidos fallaron por errores de validación.`
          : `${successCount} partidos creados exitosamente.`
        
        toast({
          title: "Partidos creados",
          description: successMessage,
          variant: "default"
        })
        
        // If there were errors, show them in a separate toast
        if (errorCount > 0 && lastError) {
          setTimeout(() => {
            const formattedError = parseMatchCreationError(lastError)
            toast({
              title: `${errorCount} partido${errorCount > 1 ? 's' : ''} no se pudo${errorCount > 1 ? 'ieron' : ''} crear`,
              description: formattedError,
              variant: "destructive"
            })
          }, 1000) // Small delay to show after success message
        }
        
        setPendingMatches([])
        
        // Reload both zones and matches data to update the matrix with new scores
        const [updatedZonesResponse, updatedMatchesResponse] = await Promise.all([
          fetch(`/api/tournaments/${tournamentId}?endpoint=zones`),
          fetch(`/api/tournaments/${tournamentId}`)
        ])
        
        const [updatedZonesResult, updatedMatchesResult] = await Promise.all([
          updatedZonesResponse.json(),
          updatedMatchesResponse.json()
        ])
        
        if (updatedZonesResult.success && updatedZonesResult.zones) {
          setZones(updatedZonesResult.zones)
        }
        
        if (updatedMatchesResult.success && updatedMatchesResult.matches) {
          setMatches(updatedMatchesResult.matches)
        }
        
        if (onMatchesCreated) {
          onMatchesCreated()
        }
      }

      if (errorCount > 0 && successCount === 0) {
        const formattedError = parseMatchCreationError(lastError)
        toast({
          title: "No se pudo crear el partido",
          description: formattedError,
          variant: "destructive"
        })
      }
    } catch (err) {
      console.error("Error in batch creation:", err)
      toast({
        title: "Error inesperado",
        description: "Ocurrió un problema al conectar con el servidor. Por favor, intenta nuevamente.",
        variant: "destructive"
      })
    } finally {
      setCreating(false)
    }
  }

  if (!isOwner) {
    return (
      <div className="text-center py-16">
        <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Users className="h-10 w-10 text-slate-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900 mb-2">Acceso Restringido</h3>
        <p className="text-slate-500">Solo el dueño del torneo puede crear partidos.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2 className="h-8 w-8 text-slate-600 animate-spin" />
        <span className="ml-3 text-slate-500">Cargando zonas...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-surface border border-red-200 text-center">
        <div className="font-semibold mb-1">Error al cargar zonas</div>
        <div className="text-sm">{error}</div>
      </div>
    )
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
        {/* Left side - Zones */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Zonas del Torneo</h2>
            {selectedCouples.length > 0 && (
              <Badge variant="default" className="bg-emerald-600">
                {selectedCouples.length}/2 seleccionadas
              </Badge>
            )}
          </div>

          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            {zones.map((zone) => {
              // Filter matches for this zone
              const zoneMatches = matches.filter(match => match.zone_id === zone.id)
              const couplesWithFinished = couplesWithFinishedMatches[zone.id] || []
              
              return (
                <ZoneMatrixTable
                  key={zone.id}
                  zone={zone}
                  matches={zoneMatches}
                  onCoupleClick={handleCoupleClick}
                  selectedCouples={selectedCouples}
                  couplesWithFinishedMatches={couplesWithFinished}
                />
              )
            })}
          </div>
        </div>

        {/* Right side - Match Builder */}
        <div className="space-y-4">
          <MatchBuilder
            pendingMatches={pendingMatches}
            onRemoveMatch={handleRemoveMatch}
            onCourtChange={handleCourtChange}
            clubCourts={clubCourts}
            selectedCouples={selectedCouples}
          />

          {/* Create matches button */}
          {pendingMatches.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <Button
                  onClick={handleCreateMatches}
                  disabled={creating}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  size="lg"
                >
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creando partidos...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Crear {pendingMatches.length} Partido{pendingMatches.length !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeDragId ? (
          <Card className="opacity-90 shadow-lg">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" />
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