'use client'

import React, { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Trophy, Calendar, Users, Clock, AlertTriangle } from 'lucide-react'
import { useTournamentPermissions } from '@/hooks/use-tournament-permissions'
import { getMatchSchedulingData, SchedulingData, CoupleWithData, TimeSlot, createMatch, CustomSchedule } from '../actions'
import SchedulingMatrixV0 from './SchedulingMatrixV0'
import DraftMatchesManager from './DraftMatchesManager'
import MatchRecommendationPanel from './MatchRecommendationPanel'

interface TournamentFecha {
  id: string
  name: string
  fecha_number: number
  description?: string
  status: string
  start_date?: string
  end_date?: string
}

interface Club {
  id: string
  name: string
}

interface MatchSchedulingContainerProps {
  tournamentId: string
  tournamentName: string
  clubName: string
  fechas: TournamentFecha[]
  selectedFechaId: string
  clubes: Club[]
  isDraftModeEnabled: boolean
}

const MatchSchedulingContainer: React.FC<MatchSchedulingContainerProps> = ({
  tournamentId,
  tournamentName,
  clubName,
  fechas,
  selectedFechaId: initialFechaId,
  clubes,
  isDraftModeEnabled
}) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  
  // Client-side state management like schedules
  const selectedFechaId = initialFechaId
  const [schedulingData, setSchedulingData] = useState<SchedulingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const { permissions, isLoading: permissionsLoading } = useTournamentPermissions(tournamentId)

  // Selection state for couples
  const [selectedCouples, setSelectedCouples] = useState<string[]>([])
  const [draggedCouple, setDraggedCouple] = useState<string | null>(null)
  const [createdMatches, setCreatedMatches] = useState<string[]>([])

  // Load scheduling data when fecha changes - like schedules pattern
  useEffect(() => {
    const loadSchedulingData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const result = await getMatchSchedulingData(tournamentId, selectedFechaId)
        
        if (result.success && result.data) {
          setSchedulingData(result.data)
        } else {
          setError(result.error || 'Error al cargar datos de programación')
        }
      } catch (err) {
        setError('Error inesperado al cargar los datos')
        console.error('Error loading scheduling data:', err)
      } finally {
        setLoading(false)
      }
    }

    if (selectedFechaId) {
      loadSchedulingData()
    }
  }, [tournamentId, selectedFechaId, refreshKey])

  // Get current fecha info
  const currentFecha = fechas.find(f => f.id === selectedFechaId)

  // Handle fecha change - URL-based navigation (same as schedules)
  const handleFechaChange = (newFechaId: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('fecha_id', newFechaId)
      router.push(`/tournaments/${tournamentId}/match-scheduling?${params.toString()}`)
    })
  }

  // Handle couple selection
  const handleCoupleSelect = (coupleId: string) => {
    if (selectedCouples.includes(coupleId)) {
      // Deselect
      setSelectedCouples(prev => prev.filter(id => id !== coupleId))
    } else if (selectedCouples.length < 2) {
      // Select
      setSelectedCouples(prev => [...prev, coupleId])
    }
  }

  // Clear selection
  const handleClearSelection = () => {
    setSelectedCouples([])
  }

  // Handle match creation callback - page will auto-refresh via URL navigation
  const handleMatchCreated = () => {
    // Force data refresh by incrementing refreshKey (triggers useEffect to reload data)
    setRefreshKey(prev => prev + 1)
    // Also refresh the Next.js cache
    router.refresh()
  }

  // Statistics - with null check
  const stats = schedulingData ? {
    totalCouples: schedulingData.couples.length,
    availableCouples: schedulingData.couples.filter(c => !c.has_played_in_this_date).length,
    playedCouples: schedulingData.couples.filter(c => c.has_played_in_this_date).length,
    freeDateBlocked: schedulingData.couples.filter(c => c.free_date_blocked).length,
    totalTimeSlots: schedulingData.timeSlots.length,
    existingMatches: schedulingData.existingMatches.length
  } : {
    totalCouples: 0,
    availableCouples: 0,
    playedCouples: 0,
    freeDateBlocked: 0,
    totalTimeSlots: 0,
    existingMatches: 0
  }

  // Handle loading and error states
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold mb-2">Cargando datos de programación</h3>
              <p className="text-gray-600">Un momento por favor...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center">
              <div className="text-red-600 mb-4">❌</div>
              <h3 className="text-lg font-semibold mb-2 text-red-600">Error al cargar datos</h3>
              <p className="text-gray-600 mb-4">{error}</p>
              <button 
                onClick={() => setRefreshKey(prev => prev + 1)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!schedulingData) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">No hay datos disponibles</h3>
              <p className="text-gray-600">No se pudieron cargar los datos de programación.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4 lg:py-6">
          <div className="max-w-7xl mx-auto">
            {/* Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 lg:mb-6">
              <Button asChild variant="outline" className="border-gray-300 w-fit">
                <Link href={`/tournaments/${tournamentId}`} className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Volver al Torneo</span>
                </Link>
              </Button>
              
              <div className="flex items-center gap-2">
                <div className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-medium">
                  Programación de Partidos
                </div>
                {permissions.hasPermission && !permissionsLoading && (
                  <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                    Vista Organizador
                  </div>
                )}
              </div>
            </div>

            {/* Tournament Title */}
            <div className="flex items-start gap-3 lg:gap-4 mb-6">
              <div className="bg-orange-100 p-2 lg:p-3 rounded-xl">
                <Trophy className="h-5 w-5 lg:h-6 lg:w-6 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-2 truncate">
                  {tournamentName} - Programación de Partidos
                </h1>
                
                <div className="flex flex-wrap items-center gap-3 lg:gap-4 text-xs lg:text-sm text-slate-600">
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3 lg:h-4 lg:w-4" />
                    <span>{clubName}</span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 lg:h-4 lg:w-4" />
                    <span>Seleccionar y arrastrar</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Fecha Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-700">Fecha:</span>
              </div>
              
              <Select value={selectedFechaId} onValueChange={handleFechaChange} disabled={isPending}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Seleccionar fecha" />
                  {isPending && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 ml-2"></div>
                  )}
                </SelectTrigger>
                <SelectContent>
                  {fechas.map((fecha) => (
                    <SelectItem key={fecha.id} value={fecha.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Fecha {fecha.fecha_number}</span>
                        <span className="text-slate-500">- {fecha.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {currentFecha && (
                <div className="text-xs text-slate-500">
                  🏆 Fecha {currentFecha.fecha_number}
                </div>
              )}
              
              {/* Quick navigation buttons like in schedules */}
              {fechas.length > 1 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currentIndex = fechas.findIndex(f => f.id === selectedFechaId)
                      const prevIndex = currentIndex > 0 ? currentIndex - 1 : fechas.length - 1
                      handleFechaChange(fechas[prevIndex].id)
                    }}
                    disabled={isPending}
                  >
                    ← Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currentIndex = fechas.findIndex(f => f.id === selectedFechaId)
                      const nextIndex = currentIndex < fechas.length - 1 ? currentIndex + 1 : 0
                      handleFechaChange(fechas[nextIndex].id)
                    }}
                    disabled={isPending}
                  >
                    Siguiente →
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error handling moved to server-side */}

      {/* Stats Cards */}
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-blue-600">{stats.totalCouples}</div>
                <div className="text-xs text-slate-600">Total Parejas</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-green-600">{stats.availableCouples}</div>
                <div className="text-xs text-slate-600">Pueden Jugar</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-red-600">{stats.playedCouples}</div>
                <div className="text-xs text-slate-600">Ya Jugaron</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-rose-600">{stats.freeDateBlocked}</div>
                <div className="text-xs text-slate-600">Fecha Libre</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-purple-600">{stats.totalTimeSlots}</div>
                <div className="text-xs text-slate-600">Horarios</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-orange-600">{stats.existingMatches}</div>
                <div className="text-xs text-slate-600">Partidos</div>
              </CardContent>
            </Card>
          </div>

          {/* Draft Matches Manager - Only visible when draft mode is enabled */}
          {permissions.hasPermission && !permissionsLoading && (
            <MatchRecommendationPanel
              tournamentId={tournamentId}
              fechaId={selectedFechaId}
              enabled={isDraftModeEnabled}
              onDraftsChanged={handleMatchCreated}
            />
          )}

          <DraftMatchesManager
            key={`${selectedFechaId}-${refreshKey}`}
            fechaId={selectedFechaId}
            tournamentId={tournamentId}
            isDraftModeEnabled={isDraftModeEnabled}
            onMatchesPublished={handleMatchCreated}
            clubes={clubes}
          />

          {/* Main Content - V0 Style Matrix */}
          {permissionsLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <h3 className="text-lg font-semibold mb-2">Esperame que estoy bandejeando</h3>
                <p className="text-gray-600">
                  Un momento por favor.
                </p>
              </CardContent>
            </Card>
          ) : permissions.hasPermission ? (
            <SchedulingMatrixV0
              fechaId={selectedFechaId}
              schedulingData={schedulingData}
              onMatchCreated={handleMatchCreated}
              clubes={clubes}
            />
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertTriangle className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Acceso Restringido</h3>
                <p className="text-gray-600 mb-4">
                  Solo los organizadores del torneo pueden programar partidos.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Success Info Banner */}
          <div className="mt-8 bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Trophy className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-900 mb-1">
                  ✅ Sistema de Programación Completo
                </h3>
                <p className="text-green-700 text-sm">
                  <strong>Nueva experiencia:</strong> Parejas a la izquierda × Horarios arriba • <strong>Drag & Drop:</strong> Arrastra parejas a celdas de horario • <strong>3 Sets automáticos:</strong> Se crean automáticamente • <strong>Horarios personalizables:</strong> Configura fecha/hora específica
                </p>
              </div>
            </div>
          </div>
          
          {/* Loading overlay when changing fecha */}
          {isPending && (
            <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <span className="font-medium">Cambiando fecha...</span>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MatchSchedulingContainer
