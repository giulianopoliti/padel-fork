/**
 * MODIFY RESULT FORM - FORMULARIO DE MODIFICACIÓN CON ADVERTENCIAS
 * 
 * Formulario especializado para modificar resultados existentes.
 * Incluye advertencias sobre el impacto de los cambios.
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Save, 
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw
} from 'lucide-react'
import { useMatchManagement, type MatchResult } from '../hooks/useMatchManagement'
import type { BracketMatchV2 } from '../types/bracket-types'

// ============================================================================
// TIPOS
// ============================================================================

export interface ModifyResultFormProps {
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

export function ModifyResultForm({
  match,
  tournamentId,
  isOwner,
  onResultSaved,
  onCancel,
  className
}: ModifyResultFormProps) {

  // Estados del formulario
  const [couple1Games, setCouple1Games] = useState<number>(6)
  const [couple2Games, setCouple2Games] = useState<number>(4)
  const [detectedWinner, setDetectedWinner] = useState<'couple1' | 'couple2' | null>(null)
  const [showConfirmation, setShowConfirmation] = useState<boolean>(false)

  // Hook de match management
  const [matchState, matchActions] = useMatchManagement(
    tournamentId,
    onResultSaved,
    (error) => console.error('[ModifyResultForm] Error:', error)
  )

  // Datos de las parejas
  const couple1 = match.participants?.slot1?.couple
  const couple2 = match.participants?.slot2?.couple

  // Datos actuales del resultado
  const currentWinner = match.participants?.slot1?.couple?.id === match.metadata?.winner_id 
    ? 'couple1' 
    : match.participants?.slot2?.couple?.id === match.metadata?.winner_id 
      ? 'couple2' 
      : null

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
  // VALIDACIONES DE MODIFICACIÓN
  // ============================================================================

  const isChangingWinner = detectedWinner !== currentWinner
  const isValidModification = detectedWinner !== null && isChangingWinner

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

    console.log('🔄 [ModifyResultForm] Enviando modificación:', {
      matchId: match.id,
      result,
      detectedWinner,
      winnerId,
      previousWinner: currentWinner
    })

    const success = await matchActions.updateResult(match.id, result, true)
    
    if (success && onResultSaved) {
      onResultSaved(match.id, result)
    }
  }

  const handleCancel = () => {
    setShowConfirmation(false)
    if (onCancel) {
      onCancel()
    }
  }

  const handleConfirmClick = () => {
    if (isValidModification) {
      setShowConfirmation(true)
    } else {
      handleSubmit()
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

  // Modo confirmación
  if (showConfirmation) {
    return (
      <div className={`bg-orange-50 border border-orange-200 rounded-surface p-4 space-y-4 ${className}`}>
        <div className="flex items-center gap-2 text-orange-800">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-semibold">Confirmar Modificación</span>
        </div>

        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-orange-800">
            <strong>Cambio de ganador detectado:</strong>
            <br />
            • Ganador anterior: {currentWinner === 'couple1' ? 
              `${couple1.player1_details?.first_name} & ${couple1.player2_details?.first_name}` :
              `${couple2.player1_details?.first_name} & ${couple2.player2_details?.first_name}`
            }
            <br />
            • Nuevo ganador: {detectedWinner === 'couple1' ? 
              `${couple1.player1_details?.first_name} & ${couple1.player2_details?.first_name}` :
              `${couple2.player1_details?.first_name} & ${couple2.player2_details?.first_name}`
            }
            <br />
            <br />
            <strong>Impacto:</strong> El nuevo ganador reemplazará al anterior en matches posteriores.
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          <Button
            onClick={handleSubmit}
            disabled={matchState.updatingResult}
            className="flex-1 bg-orange-600 hover:bg-orange-700"
          >
            {matchState.updatingResult ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Confirmar Modificación
          </Button>
          
          <Button
            variant="outline"
            onClick={() => setShowConfirmation(false)}
            disabled={matchState.updatingResult}
          >
            Revisar
          </Button>
        </div>
      </div>
    )
  }

  // Modo formulario normal
  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-surface p-3 space-y-3 ${className}`}>
      {/* Título */}
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-medium text-blue-900">Modificar Resultado</span>
        <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
          Cambio de Ganador
        </Badge>
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
          <div className="mt-1">
            {currentWinner === 'couple1' && (
              <Badge variant="secondary" className="bg-gray-200 text-gray-700 text-xs">
                Ganador Actual
              </Badge>
            )}
            {detectedWinner === 'couple1' && (
              <Badge variant="default" className="bg-green-600 text-white text-xs">
                Nuevo Ganador ✓
              </Badge>
            )}
          </div>
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
          <div className="mt-1">
            {currentWinner === 'couple2' && (
              <Badge variant="secondary" className="bg-gray-200 text-gray-700 text-xs">
                Ganador Actual
              </Badge>
            )}
            {detectedWinner === 'couple2' && (
              <Badge variant="default" className="bg-green-600 text-white text-xs">
                Nuevo Ganador ✓
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Validaciones y advertencias */}
      {!isChangingWinner && detectedWinner && (
        <Alert className="border-blue-200 bg-blue-50">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription className="text-blue-800 text-xs">
            No hay cambio de ganador. El resultado será actualizado sin propagación.
          </AlertDescription>
        </Alert>
      )}

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
          onClick={handleConfirmClick}
          disabled={!canSubmit || matchState.updatingResult}
          size="sm"
          className="flex-1 h-8 text-xs"
          variant={isValidModification ? "default" : "outline"}
        >
          {matchState.updatingResult ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Save className="h-3 w-3 mr-1" />
              {isValidModification ? 'Modificar' : 'Actualizar'}
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

export default ModifyResultForm