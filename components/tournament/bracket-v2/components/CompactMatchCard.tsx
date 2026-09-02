/**
 * COMPACT MATCH CARD - MATCH CARD COMPACTA OPTIMIZADA
 * 
 * Match card compacta para el nuevo layout horizontal:
 * - Altura reducida (~120px vs ~200px actual)
 * - Mejor visualización de resultados
 * - Mantiene toda la funcionalidad existente
 * - Optimizada para evitar re-renders innecesarios
 * 
 * @author Claude Code Assistant
 * @version 1.0.0
 * @created 2025-01-19
 */

'use client'

import React, { useState, useCallback, memo } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Trophy, 
  MapPin, 
  Edit3,
  Zap,
  CheckCircle2,
  Clock,
  Users
} from 'lucide-react'
import { DraggableCoupleSlot } from './DraggableCoupleSlot'
import { useBracketDragOperations } from '../hooks/useBracketDragOperations'
import { useBracketDragDrop } from '../context/bracket-drag-context'
import { InlineResultForm } from './InlineResultForm'
import { ModifyResultForm } from './ModifyResultForm'
import type {
  BracketMatchV2,
  CoupleData
} from '../types/bracket-types'

// ============================================================================
// TIPOS
// ============================================================================

export interface CompactMatchCardProps {
  /** Match data */
  match: BracketMatchV2
  /** Tournament ID */
  tournamentId: string
  /** Si es owner */
  isOwner: boolean
  /** Si está en modo edición */
  isEditMode: boolean
  /** Handler para updates */
  onMatchUpdate?: (matchId: string, updatedData: any) => void
  /** Clase CSS */
  className?: string
}

// ============================================================================
// COMPONENTE PRINCIPAL (MEMOIZADO)
// ============================================================================

