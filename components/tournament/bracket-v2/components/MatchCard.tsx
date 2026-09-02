/**
 * MATCH CARD - COMPONENTE REUTILIZABLE DE MATCH
 * 
 * Componente que renderiza un match individual del bracket.
 * Diseñado para ser altamente reutilizable y configurable.
 * 
 * CARACTERÍSTICAS:
 * - Soporte para diferentes estados (PENDING, IN_PROGRESS, FINISHED, BYE)
 * - Renderizado de parejas reales y placeholders
 * - Estados visuales (hover, selected, disabled)
 * - Información de seeds y zonas
 * - Accesibilidad completa
 * - Animaciones suaves
 * - Responsive design
 * 
 * @author Claude Code Assistant
 * @version 2.0.0
 * @created 2025-01-17
 */

'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import type {
  BracketMatchV2,
  ParticipantSlot,
  CoupleData,
  SeedInfo,
  MatchStatus
} from '../types/bracket-types'
import type {
  MatchLayoutPosition
} from '../types/layout-types'

// ============================================================================
// TIPOS DEL COMPONENTE
// ============================================================================

/**
 * Props del componente MatchCard
 */
export interface MatchCardProps {
  /** Match a renderizar */
  match: BracketMatchV2
  /** Posición calculada en el layout */
  position?: MatchLayoutPosition
  /** Configuración visual */
  config?: MatchCardConfig
  /** Estado visual del componente */
  state?: MatchCardState
  /** Si está seleccionado */
  selected?: boolean
  /** Si está deshabilitado */
  disabled?: boolean
  /** Handlers de eventos */
  onMatchClick?: (match: BracketMatchV2) => void
  onParticipantClick?: (slot: ParticipantSlot, slotPosition: 'slot1' | 'slot2') => void
  /** Configuración de interactividad */
  interactive?: boolean
  /** Mostrar información detallada */
  showDetails?: boolean
  /** Clase CSS adicional */
  className?: string
}

/**
 * Configuración visual del MatchCard
 */
export interface MatchCardConfig {
  /** Mostrar seeds */
  showSeeds: boolean
  /** Mostrar información de zona */
  showZoneInfo: boolean
  /** Mostrar estado del match */
  showStatus: boolean
  /** Mostrar resultado si existe */
  showResult: boolean
  /** Estilo de la tarjeta */
  cardStyle: 'default' | 'compact' | 'detailed'
  /** Colores por estado */
  colors: {
    pending: string
    inProgress: string
    finished: string
    bye: string
    placeholder: string
  }
}

/**
 * Estado visual del MatchCard
 */
export type MatchCardState = 
  | 'default'
  | 'hover'
  | 'selected'
  | 'disabled'
  | 'highlighted'
  | 'dimmed'

// ============================================================================
// CONFIGURACIÓN POR DEFECTO
// ============================================================================

const DEFAULT_CONFIG: MatchCardConfig = {
  showSeeds: true,
  showZoneInfo: true,
  showStatus: true,
  showResult: true,
  cardStyle: 'default',
  colors: {
    pending: 'bg-slate-50 border-slate-200',
    inProgress: 'bg-blue-50 border-blue-200',
    finished: 'bg-green-50 border-green-200',
    bye: 'bg-yellow-50 border-yellow-200',
    placeholder: 'bg-gray-50 border-gray-200 border-dashed'
  }
}

// ============================================================================
// COMPONENTES AUXILIARES
// ============================================================================

/**
 * Componente para renderizar información de un participante
 */
interface ParticipantInfoProps {
  slot: ParticipantSlot
  slotPosition: 'slot1' | 'slot2'
  config: MatchCardConfig
  onClick?: (slot: ParticipantSlot, slotPosition: 'slot1' | 'slot2') => void
  className?: string
}

function ParticipantInfo({ 
  slot, 
  slotPosition, 
  config, 
  onClick,
  className 
}: ParticipantInfoProps) {
  
  const handleClick = () => {
    if (onClick) {
      onClick(slot, slotPosition)
    }
  }
  
  // Renderizado según tipo de participante
  switch (slot.type) {
    case 'couple':
      return (
        <CoupleParticipant
          couple={slot.couple!}
          seed={slot.seed}
          config={config}
          onClick={handleClick}
          className={className}
        />
      )
    
    case 'placeholder':
      return (
        <PlaceholderParticipant
          placeholder={slot.placeholder!}
          onClick={handleClick}
          className={className}
        />
      )
    
    case 'bye':
      return (
        <BYEParticipant
          onClick={handleClick}
          className={className}
        />
      )
    
    default:
      return (
        <EmptyParticipant
          onClick={handleClick}
          className={className}
        />
      )
  }
}

