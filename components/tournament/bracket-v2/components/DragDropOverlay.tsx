/**
 * DRAG & DROP OVERLAY - SISTEMA VISUAL DE DRAG & DROP
 * 
 * Componente que renderiza el overlay visual durante operaciones de drag & drop.
 * Muestra zonas de drop válidas/inválidas, ghost element y feedback visual.
 * 
 * FUNCIONALIDADES:
 * - Overlay completo durante drag
 * - Zonas de drop con indicadores visuales
 * - Ghost element personalizado
 * - Animaciones suaves y feedback haptico
 * - Estados visuales (valid, invalid, hover)
 * - Responsive y accesible
 * 
 * @author Claude Code Assistant
 * @version 2.0.0
 * @created 2025-01-17
 */

'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import type {
  DraggedCouple,
  DropZone,
  DropTarget,
  DragDropConfig
} from '../types/drag-drop-types'
import type { CoupleData } from '../types/bracket-types'

// ============================================================================
// TIPOS DEL COMPONENTE
// ============================================================================

/**
 * Props del DragDropOverlay
 */
export interface DragDropOverlayProps {
  /** Item siendo arrastrado */
  draggedItem: DraggedCouple | null
  /** Zonas de drop disponibles */
  dropZones: DropZone[]
  /** Target actual del hover */
  currentTarget: DropTarget | null
  /** Configuración visual */
  config: DragDropConfig
  /** Handler para drop */
  onDrop: (target: DropTarget) => void
  /** Handler para hover sobre zona */
  onZoneHover: (zone: DropZone | null) => void
  /** Posición del mouse */
  mousePosition: { x: number; y: number }
  /** Clase CSS adicional */
  className?: string
}

/**
 * Props del ghost element
 */
interface GhostElementProps {
  draggedItem: DraggedCouple
  mousePosition: { x: number; y: number }
  config: DragDropConfig
}

/**
 * Props de zona de drop
 */
interface DropZoneIndicatorProps {
  zone: DropZone
  isCurrentTarget: boolean
  config: DragDropConfig
  onHover: (zone: DropZone | null) => void
  onDrop: (zone: DropZone) => void
}

// ============================================================================
// COMPONENTES AUXILIARES
// ============================================================================

/**
 * Elemento ghost que sigue al mouse durante drag
 */
