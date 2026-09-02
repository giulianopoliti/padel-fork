/**
 * BRACKET RENDERER - MOTOR DE RENDERIZADO DEL BRACKET
 * 
 * Componente que combina el layout engine con los componentes visuales
 * para renderizar el bracket completo. Actúa como puente entre el cálculo
 * de posiciones y la visualización final.
 * 
 * RESPONSABILIDADES:
 * - Renderizar matches en posiciones calculadas
 * - Manejar viewport y scroll
 * - Optimizaciones de performance (virtualization)
 * - Eventos de interacción
 * - Estados de loading y error
 * 
 * @author Claude Code Assistant
 * @version 2.0.0
 * @created 2025-01-17
 */

'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { MatchCard } from './MatchCard'
import { DraggableMatchCard } from './DraggableMatchCard'
import { DragDropOverlay } from './DragDropOverlay'
import { useBracketLayout } from '../hooks/useBracketLayout'
import { useBracketDragDrop } from '../hooks/useBracketDragDrop'
import type {
  BracketData,
  BracketMatchV2,
  ParticipantSlot,
  CoupleData
} from '../types/bracket-types'
import type {
  BracketLayout,
  MatchLayoutPosition,
  UseBracketLayoutConfig
} from '../types/layout-types'
import type {
  DragDropConfig,
  SlotPosition
} from '../types/drag-drop-types'
import type { MatchCardConfig } from './MatchCard'

// ============================================================================
// TIPOS DEL COMPONENTE
// ============================================================================

/**
 * Props del BracketRenderer
 */
export interface BracketRendererProps {
  /** Datos del bracket */
  bracketData: BracketData
  /** ID del torneo */
  tournamentId: string
  /** Configuración del layout */
  layoutConfig?: UseBracketLayoutConfig
  /** Configuración de MatchCard */
  matchCardConfig?: Partial<MatchCardConfig>
  /** Configuración de drag & drop */
  dragDropConfig?: Partial<DragDropConfig>
  /** Si es interactivo */
  interactive?: boolean
  /** Si drag & drop está habilitado */
  draggable?: boolean
  /** Si el usuario es owner */
  isOwner?: boolean
  /** Match seleccionado */
  selectedMatchId?: string
  /** Handlers de eventos */
  onMatchClick?: (match: BracketMatchV2) => void
  onParticipantClick?: (slot: ParticipantSlot, slotPosition: 'slot1' | 'slot2', match: BracketMatchV2) => void
  /** Handler para drag start */
  onDragStart?: (couple: CoupleData, match: BracketMatchV2, slot: SlotPosition) => void
  /** Handler para data refresh */
  onDataRefresh?: () => void
  /** Clase CSS adicional */
  className?: string
}

/**
 * Props del viewport container
 */
interface ViewportContainerProps {
  layout: BracketLayout
  children: React.ReactNode
  className?: string
}

// ============================================================================
// COMPONENTES AUXILIARES
// ============================================================================

/**
 * Container con scroll y dimensiones calculadas
 */
