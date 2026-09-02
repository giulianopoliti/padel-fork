'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Calendar, Info, Users, Clock, Trophy, AlertTriangle, Edit3, Save, X, Zap } from 'lucide-react'
import RoundSelector, { type Round } from './RoundSelector'
import ScheduleMatrix from './ScheduleMatrix'
import ModifyScheduleDialog from '../../match-scheduling/components/ModifyScheduleDialog'
import LoadMatchResultDialog from '../../match-scheduling/components/LoadMatchResultDialog'
import type { ExistingMatch } from '../../match-scheduling/actions'
import { BracketDragDropProvider, useBracketDragDrop } from '@/components/tournament/bracket-v2/context/bracket-drag-context'
import { useBracketDragOperations } from '@/components/tournament/bracket-v2/hooks/useBracketDragOperations'
import { useLongBracketData } from '../hooks/useLongBracketData'
import type { BracketMatchV2 } from '@/components/tournament/bracket-v2/types/bracket-types'
import { toast } from 'sonner'
import useSWR from 'swr'
import { createClient } from '@/utils/supabase/client'
import { useTournament } from '@/hooks/use-tournament'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import type { BracketKey } from '@/types/tournament-format-v2'

interface Club {
  id: string
  name: string
}

// Type mapping entre el RoundSelector local y el ENUM de base de datos
type RoundTypeEnum = 'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL'

const ROUND_TO_ENUM_MAP: Record<Round, RoundTypeEnum> = {
  '32VOS': '32VOS',
  '16VOS': '16VOS',
  '8VOS': '8VOS',
  '4TOS': '4TOS',
  'SEMIFINAL': 'SEMIFINAL',
  'FINAL': 'FINAL'
}

const ROUND_CONFIG: Record<Round, { displayName: string }> = {
  '32VOS': { displayName: 'Treintaidosavos' },
  '16VOS': { displayName: 'Dieciseisavos' },
  '8VOS': { displayName: 'Octavos de Final' },
  '4TOS': { displayName: 'Cuartos de Final' },
  'SEMIFINAL': { displayName: 'Semifinales' },
  'FINAL': { displayName: 'Final' }
}

interface LongScheduleViewProps {
  tournamentId: string
}

