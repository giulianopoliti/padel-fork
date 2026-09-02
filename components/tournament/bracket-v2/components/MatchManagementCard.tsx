/**
 * Componente principal para gestión completa de matches
 * Incluye asignación de cancha, inicio de match, y carga de resultados
 * Reutilizable para diferentes formatos de torneo
 */

'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Clock, MapPin, Trophy, Edit3, Play, Users, AlertCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { useMatchManagement, type MatchResult } from '../hooks/useMatchManagement'
import type { BracketMatchV2 } from '../types/bracket-types'

interface MatchManagementCardProps {
  match: BracketMatchV2
  tournamentId: string
  isOwner: boolean
  onMatchUpdate?: (matchId: string, updatedData: any) => void
  format?: 'single_set' | 'best_of_3'  // Para extensibilidad futura
  className?: string
}

export function MatchManagementCard({
  match,
  tournamentId,
  isOwner,
  onMatchUpdate,
  format = 'single_set',
  className = ''
}: MatchManagementCardProps) {
  
  const [state, actions] = useMatchManagement(tournamentId, onMatchUpdate)
  
  // Estados locales para formularios
  const [courtInput, setCourtInput] = useState((match as any).court || match.scheduling?.court || '')
  const [showResultDialog, setShowResultDialog] = useState(false)
  const [showCourtDialog, setShowCourtDialog] = useState(false)
  
  // Estados para formulario de resultado
  const [couple1Games, setCouple1Games] = useState<number>(6)
  const [couple2Games, setCouple2Games] = useState<number>(4)
  const [selectedWinner, setSelectedWinner] = useState<string>('')
  const [matchDuration, setMatchDuration] = useState<number>(45)
  const [notes, setNotes] = useState('')

  // Verificar si el match tiene ambas parejas
  const hasBothCouples = !!(match.participants?.slot1?.couple && match.participants?.slot2?.couple)
  const couple1 = match.participants?.slot1?.couple
  const couple2 = match.participants?.slot2?.couple

  // Determinar estado visual del match
  const getMatchStatusInfo = () => {
    switch (match.status) {
      case 'PENDING':
        return {
          badge: <Badge variant="secondary">Pendiente</Badge>,
          color: 'border-gray-300',
          canAssignCourt: true,
          canStart: hasBothCouples,
          canAddResult: hasBothCouples
        }
      case 'IN_PROGRESS':
        return {
          badge: <Badge variant="default" className="bg-blue-600">En Curso</Badge>,
          color: 'border-blue-400',
          canAssignCourt: true,
          canStart: false,
          canAddResult: true
        }
      case 'FINISHED':
        return {
          badge: <Badge variant="default" className="bg-green-600">Finalizado</Badge>,
          color: 'border-green-400',
          canAssignCourt: false,
          canStart: false,
          canAddResult: false,
          canModify: true
        }
      case 'WAITING_OPONENT' as any:
        return {
          badge: <Badge variant="outline">Esperando Rival</Badge>,
          color: 'border-orange-300',
          canAssignCourt: false,
          canStart: false,
          canAddResult: false
        }
      default:
        return {
          badge: <Badge variant="secondary">{match.status}</Badge>,
          color: 'border-gray-300',
          canAssignCourt: false,
          canStart: false,
          canAddResult: false
        }
    }
  }

  const statusInfo = getMatchStatusInfo()

  // Manejar asignación de cancha
  const handleAssignCourt = async (startMatch = false) => {
    if (!courtInput.trim()) {
      toast.error('Ingresa el nombre de la cancha')
      return
    }

    const success = await actions.assignCourt(match.id, courtInput, startMatch)
    if (success) {
      setShowCourtDialog(false)
    }
  }

  // Manejar envío de resultado
  const handleSubmitResult = async () => {
    if (!selectedWinner) {
      toast.error('Selecciona el ganador del match')
      return
    }

    const result = actions.createSingleSetResult(
      couple1Games,
      couple2Games,
      selectedWinner,
      matchDuration || undefined
    )

    // Validar resultado
    const validation = actions.validateResult(
      result,
      couple1?.id || '',
      couple2?.id || ''
    )

    if (!validation.valid) {
      toast.error(validation.error)
      return
    }

    const success = await actions.updateResult(match.id, result, true)
    if (success) {
      setShowResultDialog(false)
      // Reset form
      setCouple1Games(6)
      setCouple2Games(4)
      setSelectedWinner('')
      setMatchDuration(45)
      setNotes('')
    }
  }

  // Renderizar información de parejas
  const renderCoupleInfo = (couple: any, label: string, slotPosition: 'slot1' | 'slot2') => {
    // Obtener información de placeholder basada en la posición del slot
    const placeholderLabel = slotPosition === 'slot1' 
      ? (match as any).couple1_placeholder_label 
      : (match as any).couple2_placeholder_label;
    const isPlaceholder = slotPosition === 'slot1' 
      ? (match as any).couple1_is_placeholder 
      : (match as any).couple2_is_placeholder;

    if (!couple) {
      // Si hay placeholder, mostrar información del placeholder
      if (isPlaceholder && placeholderLabel) {
        return (
          <div className="text-sm">
            <span className="font-medium text-gray-700">{label}:</span>
            <div className="flex items-center gap-2 mt-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-amber-700 font-medium">
                {/* Convertir "2B" a "2° B" */}
                {placeholderLabel.replace(/(\d+)([A-Z])/g, '$1° $2')}
              </span>
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                Esperando zona
              </Badge>
            </div>
          </div>
        )
      }
      
      // Caso normal: slot vacío
      return (
        <div className="text-sm text-gray-500 italic">
          {label}: Por definir
        </div>
      )
    }

    return (
      <div className="text-sm">
        <span className="font-medium text-gray-700">{label}:</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-gray-900 cursor-help truncate">
                {couple.player1_details?.first_name || couple.player1?.first_name || 'P1'} {couple.player1_details?.last_name || couple.player1?.last_name || ''} / {couple.player2_details?.first_name || couple.player2?.first_name || 'P2'} {couple.player2_details?.last_name || couple.player2?.last_name || ''}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="font-medium">
                {couple.player1_details?.first_name || couple.player1?.first_name || 'P1'} {couple.player1_details?.last_name || couple.player1?.last_name || ''}
              </p>
              <p className="font-medium">
                {couple.player2_details?.first_name || couple.player2?.first_name || 'P2'} {couple.player2_details?.last_name || couple.player2?.last_name || ''}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {couple.seed && (
          <Badge variant="outline" className="text-xs mt-1">
            Seed {typeof couple.seed === 'object' ? couple.seed.seed : couple.seed}
          </Badge>
        )}
      </div>
    )
  }

  // Si no es owner, mostrar solo información
  if (!isOwner) {
    return (
      <Card className={`${statusInfo.color} ${className}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {match.round} - Match {((match as any).order ?? match.order_in_round)}
            </CardTitle>
            {statusInfo.badge}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {renderCoupleInfo(couple1, 'Pareja 1', 'slot1')}
          {renderCoupleInfo(couple2, 'Pareja 2', 'slot2')}
          
          {((match as any).court || match.scheduling?.court) && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="h-4 w-4" />
              <span>{(match as any).court || match.scheduling?.court}</span>
            </div>
          )}
          
          {match.result && (
            <div className="flex items-center gap-2 text-sm">
              <Trophy className="h-4 w-4 text-yellow-500" />
              <span className="font-medium">
                Resultado: {(match as any).result?.final_score ?? '--'}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`${statusInfo.color} ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            {match.round} - Match {((match as any).order ?? match.order_in_round)}
          </CardTitle>
          {statusInfo.badge}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Información de parejas */}
        <div className="space-y-3">
          {renderCoupleInfo(couple1, 'Pareja 1', 'slot1')}
          {renderCoupleInfo(couple2, 'Pareja 2', 'slot2')}
        </div>

        {/* Información de cancha */}
        {(((match as any).court) ?? match.scheduling?.court) && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <MapPin className="h-4 w-4" />
            <span>{((match as any).court) ?? match.scheduling?.court}</span>
          </div>
        )}

        {/* Resultado actual */}
        {match.result && (
          <div className="p-3 bg-gray-50 rounded-surface">
            <div className="flex items-center gap-2 text-sm">
              <Trophy className="h-4 w-4 text-yellow-500" />
              <span className="font-medium">
                Resultado: {(match as any).result?.final_score ?? '--'}
              </span>
            </div>
          </div>
        )}

        {/* Warning si falta información */}
        {!hasBothCouples && (
          <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            <span className="text-sm text-orange-700">
              Faltan parejas para jugar este match
            </span>
          </div>
        )}

        {/* Acciones de gestión */}
        <div className="flex flex-wrap gap-2 pt-2">
          {/* Asignar cancha */}
          {statusInfo.canAssignCourt && (
            <Dialog open={showCourtDialog} onOpenChange={setShowCourtDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <MapPin className="h-4 w-4 mr-1" />
                  {(((match as any).court) ?? match.scheduling?.court) ? 'Cambiar Cancha' : 'Asignar Cancha'}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Asignar Cancha</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Nombre de la cancha</label>
                    <Input
                      value={courtInput}
                      onChange={(e) => setCourtInput(e.target.value)}
                      placeholder="Ej: Cancha 1, Central, etc."
                      className="mt-1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleAssignCourt(false)}
                      disabled={state.assigningCourt}
                      variant="outline"
                      className="flex-1"
                    >
                      Solo Asignar
                    </Button>
                    {statusInfo.canStart && (
                      <Button
                        onClick={() => handleAssignCourt(true)}
                        disabled={state.startingMatch || !hasBothCouples}
                        className="flex-1"
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Asignar e Iniciar
                      </Button>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Cargar resultado */}
          {statusInfo.canAddResult && (
            <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-green-600 hover:bg-green-700">
                  <Trophy className="h-4 w-4 mr-1" />
                  Cargar Resultado
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Resultado del Match</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Parejas participantes */}
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Parejas:</div>
                    <div className="text-sm space-y-1">
                      <div>1. {couple1?.player1_details?.first_name || 'P1'} {couple1?.player1_details?.last_name || ''} / {couple1?.player2_details?.first_name || 'P2'} {couple1?.player2_details?.last_name || ''}</div>
                      <div>2. {couple2?.player1_details?.first_name || 'P1'} {couple2?.player1_details?.last_name || ''} / {couple2?.player2_details?.first_name || 'P2'} {couple2?.player2_details?.last_name || ''}</div>
                    </div>
                  </div>

                  {/* Resultado del set */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Pareja 1 - Games</label>
                      <Input
                        type="number"
                        min="0"
                        max="7"
                        value={couple1Games}
                        onChange={(e) => setCouple1Games(parseInt(e.target.value) || 0)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Pareja 2 - Games</label>
                      <Input
                        type="number"
                        min="0"
                        max="7"
                        value={couple2Games}
                        onChange={(e) => setCouple2Games(parseInt(e.target.value) || 0)}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  {/* Ganador */}
                  <div>
                    <label className="text-sm font-medium">Ganador</label>
                    <Select value={selectedWinner} onValueChange={setSelectedWinner}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Seleccionar ganador" />
                      </SelectTrigger>
                      <SelectContent>
                        {couple1 && (
                          <SelectItem value={couple1.id}>
                            Pareja 1: {couple1.player1_details?.first_name || 'P1'} {couple1.player1_details?.last_name || ''} / {couple1.player2_details?.first_name || 'P2'} {couple1.player2_details?.last_name || ''}
                          </SelectItem>
                        )}
                        {couple2 && (
                          <SelectItem value={couple2.id}>
                            Pareja 2: {couple2.player1_details?.first_name || 'P1'} {couple2.player1_details?.last_name || ''} / {couple2.player2_details?.first_name || 'P2'} {couple2.player2_details?.last_name || ''}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Duración (opcional) */}
                  <div>
                    <label className="text-sm font-medium">Duración (minutos)</label>
                    <Input
                      type="number"
                      min="0"
                      value={matchDuration}
                      onChange={(e) => setMatchDuration(parseInt(e.target.value) || 0)}
                      placeholder="45"
                      className="mt-1"
                    />
                  </div>

                  {/* Notas (opcional) */}
                  <div>
                    <label className="text-sm font-medium">Notas (opcional)</label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Observaciones del match..."
                      className="mt-1"
                      rows={2}
                    />
                  </div>

                  <Button
                    onClick={handleSubmitResult}
                    disabled={state.updatingResult || !selectedWinner}
                    className="w-full"
                  >
                    {state.updatingResult ? 'Guardando...' : 'Finalizar Match'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Modificar resultado */}
          {statusInfo.canModify && (
            <Button variant="outline" size="sm" className="text-orange-600">
              <Edit3 className="h-4 w-4 mr-1" />
              Modificar
            </Button>
          )}
        </div>

        {/* Mostrar errores */}
        {state.error && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {state.error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}