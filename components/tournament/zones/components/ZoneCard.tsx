"use client"

/**
 * ZoneCard Component
 * 
 * Displays a single zone with couples in a table format.
 * Handles drop operations and visual feedback.
 */

import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { CleanZone, Match } from '../types/zone-types'
import type { DragItem } from '../types/drag-types'
import { useDragDropOperations } from '../hooks/use-drag-drop'
import { CoupleRow } from './CoupleRow'
import { ZoneDeleteButton } from './ZoneManagement'
import { ZoneCapacityDetails } from './ZoneCapacityIndicator'
import { ZoneDragFeedback } from './DragDropFeedback'

interface ZoneCardProps {
  zone: CleanZone
  isEditMode: boolean
  matches?: Match[] // Match data for results display
  onDragStart?: (item: DragItem) => void
  onDragEnd?: () => void
  onDrop?: (zoneId: string) => void
  onDeleteZone?: (zoneId: string, zoneName: string) => void
  onCellClick?: (couple1: any, couple2: any, match: Match | null, zoneId: string, zoneName: string) => void
  zoneCounts?: Record<string, number> // For validation
  tournamentId?: string // For tournament-specific validation
  formatId?: string // Tournament format
  isOwner?: boolean
  isMobile?: boolean
  selectedCoupleForMove?: { coupleId: string; coupleName: string; sourceZoneId: string | null } | null
  onCoupleSelect?: (selection: { coupleId: string; coupleName: string; sourceZoneId: string | null } | null) => void
  onDisqualificationChange?: () => Promise<void> | void
  isSingleZone?: boolean
}

export function ZoneCard({
  zone,
  isEditMode,
  matches = [],
  onDragStart,
  onDragEnd,
  onDrop,
  onDeleteZone,
  onCellClick,
  zoneCounts = {},
  tournamentId,
  formatId = 'AMERICAN_2',
  isOwner = false,
  isMobile = false,
  selectedCoupleForMove = null,
  onCoupleSelect,
  onDisqualificationChange,
  isSingleZone = false
}: ZoneCardProps) {
  const {
    isDragging,
    draggedItem,
    createDropTarget,
    getDragOverFeedback,
    setDragOver
  } = useDragDropOperations({
    tournamentId,
    formatId
  })
  
  // Get enhanced drag over feedback for this zone
  const { isOver, canDrop, feedback, level, consequences } = getDragOverFeedback(zone.id, zoneCounts)
  
  // Handle drag over
  const handleDragOver = (e: React.DragEvent) => {
    if (!isEditMode || !isDragging) return
    
    e.preventDefault()
    e.dataTransfer.dropEffect = canDrop ? 'move' : 'none'
    
    const dropTarget = createDropTarget('zone', zone.id, zone.name)
    setDragOver(dropTarget)
  }
  
  // Handle drag leave
  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're really leaving the zone (not just moving to a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(null)
    }
  }
  
  // Handle drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()

    if (!isEditMode || !canDrop) return

    setDragOver(null)

    if (onDrop) {
      onDrop(zone.id)
    }
  }

  // Dynamic card classes based on drag state
  const cardClasses = [
    'border-gray-200 shadow-sm transition-all duration-200',
    isOver && canDrop ? 'border-blue-400 bg-blue-50 shadow-lg scale-102' : '',
    isOver && !canDrop ? 'border-red-400 bg-red-50' : '',
    isDragging && isEditMode ? 'hover:shadow-lg' : ''
  ].filter(Boolean).join(' ')

  // Dynamic header classes - sticky when dragging for better UX
  const headerClasses = [
    'bg-slate-50 border-b border-slate-200',
    isDragging && isEditMode
      ? 'sticky top-0 z-20 shadow-md'
      : ''
  ].filter(Boolean).join(' ')

  // Use tournament-specific capacity validation
  // Legacy badge variant for fallback compatibility
  const getCapacityBadgeVariant = () => {
    const currentCount = zone.couples.length
    if (currentCount === zone.capacity) return 'destructive'
    if (currentCount >= zone.capacity * 0.75) return 'secondary'
    return 'outline'
  }
  
  return (
    <Card
      className={cardClasses}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role={isEditMode ? 'region' : undefined}
      aria-label={isEditMode ? `Zona de destino: ${zone.name}` : undefined}
    >
      <CardHeader className={headerClasses}>
        <CardTitle className="flex justify-between items-center text-lg font-semibold">
          <span className="flex items-center gap-2">
            {zone.name}
            {isOver && (
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            )}
          </span>
          
          <div className="flex items-center gap-2">
            {/* Enhanced capacity indicator with tournament validation */}
            {isSingleZone ? (
              <Badge variant="outline">{zone.couples.length} parejas</Badge>
            ) : (
              <ZoneCapacityDetails
                currentSize={zone.couples.length}
                zoneId={zone.id}
                zoneName={zone.name}
                formatId={formatId}
                tournamentId={tournamentId}
              />
            )}
            
            {isOver && !canDrop && (
              <Badge variant="destructive" className="text-xs">
                {feedback}
              </Badge>
            )}
            
            {/* Delete Zone Button */}
            {onDeleteZone && (
              <ZoneDeleteButton
                zone={zone}
                isEditMode={isEditMode}
                onDelete={onDeleteZone}
              />
            )}
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-6 text-center">#</TableHead>
              <TableHead className="w-48">Pareja</TableHead>
              
              {/* Match columns - show only if matches exist */}
              {zone.couples.map((_, index) => (
                <TableHead key={index} className="text-center w-12">
                  {index + 1}
                </TableHead>
              ))}
              
              {/* Statistics columns - Games Won/Lost */}
              <TableHead className="w-12 text-center text-xs">G</TableHead>
              <TableHead className="w-12 text-center text-xs">P</TableHead>
              <TableHead className="w-16 text-center">+/-</TableHead>
              {isOwner && tournamentId && (
                <TableHead className="w-24 text-right">Accion</TableHead>
              )}
            </TableRow>
          </TableHeader>
          
          <TableBody>
            {zone.couples.length > 0 ? (
              zone.couples.map((couple, index) => (
                <CoupleRow
                  key={couple.id}
                  couple={couple}
                  zoneId={zone.id}
                  isEditMode={isEditMode}
                  isInZone={true}
                  maxColumns={zone.couples.length}
                  zoneCouples={zone.couples}
                  matches={matches}
                  couplePosition={couple.position}
                  coupleIndex={index}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onCellClick={(c1, c2, match) => {
                    if (onCellClick) {
                      onCellClick(c1, c2, match, zone.id, zone.name)
                    }
                  }}
                  isOwner={isOwner}
                  tournamentId={tournamentId}
                  isMobile={isMobile}
                  selectedCoupleForMove={selectedCoupleForMove}
                  onCoupleSelect={onCoupleSelect}
                  onDisqualificationChange={onDisqualificationChange}
                />
              ))
            ) : (
              <TableRow>
                <TableCell 
                  colSpan={isOwner && tournamentId ? 7 : 6}
                  className="text-center py-8 text-slate-500"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                      <span className="text-2xl">👥</span>
                    </div>
                    <div>
                      {isEditMode 
                        ? 'Arrastra parejas aquí' 
                        : 'No hay parejas asignadas'
                      }
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        
        {/* Enhanced Drop Zone Feedback */}
        {isOver && isEditMode && (
          <ZoneDragFeedback
            isOver={isOver}
            canDrop={canDrop}
            feedback={feedback}
            level={level}
            consequences={consequences}
            zoneName={zone.name}
          />
        )}
      </CardContent>
    </Card>
  )
}
