/**
 * ZONE CONFLICT BADGE
 *
 * Componente badge que alerta cuando dos parejas ya se enfrentaron
 * en la fase de zonas y están programadas para jugar nuevamente en el bracket.
 *
 * @author Claude Code Assistant
 * @version 1.0.0
 * @created 2025-01-XX
 */

'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// TIPOS
// ============================================================================

export interface ZoneConflictBadgeProps {
  /** Nombre de la primera pareja (opcional, para mensaje más específico) */
  couple1Name?: string
  /** Nombre de la segunda pareja (opcional, para mensaje más específico) */
  couple2Name?: string
  /** Variante del badge */
  variant?: 'warning' | 'info'
  /** Tamaño del badge */
  size?: 'sm' | 'md' | 'lg'
  /** Mostrar solo ícono sin texto */
  iconOnly?: boolean
  /** Clase CSS adicional */
  className?: string
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

/**
 * Badge que muestra alerta de conflicto de zona
 *
 * @example
 * ```tsx
 * <ZoneConflictBadge
 *   couple1Name="Juan / Pedro"
 *   couple2Name="Carlos / Luis"
 *   variant="warning"
 * />
 * ```
 */
export function ZoneConflictBadge({
  couple1Name,
  couple2Name,
  variant = 'warning',
  size = 'md',
  iconOnly = false,
  className
}: ZoneConflictBadgeProps) {

  // Mensaje del tooltip
  const tooltipMessage = couple1Name && couple2Name
    ? `⚠️ Estas parejas ya jugaron en la fase de zonas:\n\n"${couple1Name}" vs "${couple2Name}"\n\nSe recomienda verificar si este enfrentamiento es intencional.`
    : '⚠️ Estas parejas ya se enfrentaron en la fase de zonas. Verifica si este match es intencional.'

  // Estilos según variante
  const variantStyles = {
    warning: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200',
    info: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
  }

  // Estilos según tamaño
  const sizeStyles = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5'
  }

  // Tamaño del ícono según size
  const iconSize = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  }

  const Icon = variant === 'warning' ? AlertTriangle : Info

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'flex items-center gap-1.5 border cursor-help transition-colors',
              variantStyles[variant],
              sizeStyles[size],
              className
            )}
          >
            <Icon className={cn('shrink-0', iconSize[size])} />
            {!iconOnly && (
              <span className="font-medium whitespace-nowrap">
                Ya jugaron en zona
              </span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          className={cn(
            'max-w-xs text-center whitespace-pre-line',
            variant === 'warning' ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-blue-50 text-blue-900 border-blue-200'
          )}
        >
          <div className="space-y-2">
            <p className="font-medium">{tooltipMessage}</p>
            {couple1Name && couple2Name && (
              <p className="text-xs opacity-80">
                Usá "Reorganizar parejas" si necesitás cambiar este cruce.
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ============================================================================
// VARIANTES PRE-CONFIGURADAS
// ============================================================================

/**
 * Badge compacto solo con ícono (para espacios reducidos)
 */
export function ZoneConflictIconBadge(props: Omit<ZoneConflictBadgeProps, 'iconOnly'>) {
  return <ZoneConflictBadge {...props} iconOnly size="sm" />
}

/**
 * Badge informativo (menos alarmante)
 */
export function ZoneConflictInfoBadge(props: Omit<ZoneConflictBadgeProps, 'variant'>) {
  return <ZoneConflictBadge {...props} variant="info" />
}

export interface SameZonePlaceholderConflictBadgeProps {
  coupleName?: string
  placeholderLabel: string
  zoneName?: string | null
  size?: 'sm' | 'md' | 'lg'
  iconOnly?: boolean
  className?: string
}

export function SameZonePlaceholderConflictBadge({
  coupleName,
  placeholderLabel,
  zoneName,
  size = 'md',
  iconOnly = false,
  className
}: SameZonePlaceholderConflictBadgeProps) {
  const displayZoneName = zoneName || 'la misma zona'
  const tooltipMessage = coupleName
    ? `${coupleName} viene de ${displayZoneName} y el rival pendiente (${placeholderLabel}) tambien saldra de esa zona. Revisa la llave antes de programar este partido.`
    : `El rival pendiente (${placeholderLabel}) sale de la misma zona que la pareja ya definida. Revisa la llave antes de programar este partido.`

  const sizeStyles = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5'
  }

  const iconSize = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'flex items-center gap-1.5 border cursor-help transition-colors',
              'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200',
              sizeStyles[size],
              className
            )}
          >
            <AlertTriangle className={cn('shrink-0', iconSize[size])} />
            {!iconOnly && (
              <span className="font-medium whitespace-nowrap">
                Posible cruce de misma zona
              </span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          className="max-w-xs text-center whitespace-pre-line bg-orange-50 text-orange-900 border-orange-200"
        >
          <div className="space-y-2">
            <p className="font-medium">{tooltipMessage}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
