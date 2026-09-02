/**
 * DRAGGABLE COUPLE SLOT - COMPONENTE GRANULAR
 * 
 * Componente específico para arrastrar parejas individuales entre matches.
 * Solo la información de la pareja es draggable, no toda la card.
 * 
 * @author Claude Code Assistant
 * @version 1.0.0
 * @created 2025-01-19
 */

'use client'

import React, { useRef } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Users, GripVertical, Trophy, Clock } from 'lucide-react'
import { WinnerBadge } from './WinnerBadge'
import type {
  BracketMatchV2,
  CoupleData,
  ParticipantSlot
} from '../types/bracket-types'

// ============================================================================
// TIPOS
// ============================================================================

export interface DraggableCoupleSlotProps {
  /** Pareja a renderizar */
  couple: CoupleData | null
  /** Match que contiene esta pareja */
  match: BracketMatchV2
  /** Posición del slot (slot1 o slot2) */
  slotPosition: 'slot1' | 'slot2'
  /** Información de placeholder si aplica */
  placeholderLabel?: string | null
  isPlaceholder?: boolean
  /** Si es owner y puede arrastrar */
  canDrag: boolean
  /** Si está en modo edición */
  isEditMode: boolean
  /** Si este slot está siendo arrastrado */
  isDragging: boolean
  /** Si este slot puede recibir drop */
  canReceiveDrop: boolean
  /** Si hay drag hover sobre este slot */
  isDragHover: boolean
  /** Si este slot esta seleccionado para mover por click */
  isSelectedForMove?: boolean
  /** Si este slot es un destino posible para mover por click */
  isMoveTarget?: boolean
  /** Resultado de este slot (W, L, null) */
  result?: 'W' | 'L' | null
  /** Games por set para este slot en torneos largos */
  setScores?: number[]
  /** Handlers */
  onDragStart: (couple: CoupleData, match: BracketMatchV2, slot: 'slot1' | 'slot2') => void
  onDragEnd: () => void
  onDragEnter: (match: BracketMatchV2, slot: 'slot1' | 'slot2') => void
  onDragLeave: () => void
  onDrop: (match: BracketMatchV2, slot: 'slot1' | 'slot2') => void
  /** Click handler para carga de resultados */
  onClick?: (couple: CoupleData | null, match: BracketMatchV2, slot: 'slot1' | 'slot2') => void
  /** Layout compacto para cards del bracket */
  compact?: boolean
  /** Clase CSS adicional */
  className?: string
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export function DraggableCoupleSlot({
  couple,
  match,
  slotPosition,
  placeholderLabel,
  isPlaceholder,
  canDrag,
  isEditMode,
  isDragging,
  canReceiveDrop,
  isDragHover,
  isSelectedForMove = false,
  isMoveTarget = false,
  result,
  setScores,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDrop,
  onClick,
  compact = false,
  className
}: DraggableCoupleSlotProps) {

  const slotRef = useRef<HTMLDivElement>(null)

  // Placeholder functionality integrated successfully

  // ============================================================================
  // LÓGICA DE RESULTADOS
  // ============================================================================

  // Obtener el resultado numérico para este slot
  const getSlotResult = (): number | null => {
    if (match.status !== 'FINISHED') return null
    
    if (slotPosition === 'slot1') {
      const result = match.result_couple1 ? parseInt(match.result_couple1 as string) : null
      return result !== null && !Number.isNaN(result) ? result : null
    } else {
      const result = match.result_couple2 ? parseInt(match.result_couple2 as string) : null
      return result !== null && !Number.isNaN(result) ? result : null
    }
  }

  // Determinar si esta pareja es la ganadora
  const isWinner = (): boolean => {
    if (!couple || match.status !== 'FINISHED') return false
    
    // Verificar tanto winner_id como posición del slot para mayor precisión
    if (match.winner_id === couple.id) return true
    
    // Fallback: verificar por posición del slot
    if (slotPosition === 'slot1' && match.couple1_id === couple.id && match.winner_id === match.couple1_id) return true
    if (slotPosition === 'slot2' && match.couple2_id === couple.id && match.winner_id === match.couple2_id) return true
    
    return false
  }

  const slotResult = getSlotResult()
  const isSlotWinner = isWinner()

  // ============================================================================
  // DRAG & DROP HANDLERS
  // ============================================================================

  const handleDragStart = (e: React.DragEvent) => {
    if (!couple || !canDrag || !isEditMode) {
      e.preventDefault()
      return
    }

    console.log(`🎯 [DraggableCoupleSlot] Drag started:`, {
      couple: couple.id,
      coupleName: `${couple.player1_details?.first_name} ${couple.player1_details?.last_name} & ${couple.player2_details?.first_name} ${couple.player2_details?.last_name}`,
      match: match.id,
      slot: slotPosition,
      round: match.round
    })

    // Configurar datos del drag
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'couple-drag',
      coupleId: couple.id,
      matchId: match.id,
      slot: slotPosition,
      round: match.round,
      coupleName: `${couple.player1_details?.first_name} ${couple.player1_details?.last_name || 'P1'} & ${couple.player2_details?.first_name} ${couple.player2_details?.last_name || 'P2'}`
    }))

    // Imagen de drag personalizada
    const dragImage = document.createElement('div')
    dragImage.className = 'bg-blue-600 text-white px-3 py-2 rounded-surface shadow-lg text-sm font-medium flex items-center gap-2'
    dragImage.innerHTML = `
      <span>👥</span>
      <span>${couple.player1_details?.first_name} ${couple.player1_details?.last_name || 'P1'} & ${couple.player2_details?.first_name} ${couple.player2_details?.last_name || 'P2'}</span>
      <span class="text-xs opacity-75">${match.round}</span>
    `
    dragImage.style.position = 'absolute'
    dragImage.style.top = '-1000px'
    dragImage.style.zIndex = '9999'
    document.body.appendChild(dragImage)
    
    e.dataTransfer.setDragImage(dragImage, 0, 0)
    
    // Limpiar imagen después del drag
    setTimeout(() => {
      if (document.body.contains(dragImage)) {
        document.body.removeChild(dragImage)
      }
    }, 0)

    // Notificar al sistema
    onDragStart(couple, match, slotPosition)
  }

  const handleDragEnd = (e: React.DragEvent) => {
    console.log(`🏁 [DraggableCoupleSlot] Drag ended`)
    onDragEnd()
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!canReceiveDrop || !isEditMode) return
    
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDragEnter = (e: React.DragEvent) => {
    if (!canReceiveDrop || !isEditMode) return
    
    e.preventDefault()
    e.stopPropagation()
    
    console.log(`📥 [DraggableCoupleSlot] Drag enter:`, {
      targetMatch: match.id,
      targetSlot: slotPosition
    })
    
    onDragEnter(match, slotPosition)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!canReceiveDrop || !isEditMode) return
    
    // Solo procesar si realmente salimos del elemento
    const rect = slotRef.current?.getBoundingClientRect()
    if (!rect) return
    
    const { clientX, clientY } = e
    const isOutside = clientX < rect.left || clientX > rect.right || 
                     clientY < rect.top || clientY > rect.bottom
    
    if (isOutside) {
      console.log(`📤 [DraggableCoupleSlot] Drag leave`)
      onDragLeave()
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    if (!canReceiveDrop || !isEditMode) return
    
    e.preventDefault()
    e.stopPropagation()
    
    try {
      const dragData = JSON.parse(e.dataTransfer.getData('application/json'))
      
      if (dragData.type === 'couple-drag') {
        console.log(`🎯 [DraggableCoupleSlot] Drop received:`, {
          draggedCouple: dragData.coupleId,
          draggedFrom: `${dragData.matchId}:${dragData.slot}`,
          droppedTo: `${match.id}:${slotPosition}`,
          sameDrag: dragData.matchId === match.id && dragData.slot === slotPosition
        })
        
        // No permitir drop en la misma posición
        if (dragData.matchId === match.id && dragData.slot === slotPosition) {
          console.log(`❌ [DraggableCoupleSlot] Drop canceled: same position`)
          return
        }
        
        onDrop(match, slotPosition)
      }
    } catch (error) {
      console.error('❌ [DraggableCoupleSlot] Error processing drop:', error)
    }
  }

  const handleClick = () => {
    if (onClick) {
      onClick(couple, match, slotPosition)
    }
  }

  // ============================================================================
  // ESTILOS DINÁMICOS
  // ============================================================================

  const formatPlayerName = (first?: string | null, last?: string | null) =>
    `${first || ''} ${last || ''}`.trim() || 'Jugador'

  const slotClasses = cn(
    // Base styles
    'relative transition-all duration-200 rounded-surface border-2',
    compact ? 'p-1.5 min-h-[2.5rem]' : 'p-3 min-h-[4rem]',
    
    // Estado normal
    !isEditMode && 'border-gray-200 hover:border-gray-300 cursor-pointer',
    
    // Estado draggable
    canDrag && isEditMode && couple && 'cursor-grab hover:shadow-md border-blue-200 hover:border-blue-400',
    canDrag && isEditMode && couple && 'hover:bg-blue-50',
    
    // Estado being dragged
    isDragging && 'opacity-50 scale-95 border-blue-400 bg-blue-100 cursor-grabbing',
    
    // Estado drop zone
    canReceiveDrop && isEditMode && 'border-green-300 hover:border-green-400',
    canReceiveDrop && isEditMode && 'hover:bg-green-50',
    
    // Estado drag hover
    isDragHover && canReceiveDrop && 'border-green-500 bg-green-100 shadow-lg scale-105',

    // Estado click-to-move
    isSelectedForMove && 'border-blue-500 bg-blue-100 shadow-md ring-2 ring-blue-200',
    isMoveTarget && !isSelectedForMove && 'border-violet-300 bg-violet-50 hover:border-violet-400 hover:bg-violet-100',
    
    // Estado de match
    match.status === 'FINISHED' && 'opacity-90',
    match.status === 'IN_PROGRESS' && 'border-yellow-400',
    
    // Slot vacío
    !couple && 'border-dashed border-gray-300 bg-gray-50',
    !couple && isEditMode && canReceiveDrop && 'border-green-300 bg-green-50',
    
    className
  )

  // ============================================================================
  // RENDERIZADO
  // ============================================================================

  return (
    <div
      ref={slotRef}
      className={slotClasses}
      draggable={canDrag && isEditMode && !!couple}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      data-match-id={match.id}
      data-slot={slotPosition}
      data-can-drag={canDrag && isEditMode && !!couple}
      data-can-drop={canReceiveDrop && isEditMode}
      title={
        couple
          ? (canDrag && isEditMode
             ? `Arrastra para mover: ${couple.player1_details?.first_name} ${couple.player1_details?.last_name} & ${couple.player2_details?.first_name} ${couple.player2_details?.last_name}`
             : `${couple.player1_details?.first_name} ${couple.player1_details?.last_name} & ${couple.player2_details?.first_name} ${couple.player2_details?.last_name}`)
          : (canReceiveDrop && isEditMode
             ? 'Zona de drop disponible'
             : 'Slot vacío')
      }
    >
      {/* Indicadores de estado */}
      {isDragging && (
        <div className="absolute -top-2 -right-2 z-20">
          <Badge variant="secondary" className="bg-blue-600 text-white text-xs">
            Arrastrando
          </Badge>
        </div>
      )}
      
      {isDragHover && canReceiveDrop && (
        <div className="absolute -top-2 -left-2 z-20">
          <Badge variant="secondary" className="bg-green-600 text-white text-xs">
            ✓ Soltar aquí
          </Badge>
        </div>
      )}
      
      {canDrag && isEditMode && couple && !isDragging && (
        <div className="absolute top-1 right-1 opacity-50 hover:opacity-100 transition-opacity">
          <GripVertical className="h-4 w-4 text-blue-600" />
        </div>
      )}

      {isSelectedForMove && (
        <div className="absolute -top-2 -left-2 z-20">
          <Badge variant="secondary" className="bg-blue-600 text-white text-xs">
            Origen
          </Badge>
        </div>
      )}

      {isMoveTarget && !isSelectedForMove && !isDragHover && (
        <div className="absolute -top-2 -left-2 z-20">
          <Badge variant="secondary" className="bg-violet-600 text-white text-xs">
            Destino
          </Badge>
        </div>
      )}
      
      {/* Contenido principal */}
      {couple ? (
        <div className={cn('space-y-1', compact && 'space-y-0.5')}>
          <div className={cn('flex items-start gap-1.5', compact && 'gap-1')}>
            {!compact && <Users className="h-4 w-4 text-gray-500 flex-shrink-0 mt-0.5" />}
            <div className={cn('min-w-0 font-medium text-gray-900', compact ? 'text-[11px] leading-snug' : 'text-sm')}>
              <div className="break-words">
                {formatPlayerName(couple.player1_details?.first_name, couple.player1_details?.last_name)}
              </div>
              <div className="break-words text-gray-600">
                {formatPlayerName(couple.player2_details?.first_name, couple.player2_details?.last_name)}
              </div>
            </div>
          </div>
          
          {/* Resultado si el match está finalizado */}
          {match.status === 'FINISHED' && slotResult !== null && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Trophy className="h-3 w-3 text-yellow-500" />
                <span className="text-sm font-bold text-gray-700">
                  {slotResult}
                </span>
              </div>
              <WinnerBadge isWinner={isSlotWinner} />
            </div>
          )}

          {match.status === 'FINISHED' && setScores && setScores.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {setScores.map((score, index) => (
                <span
                  key={`${slotPosition}-set-${index}`}
                  className={cn(
                    'inline-flex min-w-5 justify-center rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700',
                    compact && 'text-[9px]'
                  )}
                >
                  {score}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : isPlaceholder && placeholderLabel ? (
        // Placeholder (esperando resultado de zona)
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <div className="text-sm font-medium text-amber-700">
              {/* Convertir "2B" a "2do B" */}
              {placeholderLabel.replace(/(\d+)([A-Z])/g, '$1° $2')}
            </div>
          </div>
          <div className="flex items-center justify-center">
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
              Esperando zona
            </Badge>
          </div>
        </div>
      ) : (
        // Slot vacío
        <div className="flex items-center justify-center h-full text-gray-400 text-sm">
          {canReceiveDrop && isEditMode ? (
            <div className="text-center">
              <div className="text-lg mb-1">📥</div>
              <div>Zona de Drop</div>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-lg mb-1">👥</div>
              <div>TBD</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DraggableCoupleSlot
