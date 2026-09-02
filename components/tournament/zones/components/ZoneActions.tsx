"use client"

/**
 * ZoneActions Component
 * 
 * Controls for edit mode, save, cancel, and other zone management actions.
 * Implements explicit edit mode with proper state management.
 */

import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Edit3, 
  Save, 
  X, 
  RefreshCw, 
  Loader2, 
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import type { DragOperation } from '../types/drag-types'

interface ZoneActionsProps {
  isEditMode: boolean
  isLoading: boolean
  hasUnsavedChanges: boolean
  pendingOperations: DragOperation[]
  onEnterEditMode: () => void
  onExitEditMode: () => void
  onSave: () => void
  onCancel: () => void
  onRefresh: () => void
  isOwner: boolean
}

export function ZoneActions({
  isEditMode,
  isLoading,
  hasUnsavedChanges,
  pendingOperations,
  onEnterEditMode,
  onExitEditMode,
  onSave,
  onCancel,
  onRefresh,
  isOwner
}: ZoneActionsProps) {
  
  // Don't render if not owner
  if (!isOwner) return null
  
  return (
    <div className="mb-6 space-y-3">
      {/* Main Control Bar */}
      <div className="flex justify-between items-center p-4 bg-white border rounded-surface shadow-sm">
      {/* Left Side - Mode Controls */}
      <div className="flex items-center gap-3">
        {!isEditMode ? (
          // View Mode
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              onClick={onEnterEditMode}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <Edit3 className="h-4 w-4" />
              Modo edición
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Recargar
            </Button>
          </div>
        ) : (
          // Edit Mode
          <div className="flex items-center gap-3">
            <Button 
              onClick={onSave}
              disabled={isLoading || !hasUnsavedChanges}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isLoading ? 'Guardando...' : 'Guardar cambios'}
            </Button>
            
            <Button 
              variant="outline" 
              onClick={onCancel}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onExitEditMode}
              disabled={isLoading || hasUnsavedChanges}
              className="flex items-center gap-2 text-slate-600"
            >
              Solo ver
            </Button>
          </div>
        )}
      </div>
      
      {/* Right Side - Status Indicators */}
      <div className="flex items-center gap-3">
        {/* Edit Mode Badge */}
        {isEditMode && (
          <Badge 
            variant="secondary" 
            className="bg-blue-100 text-blue-800 flex items-center gap-1"
          >
            <Edit3 className="h-3 w-3" />
            Modo Edición Activo
          </Badge>
        )}
        
        {/* Unsaved Changes Indicator */}
        {hasUnsavedChanges && (
          <Badge 
            variant="destructive" 
            className="flex items-center gap-1 animate-pulse"
          >
            <AlertCircle className="h-3 w-3" />
            {pendingOperations.length} cambio{pendingOperations.length !== 1 ? 's' : ''} pendiente{pendingOperations.length !== 1 ? 's' : ''}
          </Badge>
        )}
        
        {/* Saved State Indicator */}
        {!hasUnsavedChanges && !isLoading && isEditMode && (
          <Badge 
            variant="outline" 
            className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1"
          >
            <CheckCircle2 className="h-3 w-3" />
            Todo guardado
          </Badge>
        )}
        
        {/* Loading Indicator */}
        {isLoading && (
          <Badge 
            variant="outline" 
            className="bg-yellow-50 text-yellow-700 border-yellow-200 flex items-center gap-1"
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            Procesando...
          </Badge>
        )}
      </div>
      </div>
      
      {/* Help Text - Now in natural flow */}
      {isEditMode && !hasUnsavedChanges && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-surface">
          <p className="text-sm text-blue-700 text-center">
            💡 Arrastra parejas entre zonas para reorganizar. Los cambios se guardan automáticamente.
          </p>
        </div>
      )}
      
      {/* Unsaved Changes Warning - Now in natural flow */}
      {hasUnsavedChanges && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-surface">
          {(() => {
            const deletionOperations = pendingOperations.filter(op => op.type === 'delete')
            const otherOperations = pendingOperations.filter(op => op.type !== 'delete')
            
            if (deletionOperations.length > 0) {
              return (
                <div className="space-y-2">
                  <p className="text-sm text-amber-700 text-center font-medium">
                    🚨 Operaciones Pendientes de Confirmación:
                  </p>
                  <div className="space-y-1 text-xs text-amber-600">
                    {otherOperations.length > 0 && (
                      <p>• {otherOperations.length} movimiento{otherOperations.length !== 1 ? 's' : ''} de parejas</p>
                    )}
                    <p className="font-medium text-red-700">
                      • {deletionOperations.length} eliminaci{deletionOperations.length !== 1 ? 'ones' : 'ón'} de pareja{deletionOperations.length !== 1 ? 's' : ''} del torneo
                    </p>
                  </div>
                  <p className="text-xs text-amber-700 text-center">
                    Haz clic en "Guardar cambios" para confirmar todas las operaciones.
                  </p>
                </div>
              )
            } else {
              return (
                <p className="text-sm text-amber-700 text-center">
                  ⚠️ Tienes {pendingOperations.length} cambio{pendingOperations.length !== 1 ? 's' : ''} sin guardar. 
                  Haz clic en "Guardar cambios" para aplicarlos.
                </p>
              )
            }
          })()}
        </div>
      )}
    </div>
  )
}