function GhostElement({ draggedItem, mousePosition, config }: GhostElementProps) {
  const { couple } = draggedItem
  
  return (
    <div
      className={cn(
        'ghost-element fixed pointer-events-none z-50',
        'bg-white border-2 border-blue-500 rounded-surface shadow-lg',
        'transition-transform duration-75 ease-out',
        config.visual.animations && 'animate-pulse'
      )}
      style={{
        left: mousePosition.x + 10,
        top: mousePosition.y + 10,
        transform: 'rotate(3deg)',
        minWidth: '200px'
      }}
    >
      <div className="p-3">
        <div className="text-xs font-medium text-blue-600 mb-1">
          Arrastrando...
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium">
            {couple.player1_details?.first_name} {couple.player1_details?.last_name}
          </div>
          <div className="text-sm font-medium">
            {couple.player2_details?.first_name} {couple.player2_details?.last_name}
          </div>
        </div>
        {couple.seed && (
          <div className="mt-2">
            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded">
              Seed #{couple.seed.seed}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Indicador visual de zona de drop
 */
function DropZoneIndicator({ 
  zone, 
  isCurrentTarget, 
  config, 
  onHover, 
  onDrop 
}: DropZoneIndicatorProps) {
  
  const baseClasses = cn(
    'drop-zone-indicator absolute transition-all duration-200',
    'border-2 border-dashed rounded',
    {
      // Estados válidos
      'border-green-400 bg-green-50': zone.isValid && !isCurrentTarget,
      'border-green-500 bg-green-100': zone.isValid && isCurrentTarget,
      
      // Estados inválidos
      'border-red-400 bg-red-50': !zone.isValid && !isCurrentTarget,
      'border-red-500 bg-red-100': !zone.isValid && isCurrentTarget,
      
      // Animaciones
      'scale-105': isCurrentTarget && config.visual.animations,
      'animate-pulse': isCurrentTarget && config.visual.animations
    },
    zone.cssClass
  )
  
  return (
    <div
      className={baseClasses}
      style={{
        left: zone.position.x,
        top: zone.position.y,
        width: zone.position.width,
        height: zone.position.height
      }}
      onMouseEnter={() => onHover(zone)}
      onMouseLeave={() => onHover(null)}
      onClick={() => zone.isValid && onDrop(zone)}
    >
      {/* Contenido del indicador */}
      <div className="flex items-center justify-center h-full">
        {zone.isValid ? (
          <div className="text-center">
            <div className="text-green-600 text-sm font-medium">
              ✓ Zona válida
            </div>
            <div className="text-xs text-green-500 mt-1">
              {zone.slot.toUpperCase()}
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-red-600 text-sm font-medium">
              ✗ No válida
            </div>
            <div className="text-xs text-red-500 mt-1">
              {zone.slot.toUpperCase()}
            </div>
          </div>
        )}
      </div>
      
      {/* Efecto de brillo en hover */}
      {isCurrentTarget && zone.isValid && (
        <div className="absolute inset-0 border-2 border-green-300 rounded animate-ping" />
      )}
    </div>
  )
}

/**
 * Información del item siendo arrastrado
 */
function DragInfo({ draggedItem }: { draggedItem: DraggedCouple }) {
  return (
    <div className="drag-info absolute top-4 left-4 z-40">
      <div className="bg-white border border-slate-200 rounded-surface shadow-lg p-4 max-w-sm">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-blue-600 text-sm font-medium">
                {draggedItem.couple.seed?.seed || '?'}
              </span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900 truncate">
              Arrastrando pareja
            </div>
            <div className="text-xs text-slate-500">
              Desde {draggedItem.sourceMatch.round} - {draggedItem.sourceSlot.toUpperCase()}
            </div>
          </div>
        </div>
        
        <div className="mt-3 space-y-1">
          <div className="text-xs text-slate-600">
            {draggedItem.couple.player1_details?.first_name} {draggedItem.couple.player1_details?.last_name}
          </div>
          <div className="text-xs text-slate-600">
            {draggedItem.couple.player2_details?.first_name} {draggedItem.couple.player2_details?.last_name}
          </div>
        </div>
        
        {draggedItem.couple.seed?.zone_name && (
          <div className="mt-2">
            <span className="inline-block bg-slate-100 text-slate-700 text-xs px-2 py-1 rounded">
              {draggedItem.couple.seed.zone_name}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Instrucciones de uso durante drag
 */
function DragInstructions({ config }: { config: DragDropConfig }) {
  if (!config.visual.showDropZones) return null
  
  return (
    <div className="drag-instructions absolute bottom-4 left-1/2 transform -translate-x-1/2 z-40">
      <div className="bg-slate-900 text-white rounded-surface px-4 py-2 text-sm shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border border-green-400 border-dashed rounded-control-sm"></div>
          <span>Zonas válidas</span>
          <div className="w-3 h-3 border border-red-400 border-dashed rounded-control-sm ml-4"></div>
          <span>No válidas</span>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

/**
 * Componente principal del overlay de drag & drop
 */
export function DragDropOverlay({
  draggedItem,
  dropZones,
  currentTarget,
  config,
  onDrop,
  onZoneHover,
  mousePosition,
  className
}: DragDropOverlayProps) {
  
  // Si no hay drag activo, no renderizar nada
  if (!draggedItem || !config.enabled) {
    return null
  }
  
  const handleZoneHover = React.useCallback((zone: DropZone | null) => {
    onZoneHover(zone)
  }, [onZoneHover])
  
  const handleZoneDrop = React.useCallback((zone: DropZone) => {
    if (!zone.isValid) return
    
    const target: DropTarget = {
      match: zone.match,
      slot: zone.slot,
      isValid: zone.isValid,
      distance: 0 // Calculado en el hook principal
    }
    
    onDrop(target)
  }, [onDrop])
  
  return (
    <div
      className={cn(
        'drag-drop-overlay absolute inset-0 z-30 pointer-events-none',
        className
      )}
    >
      {/* Backdrop semi-transparente solo en el área del bracket */}
      <div className="absolute inset-0 bg-black bg-opacity-10" />
      
      {/* Zonas de drop */}
      {config.visual.showDropZones && (
        <div className="drop-zones-container relative w-full h-full pointer-events-auto">
          {dropZones.map(zone => (
            <DropZoneIndicator
              key={zone.id}
              zone={zone}
              isCurrentTarget={currentTarget?.match.id === zone.match.id && 
                              currentTarget?.slot === zone.slot}
              config={config}
              onHover={handleZoneHover}
              onDrop={handleZoneDrop}
            />
          ))}
        </div>
      )}
      
      {/* Ghost element */}
      <GhostElement
        draggedItem={draggedItem}
        mousePosition={mousePosition}
        config={config}
      />
      
      {/* Información del drag */}
      <DragInfo draggedItem={draggedItem} />
      
      {/* Instrucciones */}
      <DragInstructions config={config} />
      
      {/* Información del target actual */}
      {currentTarget && (
        <div className="current-target-info absolute top-4 right-4 z-40">
          <div className={cn(
            'bg-white border rounded-surface shadow-lg p-3',
            currentTarget.isValid 
              ? 'border-green-200' 
              : 'border-red-200'
          )}>
            <div className="text-sm font-medium">
              {currentTarget.isValid ? '✓ Target válido' : '✗ Target inválido'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {currentTarget.match.round} - {currentTarget.slot.toUpperCase()}
            </div>
            {!currentTarget.isValid && currentTarget.invalidReason && (
              <div className="text-xs text-red-600 mt-1">
                {currentTarget.invalidReason}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default DragDropOverlay