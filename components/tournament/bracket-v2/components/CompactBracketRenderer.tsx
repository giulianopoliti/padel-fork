/**
 * COMPACT BRACKET RENDERER - LAYOUT HORIZONTAL COMPACTO CON OPTIMIZACIONES
 * 
 * Nuevo renderizador de brackets con:
 * - Cards más compactas (~120px altura)  
 * - Layout horizontal de izquierda a derecha
 * - Mejor visualización de resultados
 * - Adaptativo a cualquier instancia inicial (32VOS, 16VOS, 8VOS, 4TOS, etc.)
 * - Mantiene toda la funcionalidad existente de drag & drop
 * - OPTIMIZACIONES: Re-renders mínimos, estado persistente, updates optimistas
 * 
 * @author Claude Code Assistant
 * @version 1.0.0
 * @created 2025-01-19
 */

'use client'

import React, { useMemo, useState, useCallback, memo, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { 
  Edit3,
  Save,
  X,
  Trophy,
  ChevronRight,
  RotateCw
} from 'lucide-react'
import { CompactMatchCard } from './CompactMatchCard'
import { useBracketDragDrop } from '../context/bracket-drag-context'
import { useBracketDragOperations } from '../hooks/useBracketDragOperations'
import { applyPendingOperationsToData, getMatchPreviewInfo } from '../utils/preview-operations'
import type {
  BracketData,
  BracketMatchV2
} from '../types/bracket-types'

// ============================================================================
// TIPOS
// ============================================================================

export interface CompactBracketRendererProps {
  bracketData: BracketData
  tournamentId: string
  isOwner?: boolean
  enableDragDrop?: boolean
  onMatchUpdate?: (matchId: string, updatedData: any) => void
  onDataRefresh?: () => void
  className?: string
}

interface RoundColumn {
  round: string
  displayName: string
  matches: BracketMatchV2[]
  totalMatches: number
  completedMatches: number
  canPlay: number
  position: number
}

// ============================================================================
// COMPONENTE OPTIMIZADO CON MEMO
// ============================================================================

export const CompactBracketRenderer = memo(function CompactBracketRenderer({
  bracketData,
  tournamentId,
  isOwner = false,
  enableDragDrop = false,
  onMatchUpdate,
  onDataRefresh,
  className
}: CompactBracketRendererProps) {

  // Estados locales - PERSISTENTES gracias a memo
  const [isEditMode, setIsEditMode] = useState<boolean>(false)
  const [scrollPosition, setScrollPosition] = useState({ x: 0, y: 0 })
  
  // Refs para preservar scroll
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Hook del contexto de drag & drop
  const { state: dragState } = useBracketDragDrop()
  
  // Hook para operaciones de drag & drop
  const dragOperations = useBracketDragOperations({
    tournamentId,
    isOwner,
    config: {
      enabled: enableDragDrop && isOwner && isEditMode,
      sameRoundOnly: true,
      pendingMatchesOnly: true,
      maxPendingOperations: 10
    }
  })
  
  // ============================================================================
  // OPTIMIZACIÓN: CÁLCULO DE PREVIEW DATA MEMOIZADO
  // ============================================================================
  
  const previewData = useMemo(() => {
    // Solo recalcular si hay operaciones pendientes
    if (dragState.pendingOperations.length === 0) {
      return bracketData
    }
    return applyPendingOperationsToData(bracketData, dragState.pendingOperations)
  }, [bracketData, dragState.pendingOperations])

  // ============================================================================
  // OPTIMIZACIÓN: AGRUPAR Y ORGANIZAR MATCHES MEMOIZADO  
  // ============================================================================

  const roundColumns = useMemo(() => {
    const groups = new Map<string, BracketMatchV2[]>()
    
    // Agrupar matches por round
    previewData.matches.forEach(match => {
      if (!groups.has(match.round)) {
        groups.set(match.round, [])
      }
      groups.get(match.round)!.push(match)
    })

    // Orden lógico adaptativo - detecta automáticamente primera instancia
    const roundOrder = ['32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']
    const roundDisplayNames: Record<string, string> = {
      '32VOS': 'Treintaidosavos',
      '16VOS': 'Dieciseisavos', 
      '8VOS': 'Octavos',
      '4TOS': 'Cuartos',
      'SEMIFINAL': 'Semifinales',
      'FINAL': 'Final'
    }

    // Crear columnas solo para las rondas que existen
    const existingRounds = Array.from(groups.keys())
    const orderedRounds = roundOrder.filter(round => existingRounds.includes(round))
    
    return orderedRounds.map((round, index): RoundColumn => {
      const matches = groups.get(round) || []
      const sortedMatches = matches.sort((a, b) => (a.order_in_round || a.order || 0) - (b.order_in_round || b.order || 0))
      const completedMatches = sortedMatches.filter(m => m.status === 'FINISHED').length
      const canPlay = sortedMatches.filter(m => 
        m.participants?.slot1?.couple && m.participants?.slot2?.couple && m.status === 'PENDING'
      ).length

      return {
        round,
        displayName: roundDisplayNames[round] || round,
        matches: sortedMatches,
        totalMatches: sortedMatches.length,
        completedMatches,
        canPlay,
        position: index
      }
    })
  }, [previewData.matches])

  // ============================================================================
  // OPTIMIZACIÓN: ESTADÍSTICAS MEMOIZADAS
  // ============================================================================

  const stats = useMemo(() => {
    const total = previewData.matches.length
    const completed = previewData.matches.filter(m => m.status === 'FINISHED').length
    const inProgress = previewData.matches.filter(m => m.status === 'IN_PROGRESS').length
    const canPlay = previewData.matches.filter(m => 
      m.participants?.slot1?.couple && m.participants?.slot2?.couple && m.status === 'PENDING'
    ).length

    return { total, completed, inProgress, canPlay }
  }, [previewData.matches])

  // ============================================================================
  // OPTIMIZACIÓN: HANDLERS OPTIMIZADOS CON useCallback
  // ============================================================================

  const handleEnterEditMode = useCallback(() => {
    setIsEditMode(true)
  }, [])
  
  const handleExitEditMode = useCallback(() => {
    dragOperations.clearPendingOperations()
    setIsEditMode(false)
  }, [dragOperations])

  const handleSaveChanges = useCallback(async () => {
    if (dragState.pendingOperations.length === 0) return
    
    // Guardar posición de scroll antes de la operación
    const currentScroll = {
      x: scrollAreaRef.current?.scrollLeft || 0,
      y: scrollAreaRef.current?.scrollTop || 0
    }
    setScrollPosition(currentScroll)
    
    const result = await dragOperations.saveAllOperations()
    if (result.success) {
      setIsEditMode(false)
      // Llamar refresh DESPUÉS de actualizar estado local
      setTimeout(() => {
        onDataRefresh?.()
      }, 100)
    }
  }, [dragState.pendingOperations.length, dragOperations, onDataRefresh])

  // OPTIMIZACIÓN: Handler de match update optimista
  const handleMatchUpdate = useCallback((matchId: string, updatedData: any) => {
    // Update optimista inmediato - no esperar refetch
    console.log(`🔄 [CompactBracketRenderer] Update optimista para match ${matchId}:`, updatedData)
    
    // Preservar scroll durante update
    const currentScroll = {
      x: scrollAreaRef.current?.scrollLeft || 0,
      y: scrollAreaRef.current?.scrollTop || 0
    }
    setScrollPosition(currentScroll)
    
    // Llamar el handler parent
    onMatchUpdate?.(matchId, updatedData)
    
    // Restaurar scroll después del update
    setTimeout(() => {
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollLeft = currentScroll.x
        scrollAreaRef.current.scrollTop = currentScroll.y
      }
    }, 50)
  }, [onMatchUpdate])

  // ============================================================================
  // OPTIMIZACIÓN: PRESERVAR SCROLL POSITION
  // ============================================================================

  useEffect(() => {
    if (scrollAreaRef.current && scrollPosition.x > 0) {
      scrollAreaRef.current.scrollLeft = scrollPosition.x
      scrollAreaRef.current.scrollTop = scrollPosition.y
    }
  }, [previewData.matches.length])

  // ============================================================================
  // RENDER: MATCH INDIVIDUAL OPTIMIZADO
  // ============================================================================

  const renderCompactMatch = useCallback((match: BracketMatchV2, index: number) => {
    const previewInfo = getMatchPreviewInfo(match.id, dragState.pendingOperations)
    const hasChanges = previewInfo.hasChanges
    
    return (
      <div
        key={match.id}
        className={cn(
          'transition-all duration-200 relative mb-3',
          hasChanges && 'ring-2 ring-blue-300 ring-opacity-50 shadow-blue-100'
        )}
      >
        {/* Indicador de cambios pendientes */}
        {hasChanges && (
          <div className="absolute -top-1 -right-1 z-30">
            <div className="bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold shadow-lg">
              {previewInfo.operationsCount}
            </div>
          </div>
        )}
        
        {/* Componente compacto memoizado */}
        <CompactMatchCard
          match={match}
          tournamentId={tournamentId}
          isOwner={isOwner}
          isEditMode={isEditMode}
          onMatchUpdate={handleMatchUpdate}
          className={cn(
            'hover:shadow-md transition-shadow',
            hasChanges && 'ring-1 ring-blue-200 shadow-blue-50'
          )}
        />
      </div>
    )
  }, [tournamentId, isOwner, isEditMode, dragState.pendingOperations, handleMatchUpdate])

  // ============================================================================
  // RENDER: COLUMNA DE RONDA OPTIMIZADA
  // ============================================================================

  const renderRoundColumn = useCallback((column: RoundColumn, columnIndex: number) => {
    return (
      <div key={column.round} className="flex-shrink-0 min-w-[280px] max-w-[320px] relative">
        {/* Header de la columna - STICKY */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-200 pb-3 mb-4 rounded-surface">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {column.displayName}
            </h3>
            <div className="flex items-center justify-center gap-3 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                {column.totalMatches}
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                {column.completedMatches}
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                {column.canPlay}
              </span>
            </div>
            
            {/* Barra de progreso compacta */}
            <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
              <div 
                className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
                style={{ 
                  width: column.totalMatches > 0 ? `${(column.completedMatches / column.totalMatches) * 100}%` : '0%' 
                }}
              />
            </div>
          </div>
        </div>

        {/* Matches de la columna */}
        <div className="space-y-3">
          {column.matches.map((match, index) => renderCompactMatch(match, index))}
        </div>

        {/* Conector hacia la siguiente ronda */}
        {columnIndex < roundColumns.length - 1 && (
          <div className="absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
            <div className="bg-white rounded-full p-1 shadow-sm border border-gray-200">
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </div>
          </div>
        )}
      </div>
    )
  }, [roundColumns.length, renderCompactMatch])

  // ============================================================================
  // RENDER: CONTROLES COMPACTOS OPTIMIZADOS
  // ============================================================================

  const renderCompactControls = useCallback(() => (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white/95 backdrop-blur-sm border-b border-gray-200">
      
      {/* Modo edición y controles */}
      {isOwner && enableDragDrop && (
        <div className="flex items-center gap-2">
          {!isEditMode ? (
            <Button
              onClick={handleEnterEditMode}
              variant="outline"
              size="sm"
              className="border-blue-300 text-blue-700 hover:bg-blue-50 text-xs h-8"
            >
              <Edit3 className="h-3 w-3 mr-1" />
              Editar
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              {dragState.pendingOperations.length > 0 ? (
                <>
                  <Button
                    onClick={handleSaveChanges}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white text-xs h-8"
                    disabled={dragOperations.savingOperations}
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Guardar {dragState.pendingOperations.length}
                  </Button>
                  <Button
                    onClick={handleExitEditMode}
                    variant="outline"
                    size="sm"
                    className="border-red-300 text-red-700 hover:bg-red-50 text-xs h-8"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button
                  onClick={handleExitEditMode}
                  variant="outline"
                  size="sm"
                  className="border-gray-300 text-xs h-8"
                >
                  <X className="h-3 w-3 mr-1" />
                  Salir
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Indicador de operaciones pendientes - más compacto */}
      {dragState.pendingOperations.length > 0 && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded px-2 py-1">
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-blue-800 font-medium">
            {dragState.pendingOperations.length} cambio(s) pendiente(s)
          </span>
        </div>
      )}
    
      {/* Estadísticas compactas */}
      <div className="flex items-center gap-3 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <Trophy className="h-3 w-3" />
          {stats.total}
        </span>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          {stats.completed}
        </span>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
          {stats.canPlay}
        </span>
      </div>

      {/* Refresh button */}
      {onDataRefresh && (
        <Button
          variant="outline"
          size="sm"
          onClick={onDataRefresh}
          className="text-xs h-8"
        >
          <RotateCw className="h-3 w-3" />
        </Button>
      )}
    </div>
  ), [isOwner, enableDragDrop, isEditMode, dragState.pendingOperations.length, dragOperations.savingOperations, stats, onDataRefresh, handleEnterEditMode, handleExitEditMode, handleSaveChanges])

  // ============================================================================
  // RENDER PRINCIPAL OPTIMIZADO
  // ============================================================================

  return (
    <div className={cn('bg-gray-50 rounded-surface border', className)}>
      {/* Controles superiores compactos */}
      {renderCompactControls()}

      {/* Contenido principal - Layout horizontal */}
      <ScrollArea ref={scrollAreaRef} className="h-[calc(100vh-10rem)]">
        <div className="p-4">
          {roundColumns.length === 0 ? (
            /* Estado vacío */
            <div className="text-center py-12">
              <div className="text-gray-500 text-lg mb-2">
                No hay matches para mostrar
              </div>
              <div className="text-gray-400 text-sm">
                Verifica que el bracket esté generado
              </div>
            </div>
          ) : (
            /* Layout horizontal de columnas */
            <div className="flex gap-8 relative min-h-[500px]">
              {roundColumns.map((column, index) => renderRoundColumn(column, index))}
            </div>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
        <ScrollBar orientation="vertical" />
      </ScrollArea>

      {/* Footer con información de drag & drop */}
      {enableDragDrop && isOwner && (
        <div className={cn(
          "p-2 border-t transition-colors text-xs",
          isEditMode ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isEditMode ? (
                <>
                  <Edit3 className="h-3 w-3 text-blue-600" />
                  <span className="text-blue-800">
                    <strong>Modo Edición:</strong> Arrastra parejas entre matches de la misma ronda
                  </span>
                </>
              ) : (
                <>
                  <Edit3 className="h-3 w-3 text-gray-600" />
                  <span className="text-gray-700">
                    Drag & Drop disponible. Toca "Editar" para reorganizar
                  </span>
                </>
              )}
            </div>
            {isEditMode && dragState.pendingOperations.length > 0 && (
              <span className="text-blue-600 font-medium">
                {dragState.pendingOperations.length} operación(es) pendiente(s)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}, (prevProps, nextProps) => {
  // OPTIMIZACIÓN: Custom comparison para evitar re-renders innecesarios
  return (
    prevProps.tournamentId === nextProps.tournamentId &&
    prevProps.isOwner === nextProps.isOwner &&
    prevProps.enableDragDrop === nextProps.enableDragDrop &&
    prevProps.bracketData.matches.length === nextProps.bracketData.matches.length &&
    // Solo re-render si realmente cambió el contenido de los matches
    JSON.stringify(prevProps.bracketData.matches.map(m => ({ 
      id: m.id, status: m.status, result_couple1: m.result_couple1, result_couple2: m.result_couple2 
    }))) === JSON.stringify(nextProps.bracketData.matches.map(m => ({ 
      id: m.id, status: m.status, result_couple1: m.result_couple1, result_couple2: m.result_couple2 
    })))
  )
})

export default CompactBracketRenderer