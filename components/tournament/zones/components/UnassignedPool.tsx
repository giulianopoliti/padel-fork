"use client"

/**
 * UnassignedPool Component
 * 
 * Displays the pool of couples that haven't been assigned to any zone yet.
 * Acts as both a source for dragging and a drop target for returning couples.
 */

import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Users } from 'lucide-react'
import type { AvailableCouple } from '../types/zone-types'
import type { DragItem } from '../types/drag-types'
import { useDragDropOperations } from '../hooks/use-drag-drop'
import { CoupleRow } from './CoupleRow'

interface UnassignedPoolProps {
  availableCouples: AvailableCouple[]
  isEditMode: boolean
  onDragStart?: (item: DragItem) => void
  onDragEnd?: () => void
  onDrop?: () => void
  isVisible?: boolean // Allow hiding in view mode
  isMobile?: boolean
  selectedCoupleForMove?: { coupleId: string; coupleName: string; sourceZoneId: string | null } | null
  onCoupleSelect?: (selection: { coupleId: string; coupleName: string; sourceZoneId: string | null } | null) => void
}

export function UnassignedPool({
  availableCouples,
  isEditMode,
  onDragStart,
  onDragEnd,
  onDrop,
  isVisible = true,
  isMobile = false,
  selectedCoupleForMove = null,
  onCoupleSelect
}: UnassignedPoolProps) {
  const {
    isDragging,
    draggedItem,
    createDropTarget,
    getDragOverFeedback,
    setDragOver
  } = useDragDropOperations()
  
  // Get drag over feedback for the pool
  const { isOver, canDrop } = getDragOverFeedback('available-pool')
  
  // Only show if there are couples or we're in edit mode
  const shouldRender = isVisible && (availableCouples.length > 0 || isEditMode)
  
  if (!shouldRender) return null
  
  // Handle drag over
  const handleDragOver = (e: React.DragEvent) => {
    if (!isEditMode || !isDragging) return
    
    // Only allow zone couples to be returned to pool
    if (draggedItem?.type !== 'zone-couple') return
    
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    
    const dropTarget = createDropTarget('available-pool', 'available-pool', 'Pool de Disponibles')
    setDragOver(dropTarget)
  }
  
  // Handle drag leave
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(null)
    }
  }
  
  // Handle drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()

    if (!isEditMode || draggedItem?.type !== 'zone-couple') return

    setDragOver(null)

    if (onDrop) {
      onDrop()
    }
  }

  // Dynamic card classes
  const cardClasses = [
    'border-gray-200 shadow-sm transition-all duration-200',
    isOver && canDrop ? 'border-green-400 bg-green-50 shadow-lg' : '',
    isDragging && isEditMode && draggedItem?.type === 'zone-couple' ? 'hover:shadow-lg border-dashed' : ''
  ].filter(Boolean).join(' ')
  
  // Convert available couples to serializable couples for CoupleRow
  const serializableCouples = availableCouples.map(couple => ({
    id: couple.id,
    player1Name: couple.player1Name,
    player2Name: couple.player2Name,
    stats: {
      played: 0,
      won: 0,
      lost: 0,
      scored: 0,
      conceded: 0,
      points: 0
    },
    metadata: couple.metadata
  }))
  
  return (
    <Card
      className={cardClasses}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role={isEditMode ? 'region' : undefined}
      aria-label={isEditMode ? 'Pool de parejas disponibles' : undefined}
    >
      <CardHeader className="bg-slate-50 border-b border-slate-200">
        <CardTitle className="flex justify-between items-center text-lg font-semibold">
          <span className="flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-600" />
            Pool de Parejas Sin Asignar
            {isOver && (
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            )}
          </span>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-white">
              {availableCouples.length}
            </Badge>
            
            {isEditMode && (
              <Badge variant="secondary" className="text-xs">
                Fuente
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-full">Pareja</TableHead>
            </TableRow>
          </TableHeader>
          
          <TableBody>
            {serializableCouples.length > 0 ? (
              serializableCouples.map((couple) => (
                <CoupleRow
                  key={couple.id}
                  couple={couple}
                  isEditMode={isEditMode}
                  isInZone={false}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  isMobile={isMobile}
                  selectedCoupleForMove={selectedCoupleForMove}
                  onCoupleSelect={onCoupleSelect}
                />
              ))
            ) : (
              <TableRow>
                <TableCell className="text-center py-8 text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                      <Users className="h-6 w-6 text-slate-400" />
                    </div>
                    <div>
                      {isEditMode 
                        ? 'Todas las parejas están asignadas' 
                        : 'No hay parejas sin asignar'
                      }
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        
        {/* Drop Zone Indicator */}
        {isOver && isEditMode && draggedItem?.type === 'zone-couple' && (
          <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-green-400 bg-green-50/50 rounded-surface">
            <div className="flex items-center justify-center h-full">
              <div className="px-4 py-2 rounded-surface font-medium bg-green-100 text-green-800 border border-green-200">
                Devolver al pool de disponibles
              </div>
            </div>
          </div>
        )}
        
        {/* Help Text for Edit Mode */}
        {isEditMode && availableCouples.length > 0 && (
          <div className="p-3 bg-blue-50 border-t border-blue-100">
            <p className="text-sm text-blue-700 text-center">
              💡 Arrastra parejas desde aquí hacia las zonas, o devuelve parejas desde las zonas
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}