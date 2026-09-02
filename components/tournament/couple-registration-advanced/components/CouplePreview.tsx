"use client"

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Users, X, User, UserPlus, CheckCircle } from 'lucide-react'
import PlayerDniDisplay from '@/components/players/player-dni-display'

import { CoupleSelectionState } from '../types'

interface CouplePreviewProps {
  coupleState: CoupleSelectionState
  onClearPlayer: (playerNumber: 1 | 2) => void
}

export default function CouplePreview({ coupleState, onClearPlayer }: CouplePreviewProps) {
  const { player1, player2 } = coupleState

  // Don't show preview if no players are selected
  if (player1.type === 'none' && player2.type === 'none') {
    return null
  }

  const getPlayerDisplay = (playerNumber: 1 | 2) => {
    const player = playerNumber === 1 ? player1 : player2
    
    if (player.type === 'none') {
      return (
        <div className="flex items-center justify-center h-24 border-2 border-dashed border-gray-300 rounded-surface bg-gray-50">
          <div className="text-center">
            <User className="h-6 w-6 mx-auto text-gray-400 mb-1" />
            <p className="text-sm text-gray-500">Jugador {playerNumber}</p>
            <p className="text-xs text-gray-400">No seleccionado</p>
          </div>
        </div>
      )
    }

    if (player.type === 'existing' && player.existingPlayer) {
      const playerData = player.existingPlayer
      return (
        <div className="relative bg-green-50 border border-green-200 rounded-surface p-4">
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 h-6 w-6 p-0 text-green-600 hover:text-green-700"
            onClick={() => onClearPlayer(playerNumber)}
          >
            <X className="h-4 w-4" />
          </Button>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <User className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-green-900">
                {playerData.first_name} {playerData.last_name}
              </h4>
              <div className="text-sm text-green-700">
                <PlayerDniDisplay dni={playerData.dni} />
              </div>
              <div className="flex gap-2 mt-1">
                <Badge variant="outline" className="text-xs border-green-300 text-green-700">
                  Jugador existente
                </Badge>
                {playerData.score && (
                  <Badge variant="outline" className="text-xs border-green-300 text-green-700">
                    Score: {playerData.score}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (player.type === 'new' && player.newPlayerData) {
      const playerData = player.newPlayerData
      return (
        <div className="relative bg-blue-50 border border-blue-200 rounded-surface p-4">
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 h-6 w-6 p-0 text-blue-600 hover:text-blue-700"
            onClick={() => onClearPlayer(playerNumber)}
          >
            <X className="h-4 w-4" />
          </Button>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-blue-900">
                {playerData.first_name} {playerData.last_name}
              </h4>
              <div className="text-sm text-blue-700">
                <PlayerDniDisplay dni={playerData.dni} />
              </div>
              <div className="flex gap-2 mt-1">
                <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
                  Nuevo jugador
                </Badge>
                {playerData.phone && (
                  <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
                    Tel: {playerData.phone}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    return null
  }

  const isComplete = player1.type !== 'none' && player2.type !== 'none'

  return (
    <Card className={`transition-all duration-300 ${isComplete ? 'ring-2 ring-emerald-200 bg-emerald-50/50' : ''}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Vista Previa de la Pareja
          {isComplete && (
            <CheckCircle className="h-5 w-5 text-emerald-600" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Jugador 1</h4>
            {getPlayerDisplay(1)}
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Jugador 2</h4>
            {getPlayerDisplay(2)}
          </div>
        </div>

        {isComplete && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-surface">
            <div className="flex items-center gap-2 text-emerald-800">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">
                Pareja lista para registrar
              </span>
            </div>
            <p className="text-xs text-emerald-700 mt-1">
              Revise los datos y confirme el registro de la pareja
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 
