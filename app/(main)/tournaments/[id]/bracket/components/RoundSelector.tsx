'use client'

import React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Trophy, Users, CheckCircle } from 'lucide-react'

export type Round = '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL' | '16VOS' | '32VOS'

interface RoundInfo {
  round: Round
  displayName: string
  matches: number
  completed: number
  icon: React.ReactNode
}

interface RoundSelectorProps {
  selectedRound: Round | 'all'
  onRoundChange: (round: Round | 'all') => void
  availableRounds: Round[]
  roundStats?: Record<string, { total: number; completed: number }>
  className?: string
}

const ROUND_CONFIG: Record<Round, { displayName: string; icon: React.ReactNode }> = {
  '32VOS': { displayName: 'Treintaidosavos', icon: <Users className="h-3 w-3" /> },
  '16VOS': { displayName: 'Dieciseisavos', icon: <Users className="h-3 w-3" /> },
  '8VOS': { displayName: 'Octavos de Final', icon: <Users className="h-3 w-3" /> },
  '4TOS': { displayName: 'Cuartos de Final', icon: <Users className="h-3 w-3" /> },
  'SEMIFINAL': { displayName: 'Semifinales', icon: <Trophy className="h-3 w-3" /> },
  'FINAL': { displayName: 'Final', icon: <Trophy className="h-3 w-3" /> }
}

export default function RoundSelector({
  selectedRound,
  onRoundChange,
  availableRounds,
  roundStats,
  className = ''
}: RoundSelectorProps) {

  // Construir información de rounds con estadísticas
  const roundsInfo: RoundInfo[] = availableRounds.map(round => {
    const config = ROUND_CONFIG[round]
    const stats = roundStats?.[round] || { total: 0, completed: 0 }

    return {
      round,
      displayName: config.displayName,
      matches: stats.total,
      completed: stats.completed,
      icon: config.icon
    }
  })

  // Ordenar rounds en orden lógico
  const orderedRounds = roundsInfo.sort((a, b) => {
    const order: Round[] = ['32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']
    return order.indexOf(a.round) - order.indexOf(b.round)
  })

  return (
    <div className={`flex items-center gap-4 ${className}`}>

      {/* Label */}
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-slate-600" />
        <span className="text-sm font-medium text-slate-700">Ronda:</span>
      </div>

      {/* Selector */}
      <Select
        value={selectedRound}
        onValueChange={(value) => onRoundChange(value as Round | 'all')}
      >
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Seleccionar ronda" />
        </SelectTrigger>
        <SelectContent>

          {/* Opción "Todas" */}
          <SelectItem value="all">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center">
                <Users className="h-3 w-3 text-slate-600" />
              </div>
              <span className="font-medium">Todas las Rondas</span>
              {roundStats && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {Object.values(roundStats).reduce((acc, stats) => acc + stats.total, 0)} matches
                </Badge>
              )}
            </div>
          </SelectItem>

          {/* Separador */}
          <div className="border-t my-2" />

          {/* Rounds individuales */}
          {orderedRounds.map((roundInfo) => {
            const isCompleted = roundInfo.completed === roundInfo.matches && roundInfo.matches > 0
            const hasMatches = roundInfo.matches > 0

            return (
              <SelectItem key={roundInfo.round} value={roundInfo.round}>
                <div className="flex items-center gap-3 w-full">

                  {/* Icono */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    isCompleted
                      ? 'bg-green-100 text-green-600'
                      : hasMatches
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-slate-100 text-slate-400'
                  }`}>
                    {isCompleted ? <CheckCircle className="h-3 w-3" /> : roundInfo.icon}
                  </div>

                  {/* Nombre */}
                  <div className="flex-1">
                    <span className="font-medium">{roundInfo.displayName}</span>
                  </div>

                  {/* Estadísticas */}
                  <div className="flex items-center gap-2">
                    {hasMatches ? (
                      <>
                        <Badge
                          variant={isCompleted ? "default" : "secondary"}
                          className={`text-xs ${
                            isCompleted
                              ? 'bg-green-600 text-white'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {roundInfo.completed}/{roundInfo.matches}
                        </Badge>
                        {isCompleted && (
                          <CheckCircle className="h-3 w-3 text-green-600" />
                        )}
                      </>
                    ) : (
                      <Badge variant="outline" className="text-xs text-slate-400">
                        No iniciada
                      </Badge>
                    )}
                  </div>
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>

      {/* Indicador de ronda actual */}
      {selectedRound !== 'all' && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-surface px-3 py-1">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          <span className="text-sm text-blue-800 font-medium">
            {ROUND_CONFIG[selectedRound as Round]?.displayName || selectedRound}
          </span>
          {roundStats?.[selectedRound] && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
              {roundStats[selectedRound].completed}/{roundStats[selectedRound].total}
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}