"use client"

/**
 * TournamentZonesMatrix - NEW ARCHITECTURE
 * 
 * Complete rebuild with best practices:
 * - Clean data serialization
 * - Explicit edit mode
 * - Rich animations
 * - Toast notifications
 * - Proper error handling
 * - Batch operations with optimistic updates
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from './utils/toast-alternative'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Loader2, BarChart3, Shuffle, X } from 'lucide-react'

// Import our new architecture
import { DragDropProvider } from './context/drag-drop-context'
import { useTournamentZonesData } from './hooks/use-tournament-zones-data'
import { useTournamentMatches } from './hooks/use-tournament-matches'
import { useDragDropOperations } from './hooks/use-drag-drop'
import { useZoneMutations } from './hooks/use-zone-mutations'
import { useCoupleRestrictions } from '@/hooks/use-couple-restrictions'
import { useZonePositionsEnhanced } from './hooks/use-zone-positions-enhanced'
import { useDragAutoScroll } from './hooks/use-drag-auto-scroll'

// Import components
import { ZoneActions } from './components/ZoneActions'
import { ZoneCard } from './components/ZoneCard'
import { UnassignedPool } from './components/UnassignedPool'
import { ZoneManagement } from './components/ZoneManagement'
import { TrashDropZone } from './components/TrashDropZone'
import ZoneMatchDialog from './components/ZoneMatchDialog'
import { MoveCoupleMobileSheet } from './components/MoveCoupleMobileSheet'
import { MoveCoupleSidebar } from './components/MoveCoupleSidebar'

// Import types
import type { DragItem, DragOperation } from './types/drag-types'

interface TournamentZonesMatrixProps {
  tournamentId: string
  isOwner?: boolean
  tournamentStatus?: string
}

/**
 * Internal component that uses the drag drop context
 */