/**
 * Renderiza una pareja real
 */
function CoupleParticipant({
  couple,
  seed,
  config,
  onClick,
  className
}: {
  couple: CoupleData
  seed?: SeedInfo
  config: MatchCardConfig
  onClick?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'participant-couple p-3 rounded transition-colors cursor-pointer',
        'hover:bg-slate-100',
        className
      )}
      onClick={onClick}
    >
      {/* Seed badge */}
      {config.showSeeds && seed && (
        <div className="flex items-center gap-2 mb-1">
          <span className="seed-badge bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded font-medium">
            #{seed.seed}
          </span>
          {config.showZoneInfo && seed.zone_name && (
            <span className="zone-badge bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded">
              {seed.zone_name}
            </span>
          )}
        </div>
      )}
      
      {/* Jugadores */}
      <div className="players space-y-1">
        <PlayerName player={couple.player1_details} />
        <PlayerName player={couple.player2_details} />
      </div>
    </div>
  )
}

/**
 * Renderiza un placeholder
 */
function PlaceholderParticipant({
  placeholder,
  onClick,
  className
}: {
  placeholder: any // PlaceholderData
  onClick?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'participant-placeholder p-3 rounded border-2 border-dashed cursor-pointer',
        'text-slate-500 italic text-center transition-colors',
        'hover:bg-slate-50',
        className
      )}
      onClick={onClick}
    >
      <div className="text-sm">
        {placeholder.display || 'Pendiente'}
      </div>
      {!placeholder.isDefinitive && (
        <div className="text-xs opacity-70 mt-1">
          Por definir
        </div>
      )}
    </div>
  )
}

/**
 * Renderiza un BYE
 */
function BYEParticipant({
  onClick,
  className
}: {
  onClick?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'participant-bye p-3 rounded text-center cursor-pointer',
        'bg-yellow-50 text-yellow-800 border border-yellow-200',
        'transition-colors hover:bg-yellow-100',
        className
      )}
      onClick={onClick}
    >
      <div className="text-sm font-medium">BYE</div>
      <div className="text-xs opacity-70">Pasa automáticamente</div>
    </div>
  )
}

/**
 * Renderiza un slot vacío
 */
function EmptyParticipant({
  onClick,
  className
}: {
  onClick?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'participant-empty p-3 rounded border-2 border-dashed cursor-pointer',
        'text-slate-400 text-center transition-colors',
        'hover:bg-slate-50',
        className
      )}
      onClick={onClick}
    >
      <div className="text-sm">Sin asignar</div>
    </div>
  )
}

/**
 * Renderiza nombre de un jugador
 */
function PlayerName({ player }: { player?: any }) {
  if (!player) {
    return <div className="text-slate-400 text-sm">Jugador pendiente</div>
  }
  
  const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim()
  
  return (
    <div className="player-name text-sm font-medium text-slate-900">
      {fullName || 'Jugador'}
    </div>
  )
}

/**
 * Badge de estado del match
 */
function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const statusConfig = {
    PENDING: { label: 'Pendiente', color: 'bg-slate-100 text-slate-700' },
    IN_PROGRESS: { label: 'En Curso', color: 'bg-blue-100 text-blue-700' },
    FINISHED: { label: 'Finalizado', color: 'bg-green-100 text-green-700' },
    CANCELED: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
    BYE: { label: 'BYE', color: 'bg-yellow-100 text-yellow-700' },
    WAITING_OPPONENT: { label: 'Esperando', color: 'bg-orange-100 text-orange-700' }
  }
  
  const config = statusConfig[status] || statusConfig.PENDING
  
  return (
    <span className={cn(
      'status-badge text-xs px-2 py-1 rounded font-medium',
      config.color
    )}>
      {config.label}
    </span>
  )
}

/**
 * Información del resultado del match
 */
