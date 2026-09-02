"use client"

/**
 * ZoneManagement Component
 * 
 * UI for adding and deleting zones dynamically.
 * Shows add zone button and delete buttons for empty zones.
 */

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog'
import { 
  Plus, 
  Trash2, 
  Loader2, 
  AlertTriangle 
} from 'lucide-react'
import type { CleanZone } from '../types/zone-types'

interface ZoneManagementProps {
  zones: CleanZone[]
  isEditMode: boolean
  isLoading: boolean
  onAddZone: (name: string, capacity: number) => Promise<void>
  onDeleteZone: (zoneId: string, zoneName: string) => Promise<void>
}

export function ZoneManagement({
  zones,
  isEditMode,
  isLoading,
  onAddZone,
  onDeleteZone
}: ZoneManagementProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<{ zoneId: string; zoneName: string } | null>(null)
  const [operationLoading, setOperationLoading] = useState(false)
  
  // Generate next zone name automatically with collision detection for both languages
  const generateNextZoneName = () => {
    const existingNames = zones.map(z => z.name.toLowerCase()) // Normalize for comparison
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    
    for (let i = 0; i < letters.length; i++) {
      const letter = letters[i]
      const spanishName = `Zona ${letter}`
      const englishName = `Zone ${letter}`
      
      // Check if neither Spanish nor English version exists (case-insensitive)
      const spanishExists = existingNames.includes(spanishName.toLowerCase())
      const englishExists = existingNames.includes(englishName.toLowerCase())
      
      if (!spanishExists && !englishExists) {
        return spanishName // Always return Spanish version
      }
    }
    
    // Fallback to numbered zones if all letters are taken
    for (let i = 1; i <= 50; i++) {
      const spanishName = `Zona ${i}`
      const englishName = `Zone ${i}`
      
      const spanishExists = existingNames.includes(spanishName.toLowerCase())
      const englishExists = existingNames.includes(englishName.toLowerCase())
      
      if (!spanishExists && !englishExists) {
        return spanishName
      }
    }
    
    // Ultimate fallback with timestamp
    return `Nueva Zona ${Date.now().toString().slice(-4)}`
  }
  
  // Handle add zone - fully automatic
  const handleAddZone = async () => {
    const zoneName = generateNextZoneName()
    const capacity = 4 // Default capacity
    
    setOperationLoading(true)
    try {
      await onAddZone(zoneName, capacity)
    } catch (error) {
      console.error('Error adding zone:', error)
    } finally {
      setOperationLoading(false)
    }
  }
  
  // Handle delete zone
  const handleDeleteZone = async (zoneId: string, zoneName: string) => {
    setOperationLoading(true)
    try {
      await onDeleteZone(zoneId, zoneName)
      setDeleteConfirm(null)
    } catch (error) {
      console.error('Error deleting zone:', error)
    } finally {
      setOperationLoading(false)
    }
  }
  
  // Get deletable zones (empty zones)
  const deletableZones = zones.filter(zone => zone.couples.length === 0)
  
  if (!isEditMode) return null
  
  return (
    <>
      {/* Zone Management Controls */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-surface flex items-center justify-center">
                <Plus className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-blue-900">Gestión de Zonas</h3>
                <p className="text-sm text-blue-700">
                  Agregar nuevas zonas o eliminar zonas vacías
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Add Zone Button - Direct Action */}
              <Button
                onClick={handleAddZone}
                disabled={isLoading || operationLoading}
                className="flex items-center gap-2"
                size="sm"
              >
                {operationLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Agregar Zona
              </Button>
              
              {/* Delete Zone Info */}
              {deletableZones.length > 0 && (
                <span className="text-sm text-blue-600 bg-blue-100 px-2 py-1 rounded">
                  {deletableZones.length} zona{deletableZones.length !== 1 ? 's' : ''} vacía{deletableZones.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <Dialog open={true} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Eliminar Zona
              </DialogTitle>
            </DialogHeader>
            
            <div className="py-4">
              <p>
                ¿Estás seguro de que quieres eliminar la zona <strong>"{deleteConfirm.zoneName}"</strong>?
              </p>
              <p className="text-sm text-slate-500 mt-2">
                Esta acción no se puede deshacer.
              </p>
            </div>
            
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteConfirm(null)}
                disabled={operationLoading}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDeleteZone(deleteConfirm.zoneId, deleteConfirm.zoneName)}
                disabled={operationLoading}
              >
                {operationLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

// Export delete zone button for individual zones
export function ZoneDeleteButton({
  zone,
  isEditMode,
  onDelete,
  disabled = false
}: {
  zone: CleanZone
  isEditMode: boolean
  onDelete: (zoneId: string, zoneName: string) => void
  disabled?: boolean
}) {
  const isEmpty = zone.couples.length === 0
  
  if (!isEditMode || !isEmpty) return null
  
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onDelete(zone.id, zone.name)}
      disabled={disabled}
      className="text-red-600 hover:text-red-700 hover:bg-red-50"
      title={`Eliminar ${zone.name} (vacía)`}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  )
}