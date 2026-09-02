"use client"

import React from 'react'
import { Trash2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDragDrop } from '../context/drag-drop-context'
import type { DropTarget } from '../types/drag-types'

interface TrashDropZoneProps {
  onDrop: () => void
  onDragEnter: (target: DropTarget) => void
  onDragLeave: () => void
  isEditMode: boolean
  isVisible: boolean
}

export function TrashDropZone({ onDrop, onDragEnter, onDragLeave, isEditMode, isVisible }: TrashDropZoneProps) {
  const { state } = useDragDrop()
  const { isDragging, draggedItem, dragOverTarget } = state

  // Only show when in edit mode and visible
  if (!isEditMode || !isVisible) {
    return null
  }

  // Check if we're hovering over the trash zone
  const isHovering = dragOverTarget?.type === 'trash' && isDragging
  const canDrop = draggedItem && !draggedItem.coupleId.includes('restricted')

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const trashTarget: DropTarget = { type: 'trash', id: 'trash', name: 'Eliminación' }
    onDragEnter(trashTarget)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDragLeave()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDrop()
  }

  return (
    <div className="mt-6 mb-4">
      <div
        className={cn(
          "relative border-2 border-dashed rounded-surface p-6 transition-all duration-200 min-h-24",
          "flex flex-col items-center justify-center space-y-2",
          isDragging
            ? isHovering
              ? canDrop
                ? "border-red-400 bg-red-50"
                : "border-red-300 bg-red-25 opacity-50"
              : "border-red-200 bg-red-25"
            : "border-gray-300 bg-gray-50",
          isDragging && "cursor-pointer",
          isHovering && canDrop && "scale-105 shadow-lg"
        )}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-drop-target="trash"
      >
        {/* Trash Icon */}
        <div className={cn(
          "transition-all duration-200",
          isHovering && canDrop ? "scale-110" : "scale-100"
        )}>
          <Trash2 
            className={cn(
              "w-8 h-8 transition-colors duration-200",
              isDragging
                ? isHovering && canDrop
                  ? "text-red-600"
                  : "text-red-400"
                : "text-gray-400"
            )}
          />
        </div>

        {/* Text Content */}
        <div className="text-center space-y-1">
          <p className={cn(
            "text-sm font-medium transition-colors duration-200",
            isDragging
              ? isHovering && canDrop
                ? "text-red-700"
                : "text-red-500"
              : "text-gray-600"
          )}>
            {isDragging 
              ? isHovering
                ? canDrop 
                  ? "Soltar para eliminar del torneo"
                  : "Esta pareja no puede ser eliminada"
                : "Arrastre aquí para eliminar"
              : "Zona de Eliminación"
            }
          </p>
          
          {!isDragging && (
            <p className="text-xs text-gray-500">
              Arrastra parejas aquí para eliminarlas del torneo
            </p>
          )}
          
          {isDragging && draggedItem && !canDrop && (
            <div className="flex items-center justify-center space-x-1 text-xs text-red-600">
              <AlertTriangle className="w-3 h-3" />
              <span>Pareja con partidos activos</span>
            </div>
          )}
        </div>

        {/* Visual feedback overlay */}
        {isHovering && canDrop && (
          <div className="absolute inset-0 bg-red-100/20 rounded-surface pointer-events-none" />
        )}
      </div>
    </div>
  )
}