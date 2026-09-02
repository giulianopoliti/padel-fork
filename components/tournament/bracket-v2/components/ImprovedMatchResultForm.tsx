/**
 * IMPROVED MATCH RESULT FORM - FORMULARIO MEJORADO PARA CARGA DE RESULTADOS
 * 
 * Formulario con nombres completos de jugadores y detección automática de ganador.
 * Diseñado para ser intuitivo y fácil de usar.
 * 
 * @author Claude Code Assistant
 * @version 1.0.0
 * @created 2025-01-19
 */

'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Trophy, 
  Users, 
  Clock, 
  Save, 
  X,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import { useMatchManagement, type MatchResult } from '../hooks/useMatchManagement'
import type { BracketMatchV2 } from '../types/bracket-types'

// ============================================================================
// TIPOS
// ============================================================================

export interface ImprovedMatchResultFormProps {
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

interface GameScore {
  couple1Games: number
  couple2Games: number
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export function ImprovedMatchResultForm({
  match,
  tournamentId,
  isOwner,
  onResultSaved,
  onCancel,
  className
}: ImprovedMatchResultFormProps) {

  // Estados del formulario
  const [gameScore, setGameScore] = useState<GameScore>({ couple1Games: 0, couple2Games: 0 })
  const [detectedWinner, setDetectedWinner] = useState<'couple1' | 'couple2' | null>(null)

  // Hook de match management
  const [matchState, matchActions] = useMatchManagement(
    tournamentId,
    onResultSaved,
    (error) => console.error('[ImprovedMatchResultForm] Error:', error)
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
    const { couple1Games, couple2Games } = gameScore
    
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
  }, [gameScore])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleGameScoreChange = (couple: 'couple1' | 'couple2', value: string) => {
    const numValue = parseInt(value) || 0
    
    setGameScore(prev => ({
      ...prev,
      [`${couple}Games`]: numValue
    }))
  }

  const handleSubmit = async () => {
    if (!canSubmit || !couple1 || !couple2 || !detectedWinner) {
      return
    }

    const winnerId = detectedWinner === 'couple1' ? couple1.id : couple2.id

    const result: MatchResult = {
      format: 'single_set',
      sets: [{
        couple1_games: gameScore.couple1Games,
        couple2_games: gameScore.couple2Games
      }],
      winner_id: winnerId
    }

    console.log('🎯 [ImprovedMatchResultForm] Enviando resultado:', {
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
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="h-5 w-5" />
            <span>Este match no tiene ambas parejas asignadas</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-blue-600" />
          Cargar Resultado del Match
        </CardTitle>
        <div className="text-sm text-gray-600">
          {match.round} - Match {match.order_in_round || match.order}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* PAREJA 1 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-500" />
            <span className="font-medium text-gray-900">Pareja 1</span>
            {detectedWinner === 'couple1' && (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Ganador
              </Badge>
            )}
          </div>
          
          <div className="bg-gray-50 p-3 rounded-surface">
            <div className="text-lg font-semibold text-gray-900">
              {couple1.player1_details?.first_name || 'Jugador'} {couple1.player1_details?.last_name || '1'}
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {couple1.player2_details?.first_name || 'Jugador'} {couple1.player2_details?.last_name || '2'}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Games:</label>
            <Input
              type="number"
              min="0"
              max="7"
              value={gameScore.couple1Games}
              onChange={(e) => handleGameScoreChange('couple1', e.target.value)}
              className="w-20 text-center font-mono text-lg"
              disabled={matchState.updatingResult}
            />
          </div>
        </div>

        <div className="flex items-center justify-center">
          <Separator className="flex-1" />
          <div className="px-4 text-xs font-semibold text-gray-500 bg-gray-100 rounded-full py-1">
            VS
          </div>
          <Separator className="flex-1" />
        </div>

        {/* PAREJA 2 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-500" />
            <span className="font-medium text-gray-900">Pareja 2</span>
            {detectedWinner === 'couple2' && (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Ganador
              </Badge>
            )}
          </div>
          
          <div className="bg-gray-50 p-3 rounded-surface">
            <div className="text-lg font-semibold text-gray-900">
              {couple2.player1_details?.first_name || 'Jugador'} {couple2.player1_details?.last_name || '3'}
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {couple2.player2_details?.first_name || 'Jugador'} {couple2.player2_details?.last_name || '4'}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Games:</label>
            <Input
              type="number"
              min="0"
              max="7"
              value={gameScore.couple2Games}
              onChange={(e) => handleGameScoreChange('couple2', e.target.value)}
              className="w-20 text-center font-mono text-lg"
              disabled={matchState.updatingResult}
            />
          </div>
        </div>

        {/* INFORMACIÓN ADICIONAL */}
        <div className="space-y-4 pt-4 border-t">

          {/* RESULTADO DETECTADO */}
          {detectedWinner && (
            <div className="bg-green-50 border border-green-200 rounded-surface p-3">
              <div className="flex items-center gap-2 text-green-800">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">
                  Resultado: {gameScore.couple1Games}-{gameScore.couple2Games}
                </span>
              </div>
              <div className="text-sm text-green-700 mt-1">
                Ganador detectado: {detectedWinner === 'couple1' ? 'Pareja 1' : 'Pareja 2'}
              </div>
            </div>
          )}

          {/* ERROR DE VALIDACIÓN */}
          {(gameScore.couple1Games >= 6 || gameScore.couple2Games >= 6) && !detectedWinner && (
            <div className="bg-red-50 border border-red-200 rounded-surface p-3">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">Resultado inválido</span>
              </div>
              <div className="text-sm text-red-700 mt-1">
                {gameScore.couple1Games === gameScore.couple2Games 
                  ? 'No puede haber empate en los games'
                  : 'Al menos una pareja debe llegar a 6 games'}
              </div>
            </div>
          )}
        </div>

        {/* ERROR DEL SISTEMA */}
        {matchState.error && (
          <div className="bg-red-50 border border-red-200 rounded-surface p-3">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-4 w-4" />
              <span className="font-medium">Error al guardar resultado</span>
            </div>
            <div className="text-sm text-red-700 mt-1">
              {matchState.error}
            </div>
          </div>
        )}

        {/* BOTONES */}
        <div className="flex gap-3 pt-4">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || matchState.updatingResult}
            className="flex-1"
          >
            {matchState.updatingResult ? (
              <>
                <Clock className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Guardar Resultado
              </>
            )}
          </Button>
          
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={matchState.updatingResult}
            className="px-6"
          >
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default ImprovedMatchResultForm