// Componente interno con acceso al contexto de drag & drop
function LongScheduleViewContent({
  tournamentId,
  selectedRound,
  setSelectedRound,
  scheduleMatch,
  setScheduleMatch,
  resultMatch,
  setResultMatch,
  isEditMode,
  setIsEditMode,
  bracketData,
  bracketLoading,
  bracketError,
  roundFechas,
  roundTimeSlots,
  roundAvailability,
  roundSchedulingLoading,
  roundSchedulingError,
  isLoading,
  refetchAll,
  clubes,
  isGoldSilverFormat,
  activeBracketKey,
  setActiveBracketKey
}: {
  tournamentId: string
  selectedRound: Round | 'all'
  setSelectedRound: (round: Round | 'all') => void
  scheduleMatch: ExistingMatch | null
  setScheduleMatch: (match: ExistingMatch | null) => void
  resultMatch: BracketMatchV2 | null
  setResultMatch: (match: BracketMatchV2 | null) => void
  isEditMode: boolean
  setIsEditMode: (mode: boolean) => void
  bracketData: any
  bracketLoading: boolean
  bracketError: any
  roundFechas: any[]
  roundTimeSlots: any[]
  roundAvailability: any[]
  roundSchedulingLoading: boolean
  roundSchedulingError: any
  isLoading: boolean
  refetchAll: () => void
  clubes: Club[]
  isGoldSilverFormat: boolean
  activeBracketKey: BracketKey
  setActiveBracketKey: (key: BracketKey) => void
}) {

  // Hook del contexto de drag & drop
  const { state: dragState } = useBracketDragDrop()

  // Hook para operaciones de drag & drop
  const dragOperations = useBracketDragOperations({
    tournamentId,
    isOwner: true, // TODO: Get from permissions
    config: {
      enabled: true,
      sameRoundOnly: true,
      pendingMatchesOnly: true,
      maxPendingOperations: 10
    }
  })

  // Debug hook states
  console.log('🔍 [LongScheduleView] Hook states:', {
    tournamentId,
    selectedRound,
    bracketLoading,
    bracketError: bracketError?.message,
    roundSchedulingLoading,
    roundSchedulingError,
    hasRoundFechas: roundFechas.length,
    hasRoundTimeSlots: roundTimeSlots.length,
    hasRoundAvailability: roundAvailability.length,
    isLoading
  })

  // Procesar matches y filtrar por round
  const { filteredMatches, roundStats, availableRounds } = useMemo(() => {
    console.log('🔍 [LongScheduleView] Processing bracket data:', {
      bracketData: !!bracketData,
      matches: bracketData?.matches?.length || 0,
      tournamentId,
      selectedRound
    })

    if (!bracketData?.matches) {
      console.log('❌ [LongScheduleView] No bracket data or matches found')
      return {
        filteredMatches: [],
        roundStats: {},
        availableRounds: [] as Round[]
      }
    }

    // DEBUG: Log para ver la estructura de los datos
    console.log('🔍 [LongScheduleView] Bracket data received:', {
      totalMatches: bracketData.matches.length,
      sampleMatch: bracketData.matches[0],
        matchesWithCouples: bracketData.matches.filter((m: BracketMatchV2) =>
          m.participants?.slot1?.couple && m.participants?.slot2?.couple
        ).length,
        allMatches: bracketData.matches.map((m: BracketMatchV2) => ({
          id: m.id,
          round: m.round,
          status: m.status,
        hasCouple1: !!m.participants?.slot1?.couple,
        hasCouple2: !!m.participants?.slot2?.couple
      }))
    })

    // Calcular estadísticas por round
    const stats: Record<string, { total: number; completed: number }> = {}
    const rounds = new Set<Round>()

    bracketData.matches.forEach((match: BracketMatchV2) => {
      const round = match.round as Round
      rounds.add(round)

      if (!stats[round]) {
        stats[round] = { total: 0, completed: 0 }
      }

      stats[round].total++
      if (match.status === 'FINISHED') {
        stats[round].completed++
      }
    })

    // Filtrar matches por round seleccionado
    const filtered = selectedRound === 'all'
      ? bracketData.matches
      : bracketData.matches.filter((match: BracketMatchV2) => match.round === selectedRound)

    // Ordenar por orden en la ronda
    const sorted = filtered.sort((a: BracketMatchV2, b: BracketMatchV2) => {
      return (a.order_in_round || 0) - (b.order_in_round || 0)
    })

    return {
      filteredMatches: sorted,
      roundStats: stats,
      availableRounds: Array.from(rounds).sort((a, b) => {
        const order: Round[] = ['32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']
        return order.indexOf(a) - order.indexOf(b)
      })
    }
  }, [bracketData?.matches, selectedRound])

  // Estadísticas generales
  const generalStats = useMemo(() => {
    if (!filteredMatches.length) {
      return { total: 0, completed: 0, scheduled: 0, pending: 0 }
    }

    return {
      total: filteredMatches.length,
      completed: filteredMatches.filter((m: BracketMatchV2) => m.status === 'FINISHED').length,
      scheduled: filteredMatches.filter((m: BracketMatchV2) => m.status === 'IN_PROGRESS').length,
      pending: filteredMatches.filter((m: BracketMatchV2) => m.status === 'PENDING').length
    }
  }, [filteredMatches])

  // Helper function to convert BracketMatchV2 to ExistingMatch
  const convertToExistingMatch = (bracketMatch: BracketMatchV2): ExistingMatch => {
    const couple1 = bracketMatch.participants?.slot1?.couple
    const couple2 = bracketMatch.participants?.slot2?.couple

    return {
      id: bracketMatch.id,
      couple1_id: couple1?.id || null,
      couple2_id: couple2?.id || null,
      time_slot_id: null,
      status: bracketMatch.status,
      scheduled_date: bracketMatch.scheduling?.scheduled_time?.split('T')[0] || null,
      scheduled_start_time: bracketMatch.scheduling?.scheduled_time?.split('T')[1]?.substring(0, 5) || null,
      scheduled_end_time: bracketMatch.scheduling?.actual_end_time?.split('T')[1]?.substring(0, 5) || null,
      court_assignment: bracketMatch.scheduling?.court || null,
      club_id: bracketMatch.couple1_id || null,
      couple1: couple1 ? {
        player1: {
          first_name: couple1.player1_details?.first_name || '',
          last_name: couple1.player1_details?.last_name || ''
        },
        player2: {
          first_name: couple1.player2_details?.first_name || '',
          last_name: couple1.player2_details?.last_name || ''
        }
      } : null,
      couple2: couple2 ? {
        player1: {
          first_name: couple2.player1_details?.first_name || '',
          last_name: couple2.player1_details?.last_name || ''
        },
        player2: {
          first_name: couple2.player2_details?.first_name || '',
          last_name: couple2.player2_details?.last_name || ''
        }
      } : null,
      club: null
    }
  }

  // Handlers
  const handleScheduleMatch = (matchId: string) => {
    const match = filteredMatches.find((m: BracketMatchV2) => m.id === matchId)
    if (match) {
      const existingMatch = convertToExistingMatch(match)
      setScheduleMatch(existingMatch)
    }
  }

  const handleLoadResult = (matchId: string) => {
    const match = filteredMatches.find((m: BracketMatchV2) => m.id === matchId)
    if (match) {
      setResultMatch(match)
    }
  }

  const handleMatchScheduled = () => {
    setScheduleMatch(null)
    refetchAll()
  }

  const handleResultSaved = () => {
    setResultMatch(null)
    refetchAll()
  }

  // Estados de carga y error
  if (bracketLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-slate-600">Cargando datos del torneo...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (bracketError) {
    return (
      <div className="space-y-6">
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>Error al cargar datos del bracket:</strong> {bracketError.message}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!bracketData?.matches?.length) {
    return (
      <div className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>No hay bracket generado aún.</strong>
            Genera el bracket desde la sección principal para poder usar la vista de schedule.
          </AlertDescription>
        </Alert>

        {/* Debug info para ver qué está pasando */}
        <Alert className="bg-yellow-50 border-yellow-200">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 space-y-2">
            <div><strong>🔍 Debug Info:</strong></div>
            <div>• Tournament ID: {tournamentId}</div>
            <div>• Bracket Loading: {bracketLoading ? 'Sí' : 'No'}</div>
            <div>• Bracket Error: {bracketError?.message || 'Ninguno'}</div>
            <div>• Bracket Data: {bracketData ? 'Existe' : 'No existe'}</div>
            <div>• Matches: {bracketData?.matches?.length || 0}</div>
            <div>• Selected Round: {selectedRound}</div>
          </AlertDescription>
        </Alert>

        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>📋 Pasos para generar bracket:</strong>
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>Ve a la página principal del torneo</li>
              <li>Asegúrate de tener parejas registradas</li>
              <li>Ve a la seccion "Llave"</li>
              <li>Haz clic en "Generar Bracket"</li>
              <li>Luego regresa a esta vista de schedule</li>
            </ol>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Handlers de modo edición
  const handleEnterEditMode = () => {
    if (selectedRound === 'all') {
      toast.error('Selecciona una ronda específica para reorganizar parejas')
      return
    }
    setIsEditMode(true)
    toast.success(`Modo edición activado para ${ROUND_CONFIG[selectedRound as Round]?.displayName}`)
  }

  const handleExitEditMode = () => {
    dragOperations.clearPendingOperations()
    setIsEditMode(false)
    toast.success('Modo edición desactivado')
  }

  const handleSaveChanges = async () => {
    if (dragState.pendingOperations.length === 0) return

    const result = await dragOperations.saveAllOperations()
    if (result.success) {
      setIsEditMode(false)
      refetchAll()
      toast.success('✅ Cambios guardados exitosamente')
    } else {
      toast.error('❌ Error al guardar cambios')
    }
  }

  // Handlers ya están definidos arriba en el componente original

  return (
    <div className="space-y-6">

      {/* Header informativo */}
      <div className="bg-white rounded-surface border border-slate-200 p-6">
        <div className="flex items-start gap-4">
          <div className="bg-blue-100 p-2 rounded-surface">
            <Calendar className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Vista de Programación - Matriz Compacta
            </h2>
            <p className="text-slate-600 text-sm mb-4">
              Visualización matricial con disponibilidad de parejas y programación de horarios inline.
            </p>

            <Alert className="bg-green-50 border-green-200">
              <Trophy className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>✅ Características clave:</strong> Cada match = 2 filas (pareja 1 + pareja 2) •
                Time slots horizontales • Disponibilidad inline • Programación rápida • Carga de resultados
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </div>

      {/* Round selector */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Selección de Ronda</CardTitle>
        </CardHeader>
        <CardContent>
          <RoundSelector
            selectedRound={selectedRound}
            onRoundChange={setSelectedRound}
            availableRounds={availableRounds}
            roundStats={roundStats}
          />
        </CardContent>
      </Card>

      {isGoldSilverFormat && selectedRound !== 'all' && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Copa de Llave</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={activeBracketKey === 'GOLD' ? 'default' : 'outline'}
                onClick={() => setActiveBracketKey('GOLD')}
              >
                Copa de Oro
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeBracketKey === 'SILVER' ? 'default' : 'outline'}
                onClick={() => setActiveBracketKey('SILVER')}
              >
                Copa de Plata
              </Button>
              <Badge variant="outline">
                {activeBracketKey === 'GOLD' ? 'Mostrando Oro' : 'Mostrando Plata'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controles de reorganización */}
      {selectedRound !== 'all' && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-slate-900 mb-1">
                  Reorganización de Parejas
                </h3>
                <p className="text-xs text-slate-600">
                  Arrastra parejas entre matches de la misma ronda para optimizar horarios
                </p>
              </div>

              <div className="flex items-center gap-3">
                {!isEditMode ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleEnterEditMode}
                          variant="outline"
                          size="sm"
                          className="border-blue-300 text-blue-700 hover:bg-blue-50"
                        >
                          <Edit3 className="h-4 w-4 mr-2" />
                          🔄 Reorganizar Parejas
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Activar drag & drop para reorganizar parejas en {ROUND_CONFIG[selectedRound as Round]?.displayName}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <div className="flex items-center gap-2">
                    {dragState.pendingOperations.length > 0 ? (
                      <>
                        <Button
                          onClick={handleSaveChanges}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          Guardar {dragState.pendingOperations.length} cambio(s)
                        </Button>
                        <Button
                          onClick={handleExitEditMode}
                          variant="outline"
                          size="sm"
                          className="border-red-300 text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button
                        onClick={handleExitEditMode}
                        variant="outline"
                        size="sm"
                        className="border-gray-300"
                      >
                        <X className="h-4 w-4 mr-2" />
                        ✅ Editando {ROUND_CONFIG[selectedRound as Round]?.displayName}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Indicador de operaciones pendientes */}
            {dragState.pendingOperations.length > 0 && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-surface">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-blue-800 font-medium">
                    {dragState.pendingOperations.length} intercambio(s) pendiente(s)
                  </span>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    No guardado
                  </Badge>
                </div>
              </div>
            )}

            {/* Info de modo edición */}
            {isEditMode && (
              <Alert className="mt-3 bg-blue-50 border-blue-200">
                <Zap className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <strong>Modo Edición Activo:</strong> Arrastra filas completas de parejas entre matches de <Badge variant="default">{selectedRound}</Badge>. Solo matches pendientes pueden ser reorganizados.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Estadísticas de la ronda seleccionada */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              <div>
                <div className="text-2xl font-bold text-blue-600">{generalStats.total}</div>
                <div className="text-xs text-slate-600">Total Matches</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-green-600" />
              <div>
                <div className="text-2xl font-bold text-green-600">{generalStats.completed}</div>
                <div className="text-xs text-slate-600">Finalizados</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <div>
                <div className="text-2xl font-bold text-blue-600">{generalStats.scheduled}</div>
                <div className="text-xs text-slate-600">Programados</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-orange-600" />
              <div>
                <div className="text-2xl font-bold text-orange-600">{generalStats.pending}</div>
                <div className="text-xs text-slate-600">Pendientes</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Matriz de schedule */}
      {roundSchedulingError ? (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <strong>Aviso:</strong> Error al cargar datos de la ronda: {roundSchedulingError}.
            La matriz se mostrará sin información de disponibilidad.
          </AlertDescription>
        </Alert>
      ) : selectedRound !== 'all' && roundTimeSlots.length === 0 && !roundSchedulingLoading ? (
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Información:</strong> No hay fechas creadas para la ronda {ROUND_CONFIG[selectedRound as Round]?.displayName}.
            Ve a <strong>Gestión de Fechas</strong> para crear fechas y horarios para esta ronda.
          </AlertDescription>
        </Alert>
      ) : selectedRound !== 'all' && roundTimeSlots.length > 0 ? (
        <Alert className="border-green-200 bg-green-50">
          <Info className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <strong>✅ Datos cargados:</strong> {roundFechas.length} fecha(s) con {roundTimeSlots.length} horario(s) disponibles para {ROUND_CONFIG[selectedRound as Round]?.displayName}.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Debug info durante desarrollo */}
      {process.env.NODE_ENV === 'development' && selectedRound !== 'all' && (
        <Alert className="border-gray-200 bg-gray-50">
          <Info className="h-4 w-4 text-gray-600" />
          <AlertDescription className="text-gray-800">
            <strong>🔍 Debug:</strong> Round={selectedRound}, Fechas={roundFechas.length}, TimeSlots={roundTimeSlots.length}, Loading={roundSchedulingLoading}
          </AlertDescription>
        </Alert>
      )}

      <ScheduleMatrix
        matches={filteredMatches}
        timeSlots={roundTimeSlots}
        availability={roundAvailability}
        onScheduleMatch={handleScheduleMatch}
        onLoadResult={handleLoadResult}
        loading={isLoading}
        tournamentId={tournamentId}
        isOwner={true} // TODO: Get from permissions
        dragEnabled={isEditMode}
        isEditMode={isEditMode}
        pendingOperations={dragState.pendingOperations}
      />

      {/* Modal para programar matches - usando ModifyScheduleDialog */}
      {scheduleMatch && (
        <ModifyScheduleDialog
          match={scheduleMatch}
          open={!!scheduleMatch}
          onOpenChange={() => setScheduleMatch(null)}
          onScheduleModified={handleMatchScheduled}
          clubes={clubes}
        />
      )}

      {/* Modal para cargar resultados - reutiliza el componente existente */}
      {resultMatch && (
        <LoadMatchResultDialog
          match={resultMatch as any} // Type compatibility
          open={!!resultMatch}
          onOpenChange={() => setResultMatch(null)}
          onResultSaved={handleResultSaved}
        />
      )}

      {/* Info de funcionalidades */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-sm font-medium text-slate-700">Matriz Compacta</span>
            </div>
            <p className="text-xs text-slate-600">
              Cada match = 2 filas con disponibilidad de parejas visible inline
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm font-medium text-slate-700">Programación Rápida</span>
            </div>
            <p className="text-xs text-slate-600">
              Programa horarios directamente desde la matriz con el modal integrado
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function LongScheduleView({ tournamentId }: LongScheduleViewProps) {

  // Estados locales
  const [selectedRound, setSelectedRound] = useState<Round | 'all'>('8VOS')
  const [scheduleMatch, setScheduleMatch] = useState<ExistingMatch | null>(null)
  const [resultMatch, setResultMatch] = useState<BracketMatchV2 | null>(null)
  const [isEditMode, setIsEditMode] = useState<boolean>(false)
  const [clubes, setClubes] = useState<Club[]>([])
  const [activeBracketKey, setActiveBracketKey] = useState<BracketKey>('MAIN')

  const { tournament } = useTournament(tournamentId)
  const resolvedFormat = useMemo(() => {
    if (!tournament) return null
    return TournamentFormatResolver.getResolvedFormat(tournament)
  }, [tournament])
  const isGoldSilverFormat = resolvedFormat?.effectiveBracketMode === 'GOLD_SILVER'

  useEffect(() => {
    if (isGoldSilverFormat && activeBracketKey === 'MAIN') {
      setActiveBracketKey('GOLD')
      return
    }

    if (!isGoldSilverFormat && activeBracketKey !== 'MAIN') {
      setActiveBracketKey('MAIN')
    }
  }, [isGoldSilverFormat, activeBracketKey])

  // Obtener clubes del torneo
  useEffect(() => {
    const fetchClubes = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('clubes_tournament')
        .select('clubes(id, name)')
        .eq('tournament_id', tournamentId)

      const clubsList: Club[] = (data || []).flatMap((item: any) => {
        const rawClub = item?.clubes
        const club = Array.isArray(rawClub) ? rawClub[0] : rawClub
        if (!club || typeof club !== 'object') return []
        return [{ id: club.id, name: club.name }]
      })

      setClubes(clubsList)
    }
    fetchClubes()
  }, [tournamentId])

  // Hook de datos (bracket + round-based scheduling)
  const {
    bracketData,
    bracketLoading,
    bracketError,
    roundFechas,
    roundTimeSlots,
    roundAvailability,
    roundSchedulingLoading,
    roundSchedulingError,
    isLoading,
    refetchAll
  } = useLongBracketData(tournamentId, {
    selectedRound: selectedRound === 'all' ? undefined : selectedRound,
    selectedRoundType: selectedRound !== 'all' ? ROUND_TO_ENUM_MAP[selectedRound] : undefined,
    bracketKey: selectedRound === 'all' ? undefined : activeBracketKey,
    includeSchedulingData: false
  })

  return (
    <BracketDragDropProvider key={activeBracketKey}>
      <LongScheduleViewContent
        tournamentId={tournamentId}
        selectedRound={selectedRound}
        setSelectedRound={setSelectedRound}
        scheduleMatch={scheduleMatch}
        setScheduleMatch={setScheduleMatch}
        resultMatch={resultMatch}
        setResultMatch={setResultMatch}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
        bracketData={bracketData}
        bracketLoading={bracketLoading}
        bracketError={bracketError}
        roundFechas={roundFechas}
        roundTimeSlots={roundTimeSlots}
        roundAvailability={roundAvailability}
        roundSchedulingLoading={roundSchedulingLoading}
        roundSchedulingError={roundSchedulingError}
        isLoading={isLoading}
        refetchAll={refetchAll}
        clubes={clubes}
        isGoldSilverFormat={isGoldSilverFormat}
        activeBracketKey={activeBracketKey}
        setActiveBracketKey={setActiveBracketKey}
      />
    </BracketDragDropProvider>
  )
}