function MatchResult({ match }: { match: BracketMatchV2 }) {
  if (!match.result) return null
  
  const { result } = match
  const winnerSlot = result.winner
  
  return (
    <div className="match-result mt-2 pt-2 border-t border-slate-200">
      <div className="text-xs text-slate-600 mb-1">Resultado:</div>
      <div className="sets space-y-1">
        {result.sets.map((set, index) => (
          <div key={index} className="set flex items-center gap-2 text-sm">
            <span className={cn(
              'set-score px-2 py-0.5 rounded',
              winnerSlot === 'slot1' && set.slot1Score > set.slot2Score
                ? 'bg-green-100 text-green-800 font-medium'
                : 'bg-slate-100 text-slate-700'
            )}>
              {set.slot1Score}
            </span>
            <span className="text-slate-400">-</span>
            <span className={cn(
              'set-score px-2 py-0.5 rounded',
              winnerSlot === 'slot2' && set.slot2Score > set.slot1Score
                ? 'bg-green-100 text-green-800 font-medium'
                : 'bg-slate-100 text-slate-700'
            )}>
              {set.slot2Score}
            </span>
            {set.tiebreaker && (
              <span className="tiebreaker text-xs text-slate-500">
                ({set.tiebreaker.slot1}-{set.tiebreaker.slot2})
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

/**
 * Componente principal MatchCard
 */
export function MatchCard({
  match,
  position,
  config = DEFAULT_CONFIG,
  state = 'default',
  selected = false,
  disabled = false,
  onMatchClick,
  onParticipantClick,
  interactive = true,
  showDetails = false,
  className
}: MatchCardProps) {
  
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  
  // Calcular clases CSS basadas en estado
  const cardClasses = cn(
    'match-card bg-white border rounded-surface shadow-sm transition-all duration-200',
    'min-h-[120px] p-4',
    {
      // Estados base
      [finalConfig.colors.pending]: match.status === 'PENDING',
      [finalConfig.colors.inProgress]: match.status === 'IN_PROGRESS',
      [finalConfig.colors.finished]: match.status === 'FINISHED',
      [finalConfig.colors.bye]: match.status === 'BYE',
      
      // Estados visuales
      'ring-2 ring-blue-500 ring-offset-2': selected,
      'opacity-50 cursor-not-allowed': disabled,
      'cursor-pointer hover:shadow-md': interactive && !disabled,
      'transform hover:scale-[1.02]': interactive && !disabled && state === 'hover',
      'brightness-110': state === 'highlighted',
      'opacity-60': state === 'dimmed',
      
      // Estilos de card
      'p-2 min-h-[100px]': finalConfig.cardStyle === 'compact',
      'p-6 min-h-[160px]': finalConfig.cardStyle === 'detailed'
    },
    className
  )
  
  const handleCardClick = (e: React.MouseEvent) => {
    if (disabled || !interactive) return
    
    e.preventDefault()
    if (onMatchClick) {
      onMatchClick(match)
    }
  }
  
  const handleParticipantClick = (slot: ParticipantSlot, slotPosition: 'slot1' | 'slot2') => {
    if (disabled || !interactive) return
    
    if (onParticipantClick) {
      onParticipantClick(slot, slotPosition)
    }
  }
  
  return (
    <div
      className={cardClasses}
      onClick={handleCardClick}
      style={position ? {
        position: 'absolute',
        left: position.bounds.x,
        top: position.bounds.y,
        width: position.bounds.width,
        height: position.bounds.height
      } : undefined}
      role="button"
      tabIndex={interactive && !disabled ? 0 : -1}
      aria-label={`Match ${match.round} - ${match.order_in_round}`}
      aria-selected={selected}
      aria-disabled={disabled}
    >
      {/* Header del match */}
      <div className="match-header flex items-center justify-between mb-3">
        <div className="match-info">
          <div className="text-xs font-medium text-slate-600 uppercase tracking-wide">
            {match.round}
          </div>
          {match.scheduling?.court && (
            <div className="text-xs text-slate-500 mt-0.5">
              Cancha {match.scheduling.court}
            </div>
          )}
        </div>
        
        {finalConfig.showStatus && (
          <MatchStatusBadge status={match.status} />
        )}
      </div>
      
      {/* Participantes */}
      <div className="participants space-y-2">
        <ParticipantInfo
          slot={match.participants.slot1}
          slotPosition="slot1"
          config={finalConfig}
          onClick={interactive ? handleParticipantClick : undefined}
          className="border-b border-slate-100 pb-2"
        />
        
        <ParticipantInfo
          slot={match.participants.slot2}
          slotPosition="slot2"
          config={finalConfig}
          onClick={interactive ? handleParticipantClick : undefined}
        />
      </div>
      
      {/* Resultado si existe */}
      {finalConfig.showResult && <MatchResult match={match} />}
      
      {/* Información detallada (opcional) */}
      {showDetails && (
        <div className="match-details mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500">
          <div>ID: {match.id}</div>
          <div>Orden: {match.order_in_round}</div>
          {match.metadata?.created_at && (
            <div>Creado: {new Date(match.metadata.created_at).toLocaleString()}</div>
          )}
        </div>
      )}
    </div>
  )
}

export default MatchCard