function TournamentZonesMatrixInternal({
  tournamentId,
  isOwner = false,
  tournamentStatus
}: TournamentZonesMatrixProps) {
  // Local state
  const [isEditMode, setIsEditMode] = useState(false)

  // Single dialog state for match management (consolidated)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedCell, setSelectedCell] = useState<{
    couple1: any
    couple2: any
    existingMatch: any | null
    zoneId: string
    zoneName: string
  } | null>(null)

  // Mobile tap-to-move state
  const [selectedCoupleForMove, setSelectedCoupleForMove] = useState<{
    coupleId: string
    coupleName: string
    sourceZoneId: string | null
  } | null>(null)

  // Detect if mobile device
  const isMobile = typeof window !== 'undefined'
    ? /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    : false

  // Container ref for auto-scroll (targeting the main content container)
  const mainContainerRef = useRef<HTMLDivElement | null>(null)
  
  // Data fetching
  const { 
    zones, 
    availableCouples, 
    isLoading: dataLoading, 
    error: dataError,
    refresh: refreshData,
    optimisticUpdate
  } = useTournamentZonesData(tournamentId)
  
  // Tournament matches data
  const {
    matches,
    isLoading: matchesLoading,
    error: matchesError,
    refresh: refreshMatches
  } = useTournamentMatches(tournamentId)

  // Couple restrictions (for matches)
  const { 
    restrictedCouples,
    isLoading: restrictionsLoading,
    error: restrictionsError,
    refresh: refreshRestrictions
  } = useCoupleRestrictions(tournamentId)

  // Zone positions for real-time position display
  const { 
    zones: zonesWithPositions,
    isLoading: positionsLoading,
    error: positionsError,
    refresh: refreshPositions
  } = useZonePositionsEnhanced(tournamentId)
  
  // Drag and drop operations
  const {
    isDragging,
    draggedItem,
    pendingOperations,
    startDrag,
    endDrag,
    setDragOver,
    handleDrop,
    clearPendingOperations,
    createDropTarget,
    validateDrop,
    createOperation,
    addPendingOperation
  } = useDragDropOperations({
    allowSwapping: true,
    allowDeletion: true,
    restrictedCouples,
    tournamentId,
    formatId: 'AMERICAN_2' // TODO: Get from tournament data
  })
  
  // Server mutations
  const {
    isLoading: mutationLoading,
    error: mutationError,
    executeBatchOperations,
    createOptimisticUpdate,
    addZone,
    deleteZone
  } = useZoneMutations(
    tournamentId,
    () => {
      // Success callback
      refreshData()
      clearPendingOperations()
      toast.success('Cambios guardados exitosamente')
    },
    (error) => {
      // Error callback
      toast.error(`Error: ${error}`)
      refreshData() // Refresh to get clean state
    }
  )
  
  // Auto-scroll during drag operations
  // Find the main content container for scrolling
  useEffect(() => {
    // Find the main content container (the one with overflow-y-auto)
    const findMainContainer = () => {
      // Try specific selector first, then fallback to more general
      let container = document.querySelector('.flex-1.bg-white.lg\\:rounded-tl-elevated.shadow-sm.lg\\:ml-2.h-full.overflow-y-auto.overflow-x-hidden') as HTMLDivElement
      
      // Fallback: find any element with overflow-y-auto that contains our component
      if (!container) {
        container = document.querySelector('[class*="overflow-y-auto"][class*="flex-1"]') as HTMLDivElement
      }
      
      // Debug logging
      if (process.env.NODE_ENV === 'development') {
        console.log('[Auto-scroll] Container found:', !!container, container?.className)
      }
      
      if (container) {
        mainContainerRef.current = container
      }
    }
    
    findMainContainer()
    
    // Re-check when component mounts or drag starts
    if (isDragging && !mainContainerRef.current) {
      findMainContainer()
    }
  }, [isDragging])
  
  useDragAutoScroll(mainContainerRef, isDragging, {
    edgeThreshold: 150,  // Increased from 100 - activates scroll earlier
    scrollSpeed: 18,     // Increased from 12 - faster scrolling
    acceleration: 1.8    // Same - good balance
  })
  
  // Merge zones with positions data
  const enhancedZones = React.useMemo(() => {
    if (!zonesWithPositions || zonesWithPositions.length === 0) {
      return zones // Fallback to basic zones
    }
    
    return zones.map(zone => {
      const positionsZone = zonesWithPositions.find(pz => pz.id === zone.id)
      if (!positionsZone) return zone
      
      // Merge couples with their positions
      const enhancedCouples = zone.couples.map(couple => {
        const positionedCouple = positionsZone.couples.find(pc => pc.id === couple.id)
        return {
          ...couple,
          position: positionedCouple?.position || undefined
        }
      })
      
      return {
        ...zone,
        couples: enhancedCouples
      }
    })
  }, [zones, zonesWithPositions])

  // Computed state
  const isLoading = dataLoading || mutationLoading || restrictionsLoading || matchesLoading || positionsLoading
  const hasUnsavedChanges = pendingOperations.length > 0
  const hasError = dataError || mutationError || restrictionsError || matchesError || positionsError
  
  // Zone counts for validation (use enhanced zones)
  const zoneCounts = enhancedZones.reduce((acc, zone) => {
    acc[zone.id] = zone.couples.length
    return acc
  }, {} as Record<string, number>)
  
  // Handlers
  const handleEnterEditMode = useCallback(() => {
    setIsEditMode(true)
    toast.info('Modo edición activado - Arrastra parejas para reorganizar')
  }, [])
  
  const handleExitEditMode = useCallback(() => {
    if (hasUnsavedChanges) {
      toast.warning('Guarda o cancela los cambios primero')
      return
    }
    setIsEditMode(false)
    toast.info('Modo edición desactivado')
  }, [hasUnsavedChanges])
  
  const handleSave = useCallback(async () => {
    if (pendingOperations.length === 0) {
      toast.warning('No hay cambios para guardar')
      return
    }
    
    // Don't apply optimistic update here - it was already applied during drag
    // Just execute batch operations to persist to server
    const result = await executeBatchOperations(pendingOperations)
    
    if (result.success) {
      clearPendingOperations()
    }
  }, [pendingOperations, executeBatchOperations, clearPendingOperations])
  
  const handleCancel = useCallback(() => {
    if (pendingOperations.length === 0) {
      setIsEditMode(false)
      return
    }
    
    // Confirm cancellation
    if (window.confirm(`¿Cancelar ${pendingOperations.length} cambio${pendingOperations.length !== 1 ? 's' : ''} pendiente${pendingOperations.length !== 1 ? 's' : ''}?`)) {
      clearPendingOperations()
      refreshData() // Refresh to clean state
      setIsEditMode(false)
      toast.info('Cambios cancelados')
    }
  }, [pendingOperations, clearPendingOperations, refreshData])
  
  const handleRefresh = useCallback(async () => {
    if (hasUnsavedChanges) {
      toast.warning('Guarda o cancela los cambios antes de recargar')
      return
    }
    
    await refreshData()
    refreshRestrictions()
    refreshMatches()
    refreshPositions()
    toast.success('Datos actualizados')
  }, [hasUnsavedChanges, refreshData, refreshRestrictions, refreshMatches, refreshPositions])

  const handleDisqualificationRefresh = useCallback(async () => {
    await refreshData()
    refreshRestrictions()
    refreshMatches()
    refreshPositions()
  }, [refreshData, refreshRestrictions, refreshMatches, refreshPositions])
  
  const handleDragStart = useCallback((item: DragItem) => {
    startDrag(item)
  }, [startDrag])
  
  const handleDragEnd = useCallback(() => {
    endDrag()
  }, [endDrag])
  
  const handleZoneDrop = useCallback((zoneId: string) => {
    const dropTarget = createDropTarget('zone', zoneId, enhancedZones.find(z => z.id === zoneId)?.name || '')
    const result = handleDrop(dropTarget, zoneCounts, (operation: DragOperation) => {
      // Apply optimistic update immediately for visual feedback
      const optimisticData = createOptimisticUpdate(operation, enhancedZones, availableCouples)
      optimisticUpdate(() => optimisticData)
      
      // Operation will be added to pending operations automatically
      toast.success(`Pareja movida a ${dropTarget.name}`)
    })
    
    if (!result.success && result.message) {
      toast.error(result.message)
    }
  }, [createDropTarget, enhancedZones, handleDrop, zoneCounts, availableCouples, createOptimisticUpdate, optimisticUpdate])
  
  const handlePoolDrop = useCallback(() => {
    const dropTarget = createDropTarget('available-pool', 'available-pool', 'Pool de Disponibles')
    const result = handleDrop(dropTarget, zoneCounts, (operation: DragOperation) => {
      // Apply optimistic update immediately for visual feedback
      const optimisticData = createOptimisticUpdate(operation, enhancedZones, availableCouples)
      optimisticUpdate(() => optimisticData)
      
      toast.success('Pareja devuelta al pool de disponibles')
    })
    
    if (!result.success && result.message) {
      toast.error(result.message)
    }
  }, [createDropTarget, handleDrop, zoneCounts, enhancedZones, availableCouples, createOptimisticUpdate, optimisticUpdate])
  
  // Handle trash drop with confirmation
  const handleTrashDrop = useCallback(() => {
    if (!draggedItem) {
      toast.error('No hay elemento siendo arrastrado')
      return
    }

    const coupleName = draggedItem.coupleName || 'esta pareja'
    const dropTarget = createDropTarget('trash', 'trash', 'Eliminación')
    const result = handleDrop(dropTarget, zoneCounts, (operation: DragOperation) => {
      // Apply optimistic update immediately for visual feedback
      const optimisticData = createOptimisticUpdate(operation, enhancedZones, availableCouples)
      optimisticUpdate(() => optimisticData)
      
      toast.success(`Pareja "${coupleName}" marcada para eliminación del torneo`)
    })
    
    if (!result.success && result.message) {
      toast.error(result.message)
    }
  }, [draggedItem, createDropTarget, handleDrop, zoneCounts, enhancedZones, availableCouples, createOptimisticUpdate, optimisticUpdate])
  
  // Zone management handlers
  const handleAddZone = useCallback(async (name: string, capacity: number) => {
    await addZone(name, capacity)
    // Data will be refreshed by the success callback
  }, [addZone])

  const handleDeleteZone = useCallback(async (zoneId: string, zoneName: string) => {
    await deleteZone(zoneId, zoneName)
    // Data will be refreshed by the success callback
  }, [deleteZone])

  // Match management handlers
  const handleCellClick = useCallback((
    couple1: any,
    couple2: any,
    match: any | null,
    zoneId: string,
    zoneName: string
  ) => {
    // ✅ CORRECCIÓN: Si hay un match existente, SIEMPRE usar el orden de la DB
    // para evitar confusión en la visualización
    if (match && match.couple1_id && match.couple2_id) {
      // Determinar qué pareja es couple1 y couple2 según la DB
      let dbCouple1, dbCouple2

      if (couple1.id === match.couple1_id) {
        // El orden del click coincide con la DB
        dbCouple1 = couple1
        dbCouple2 = couple2
      } else {
        // El orden del click NO coincide - intercambiar para mostrar en orden de DB
        dbCouple1 = couple2
        dbCouple2 = couple1
      }

      setSelectedCell({ couple1: dbCouple1, couple2: dbCouple2, existingMatch: match, zoneId, zoneName })
    } else {
      // No hay match existente - usar el orden del click (para crear nuevo match)
      setSelectedCell({ couple1, couple2, existingMatch: match, zoneId, zoneName })
    }

    setDialogOpen(true)
  }, [])

  const handleMatchChanged = useCallback(() => {
    refreshData()
    refreshMatches()
    refreshPositions()
  }, [refreshData, refreshMatches, refreshPositions])

  // Mobile Bottom Sheet: Move couple to zone
  const handleMoveToZoneFromSheet = useCallback((targetZoneId: string) => {
    if (!selectedCoupleForMove) return

    // Create drag item from selected couple
    const dragItem: DragItem = selectedCoupleForMove.sourceZoneId
      ? {
          type: 'zone-couple',
          coupleId: selectedCoupleForMove.coupleId,
          coupleName: selectedCoupleForMove.coupleName,
          sourceZoneId: selectedCoupleForMove.sourceZoneId
        }
      : {
          type: 'available-couple',
          coupleId: selectedCoupleForMove.coupleId,
          coupleName: selectedCoupleForMove.coupleName
        }

    // Create drop target
    const targetZone = enhancedZones.find(z => z.id === targetZoneId)
    const dropTarget = createDropTarget('zone', targetZoneId, targetZone?.name || '')

    // Validate manually (no drag state needed)
    const validation = validateDrop(dragItem, dropTarget, zoneCounts)
    if (!validation.valid) {
      toast.error(validation.reason || 'No se puede mover la pareja a esta zona')
      setSelectedCoupleForMove(null)
      return
    }

    // Create operation manually
    const operation = createOperation(dragItem, dropTarget)
    if (!operation) {
      toast.error('Operación inválida')
      setSelectedCoupleForMove(null)
      return
    }

    // Apply optimistic update
    const optimisticData = createOptimisticUpdate(operation, enhancedZones, availableCouples)
    optimisticUpdate(() => optimisticData)

    // Add to pending operations
    addPendingOperation(operation)

    // Success feedback
    toast.success(`Pareja movida a ${targetZone?.name || 'zona'}`)

    // Clear selection
    setSelectedCoupleForMove(null)
  }, [selectedCoupleForMove, enhancedZones, availableCouples, zoneCounts, createDropTarget, validateDrop, createOperation, addPendingOperation, createOptimisticUpdate, optimisticUpdate])

  // Mobile Bottom Sheet: Move couple to pool
  const handleMoveToPoolFromSheet = useCallback(() => {
    if (!selectedCoupleForMove || !selectedCoupleForMove.sourceZoneId) return

    // Create drag item from selected couple (must be from zone)
    const dragItem: DragItem = {
      type: 'zone-couple',
      coupleId: selectedCoupleForMove.coupleId,
      coupleName: selectedCoupleForMove.coupleName,
      sourceZoneId: selectedCoupleForMove.sourceZoneId
    }

    // Create drop target for pool
    const dropTarget = createDropTarget('available-pool', 'available-pool', 'Pool de Disponibles')

    // Validate manually (no drag state needed)
    const validation = validateDrop(dragItem, dropTarget, zoneCounts)
    if (!validation.valid) {
      toast.error(validation.reason || 'No se puede devolver la pareja al pool')
      setSelectedCoupleForMove(null)
      return
    }

    // Create operation manually
    const operation = createOperation(dragItem, dropTarget)
    if (!operation) {
      toast.error('Operación inválida')
      setSelectedCoupleForMove(null)
      return
    }

    // Apply optimistic update
    const optimisticData = createOptimisticUpdate(operation, enhancedZones, availableCouples)
    optimisticUpdate(() => optimisticData)

    // Add to pending operations
    addPendingOperation(operation)

    // Success feedback
    toast.success('Pareja devuelta al pool de disponibles')

    // Clear selection
    setSelectedCoupleForMove(null)
  }, [selectedCoupleForMove, enhancedZones, availableCouples, zoneCounts, createDropTarget, validateDrop, createOperation, addPendingOperation, createOptimisticUpdate, optimisticUpdate])

  // Desktop/Mobile: Delete couple from tournament
  const handleDeleteFromSheet = useCallback(async () => {
    if (!selectedCoupleForMove) return

    // Create drag item from selected couple
    const dragItem: DragItem = selectedCoupleForMove.sourceZoneId
      ? {
          type: 'zone-couple',
          coupleId: selectedCoupleForMove.coupleId,
          coupleName: selectedCoupleForMove.coupleName,
          sourceZoneId: selectedCoupleForMove.sourceZoneId
        }
      : {
          type: 'available-couple',
          coupleId: selectedCoupleForMove.coupleId,
          coupleName: selectedCoupleForMove.coupleName
        }

    // Create drop target for trash
    const dropTarget = createDropTarget('trash', 'trash', 'Eliminación')

    // Validate manually (no drag state needed)
    const validation = validateDrop(dragItem, dropTarget, zoneCounts)
    if (!validation.valid) {
      toast.error(validation.reason || 'No se puede eliminar esta pareja')
      setSelectedCoupleForMove(null)
      return
    }

    // Create operation manually
    const operation = createOperation(dragItem, dropTarget)
    if (!operation) {
      toast.error('Operación inválida')
      setSelectedCoupleForMove(null)
      return
    }

    // Apply optimistic update
    const optimisticData = createOptimisticUpdate(operation, enhancedZones, availableCouples)
    optimisticUpdate(() => optimisticData)

    // Add to pending operations
    addPendingOperation(operation)

    // Execute immediately (delete operations should not wait for batch save)
    const result = await executeBatchOperations([operation])

    if (result.success) {
      toast.success(`Pareja "${selectedCoupleForMove.coupleName}" eliminada del torneo`)
      refreshData()
      refreshRestrictions()
      refreshMatches()
      refreshPositions()
    } else {
      // Revert optimistic update on error
      toast.error('Error al eliminar la pareja')
      refreshData()
    }

    // Clear selection
    setSelectedCoupleForMove(null)
  }, [selectedCoupleForMove, enhancedZones, availableCouples, zoneCounts, createDropTarget, validateDrop, createOperation, addPendingOperation, createOptimisticUpdate, optimisticUpdate, executeBatchOperations, refreshData, refreshRestrictions, refreshMatches, refreshPositions])

  // Auto-save effect (optional - you can disable this for explicit save only)
  useEffect(() => {
    if (!isEditMode || pendingOperations.length === 0) return
    
    // Auto-save after 30 seconds of inactivity
    const autoSaveTimer = setTimeout(() => {
      if (pendingOperations.length > 0) {
        toast.info('Guardado automático...')
        handleSave()
      }
    }, 30000)
    
    return () => clearTimeout(autoSaveTimer)
  }, [pendingOperations, isEditMode, handleSave])
  
  // Render loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
        <span className="ml-3 text-slate-500">
          {restrictionsLoading ? 'Verificando restricciones...' : 'Cargando zonas...'}
        </span>
      </div>
    )
  }
  
  // Render error state
  if (hasError) {
    return (
      <Alert variant="destructive" className="mb-6">
        <AlertDescription>
          {dataError || mutationError || restrictionsError || matchesError}
        </AlertDescription>
      </Alert>
    )
  }

  // Main render
  return (
    <div className="space-y-6 relative">
      {/* Zone Actions Controls */}
      <ZoneActions
        isEditMode={isEditMode}
        isLoading={isLoading}
        hasUnsavedChanges={hasUnsavedChanges}
        pendingOperations={pendingOperations}
        onEnterEditMode={handleEnterEditMode}
        onExitEditMode={handleExitEditMode}
        onSave={handleSave}
        onCancel={handleCancel}
        onRefresh={handleRefresh}
        isOwner={isOwner}
      />

      {/* Zone Management - Add/Delete Zones */}
      {isOwner && (
        <ZoneManagement
          zones={enhancedZones}
          isEditMode={isEditMode}
          isLoading={isLoading}
          onAddZone={handleAddZone}
          onDeleteZone={handleDeleteZone}
        />
      )}

      {/* Zones Grid or Empty State */}
      {enhancedZones.length > 0 ? (
        <div className="space-y-6">
          {enhancedZones.map((zone) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              isEditMode={isEditMode}
              matches={matches}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDrop={handleZoneDrop}
              onDeleteZone={handleDeleteZone}
              onCellClick={handleCellClick}
              zoneCounts={zoneCounts}
              tournamentId={tournamentId}
              formatId={'AMERICAN_2'} // TODO: Get from tournament data
              isOwner={isOwner}
              isMobile={isMobile}
              selectedCoupleForMove={selectedCoupleForMove}
              onCoupleSelect={setSelectedCoupleForMove}
              onDisqualificationChange={handleDisqualificationRefresh}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-slate-50 rounded-surface border-2 border-dashed border-slate-200">
          <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">No hay zonas creadas</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            {isEditMode
              ? 'Usa el botón "Agregar Zona" arriba para crear tu primera zona.'
              : tournamentStatus === 'NOT_STARTED'
                ? 'Inicia el torneo y activa el modo edición para crear zonas.'
                : 'Activa el modo edición para comenzar a crear zonas.'}
          </p>
        </div>
      )}

      {/* Unassigned Pool */}
      <UnassignedPool
        availableCouples={availableCouples}
        isEditMode={isEditMode}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDrop={handlePoolDrop}
        isVisible={isOwner}
        isMobile={isMobile}
        selectedCoupleForMove={selectedCoupleForMove}
        onCoupleSelect={setSelectedCoupleForMove}
      />

      {/* Trash Drop Zone */}
      <TrashDropZone
        onDrop={handleTrashDrop}
        onDragEnter={setDragOver}
        onDragLeave={() => setDragOver(null)}
        isEditMode={isEditMode}
        isVisible={isOwner}
      />
      
      {/* Global Loading Overlay */}
      {mutationLoading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-surface p-6 shadow-xl flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="font-medium">Guardando cambios...</span>
          </div>
        </div>
      )}

      {/* Consolidated Match Management Dialog */}
      {selectedCell && (
        <ZoneMatchDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          couple1={{
            id: selectedCell.couple1.id,
            player1_name: selectedCell.couple1.player1Name,
            player2_name: selectedCell.couple1.player2Name
          }}
          couple2={{
            id: selectedCell.couple2.id,
            player1_name: selectedCell.couple2.player1Name,
            player2_name: selectedCell.couple2.player2Name
          }}
          existingMatch={selectedCell.existingMatch}
          tournamentId={tournamentId}
          zoneId={selectedCell.zoneId}
          zoneName={selectedCell.zoneName}
          onMatchChanged={handleMatchChanged}
        />
      )}

      {/* Mobile: Bottom Sheet for couple movement */}
      {isMobile && selectedCoupleForMove && (
        <MoveCoupleMobileSheet
          open={!!selectedCoupleForMove}
          onOpenChange={(open) => {
            if (!open) setSelectedCoupleForMove(null)
          }}
          selectedCouple={{
            id: selectedCoupleForMove.coupleId,
            name: selectedCoupleForMove.coupleName,
            sourceZoneId: selectedCoupleForMove.sourceZoneId
          }}
          zones={enhancedZones.map(zone => ({
            id: zone.id,
            name: zone.name,
            currentSize: zone.couples.length,
            capacity: zone.maxCouples || zone.capacity,
            canReceive: zone.couples.length < (zone.maxCouples || zone.capacity)
          }))}
          onMoveToZone={handleMoveToZoneFromSheet}
          onMoveToPool={handleMoveToPoolFromSheet}
          onDelete={handleDeleteFromSheet}
          showPoolOption={!!selectedCoupleForMove.sourceZoneId}
          showDeleteOption={true}
        />
      )}

      {/* Desktop: Sidebar for couple movement */}
      {!isMobile && selectedCoupleForMove && (
        <MoveCoupleSidebar
          open={!!selectedCoupleForMove}
          onOpenChange={(open) => {
            if (!open) setSelectedCoupleForMove(null)
          }}
          selectedCouple={{
            id: selectedCoupleForMove.coupleId,
            name: selectedCoupleForMove.coupleName,
            sourceZoneId: selectedCoupleForMove.sourceZoneId
          }}
          zones={enhancedZones.map(zone => ({
            id: zone.id,
            name: zone.name,
            currentSize: zone.couples.length,
            capacity: zone.maxCouples || zone.capacity,
            canReceive: zone.couples.length < (zone.maxCouples || zone.capacity)
          }))}
          onMoveToZone={handleMoveToZoneFromSheet}
          onMoveToPool={handleMoveToPoolFromSheet}
          onDelete={handleDeleteFromSheet}
          showPoolOption={!!selectedCoupleForMove.sourceZoneId}
          showDeleteOption={true}
        />
      )}
    </div>
  )
}

/**
 * Main exported component with DragDropProvider
 */
export default function TournamentZonesMatrix(props: TournamentZonesMatrixProps) {
  return (
    <DragDropProvider>
      <TournamentZonesMatrixInternal {...props} />
    </DragDropProvider>
  )
}