export const CompactMatchCard = memo(function CompactMatchCard({
  match,
  tournamentId,
  isOwner,
  isEditMode,
  onMatchUpdate,
  className
}: CompactMatchCardProps) {

  // Estados locales (persistentes entre re-renders gracias a memo)
  const [localDragHover, setLocalDragHover] = useState<'slot1' | 'slot2' | null>(null)
  const [showInlineResult, setShowInlineResult] = useState<boolean>(false)
  const [showModifyResult, setShowModifyResult] = useState<boolean>(false)

  // Hooks de drag & drop
  const { state: dragState } = useBracketDragDrop()
  const dragOperations = useBracketDragOperations({
    tournamentId,
    isOwner,
    config: {
      enabled: isEditMode && isOwner,
      sameRoundOnly: true,
      pendingMatchesOnly: true,
      maxPendingOperations: 10
    }
  })

  // Datos de parejas (memoizados para evitar re-renders)
  const couple1 = match.participants?.slot1?.couple || null
  const couple2 = match.participants?.slot2?.couple || null

  // Estados de drag
  const slot1IsDragging = dragState.draggedItem?.sourceMatchId === match.id && 
                         dragState.draggedItem?.sourceSlot === 'slot1'
  const slot2IsDragging = dragState.draggedItem?.sourceMatchId === match.id && 
                         dragState.draggedItem?.sourceSlot === 'slot2'

  // ============================================================================
  // INFORMACIÓN DEL RESULTADO (OPTIMIZADA)
  // ============================================================================

  const resultInfo = React.useMemo(() => {
    if (match.status !== 'FINISHED' || !couple1 || !couple2) {
      return null
    }

    // Determinar ganador y resultado visual
    const isCouple1Winner = match.result_couple1 === 'W'
    const isCouple2Winner = match.result_couple2 === 'W'
    
    return {
      winner: isCouple1Winner ? 'couple1' : isCouple2Winner ? 'couple2' : null,
      score: match.final_score || 'Sin score',
      couple1Result: match.result_couple1,
      couple2Result: match.result_couple2
    }
  }, [match.status, match.result_couple1, match.result_couple2, match.final_score, couple1?.id, couple2?.id])

  // ============================================================================
  // VALIDACIONES (MEMOIZADAS)
  // ============================================================================

  const validations = React.useMemo(() => ({
    canDragSlot1: isEditMode && isOwner && !!couple1 && match.status === 'PENDING',
    canDragSlot2: isEditMode && isOwner && !!couple2 && match.status === 'PENDING',
    canReceiveDropSlot1: isEditMode && isOwner && match.status === 'PENDING' &&
                        dragState.isDragging && dragState.draggedItem &&
                        !(dragState.draggedItem.sourceMatchId === match.id && dragState.draggedItem.sourceSlot === 'slot1'),
    canReceiveDropSlot2: isEditMode && isOwner && match.status === 'PENDING' &&
                        dragState.isDragging && dragState.draggedItem &&
                        !(dragState.draggedItem.sourceMatchId === match.id && dragState.draggedItem.sourceSlot === 'slot2'),
    canAddResult: !!(couple1 && couple2) && match.status === 'PENDING',
    canModifyResult: match.status === 'FINISHED' && couple1 && couple2 && !isEditMode
  }), [isEditMode, isOwner, couple1, couple2, match.status, dragState.isDragging, dragState.draggedItem, match.id])

  // ============================================================================
  // HANDLERS OPTIMIZADOS
  // ============================================================================

  const handleDragStart = useCallback((couple: CoupleData, matchData: BracketMatchV2, slot: 'slot1' | 'slot2') => {
    dragOperations.startDrag(couple, matchData, slot)
  }, [dragOperations])

  const handleDragEnd = useCallback(() => {
    dragOperations.endDrag()
    setLocalDragHover(null)
  }, [dragOperations])

  const handleDragEnter = useCallback((targetMatch: BracketMatchV2, targetSlot: 'slot1' | 'slot2') => {
    if (targetMatch.id === match.id) {
      setLocalDragHover(targetSlot)
    }
  }, [match.id])

  const handleDragLeave = useCallback(() => {
    setLocalDragHover(null)
  }, [])

  const handleDrop = useCallback((targetMatch: BracketMatchV2, targetSlot: 'slot1' | 'slot2') => {
    if (dragState.draggedItem && dragState.draggedItem.sourceRound === targetMatch.round && targetMatch.status === 'PENDING') {
      dragOperations.handleDrop(targetMatch, targetSlot)
    }
    setLocalDragHover(null)
  }, [dragState.draggedItem, dragOperations])

  const handleResultButtonClick = useCallback(() => {
    setShowInlineResult(true)
  }, [])

  const handleModifyResultClick = useCallback(() => {
    setShowModifyResult(true)
  }, [])

  const handleInlineResultSaved = useCallback((matchId: string, result: any) => {
    setShowInlineResult(false)
    // Update optimista - actualizar inmediatamente sin esperar refetch
    onMatchUpdate?.(matchId, { result, status: 'FINISHED' })
  }, [onMatchUpdate])

  const handleInlineResultCancel = useCallback(() => {
    setShowInlineResult(false)
  }, [])

  const handleModifyResultSaved = useCallback((matchId: string, result: any) => {
    setShowModifyResult(false)
    // Update optimista
    onMatchUpdate?.(matchId, { result, status: 'FINISHED' })
  }, [onMatchUpdate])

  const handleModifyResultCancel = useCallback(() => {
    setShowModifyResult(false)
  }, [])

  const getStatusLabel = useCallback((status: string) => {
    switch (status) {
      case 'PENDING':
        return 'Pendiente'
      case 'IN_PROGRESS':
        return 'En curso'
      case 'FINISHED':
        return 'Finalizado'
      case 'WAITING_OPPONENT':
      case 'WAITING_OPONENT':
        return 'Esperando oponente'
      case 'BYE':
        return 'BYE'
      default:
        return 'Pendiente'
    }
  }, [])

  // ============================================================================
  // ESTADO VISUAL (OPTIMIZADO)
  // ============================================================================

  const statusInfo = React.useMemo(() => {
    switch (match.status) {
      case 'PENDING':
        return {
          badge: <Badge variant="secondary" className="text-xs">Pendiente</Badge>,
          borderColor: 'border-gray-300',
          bgColor: 'bg-white'
        }
      case 'IN_PROGRESS':
        return {
          badge: <Badge variant="default" className="bg-blue-600 text-xs">En Curso</Badge>,
          borderColor: 'border-blue-400',
          bgColor: 'bg-blue-50'
        }
      case 'FINISHED':
        return {
          badge: <Badge variant="default" className="bg-green-600 text-xs">Finalizado</Badge>,
          borderColor: 'border-green-400',
          bgColor: 'bg-green-50'
        }
      case 'WAITING_OPPONENT':
      case 'WAITING_OPONENT':
        return {
          badge: <Badge variant="outline" className="text-xs">Esperando oponente</Badge>,
          borderColor: 'border-orange-300',
          bgColor: 'bg-orange-50'
        }
      default:
        return {
          badge: <Badge variant="secondary" className="text-xs">{getStatusLabel(match.status)}</Badge>,
          borderColor: 'border-gray-300',
          bgColor: 'bg-white'
        }
    }
  }, [getStatusLabel, match.status])

  // ============================================================================
  // RENDER OPTIMIZADO - LAYOUT COMPACTO
  // ============================================================================

  return (
    <Card className={cn(
      'transition-all duration-200 relative',
      statusInfo.borderColor,
      statusInfo.bgColor,
      'h-[120px]', // Altura fija compacta
      dragState.isDragging && 'ring-2 ring-blue-300 ring-opacity-50',
      isEditMode && 'shadow-md',
      className
    )}>
      <CardContent className="p-3 h-full">
        <div className="flex flex-col h-full">
          
          {/* Header compacto */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <Trophy className="h-3 w-3 text-gray-600" />
              <span className="font-semibold text-xs">
                {match.round} #{match.order_in_round || match.order || 'N/A'}
              </span>
              {isEditMode && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs px-1 py-0">
                  <Zap className="h-2 w-2 mr-0.5" />
                  Edit
                </Badge>
              )}
            </div>
            {statusInfo.badge}
          </div>

          {/* Parejas - Layout compacto horizontal */}
          <div className="flex-1 flex items-center gap-2">
            
            {/* Slot 1 - Compacto */}
            <div className="flex-1 min-w-0">
              <DraggableCoupleSlot
                couple={couple1}
                match={match}
                slotPosition="slot1"
                placeholderLabel={match.participants?.slot1?.placeholder?.display || null}
                isPlaceholder={match.participants?.slot1?.type === 'placeholder' || false}
                canDrag={validations.canDragSlot1}
                isEditMode={isEditMode}
                isDragging={slot1IsDragging}
                canReceiveDrop={validations.canReceiveDropSlot1}
                isDragHover={localDragHover === 'slot1'}
                result={match.result_couple1 as 'W' | 'L' | null}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {}}
              />
            </div>

            {/* Separador VS con resultado */}
            <div className="text-center px-2">
              {resultInfo ? (
                <div className="text-center">
                  <div className="text-xs font-bold text-green-700 mb-1">
                    {resultInfo.score}
                  </div>
                  <CheckCircle2 className="h-3 w-3 text-green-500 mx-auto" />
                </div>
              ) : (
                <div className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  VS
                </div>
              )}
            </div>

            {/* Slot 2 - Compacto */}
            <div className="flex-1 min-w-0">
              <DraggableCoupleSlot
                couple={couple2}
                match={match}
                slotPosition="slot2"
                placeholderLabel={match.participants?.slot2?.placeholder?.display || null}
                isPlaceholder={match.participants?.slot2?.type === 'placeholder' || false}
                canDrag={validations.canDragSlot2}
                isEditMode={isEditMode}
                isDragging={slot2IsDragging}
                canReceiveDrop={validations.canReceiveDropSlot2}
                isDragHover={localDragHover === 'slot2'}
                result={match.result_couple2 as 'W' | 'L' | null}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {}}
              />
            </div>
          </div>

          {/* Footer compacto */}
          <div className="mt-2 flex items-center justify-between">
            {/* Info adicional */}
            <div className="flex items-center gap-2 text-xs text-gray-600">
              {match.court && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span>{match.court}</span>
                </div>
              )}
            </div>

            {/* Acciones compactas */}
            {isOwner && !isEditMode && !showInlineResult && !showModifyResult && (
              <div className="flex gap-1">
                {validations.canAddResult && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResultButtonClick}
                    className="text-xs h-6 px-2"
                  >
                    <Edit3 className="h-2 w-2 mr-1" />
                    Resultado
                  </Button>
                )}
                {validations.canModifyResult && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleModifyResultClick}
                    className="text-xs h-6 px-2 border-orange-300 text-orange-700 hover:bg-orange-50"
                  >
                    <Edit3 className="h-2 w-2 mr-1" />
                    Modificar
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Formularios inline */}
        {showInlineResult && isOwner && !isEditMode && (
          <div className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-surface p-2 z-20">
            <InlineResultForm
              match={match}
              tournamentId={tournamentId}
              isOwner={isOwner}
              onResultSaved={handleInlineResultSaved}
              onCancel={handleInlineResultCancel}
              className="text-xs"
            />
          </div>
        )}

        {showModifyResult && isOwner && !isEditMode && (
          <div className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-surface p-2 z-20">
            <ModifyResultForm
              match={match}
              tournamentId={tournamentId}
              isOwner={isOwner}
              onResultSaved={handleModifyResultSaved}
              onCancel={handleModifyResultCancel}
              className="text-xs"
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}, (prevProps, nextProps) => {
  // Custom comparison para evitar re-renders innecesarios
  return (
    prevProps.match.id === nextProps.match.id &&
    prevProps.match.status === nextProps.match.status &&
    prevProps.match.result_couple1 === nextProps.match.result_couple1 &&
    prevProps.match.result_couple2 === nextProps.match.result_couple2 &&
    prevProps.match.final_score === nextProps.match.final_score &&
    prevProps.isEditMode === nextProps.isEditMode &&
    prevProps.isOwner === nextProps.isOwner &&
    prevProps.match.participants?.slot1?.couple?.id === nextProps.match.participants?.slot1?.couple?.id &&
    prevProps.match.participants?.slot2?.couple?.id === nextProps.match.participants?.slot2?.couple?.id
  )
})

export default CompactMatchCard
