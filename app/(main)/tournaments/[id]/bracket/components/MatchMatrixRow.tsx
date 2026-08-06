'use client'

import React, { useMemo } from 'react'
import { TableRow, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Calendar, Trophy, Clock, Users, Play, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import DraggableCoupleSlot from './DraggableCoupleSlot'
import { useBracketDragOperations } from '@/components/tournament/bracket-v2/hooks/useBracketDragOperations'
import { getMatchPreviewInfo } from '@/components/tournament/bracket-v2/utils/preview-operations'
import type { BracketMatchV2 } from '@/components/tournament/bracket-v2/types/bracket-types'
import { toast } from 'sonner'

interface TimeSlot {
  id: string
  date: string
  start_time: string
  end_time: string
  court?: string
}

interface AvailabilityItem {
  couple_id: string
  time_slot_id: string
  is_available: boolean
  notes?: string | null
}

// Importar el tipo correcto
import type { BracketSwapOperation } from '@/components/tournament/bracket-v2/types/bracket-drag-types'

interface MatchMatrixRowProps {
  match: BracketMatchV2
  matchIndex: number
  timeSlots: TimeSlot[]
  availability: AvailabilityItem[]
  onScheduleMatch: (matchId: string) => void
  onLoadResult: (matchId: string) => void
  tournamentId?: string
  isOwner?: boolean
  dragEnabled?: boolean
  isEditMode?: boolean
  pendingOperations?: BracketSwapOperation[]
}

export default function MatchMatrixRow({
  match,
  matchIndex,
  timeSlots,
  availability,
  onScheduleMatch,
  onLoadResult,
  tournamentId = '',
  isOwner = false,
  dragEnabled = true,
  isEditMode = false,
  pendingOperations = []
}: MatchMatrixRowProps) {

  // Hook para operaciones de drag & drop
  const {
    isDragging,
    draggedItem,
    dragOverTarget,
    startDrag,
    endDrag,
    setDragOver,
    handleDrop,
    canDragCouple,
    canDropToSlot,
    createDropTarget
  } = useBracketDragOperations({
    tournamentId,
    isOwner,
    config: {
      enabled: dragEnabled && isEditMode,
      sameRoundOnly: true,
      pendingMatchesOnly: true
    }
  })

  // Helper para obtener disponibilidad de una pareja en un slot
  const getCoupleAvailability = (coupleId: string | undefined, slotId: string): boolean | null => {
    if (!coupleId) return null

    const availabilityItem = availability.find(a =>
      a.couple_id === coupleId && a.time_slot_id === slotId
    )

    // Debug for first match only
    if (matchIndex === 0) {
      console.log('🔍 [MatchMatrixRow] Availability check:', {
        coupleId,
        slotId,
        availabilityLength: availability.length,
        availabilityItem,
        result: availabilityItem?.is_available ?? null
      })
    }

    return availabilityItem?.is_available ?? null
  }

  // Helper para obtener notas de disponibilidad
  const getAvailabilityNotes = (coupleId: string | undefined, slotId: string): string | null => {
    if (!coupleId) return null

    const availabilityItem = availability.find(a =>
      a.couple_id === coupleId && a.time_slot_id === slotId
    )

    return availabilityItem?.notes || null
  }

  // Obtener datos de las parejas
  const couple1 = match.participants?.slot1?.couple
  const couple2 = match.participants?.slot2?.couple

  // Verificar operaciones pendientes para este match
  const previewInfo = useMemo(() => {
    if (!pendingOperations || pendingOperations.length === 0) {
      return { hasChanges: false, operationsCount: 0 }
    }
    return getMatchPreviewInfo(match.id, pendingOperations)
  }, [match.id, pendingOperations])

  // Estados de drag para cada slot
  const slot1DragState = useMemo(() => {
    const isBeingDragged = draggedItem?.sourceMatchId === match.id && draggedItem?.sourceSlot === 'slot1'
    const isDropTarget = dragOverTarget?.matchId === match.id && dragOverTarget?.slot === 'slot1'
    const canDrag = couple1 ? canDragCouple(couple1, match, 'slot1') : { canDrag: false }
    const canDrop = canDropToSlot(match, 'slot1')

    return {
      isBeingDragged,
      isDropTarget: isDropTarget && canDrop.canDrop,
      isInvalidDropTarget: isDropTarget && !canDrop.canDrop,
      canDrag: canDrag.canDrag,
      dragReason: canDrag.reason,
      dropReason: canDrop.reason
    }
  }, [draggedItem, dragOverTarget, couple1, match, canDragCouple, canDropToSlot])

  const slot2DragState = useMemo(() => {
    const isBeingDragged = draggedItem?.sourceMatchId === match.id && draggedItem?.sourceSlot === 'slot2'
    const isDropTarget = dragOverTarget?.matchId === match.id && dragOverTarget?.slot === 'slot2'
    const canDrag = couple2 ? canDragCouple(couple2, match, 'slot2') : { canDrag: false }
    const canDrop = canDropToSlot(match, 'slot2')

    return {
      isBeingDragged,
      isDropTarget: isDropTarget && canDrop.canDrop,
      isInvalidDropTarget: isDropTarget && !canDrop.canDrop,
      canDrag: canDrag.canDrag,
      dragReason: canDrag.reason,
      dropReason: canDrop.reason
    }
  }, [draggedItem, dragOverTarget, couple2, match, canDragCouple, canDropToSlot])

  // DEBUG: Log para troubleshooting
  if (matchIndex === 0) {
    console.log('🔍 [MatchMatrixRow] Sample match structure:', {
      matchId: match.id,
      round: match.round,
      status: match.status,
      position: match.position,
      participants: match.participants,
      couple1: couple1 ? { id: couple1.id, name: couple1.name } : 'undefined',
      couple2: couple2 ? { id: couple2.id, name: couple2.name } : 'undefined',
      scheduling: match.scheduling,
      hasScheduling: !!match.scheduling,
      schedulingKeys: match.scheduling ? Object.keys(match.scheduling) : null
    })
  }

  // Determinar estado del match
  const isBYE = match.status === 'BYE'
  const isSchedulableStatus = match.status === 'PENDING' || match.status === 'DRAFT'
  const canSchedule = couple1 && couple2 && isSchedulableStatus && !isBYE
  const canLoadResult = couple1 && couple2 && (match.status === 'NOT_STARTED' || match.status === 'IN_PROGRESS') && !isBYE
  const isCompleted = match.status === 'FINISHED'
  const isScheduled = !!(match.scheduling?.scheduled_time || match.scheduling?.court)

  // DEBUG: Log de scheduling
  if (match.scheduling) {
    console.log(`✅ [MatchMatrixRow] Match ${match.id} HAS scheduling data:`, {
      matchId: match.id,
      round: match.round,
      scheduling: match.scheduling,
      isScheduled
    })
  }

  // Status badge
  const getStatusBadge = () => {
    switch (match.status) {
      case 'FINISHED':
        return <Badge className="bg-green-600 text-white">Finalizado</Badge>
      case 'IN_PROGRESS':
        return <Badge className="bg-blue-600 text-white">En Juego</Badge>
      case 'NOT_STARTED':
        return <Badge className="bg-yellow-600 text-white">Programado</Badge>
      case 'PENDING':
        return <Badge variant="outline">Pendiente</Badge>
      case 'DRAFT':
        return <Badge className="bg-amber-100 text-amber-800 border border-amber-200">Borrador</Badge>
      default:
        return <Badge variant="secondary">Desconocido</Badge>
    }
  }

  // ============================================================================
  // DRAG & DROP HANDLERS
  // ============================================================================

  const handleDragStart = (e: React.DragEvent, couple: any, slot: 'slot1' | 'slot2') => {
    e.stopPropagation()

    if (!couple || !isEditMode) {
      e.preventDefault()
      return
    }

    const validation = canDragCouple(couple, match, slot)
    if (!validation.canDrag) {
      e.preventDefault()
      toast.error(validation.reason || 'No se puede arrastrar esta pareja')
      return
    }

    // Configurar el drag
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify({
      coupleId: couple.id,
      matchId: match.id,
      slot: slot
    }))

    // Iniciar drag en el hook
    startDrag(couple, match, slot)
    toast(`Arrastrando: ${couple.name}`, { duration: 1000 })
  }

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation()
    endDrag()
  }

  const handleDragOver = (e: React.DragEvent, slot: 'slot1' | 'slot2') => {
    e.preventDefault()
    e.stopPropagation()

    if (isDragging && isEditMode) {
      const validation = canDropToSlot(match, slot)

      if (validation.canDrop) {
        e.dataTransfer.dropEffect = 'move'
        const dropTarget = createDropTarget(match, slot)
        setDragOver(dropTarget)
      } else {
        e.dataTransfer.dropEffect = 'none'
      }
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation()

    // Solo limpiar si realmente salimos del elemento
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOver(null)
    }
  }

  const handleDropEvent = (e: React.DragEvent, slot: 'slot1' | 'slot2') => {
    e.preventDefault()
    e.stopPropagation()

    const validation = canDropToSlot(match, slot)
    if (!validation.canDrop) {
      toast.error(validation.reason || 'No se puede soltar aquí')
      return
    }

    try {
      handleDrop(match, slot)
    } catch (error) {
      console.error('Drop error:', error)
      toast.error('Error al procesar el intercambio')
    }
  }

  return (
    <>
      {/* Fila 1: Pareja 1 */}
      <TableRow
        className={cn(
          'border-b-0 transition-all duration-200',
          // Color base según si está programado o no
          isScheduled
            ? (matchIndex % 2 === 0 ? 'bg-blue-50' : 'bg-blue-100')
            : (matchIndex % 2 === 0 ? 'bg-white' : 'bg-slate-25'),
          {
            // Estados de drag para slot1 (sobrescriben el color base)
            'opacity-50 scale-95': slot1DragState.isBeingDragged,
            'bg-blue-100 ring-2 ring-blue-400': slot1DragState.isBeingDragged,
            'bg-green-50 ring-2 ring-green-300': slot1DragState.isDropTarget,
            'bg-red-50 ring-2 ring-red-300': slot1DragState.isInvalidDropTarget,

            // Estados de habilitación de drag
            'cursor-grab hover:bg-blue-100': slot1DragState.canDrag && isEditMode,
            'cursor-grabbing': slot1DragState.canDrag && slot1DragState.isBeingDragged,
            'cursor-not-allowed opacity-60': !slot1DragState.canDrag && couple1 && isEditMode,

            // Indicador de cambios pendientes
            'ring-1 ring-orange-300 bg-orange-25': previewInfo.hasChanges
          }
        )}
        draggable={slot1DragState.canDrag && isEditMode}
        onDragStart={(e) => handleDragStart(e, couple1, 'slot1')}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, 'slot1')}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDropEvent(e, 'slot1')}
        title={
          couple1
            ? (slot1DragState.canDrag && isEditMode
               ? `Arrastra para mover: ${couple1.name} (${match.round})`
               : slot1DragState.dragReason)
            : (slot1DragState.isDropTarget
               ? 'Slot disponible para drop'
               : slot1DragState.dropReason)
        }
      >
        {/* Nombre Pareja 1 + Badge (solo en primera pareja) */}
        <TableCell className="border-r border-slate-200 bg-slate-50 sticky left-0 z-10 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Drag handle visual */}
              {isEditMode && slot1DragState.canDrag && (
                <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />
              )}

              {/* Nombre de la pareja con estados visuales */}
              <div className={cn(
                "font-medium text-sm flex-1",
                slot1DragState.isBeingDragged ? "text-blue-700" : "text-slate-700",
                slot1DragState.isDropTarget ? "text-green-700" : "",
                slot1DragState.isInvalidDropTarget ? "text-red-700" : ""
              )}>
                {couple1?.name || 'Pareja TBD'}
              </div>

              {/* Indicadores de estado */}
              {slot1DragState.isBeingDragged && (
                <div className="bg-blue-600 text-white text-xs px-2 py-1 rounded animate-pulse">
                  Arrastrando...
                </div>
              )}

              {slot1DragState.isDropTarget && (
                <div className="bg-green-600 text-white text-xs px-2 py-1 rounded">
                  ✓ Soltar aquí
                </div>
              )}

              {slot1DragState.isInvalidDropTarget && (
                <div className="bg-red-600 text-white text-xs px-2 py-1 rounded">
                  ✗ No válido
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Indicador de operaciones pendientes */}
              {previewInfo.hasChanges && (
                <div className="bg-orange-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                  {previewInfo.operationsCount}
                </div>
              )}

              <Badge variant="default" className="text-xs bg-slate-700 hover:bg-slate-800">
                {match.round}
              </Badge>
            </div>
          </div>
        </TableCell>

        {/* Disponibilidad pareja 1 en cada time slot */}
        {timeSlots.map(slot => {
          const isAvailable = getCoupleAvailability(couple1?.id, slot.id)
          const notes = getAvailabilityNotes(couple1?.id, slot.id)

          return (
            <TableCell
              key={`${couple1?.id}-${slot.id}`}
              className={cn(
                "text-center border-r border-slate-200 p-4 transition-all duration-200",
                {
                  'bg-blue-50 ring-1 ring-blue-200': slot1DragState.isBeingDragged,
                  'bg-green-50 ring-1 ring-green-200': slot1DragState.isDropTarget,
                  'bg-red-50 ring-1 ring-red-200': slot1DragState.isInvalidDropTarget
                }
              )}
            >
              <div className="space-y-1">
                {isAvailable !== null ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-block">
                          <Checkbox
                            checked={isAvailable}
                            disabled
                            className={cn(
                              'mx-auto cursor-help',
                              isAvailable ? 'data-[state=checked]:bg-green-600' : 'border-red-300'
                            )}
                          />
                        </div>
                      </TooltipTrigger>
                      {(notes || isAvailable) && (
                        <TooltipContent
                          side="top"
                          className="bg-white border-gray-200 text-slate-900 shadow-lg max-w-xs"
                        >
                          <div className="space-y-1">
                            <div className="font-medium text-xs">
                              {slot.start_time.substring(0, 5)} - {slot.end_time.substring(0, 5)}
                            </div>
                            <div className="text-xs text-slate-600">
                              {slot.date && new Date(slot.date.split('T')[0].split('-').map(Number).join('-')).toLocaleDateString('es-ES', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short'
                              })}
                            </div>
                            {notes && (
                              <div className="text-xs text-blue-600 border-t border-gray-200 pt-1 mt-1">
                                <strong>Nota:</strong> {notes}
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <div className="mx-auto w-4 h-4 rounded border border-slate-300 bg-slate-100"></div>
                )}

                {/* Mini indicador de horario para referencia visual */}
                <div className="text-xs text-gray-500">
                  {slot.start_time.substring(0, 5)}
                </div>
              </div>
            </TableCell>
          )
        })}

        {/* Acciones (rowspan 2 para cubrir ambas parejas) */}
        <TableCell rowSpan={2} className="text-center border-l-2 border-slate-300 bg-slate-50">
          <div className="space-y-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onScheduleMatch(match.id)}
              disabled={!canSchedule}
              className={cn(
                'w-full text-xs',
                canSchedule && 'border-blue-300 text-blue-700 hover:bg-blue-50'
              )}
            >
              <Calendar className="h-3 w-3 mr-1" />
              Programar
            </Button>

            <Button
              size="sm"
              variant={isCompleted ? "secondary" : "default"}
              onClick={() => onLoadResult(match.id)}
              disabled={!canLoadResult && !isCompleted}
              className={cn(
                'w-full text-xs',
                canLoadResult && 'bg-blue-600 hover:bg-blue-700 text-white',
                isCompleted && 'bg-green-600 hover:bg-green-700 text-white'
              )}
            >
              {isCompleted ? (
                <>
                  <Trophy className="h-3 w-3 mr-1" />
                  Ver
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 mr-1" />
                  Resultado
                </>
              )}
            </Button>

            {/* Información compacta del match - Horario programado */}
            {isScheduled && (
              <div className="bg-blue-50 border border-blue-200 rounded p-2 mt-2">
                {match.scheduling?.scheduled_time && (
                  <>
                    <div className="text-xs text-blue-800 font-medium">
                      📅 {new Date(match.scheduling.scheduled_time).toLocaleDateString('es-AR')}
                    </div>
                    <div className="text-xs text-blue-800">
                      🕐 {new Date(match.scheduling.scheduled_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </>
                )}
                {match.scheduling?.court && (
                  <div className="text-xs text-blue-800 mt-1">
                    📍 {match.scheduling.court}
                  </div>
                )}
              </div>
            )}

            {/* Resultado */}
            {isCompleted && match.result && (
              <div className="bg-green-50 border border-green-200 rounded p-1 mt-2">
                <div className="text-xs text-green-800">
                  🏆 {match.result.result_couple1}-{match.result.result_couple2}
                </div>
              </div>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Fila 2: Pareja 2 */}
      <TableRow
        className={cn(
          'border-b-4 border-slate-300 transition-all duration-200', // Separador más grueso entre matches
          // Color base según si está programado o no
          isScheduled
            ? (matchIndex % 2 === 0 ? 'bg-blue-50' : 'bg-blue-100')
            : (matchIndex % 2 === 0 ? 'bg-white' : 'bg-slate-25'),
          {
            // Estados de drag para slot2 (sobrescriben el color base)
            'opacity-50 scale-95': slot2DragState.isBeingDragged,
            'bg-blue-100 ring-2 ring-blue-400': slot2DragState.isBeingDragged,
            'bg-green-50 ring-2 ring-green-300': slot2DragState.isDropTarget,
            'bg-red-50 ring-2 ring-red-300': slot2DragState.isInvalidDropTarget,

            // Estados de habilitación de drag
            'cursor-grab hover:bg-blue-100': slot2DragState.canDrag && isEditMode,
            'cursor-grabbing': slot2DragState.canDrag && slot2DragState.isBeingDragged,
            'cursor-not-allowed opacity-60': !slot2DragState.canDrag && couple2 && isEditMode,

            // Indicador de cambios pendientes
            'ring-1 ring-orange-300 bg-orange-25': previewInfo.hasChanges
          }
        )}
        draggable={slot2DragState.canDrag && isEditMode}
        onDragStart={(e) => handleDragStart(e, couple2, 'slot2')}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, 'slot2')}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDropEvent(e, 'slot2')}
        title={
          couple2
            ? (slot2DragState.canDrag && isEditMode
               ? `Arrastra para mover: ${couple2.name} (${match.round})`
               : slot2DragState.dragReason)
            : (slot2DragState.isDropTarget
               ? 'Slot disponible para drop'
               : slot2DragState.dropReason)
        }
      >
        {/* Nombre Pareja 2 (sin badge) */}
        <TableCell className="border-r border-slate-200 bg-slate-50 sticky left-0 z-10 p-3">
          <div className="flex items-center gap-2">
            {/* Drag handle visual */}
            {isEditMode && slot2DragState.canDrag && (
              <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />
            )}

            {/* Nombre de la pareja con estados visuales */}
            <div className={cn(
              "text-sm flex-1",
              slot2DragState.isBeingDragged ? "text-blue-700 font-medium" : "text-slate-600",
              slot2DragState.isDropTarget ? "text-green-700 font-medium" : "",
              slot2DragState.isInvalidDropTarget ? "text-red-700 font-medium" : ""
            )}>
              {couple2?.name || 'Pareja TBD'}
            </div>

            {/* Indicadores de estado */}
            {slot2DragState.isBeingDragged && (
              <div className="bg-blue-600 text-white text-xs px-2 py-1 rounded animate-pulse">
                Arrastrando...
              </div>
            )}

            {slot2DragState.isDropTarget && (
              <div className="bg-green-600 text-white text-xs px-2 py-1 rounded">
                ✓ Soltar aquí
              </div>
            )}

            {slot2DragState.isInvalidDropTarget && (
              <div className="bg-red-600 text-white text-xs px-2 py-1 rounded">
                ✗ No válido
              </div>
            )}
          </div>
        </TableCell>

        {/* Disponibilidad pareja 2 en cada time slot */}
        {timeSlots.map(slot => {
          const isAvailable = getCoupleAvailability(couple2?.id, slot.id)
          const notes = getAvailabilityNotes(couple2?.id, slot.id)

          return (
            <TableCell
              key={`${couple2?.id}-${slot.id}`}
              className={cn(
                "text-center border-r border-slate-200 p-4 transition-all duration-200",
                {
                  'bg-blue-50 ring-1 ring-blue-200': slot2DragState.isBeingDragged,
                  'bg-green-50 ring-1 ring-green-200': slot2DragState.isDropTarget,
                  'bg-red-50 ring-1 ring-red-200': slot2DragState.isInvalidDropTarget
                }
              )}
            >
              <div className="space-y-1">
                {isAvailable !== null ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-block">
                          <Checkbox
                            checked={isAvailable}
                            disabled
                            className={cn(
                              'mx-auto cursor-help',
                              isAvailable ? 'data-[state=checked]:bg-green-600' : 'border-red-300'
                            )}
                          />
                        </div>
                      </TooltipTrigger>
                      {(notes || isAvailable) && (
                        <TooltipContent
                          side="top"
                          className="bg-white border-gray-200 text-slate-900 shadow-lg max-w-xs"
                        >
                          <div className="space-y-1">
                            <div className="font-medium text-xs">
                              {slot.start_time.substring(0, 5)} - {slot.end_time.substring(0, 5)}
                            </div>
                            <div className="text-xs text-slate-600">
                              {slot.date && new Date(slot.date.split('T')[0].split('-').map(Number).join('-')).toLocaleDateString('es-ES', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short'
                              })}
                            </div>
                            {notes && (
                              <div className="text-xs text-blue-600 border-t border-gray-200 pt-1 mt-1">
                                <strong>Nota:</strong> {notes}
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <div className="mx-auto w-4 h-4 rounded border border-slate-300 bg-slate-100"></div>
                )}

                {/* Mini indicador de horario para referencia visual */}
                <div className="text-xs text-gray-500">
                  {slot.start_time.substring(0, 5)}
                </div>
              </div>
            </TableCell>
          )
        })}
      </TableRow>
    </>
  )
}
