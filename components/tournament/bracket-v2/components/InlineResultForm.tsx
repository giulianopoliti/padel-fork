/**
 * INLINE RESULT FORM - FORMULARIO SIMPLE DENTRO DE LA CARD
 * 
 * Formulario minimalista para cargar resultado directamente en la card.
 * Solo games, detección automática de ganador, sin panel expandido.
 * 
 * @author Claude Code Assistant
 * @version 1.0.0
 * @created 2025-01-19
 */

'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Save, 
  X,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react'
import { useMatchManagement, type MatchResult } from '../hooks/useMatchManagement'
import type { BracketMatchV2 } from '../types/bracket-types'

// ============================================================================
// TIPOS
// ============================================================================

export interface InlineResultFormProps {
  /** Match data */
  match: BracketMatchV2
  /** Tournament ID */
  tournamentId: string
  /** Si es owner */
  isOwner: boolean
  /** Handler para cuando se guarda el resultado */
  onResultSaved?: (matchId: string, result: MatchResult) => void
  /** Handler para cancelar */
  onCancel?: () => void
  /** Clase CSS */
  className?: string
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export function InlineResultForm({
  match,
  tournamentId,
  isOwner,
  onResultSaved,
  onCancel,
  className
}: InlineResultFormProps) {

  // Estados del formulario
  const [couple1Games, setCouple1Games] = useState<number>(0)
  const [couple2Games, setCouple2Games] = useState<number>(0)
  const [detectedWinner, setDetectedWinner] = useState<'couple1' | 'couple2' | null>(null)

  // Hook de match management
  const [matchState, matchActions] = useMatchManagement(
    tournamentId,
    onResultSaved,
    (error) => console.error('[InlineResultForm] Error:', error)
  )

  // Datos de las parejas
  const couple1 = match.participants?.slot1?.couple
  const couple2 = match.participants?.slot2?.couple

  // Verificar que tenemos ambas parejas
  const canSubmit = couple1 && couple2 && detectedWinner && isOwner

  // ============================================================================
  // DETECCIÓN AUTOMÁTICA DE GANADOR
  // ============================================================================

  useEffect(() => {
    // Validaciones básicas
    if (couple1Games < 0 || couple2Games < 0) {
      setDetectedWinner(null)
      return
    }

    // Debe haber al menos 6 games para ganar
    if (Math.max(couple1Games, couple2Games) < 6) {
      setDetectedWinner(null)
      return
    }

    // Determinar ganador
    if (couple1Games > couple2Games) {
      setDetectedWinner('couple1')
    } else if (couple2Games > couple1Games) {
      setDetectedWinner('couple2')
    } else {
      setDetectedWinner(null) // Empate no válido
    }
  }, [couple1Games, couple2Games])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSubmit = async () => {
    if (!canSubmit || !couple1 || !couple2 || !detectedWinner) {
      return
    }

    const winnerId = detectedWinner === 'couple1' ? couple1.id : couple2.id

    const result: MatchResult = {
      format: 'single_set',
      sets: [{
        couple1_games: couple1Games,
        couple2_games: couple2Games
      }],
      winner_id: winnerId
    }

    console.log('🎯 [InlineResultForm] Enviando resultado simplificado:', {
      matchId: match.id,
      result,
      detectedWinner,
      winnerId
    })

    const success = await matchActions.updateResult(match.id, result, true)
    
    if (success && onResultSaved) {
      onResultSaved(match.id, result)
    }
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!couple1 || !couple2) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-surface p-2 text-center text-amber-700 text-xs">
        Match incompleto
      </div>
    )
  }

  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-surface p-3 space-y-3 ${className}`}>
      {/* Título */}
      <div className="text-center text-sm font-medium text-gray-900">
        Cargar Resultado
      </div>

      {/* Formulario compacto */}
      <div className="flex items-center justify-center gap-4">
        {/* Pareja 1 */}
        <div className="text-center">
          <div className="text-xs text-gray-600 mb-1">
            {couple1.player1_details?.first_name} & {couple1.player2_details?.first_name}
          </div>
          <Input
            type="number"
            min="0"
            max="7"
            value={couple1Games}
            onChange={(e) => setCouple1Games(parseInt(e.target.value) || 0)}
            className="w-16 h-8 text-center text-sm font-mono"
            disabled={matchState.updatingResult}
          />
          {detectedWinner === 'couple1' && (
            <Badge variant="default" className="bg-green-600 text-white text-xs mt-1">
              ✓
            </Badge>
          )}
        </div>

        {/* VS */}
        <div className="text-xs font-bold text-gray-500">VS</div>

        {/* Pareja 2 */}
        <div className="text-center">
          <div className="text-xs text-gray-600 mb-1">
            {couple2.player1_details?.first_name} & {couple2.player2_details?.first_name}
          </div>
          <Input
            type="number"
            min="0"
            max="7"
            value={couple2Games}
            onChange={(e) => setCouple2Games(parseInt(e.target.value) || 0)}
            className="w-16 h-8 text-center text-sm font-mono"
            disabled={matchState.updatingResult}
          />
          {detectedWinner === 'couple2' && (
            <Badge variant="default" className="bg-green-600 text-white text-xs mt-1">
              ✓
            </Badge>
          )}
        </div>
      </div>

      {/* Error de validación */}
      {(couple1Games >= 6 || couple2Games >= 6) && !detectedWinner && (
        <div className="bg-red-50 border border-red-200 rounded p-2 text-center text-xs text-red-700">
          {couple1Games === couple2Games 
            ? 'No puede haber empate'
            : 'Resultado inválido'}
        </div>
      )}

      {/* Error del sistema */}
      {matchState.error && (
        <div className="bg-red-50 border border-red-200 rounded p-2 text-center text-xs text-red-700">
          Error: {matchState.error}
        </div>
      )}

      {/* Botones */}
      <div className="flex gap-2">
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit || matchState.updatingResult}
          size="sm"
          className="flex-1 h-8 text-xs"
        >
          {matchState.updatingResult ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Save className="h-3 w-3 mr-1" />
              Guardar
            </>
          )}
        </Button>
        
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={matchState.updatingResult}
          size="sm"
          className="h-8 text-xs px-3"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

export default InlineResultForm