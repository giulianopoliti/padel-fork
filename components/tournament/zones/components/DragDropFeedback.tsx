/**
 * Drag Drop Feedback Component
 * 
 * Shows contextual feedback during drag and drop operations.
 * Displays validation messages, consequences, and confirmation requirements.
 */

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Info,
  ArrowRight,
  Users 
} from 'lucide-react'
import type { ValidationLevel } from '@/types/tournament-rules.types'

interface DragDropFeedbackProps {
  isOver: boolean
  canDrop: boolean
  feedback: string
  level?: ValidationLevel
  consequences?: {
    eliminated: number
    matchesPerCouple: number
    totalMatches: number
    strategy: string
  }
  requiresConfirmation?: boolean
  targetName?: string
  onConfirm?: () => void
  onCancel?: () => void
  className?: string
}

export function DragDropFeedback({
  isOver,
  canDrop,
  feedback,
  level = 'info',
  consequences,
  requiresConfirmation = false,
  targetName,
  onConfirm,
  onCancel,
  className = ''
}: DragDropFeedbackProps) {
  
  if (!isOver && !requiresConfirmation) return null

  const getIcon = () => {
    if (!canDrop) return XCircle
    if (level === 'warning') return AlertTriangle
    if (level === 'error') return XCircle
    return CheckCircle
  }

  const getIconColor = () => {
    if (!canDrop) return 'text-red-500'
    if (level === 'warning') return 'text-yellow-500'
    if (level === 'error') return 'text-red-500'
    return 'text-green-500'
  }

  const getBackgroundColor = () => {
    if (!canDrop) return 'bg-red-50 border-red-200'
    if (level === 'warning') return 'bg-yellow-50 border-yellow-200'
    if (level === 'error') return 'bg-red-50 border-red-200'
    return 'bg-green-50 border-green-200'
  }

  const Icon = getIcon()

  // Confirmation dialog for significant actions
  if (requiresConfirmation && consequences?.eliminated > 0) {
    return (
      <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${className}`}>
        <div className="bg-white rounded-surface p-6 max-w-md mx-4 shadow-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Zona especial con eliminación
              </h3>
              
              <p className="text-gray-600 mb-4">
                {feedback}
              </p>

              {consequences && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-surface p-3 mb-4">
                  <div className="text-sm space-y-1">
                    <div className="flex items-center gap-2 text-yellow-800">
                      <Users className="h-4 w-4" />
                      <span className="font-medium">Consecuencias:</span>
                    </div>
                    <ul className="ml-6 text-yellow-700 space-y-0.5">
                      <li>• {consequences.matchesPerCouple} partidos por pareja</li>
                      <li>• {consequences.totalMatches} partidos totales</li>
                      {consequences.eliminated > 0 && (
                        <li className="font-medium">
                          • {consequences.eliminated} pareja{consequences.eliminated > 1 ? 's' : ''} 
                          {consequences.eliminated > 1 ? ' quedarán eliminadas' : ' quedará eliminada'}
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCancel}
                >
                  Cancelar
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={onConfirm}
                  className="bg-yellow-600 hover:bg-yellow-700"
                >
                  Continuar
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Inline feedback during drag operations
  return (
    <div className={`
      absolute inset-0 pointer-events-none border-2 border-dashed rounded-surface 
      ${getBackgroundColor()} ${className}
    `}>
      <div className="flex items-center justify-center h-full">
        <div className={`
          px-4 py-2 rounded-surface font-medium border
          ${canDrop 
            ? 'bg-white/90 text-gray-800 border-gray-200 shadow-sm' 
            : 'bg-red-100 text-red-800 border-red-200'
          }
        `}>
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${getIconColor()}`} />
            <span className="text-sm">
              {canDrop && targetName ? `Soltar en ${targetName}` : feedback}
            </span>
          </div>
          
          {canDrop && consequences?.eliminated > 0 && (
            <div className="flex items-center gap-1 mt-1 text-xs text-yellow-600">
              <AlertTriangle className="h-3 w-3" />
              <span>{consequences.eliminated} pareja eliminada</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Simple inline feedback for basic operations
 */
export function SimpleDragFeedback({
  canDrop,
  message,
  className = ''
}: {
  canDrop: boolean
  message: string
  className?: string
}) {
  return (
    <Badge 
      variant={canDrop ? "default" : "destructive"}
      className={`text-xs ${className}`}
    >
      {message}
    </Badge>
  )
}

/**
 * Zone-specific drag feedback
 */
export function ZoneDragFeedback({
  isOver,
  canDrop,
  feedback,
  level,
  consequences,
  zoneName,
  className = ''
}: Omit<DragDropFeedbackProps, 'targetName' | 'requiresConfirmation'> & { zoneName: string }) {
  
  if (!isOver) return null

  return (
    <DragDropFeedback
      isOver={isOver}
      canDrop={canDrop}
      feedback={feedback}
      level={level}
      consequences={consequences}
      targetName={zoneName}
      className={className}
    />
  )
}

/**
 * Consequence preview badge
 */
export function ConsequencePreview({
  consequences,
  size = 'sm',
  showDetails = false
}: {
  consequences?: {
    eliminated: number
    matchesPerCouple: number
    totalMatches: number
    strategy: string
  }
  size?: 'xs' | 'sm' | 'md'
  showDetails?: boolean
}) {
  if (!consequences || consequences.eliminated === 0) return null

  const sizeClasses = {
    xs: 'text-xs px-1.5 py-0.5',
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5'
  }

  return (
    <Badge 
      variant="secondary"
      className={`${sizeClasses[size]} bg-yellow-100 text-yellow-800 border-yellow-300`}
    >
      <div className="flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        <span>
          {consequences.eliminated} eliminada{consequences.eliminated > 1 ? 's' : ''}
        </span>
        
        {showDetails && (
          <span className="opacity-75">
            • {consequences.matchesPerCouple} partidos
          </span>
        )}
      </div>
    </Badge>
  )
}