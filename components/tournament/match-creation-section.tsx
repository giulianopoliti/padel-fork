"use client"

import { useEffect, useState } from "react"
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDroppable } from "@dnd-kit/core"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Loader2, MousePointer2, Plus, Save, Sparkles, Users, X } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
// Avoid importing server actions inside client components
import CourtSelector from "./court-selector"
import ZoneMatrixTable from "./zone-matrix-table"
import SingleZoneRecommendationPanel from "./match-recommendation/SingleZoneRecommendationPanel"
import {
  type ZoneRecommendationPair,
  zoneRecommendationPairKey,
} from "@/lib/services/zone-match-recommendation/types"

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
  zoneName: string
  source?: 'MANUAL' | 'RECOMMENDATION'
  recommendationRevision?: string
}

interface MatchCreationSectionProps {
  tournamentId: string
  clubCourts: number
  isOwner?: boolean
  onMatchesCreated?: () => void
  onPendingMatchesChange?: (count: number) => void
  refreshTrigger?: number
  recommendationEnabled?: boolean
}

interface CreateMatchResponse {
  success: boolean
  code?: string
  error?: string
  requiresConfirmation?: boolean
}

interface UnsafeMatchConfirmation {
  match: PendingMatch
  includeRevision: boolean
}

const MatchCreationZone = ({
  selectedCouples,
  selectedZoneName,
  onRemoveSelected
}: {
  selectedCouples: Couple[]
  selectedZoneName?: string
  onRemoveSelected: (coupleId: string) => void
}) => {
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
          <MousePointer2 className="h-8 w-8 text-slate-400 mx-auto" />
          <div>
            <p className="font-medium text-slate-700">
              {selectedCouples.length === 0 && "Elegí la primera pareja con un clic"}
              {selectedCouples.length === 1 && "Necesitas una pareja más"}
              {selectedCouples.length === 2 && "¡Listo para crear el partido!"}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Parejas seleccionadas: {selectedCouples.length}/2
              {selectedZoneName ? ` · ${selectedZoneName}` : ''}
            </p>
          </div>
          
          {selectedCouples.length > 0 && (
            <div className="space-y-2 mt-4">
              {selectedCouples.map((couple, index) => (
                <div key={couple.id} className="flex items-center justify-between gap-2 rounded-surface border border-rose-200 bg-white p-2 text-left">
                  <div className="min-w-0 text-sm font-medium">
                    <span className="mr-2 text-xs font-semibold text-rose-600">Pareja {index + 1}</span>
                    {couple.player1_name} / {couple.player2_name}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 shrink-0 p-0 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => onRemoveSelected(couple.id)}
                    aria-label={`Quitar a ${couple.player1_name} y ${couple.player2_name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
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
  selectedCouples,
  selectedZoneName,
  onRemoveSelected
}: {
  pendingMatches: PendingMatch[]
  onRemoveMatch: (matchId: string) => void
  onCourtChange: (matchId: string, court?: string) => void
  clubCourts: number
  selectedCouples: Couple[]
  selectedZoneName?: string
  onRemoveSelected: (coupleId: string) => void
}) => {
  return (
    <div className="space-y-4">
      {/* Match Creation Zone */}
      <MatchCreationZone
        selectedCouples={selectedCouples}
        selectedZoneName={selectedZoneName}
        onRemoveSelected={onRemoveSelected}
      />
      
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
              Elegí dos parejas de la misma zona para preparar un partido
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pendingMatches.map((match) => (
            <Card key={match.id} className="border-rose-200 bg-rose-50/70">
              <CardContent className="p-4">
                <div className="space-y-3">
                  {/* Match details */}
                  <div className="flex items-center justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-rose-600 text-white hover:bg-rose-600">En cola</Badge>
                        {match.source === 'RECOMMENDATION' && (
                          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                            <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
                            Recomendado
                          </Badge>
                        )}
                        <Badge variant="outline" className="border-rose-200 bg-white text-slate-600">{match.zoneName}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-rose-600" />
                        <span className="font-medium text-slate-900">
                          {match.couple1.player1_name} / {match.couple1.player2_name}
                        </span>
                      </div>
                      <div className="pl-6 text-xs font-semibold uppercase tracking-wide text-rose-600">vs.</div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-rose-600" />
                        <span className="font-medium text-slate-900">
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
  onPendingMatchesChange,
  refreshTrigger = 0,
  recommendationEnabled = false,
}: MatchCreationSectionProps) {
  const [zones, setZones] = useState<Zone[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [couplesWithFinishedMatches, setCouplesWithFinishedMatches] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [selectedCouples, setSelectedCouples] = useState<Couple[]>([])
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [visibleZoneId, setVisibleZoneId] = useState<string | null>(null)
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [recommendationOpen, setRecommendationOpen] = useState(false)
  const [recommendationRefreshTrigger, setRecommendationRefreshTrigger] = useState(0)
  const [unsafeMatch, setUnsafeMatch] = useState<UnsafeMatchConfirmation | null>(null)
  const [confirmingUnsafe, setConfirmingUnsafe] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    onPendingMatchesChange?.(pendingMatches.length)
  }, [onPendingMatchesChange, pendingMatches.length])

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
          setVisibleZoneId(currentZoneId =>
            zonesResult.zones.some((zone: Zone) => zone.id === currentZoneId)
              ? currentZoneId
              : zonesResult.zones[0]?.id || null
          )
          
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

  const handleSelectCouple = (couple: Couple, zoneId: string) => {
    if (pendingMatches.some(match => match.source === 'RECOMMENDATION')) {
      toast({
        title: "Primero creá el cruce recomendado",
        description: "Para conservar el plan calculado, no agregues otros partidos mientras esa recomendación está en cola.",
      })
      return
    }

    const unavailableCouples = couplesWithFinishedMatches[zoneId] || []
    if (unavailableCouples.includes(couple.id)) {
      toast({
        title: "Cupo de partidos completo",
        description: "Esta pareja ya alcanzó el máximo de partidos permitido en la zona.",
        variant: "destructive"
      })
      return
    }

    if (selectedCouples.some(selectedCouple => selectedCouple.id === couple.id)) {
      setSelectedCouples(current => current.filter(selectedCouple => selectedCouple.id !== couple.id))
      if (selectedCouples.length === 1) setSelectedZoneId(null)
      return
    }

    if (selectedZoneId && selectedZoneId !== zoneId) {
      toast({
        title: "Elegí una pareja de la misma zona",
        description: "Terminá o cancelá la selección actual antes de cambiar de zona.",
        variant: "destructive"
      })
      return
    }

    if (selectedCouples.length === 0) {
      setSelectedCouples([couple])
      setSelectedZoneId(zoneId)
      return
    }

    const firstCouple = selectedCouples[0]
    const matchAlreadyExists = matches.some(match =>
      match.zone_id === zoneId && (
        (match.couple1_id === firstCouple.id && match.couple2_id === couple.id) ||
        (match.couple1_id === couple.id && match.couple2_id === firstCouple.id)
      )
    )
    const matchAlreadyQueued = pendingMatches.some(match =>
      match.zoneId === zoneId && (
        (match.couple1.id === firstCouple.id && match.couple2.id === couple.id) ||
        (match.couple1.id === couple.id && match.couple2.id === firstCouple.id)
      )
    )

    if (matchAlreadyExists || matchAlreadyQueued) {
      toast({
        title: matchAlreadyExists ? "Partido ya creado" : "Partido ya en cola",
        description: "Estas dos parejas ya tienen este enfrentamiento registrado.",
        variant: "destructive"
      })
      return
    }

    const zone = zones.find(currentZone => currentZone.id === zoneId)
    const newMatch: PendingMatch = {
      id: `temp-${Date.now()}-${firstCouple.id}-${couple.id}`,
      couple1: firstCouple,
      couple2: couple,
      zoneId,
      zoneName: zone?.name || "Zona",
      source: 'MANUAL',
    }

    setPendingMatches(current => [...current, newMatch])
    setSelectedCouples([])
    setSelectedZoneId(null)
  }

  const handleUseRecommendations = ({
    zoneId,
    matches: recommendedMatches,
    revision,
  }: {
    zoneId: string
    matches: ZoneRecommendationPair[]
    revision: string
  }) => {
    const manualMatchesArePending = pendingMatches.some(match => match.source !== 'RECOMMENDATION')
    if (manualMatchesArePending) {
      toast({
        title: "Hay cruces manuales en cola",
        description: "Crealos o quitalos antes de mezclar una tanda recomendada.",
      })
      return
    }

    const zone = zones.find(currentZone => currentZone.id === zoneId)
    const couplesById = new Map(zone?.couples.map(couple => [couple.id, couple]) || [])
    const queuedKeys = new Set(pendingMatches.map(match =>
      zoneRecommendationPairKey(match.couple1.id, match.couple2.id),
    ))
    const matchesToQueue = recommendedMatches.filter(match =>
      !queuedKeys.has(zoneRecommendationPairKey(match.couple1Id, match.couple2Id)),
    )
    const everyCoupleExists = matchesToQueue.every(match =>
      couplesById.has(match.couple1Id) && couplesById.has(match.couple2Id),
    )

    if (!zone || !everyCoupleExists) {
      toast({
        title: "La recomendación quedó desactualizada",
        description: "Actualizá los datos y volvé a calcular el cruce.",
        variant: "destructive",
      })
      setRecommendationRefreshTrigger(current => current + 1)
      return
    }

    const newPendingMatches: PendingMatch[] = matchesToQueue.map(match => ({
      id: `recommended-${revision}-${match.couple1Id}-${match.couple2Id}`,
      couple1: couplesById.get(match.couple1Id)!,
      couple2: couplesById.get(match.couple2Id)!,
      zoneId,
      zoneName: zone.name || "Zona",
      source: 'RECOMMENDATION' as const,
      recommendationRevision: revision,
    }))

    if (newPendingMatches.length === 0) return

    setPendingMatches(current => [...current, ...newPendingMatches])
    setVisibleZoneId(zoneId)
    setSelectedCouples([])
    setSelectedZoneId(null)
    toast({
      title: newPendingMatches.length === 1 ? "Cruce agregado" : "Cruces agregados",
      description: `${newPendingMatches.length} partido${newPendingMatches.length === 1 ? '' : 's'} enviado${newPendingMatches.length === 1 ? '' : 's'} a la cola. Ahora podés asignar las canchas.`,
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)

    if (!over) return

    if (over.id === 'match-creation-zone') {
      const draggedData = active.data.current as { couple: Couple; zoneId: string }
      handleSelectCouple(draggedData.couple, draggedData.zoneId)
    }
  }

  const handleCoupleClick = (couple: Couple, zoneId: string) => {
    handleSelectCouple(couple, zoneId)
  }

  const handleRemoveSelected = (coupleId: string) => {
    setSelectedCouples(current => current.filter(couple => couple.id !== coupleId))
    setSelectedZoneId(null)
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

  const postPendingMatch = async (
    match: PendingMatch,
    options: { allowUnsafe?: boolean; includeRevision?: boolean } = {},
  ) => {
    const { allowUnsafe = false, includeRevision = true } = options
    const response = await fetch(`/api/tournaments/${tournamentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zoneId: match.zoneId,
        couple1Id: match.couple1.id,
        couple2Id: match.couple2.id,
        court: match.court ? parseInt(match.court) : null,
        expectedRecommendationRevision: includeRevision ? match.recommendationRevision : undefined,
        allowUnsafe,
      }),
    })
    const result = await response.json() as CreateMatchResponse
    return { response, result }
  }

  const handleCreateMatches = async () => {
    if (pendingMatches.length === 0) return

    setCreating(true)
    let successCount = 0
    let errorCount = 0
    let lastError = ''
    let lastErrorCode = ''
    let confirmationRequested = false
    const successfulMatchIds = new Set<string>()
    const validatedRecommendationRevisions = new Set<string>()

    try {
      for (const match of pendingMatches) {
        try {
          const includeRevision = Boolean(
            match.recommendationRevision &&
            !validatedRecommendationRevisions.has(match.recommendationRevision),
          )
          const { response, result } = await postPendingMatch(match, { includeRevision })

          if (response.ok && result.success) {
            successCount++
            successfulMatchIds.add(match.id)
            if (match.recommendationRevision) {
              validatedRecommendationRevisions.add(match.recommendationRevision)
            }
          } else if (result.requiresConfirmation) {
            // Se detiene el lote: los partidos que siguen todavía no fueron
            // evaluados contra el posible override del organizador.
            setUnsafeMatch({ match, includeRevision })
            confirmationRequested = true
            break
          } else {
            console.error("Error creating match:", result.error)
            lastError = result.error || 'Error desconocido'
            lastErrorCode = result.code || ''
            errorCount++

            if (result.code === 'RECOMMENDATION_STALE') {
              // La sugerencia anterior ya no debe seguir ocupando la cola: se
              // descarta y se muestra inmediatamente el nuevo cálculo.
              setPendingMatches(current => current.filter(item =>
                match.recommendationRevision
                  ? item.recommendationRevision !== match.recommendationRevision
                  : item.id !== match.id,
              ))
              setRecommendationOpen(true)
              setRecommendationRefreshTrigger(current => current + 1)
              break
            }
          }
        } catch (err) {
          console.error("Error creating individual match:", err)
          lastError = 'Error de conexión'
          lastErrorCode = ''
          errorCount++
        }
      }

      if (successCount > 0) {
        const successMessage = confirmationRequested
          ? `${successCount} partidos creados. Revisá el cruce que requiere confirmación antes de continuar.`
          : errorCount > 0
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
        
        setPendingMatches(current => current
          .filter(match => !successfulMatchIds.has(match.id))
          .map(match => match.recommendationRevision && validatedRecommendationRevisions.has(match.recommendationRevision)
            ? { ...match, recommendationRevision: undefined }
            : match),
        )
        setRecommendationRefreshTrigger(current => current + 1)
        onMatchesCreated?.()
      }

      if (errorCount > 0 && successCount === 0 && !confirmationRequested) {
        const title = lastErrorCode === 'RECOMMENDATION_STALE'
          ? "La recomendación quedó desactualizada"
          : lastErrorCode === 'COUPLE_IN_PROGRESS'
            ? "Una pareja ya está jugando"
            : "No se pudo crear el partido"
        const formattedError = parseMatchCreationError(lastError)
        toast({
          title,
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

  const handleConfirmUnsafeMatch = async () => {
    if (!unsafeMatch) return

    const { match: matchToCreate, includeRevision } = unsafeMatch
    setConfirmingUnsafe(true)
    try {
      const { response, result } = await postPendingMatch(matchToCreate, {
        allowUnsafe: true,
        includeRevision,
      })
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'No se pudo crear el partido')
      }

      setPendingMatches(current => current
        .filter(match => match.id !== matchToCreate.id)
        .map(match => match.recommendationRevision === matchToCreate.recommendationRevision
          ? { ...match, recommendationRevision: undefined }
          : match),
      )
      setUnsafeMatch(null)
      setRecommendationRefreshTrigger(current => current + 1)
      onMatchesCreated?.()
      toast({
        title: "Partido creado con confirmación",
        description: "El cruce fue creado aunque no conserva un cierre completo garantizado.",
      })
    } catch (confirmationError) {
      setUnsafeMatch(null)
      toast({
        title: "No se pudo crear el partido",
        description: confirmationError instanceof Error ? confirmationError.message : "Error inesperado",
        variant: "destructive",
      })
    } finally {
      setConfirmingUnsafe(false)
    }
  }

  const selectedZoneName = zones.find(zone => zone.id === selectedZoneId)?.name || undefined
  const visibleZones = zones.filter(zone => !visibleZoneId || zone.id === visibleZoneId)
  const hasManualPendingMatches = pendingMatches.some(match => match.source !== 'RECOMMENDATION')
  const queuedRecommendationPairKeys = pendingMatches
    .filter(match => match.source === 'RECOMMENDATION')
    .map(match => zoneRecommendationPairKey(match.couple1.id, match.couple2.id))

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
      <div className="space-y-6">
        {recommendationEnabled && (
          <section aria-labelledby="match-assistant-title" className="space-y-3">
            <div className="flex flex-col gap-3 rounded-surface border border-blue-100 bg-blue-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 id="match-assistant-title" className="font-semibold text-slate-900">Asistente de cruces</h2>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Buscá un partido que permita completar la zona sin repetir rivales.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant={recommendationOpen ? "secondary" : "outline"}
                className="shrink-0 gap-2 border-blue-200 bg-white text-blue-800 hover:bg-blue-100"
                aria-expanded={recommendationOpen}
                aria-controls="single-zone-recommendation"
                onClick={() => setRecommendationOpen(current => !current)}
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {recommendationOpen ? "Ocultar recomendación" : "Recomendar cruce"}
              </Button>
            </div>

            {recommendationOpen && (
              <div id="single-zone-recommendation">
                <SingleZoneRecommendationPanel
                  tournamentId={tournamentId}
                  refreshTrigger={refreshTrigger + recommendationRefreshTrigger}
                  useDisabled={hasManualPendingMatches}
                  useDisabledReason="Creá o vaciá los cruces manuales antes de agregar una tanda recomendada."
                  queuedPairKeys={queuedRecommendationPairKeys}
                  onUseRecommendations={handleUseRecommendations}
                />
              </div>
            )}
          </section>
        )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
        {/* Left side - Zones */}
        <div className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Elegir parejas</h2>
                <p className="mt-1 text-sm text-slate-500">Un clic selecciona; el segundo clic prepara el partido.</p>
              </div>
            {selectedCouples.length > 0 && (
              <Badge className="shrink-0 bg-rose-600 text-white hover:bg-rose-600">
                {selectedCouples.length}/2 seleccionadas
              </Badge>
            )}
            </div>

            {zones.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Seleccionar zona">
                {zones.map(zone => (
                  <Button
                    key={zone.id}
                    type="button"
                    size="sm"
                    variant={visibleZoneId === zone.id ? "default" : "outline"}
                    className={visibleZoneId === zone.id ? "shrink-0 bg-slate-900 text-white hover:bg-slate-800" : "shrink-0"}
                    onClick={() => {
                      setVisibleZoneId(zone.id)
                      setSelectedCouples([])
                      setSelectedZoneId(null)
                    }}
                  >
                    {zone.name || "Zona"}
                  </Button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-x-3 gap-y-2 text-xs text-slate-600">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-600" />En selección o cola</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />En juego</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Finalizado</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" />Cupo completo</span>
            </div>
          </div>

          <div className="space-y-4 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
            {visibleZones.map((zone) => {
              // Filter matches for this zone
              const zoneMatches = matches.filter(match => match.zone_id === zone.id)
              const couplesWithFinished = couplesWithFinishedMatches[zone.id] || []
              const pendingCoupleIds = Array.from(new Set(
                pendingMatches
                  .filter(match => match.zoneId === zone.id)
                  .flatMap(match => [match.couple1.id, match.couple2.id])
              ))
              const matchStatusSummaryByCouple = zoneMatches.reduce<Record<string, {
                finished: number
                inProgress: number
                pending: number
              }>>((summary, match) => {
                const coupleIds = [match.couple1_id, match.couple2_id]

                coupleIds.forEach(coupleId => {
                  const currentSummary = summary[coupleId] || { finished: 0, inProgress: 0, pending: 0 }

                  if (match.status === 'FINISHED') currentSummary.finished += 1
                  else if (match.status === 'IN_PROGRESS') currentSummary.inProgress += 1
                  else if (match.status === 'PENDING') currentSummary.pending += 1

                  summary[coupleId] = currentSummary
                })

                return summary
              }, {})
              
              return (
                <ZoneMatrixTable
                  key={zone.id}
                  zone={zone}
                  matches={zoneMatches}
                  onCoupleClick={handleCoupleClick}
                  selectedCouples={selectedCouples}
                  couplesWithFinishedMatches={couplesWithFinished}
                  pendingCoupleIds={pendingCoupleIds}
                  matchStatusSummaryByCouple={matchStatusSummaryByCouple}
                />
              )
            })}
          </div>
        </div>

        {/* Right side - Match Builder */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <MatchBuilder
            pendingMatches={pendingMatches}
            onRemoveMatch={handleRemoveMatch}
            onCourtChange={handleCourtChange}
            clubCourts={clubCourts}
            selectedCouples={selectedCouples}
            selectedZoneName={selectedZoneName}
            onRemoveSelected={handleRemoveSelected}
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

      <AlertDialog
        open={Boolean(unsafeMatch)}
        onOpenChange={open => {
          if (!open && !confirmingUnsafe) setUnsafeMatch(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este cruce puede romper el fixture restante</AlertDialogTitle>
            <AlertDialogDescription>
              {unsafeMatch
                ? `${unsafeMatch.match.couple1.player1_name} / ${unsafeMatch.match.couple1.player2_name} vs. ${unsafeMatch.match.couple2.player1_name} / ${unsafeMatch.match.couple2.player2_name} no conserva un cierre completo garantizado sin repetir rivales.`
                : 'El partido no conserva un cierre completo garantizado.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={confirmingUnsafe}
              onClick={() => {
                setRecommendationOpen(true)
                setRecommendationRefreshTrigger(current => current + 1)
              }}
            >
              Cancelar y recalcular
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmingUnsafe}
              onClick={event => {
                event.preventDefault()
                void handleConfirmUnsafeMatch()
              }}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {confirmingUnsafe && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Crear igualmente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DndContext>
  )
}