function ViewportContainer({ layout, children, className }: ViewportContainerProps) {
  return (
    <div
      className={cn(
        'bracket-viewport relative overflow-auto',
        'border border-slate-200 rounded-surface bg-slate-50',
        className
      )}
      style={{
        height: 'calc(100vh - 200px)', // Altura máxima adaptable
        minHeight: '400px'
      }}
    >
      <div
        className="bracket-canvas relative bg-white"
        style={{
          width: layout.totalDimensions.width,
          height: layout.totalDimensions.height,
          minWidth: '100%',
          minHeight: '100%'
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Indicador de carga del layout
 */
function LayoutLoadingIndicator() {
  return (
    <div className="bracket-loading flex items-center justify-center h-96">
      <div className="text-center space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <div className="text-sm text-slate-600">Calculando posiciones del bracket...</div>
      </div>
    </div>
  )
}

/**
 * Indicador de error del layout
 */
function LayoutErrorIndicator({ error, onRetry }: { error: Error, onRetry: () => void }) {
  return (
    <div className="bracket-error flex items-center justify-center h-96">
      <div className="text-center space-y-4 max-w-md">
        <div className="text-red-600 text-lg font-medium">Error en el layout</div>
        <div className="text-sm text-slate-600">{error.message}</div>
        <button
          onClick={onRetry}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
        >
          Reintentar cálculo
        </button>
      </div>
    </div>
  )
}

/**
 * Información de debug del layout
 */
function LayoutDebugInfo({ layout }: { layout: BracketLayout }) {
  if (process.env.NODE_ENV !== 'development') return null
  
  return (
    <div className="layout-debug bg-slate-100 border border-slate-300 rounded p-3 text-xs font-mono space-y-1">
      <div className="font-bold">🏗️ LAYOUT DEBUG</div>
      <div>Dimensions: {layout.totalDimensions.width}x{layout.totalDimensions.height}</div>
      <div>Matches: {layout.matchPositions.length}</div>
      <div>Columns: {layout.columns.length}</div>
      <div>Calculation: {layout.metadata.calculationTime.toFixed(2)}ms</div>
      <div>Valid: {layout.metadata.isValid ? '✅' : '❌'}</div>
      {layout.metadata.warnings.length > 0 && (
        <div>Warnings: {layout.metadata.warnings.length}</div>
      )}
    </div>
  )
}

/**
 * Controles de navegación
 */
function NavigationControls({
  layout,
  onScrollToMatch,
  onZoomChange
}: {
  layout: BracketLayout
  onScrollToMatch: (matchId: string) => void
  onZoomChange: (zoom: number) => void
}) {
  const [zoom, setZoom] = React.useState(1)
  
  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom)
    onZoomChange(newZoom)
  }
  
  // Para esta fase, controles básicos
  return (
    <div className="navigation-controls flex items-center gap-3 mb-4 p-3 bg-white border border-slate-200 rounded-surface">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">Zoom:</span>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={zoom}
          onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
          className="w-20"
        />
        <span className="text-sm text-slate-600 min-w-[3rem]">{Math.round(zoom * 100)}%</span>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">Rounds:</span>
        <span className="text-sm font-medium">{layout.columns.length}</span>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">Matches:</span>
        <span className="text-sm font-medium">{layout.matchPositions.length}</span>
      </div>
    </div>
  )
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

/**
 * Componente principal del renderizador de brackets
 */
export function BracketRenderer({
  bracketData,
  tournamentId,
  layoutConfig,
  matchCardConfig,
  dragDropConfig,
  interactive = true,
  draggable = false,
  isOwner = false,
  selectedMatchId,
  onMatchClick,
  onParticipantClick,
  onDragStart,
  onDataRefresh,
  className
}: BracketRendererProps) {
  
  // Hook de layout
  const {
    layout,
    calculating,
    error,
    recalculate,
    scrollToMatch,
    setZoom
  } = useBracketLayout(bracketData, layoutConfig)
  
  // Hook de drag & drop
  const {
    state: dragState,
    draggedItem,
    dropZones,
    currentTarget,
    config: finalDragDropConfig,
    startDrag,
    endDrag,
    setHoverTarget,
    handleDrop,
    validateOperation
  } = useBracketDragDrop(
    bracketData,
    layout?.matchPositions || [],
    tournamentId,
    isOwner,
    dragDropConfig
  )
  
  // Estado para posición del mouse durante drag
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 })
  
  // Track mouse position during drag
  React.useEffect(() => {
    if (dragState !== 'dragging') return
    
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    return () => document.removeEventListener('mousemove', handleMouseMove)
  }, [dragState])
  
  // Configuración de MatchCard
  const finalMatchCardConfig: MatchCardConfig = {
    showSeeds: true,
    showZoneInfo: true,
    showStatus: true,
    showResult: true,
    cardStyle: 'default',
    colors: {
      pending: 'bg-slate-50 border-slate-200',
      inProgress: 'bg-blue-50 border-blue-200',
      finished: 'bg-green-50 border-green-200',
      bye: 'bg-yellow-50 border-yellow-200',
      placeholder: 'bg-gray-50 border-gray-200 border-dashed'
    },
    ...matchCardConfig
  }
  
  // Handlers de eventos
  const handleMatchClick = React.useCallback((match: BracketMatchV2) => {
    if (onMatchClick) {
      onMatchClick(match)
    }
  }, [onMatchClick])
  
  const handleParticipantClick = React.useCallback((
    slot: ParticipantSlot, 
    slotPosition: 'slot1' | 'slot2',
    match: BracketMatchV2
  ) => {
    if (onParticipantClick) {
      onParticipantClick(slot, slotPosition, match)
    }
  }, [onParticipantClick])
  
  // Handlers de drag & drop
  const handleDragStart = React.useCallback((couple: CoupleData, match: BracketMatchV2, slot: SlotPosition) => {
    startDrag(couple, match, slot)
    if (onDragStart) {
      onDragStart(couple, match, slot)
    }
  }, [startDrag, onDragStart])
  
  const handleDragEnd = React.useCallback(() => {
    endDrag()
  }, [endDrag])
  
  const handleDragOver = React.useCallback((match: BracketMatchV2) => {
    // Update hover target if needed
  }, [])
  
  const handleLocalDrop = React.useCallback(async (match: BracketMatchV2, slot: SlotPosition) => {
    try {
      const target = {
        match,
        slot,
        isValid: true, // Will be validated in the hook
        distance: 0
      }
      
      const result = await handleDrop(target)
      
      if (result.success && onDataRefresh) {
        // Refresh data after successful drop
        onDataRefresh()
      }
    } catch (error) {
      console.error('Drop operation failed:', error)
    }
  }, [handleDrop, onDataRefresh])
  
  // Validation function for drag operations
  const canDragParticipant = React.useCallback((couple: CoupleData, match: BracketMatchV2, slot: SlotPosition) => {
    if (!draggable || !isOwner) {
      return { canDrag: false, reason: 'Drag & drop no habilitado' }
    }
    
    if (match.status !== 'PENDING') {
      return { canDrag: false, reason: 'No se pueden mover parejas de matches en progreso' }
    }
    
    return { canDrag: true }
  }, [draggable, isOwner])
  
  // Estados de renderizado
  if (calculating) {
    return <LayoutLoadingIndicator />
  }
  
  if (error) {
    return <LayoutErrorIndicator error={error} onRetry={recalculate} />
  }
  
  if (!layout) {
    return (
      <div className="bracket-empty flex items-center justify-center h-96">
        <div className="text-center space-y-3">
          <div className="text-slate-500">No hay layout calculado</div>
          <button
            onClick={recalculate}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Calcular layout
          </button>
        </div>
      </div>
    )
  }
  
  return (
    <div className={cn('bracket-renderer relative', className)}>
      {/* Controles de navegación */}
      <NavigationControls
        layout={layout}
        onScrollToMatch={scrollToMatch}
        onZoomChange={setZoom}
      />
      
      {/* Debug info */}
      <LayoutDebugInfo layout={layout} />
      
      {/* Viewport con matches */}
      <ViewportContainer layout={layout}>
        {/* Renderizar todos los matches */}
        {layout.matchPositions.map((position) => {
          const isDragSource = draggedItem?.sourceMatch.id === position.match.id
          const isValidTarget = draggable && dragState === 'dragging' && 
            position.match.round === draggedItem?.sourceMatch.round &&
            position.match.status === 'PENDING'
          const isHoverTarget = currentTarget?.match.id === position.match.id
          
          
          // Use DraggableMatchCard if drag & drop is enabled
          if (draggable && finalDragDropConfig.enabled) {
            return (
              <DraggableMatchCard
                key={position.match.id}
                match={position.match}
                position={position}
                config={finalMatchCardConfig}
                draggable={draggable}
                dragState={dragState}
                isDragSource={isDragSource}
                isValidTarget={isValidTarget}
                isHoverTarget={isHoverTarget}
                selected={position.match.id === selectedMatchId}
                interactive={interactive}
                onMatchClick={handleMatchClick}
                onParticipantClick={(slot, slotPosition) => 
                  handleParticipantClick(slot, slotPosition, position.match)
                }
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleLocalDrop}
                canDragParticipant={canDragParticipant}
              />
            )
          }
          
          // Use regular MatchCard (simplificado)
          return (
            <MatchCard
              key={position.match.id}
              match={position.match}
              position={position}
              config={finalMatchCardConfig}
              selected={position.match.id === selectedMatchId}
              interactive={interactive}
              onMatchClick={handleMatchClick}
              onParticipantClick={(slot, slotPosition) => 
                handleParticipantClick(slot, slotPosition, position.match)
              }
            />
          )
        })}
        
        {/* TODO: Líneas conectoras en FASE 5 */}
        {/* <ConnectorLines groups={layout.connectors} /> */}
      </ViewportContainer>
      
      {/* Drag & Drop Overlay - DESHABILITADO para modo edición simple */}
      {false && draggable && finalDragDropConfig.enabled && (
        <DragDropOverlay
          draggedItem={draggedItem}
          dropZones={dropZones}
          currentTarget={currentTarget}
          config={finalDragDropConfig}
          onDrop={(target) => handleLocalDrop(target.match, target.slot)}
          onZoneHover={setHoverTarget}
          mousePosition={mousePosition}
        />
      )}
      
      {/* Información adicional */}
      {layout.metadata.warnings.length > 0 && (
        <div className="layout-warnings mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <div className="text-sm font-medium text-yellow-800 mb-1">Advertencias:</div>
          <ul className="text-sm text-yellow-700 space-y-1">
            {layout.metadata.warnings.map((warning, index) => (
              <li key={index}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Drag & Drop Status */}
      {draggable && dragState !== 'idle' && process.env.NODE_ENV === 'development' && (
        <div className="drag-debug mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="text-sm font-medium text-blue-800 mb-1">🎯 DRAG & DROP DEBUG</div>
          <div className="text-xs font-mono space-y-1">
            <div>Estado: {dragState}</div>
            {draggedItem && (
              <>
                <div>Origen: {draggedItem.sourceMatch.round} - {draggedItem.sourceSlot}</div>
                <div>Pareja: {draggedItem.couple.player1_details?.first_name} & {draggedItem.couple.player2_details?.first_name}</div>
              </>
            )}
            {currentTarget && (
              <div>Target: {currentTarget.match.round} - {currentTarget.slot} (válido: {currentTarget.isValid ? '✅' : '❌'})</div>
            )}
            <div>Drop zones: {dropZones.length}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BracketRenderer