/**
 * Zone Mutations Hook
 * 
 * Handles all server-side mutations for tournament zones with optimistic updates,
 * proper error handling, and toast notifications.
 */

import { useCallback, useState } from 'react'
import { toast } from '../utils/toast-alternative'
import type { 
  MutationResult,
  CleanZone,
  AvailableCouple 
} from '../types/zone-types'
import type { DragOperation } from '../types/drag-types'

// Mutation state
interface MutationState {
  isLoading: boolean
  error: string | null
}

// Batch operation result
interface BatchResult {
  success: boolean
  successCount: number
  failureCount: number
  errors: string[]
}

interface AddZoneResult extends MutationResult {
  zone: Omit<CleanZone, 'maxCouples'> & { maxCouples?: number }
}

/**
 * Hook for zone mutations. Callbacks run once per batch; callers merge
 * structural zone changes without replacing pending couple assignments.
 */
export function useZoneMutations(
  tournamentId: string,
  onSuccess?: () => void,
  onError?: (error: string) => void
) {
  const [mutationState, setMutationState] = useState<MutationState>({
    isLoading: false,
    error: null
  })
  
  // Generic mutation wrapper with error handling
  const executeMutation = useCallback(async <T>(
    mutationFn: () => Promise<T>,
    successMessage?: string,
    errorMessage?: string
  ): Promise<T | null> => {
    setMutationState({ isLoading: true, error: null })
    
    try {
      const result = await mutationFn()
      
      setMutationState({ isLoading: false, error: null })
      
      if (successMessage) {
        toast.success(successMessage)
      }
      
      return result
    } catch (error: any) {
      const errorMsg = error.message || errorMessage || 'Error en la operación'
      
      setMutationState({ isLoading: false, error: errorMsg })
      
      toast.error(errorMsg)
      
      return null
    }
  }, [])
  
  // Move couple to zone
  const moveCoupleToZone = useCallback(async (
    coupleId: string,
    targetZoneId: string,
    fromZoneId?: string,
    capacity: number = 4
  ): Promise<MutationResult | null> => {
    return executeMutation(
      async () => {
        let response: Response
        
        if (fromZoneId) {
          // Move between zones
          response = await fetch(`/api/tournaments/${tournamentId}/zones/move-couple`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              coupleId,
              fromZoneId,
              toZoneId: targetZoneId,
              capacity: capacity
            })
          })
        } else {
          // Add from available pool
          response = await fetch(`/api/tournaments/${tournamentId}/zones/add-couple`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              coupleId,
              zoneId: targetZoneId,
              capacity: capacity
            })
          })
        }
        
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`)
        }
        
        const result = await response.json()
        
        if (!result.success) {
          throw new Error(result.message || 'Error en la operación')
        }
        
        return result
      },
      'Pareja movida exitosamente',
      'Error al mover la pareja'
    )
  }, [tournamentId, executeMutation])
  
  // Move couple to available pool
  const moveCoupleToAvailable = useCallback(async (
    coupleId: string,
    fromZoneId: string
  ): Promise<MutationResult | null> => {
    return executeMutation(
      async () => {
        const response = await fetch(`/api/tournaments/${tournamentId}/zones/remove-couple`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coupleId,
            zoneId: fromZoneId
          })
        })
        
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`)
        }
        
        const result = await response.json()
        
        if (!result.success) {
          throw new Error(result.message || 'Error en la operación')
        }
        
        return result
      },
      'Pareja movida al pool de disponibles',
      'Error al mover la pareja'
    )
  }, [tournamentId, executeMutation])
  
  // Delete couple (remove from tournament)
  const deleteCouple = useCallback(async (
    coupleId: string,
    fromZoneId?: string
  ): Promise<MutationResult | null> => {
    return executeMutation(
      async () => {
        // This would require a delete endpoint
        const response = await fetch(`/api/tournaments/${tournamentId}/couples/${coupleId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromZoneId })
        })
        
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`)
        }
        
        const result = await response.json()
        
        if (!result.success) {
          throw new Error(result.message || 'Error en la operación')
        }
        
        return result
      },
      'Pareja eliminada exitosamente',
      'Error al eliminar la pareja'
    )
  }, [tournamentId, executeMutation])
  
  // Add new zone
  const addZone = useCallback(async (
    name: string,
    capacity: number = 4
  ): Promise<AddZoneResult | null> => {
    return executeMutation(
      async () => {
        const response = await fetch(`/api/tournaments/${tournamentId}/zones/add-zone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, capacity })
        })
        
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`)
        }
        
        const result = await response.json()
        
        if (!result.success) {
          throw new Error(result.message || 'Error creando la zona')
        }
        
        return result
      },
      `Zona "${name}" creada exitosamente`,
      'Error al crear la zona'
    )
  }, [tournamentId, executeMutation])
  
  // Delete zone (only if empty)
  const deleteZone = useCallback(async (
    zoneId: string,
    zoneName?: string
  ): Promise<MutationResult | null> => {
    return executeMutation(
      async () => {
        const response = await fetch(`/api/tournaments/${tournamentId}/zones/delete-zone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zoneId })
        })
        
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`)
        }
        
        const result = await response.json()
        
        if (!result.success) {
          throw new Error(result.message || 'Error eliminando la zona')
        }
        
        return result
      },
      zoneName ? `Zona "${zoneName}" eliminada exitosamente` : 'Zona eliminada exitosamente',
      'Error al eliminar la zona'
    )
  }, [tournamentId, executeMutation])
  
  // Execute single drag operation
  const executeDragOperation = useCallback(async (
    operation: DragOperation
  ): Promise<MutationResult | null> => {
    const { sourceItem } = operation
    
    switch (operation.type) {
      case 'move-to-zone':
        if (!operation.targetZoneId) {
          throw new Error('Target zone ID required')
        }
        
        const fromZoneId = sourceItem.type === 'zone-couple' 
          ? sourceItem.sourceZoneId 
          : undefined
          
        return moveCoupleToZone(sourceItem.coupleId, operation.targetZoneId, fromZoneId, 4)
        
      case 'move-to-available':
        if (sourceItem.type !== 'zone-couple') {
          throw new Error('Can only move zone couples to available pool')
        }
        
        return moveCoupleToAvailable(sourceItem.coupleId, sourceItem.sourceZoneId)
        
      case 'delete':
        const sourceZoneId = sourceItem.type === 'zone-couple' 
          ? sourceItem.sourceZoneId 
          : undefined
          
        return deleteCouple(sourceItem.coupleId, sourceZoneId)
        
      default:
        throw new Error('Unknown operation type')
    }
  }, [moveCoupleToZone, moveCoupleToAvailable, deleteCouple])
  
  // Execute batch operations
  const executeBatchOperations = useCallback(async (
    operations: DragOperation[]
  ): Promise<BatchResult> => {
    if (operations.length === 0) {
      return {
        success: true,
        successCount: 0,
        failureCount: 0,
        errors: []
      }
    }
    
    setMutationState({ isLoading: true, error: null })
    
    let successCount = 0
    let failureCount = 0
    const errors: string[] = []
    
    // Show progress toast
    toast.loading(`Procesando ${operations.length} operaciones...`)
    
    try {
      // Execute operations sequentially to avoid conflicts
      for (const operation of operations) {
        try {
          const result = await executeDragOperation(operation)
          if (!result?.success) {
            throw new Error(result?.message || result?.error || 'No se pudo guardar el cambio')
          }
          successCount++
        } catch (error: any) {
          failureCount++
          errors.push(error.message || 'Error desconocido')
        }
      }
      
      // Dismiss progress toast
      toast.dismiss()
      
      // Show result
      if (failureCount === 0) {
        toast.success(`${successCount} operaciones completadas exitosamente`)
        if (onSuccess) onSuccess()
      } else if (successCount === 0) {
        toast.error(`Todas las operaciones fallaron`)
        if (onError) onError('Todas las operaciones fallaron')
      } else {
        toast.warning(`${successCount} exitosas, ${failureCount} fallaron`)
      }
      
      setMutationState({ isLoading: false, error: null })
      
      return {
        success: failureCount === 0,
        successCount,
        failureCount,
        errors
      }
    } catch (error: any) {
      toast.dismiss()
      toast.error('Error crítico en operaciones batch')
      
      setMutationState({ isLoading: false, error: error.message })
      
      return {
        success: false,
        successCount: 0,
        failureCount: operations.length,
        errors: [error.message]
      }
    }
  }, [executeDragOperation, onSuccess, onError])
  
  // Optimistic update helpers
  const createOptimisticUpdate = useCallback((
    operation: DragOperation,
    currentZones: CleanZone[],
    currentAvailable: AvailableCouple[]
  ) => {
    const newZones = [...currentZones]
    let newAvailable = [...currentAvailable]
    
    const { sourceItem } = operation
    let originalCouple: any = null
    
    // Find and remove from source, preserving original data
    if (sourceItem.type === 'zone-couple') {
      const sourceZone = newZones.find(z => z.id === sourceItem.sourceZoneId)
      if (sourceZone) {
        originalCouple = sourceZone.couples.find(c => c.id === sourceItem.coupleId)
        sourceZone.couples = sourceZone.couples.filter(c => c.id !== sourceItem.coupleId)
      }
    } else {
      originalCouple = newAvailable.find(c => c.id === sourceItem.coupleId)
      newAvailable = newAvailable.filter(c => c.id !== sourceItem.coupleId)
    }
    
    // Add to target
    if (operation.type === 'move-to-zone' && operation.targetZoneId) {
      const targetZone = newZones.find(z => z.id === operation.targetZoneId)
      if (targetZone) {
        // Create couple object for zone, preserving original names
        const couple = {
          id: sourceItem.coupleId,
          player1Name: originalCouple?.player1Name || sourceItem.coupleName.split(' / ')[0] || 'Jugador 1',
          player2Name: originalCouple?.player2Name || sourceItem.coupleName.split(' / ')[1] || 'Jugador 2',
          stats: originalCouple?.stats || {
            played: 0,
            won: 0,
            lost: 0,
            scored: 0,
            conceded: 0,
            points: 0
          },
          metadata: originalCouple?.metadata || {}
        }
        targetZone.couples.push(couple)
      }
    } else if (operation.type === 'move-to-available') {
      // Add back to available, preserving original names
      const availableCouple = {
        id: sourceItem.coupleId,
        player1Name: originalCouple?.player1Name || sourceItem.coupleName.split(' / ')[0] || 'Jugador 1',
        player2Name: originalCouple?.player2Name || sourceItem.coupleName.split(' / ')[1] || 'Jugador 2',
        metadata: originalCouple?.metadata || {}
      }
      newAvailable.push(availableCouple)
    }
    // For delete operation, we just removed from source
    
    return {
      zones: newZones,
      availableCouples: newAvailable
    }
  }, [])
  
  return {
    // State
    isLoading: mutationState.isLoading,
    error: mutationState.error,
    
    // Individual operations
    moveCoupleToZone,
    moveCoupleToAvailable,
    deleteCouple,
    executeDragOperation,
    
    // Zone management
    addZone,
    deleteZone,
    
    // Batch operations
    executeBatchOperations,
    
    // Utilities
    createOptimisticUpdate
  }
}
