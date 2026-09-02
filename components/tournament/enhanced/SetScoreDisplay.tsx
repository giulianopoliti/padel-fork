'use client'

import React, { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Trophy, Clock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SetData {
  id: string
  set_number: number
  couple1_games: number
  couple2_games: number
  winner_couple_id: string
  status: string
  duration_minutes?: number
}

interface SetScoreDisplayProps {
  matchId: string
  couplePosition?: 'couple1' | 'couple2' | 'both'
  layout?: 'inline' | 'stacked' | 'compact'
  showProgress?: boolean
  showDuration?: boolean
  className?: string
}

const layoutConfig = {
  inline: 'flex gap-1',
  stacked: 'flex flex-col gap-1',
  compact: 'flex gap-0.5'
}

export default function SetScoreDisplay({
  matchId,
  couplePosition = 'both',
  layout = 'inline',
  showProgress = false,
  showDuration = false,
  className
}: SetScoreDisplayProps) {
  const [sets, setSets] = useState<SetData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSets = async () => {
      try {
        const response = await fetch(`/api/matches/${matchId}/sets`)
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setSets(data.sets || [])
          } else {
            setError(data.error)
          }
        } else {
          setError(`HTTP ${response.status}`)
        }
      } catch (err) {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }

    if (matchId) {
      fetchSets()
    }
  }, [matchId])

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        <span className="text-xs text-slate-400">Cargando sets...</span>
      </div>
    )
  }

  if (error || sets.length === 0) {
    return null
  }

  // Sort sets by set_number
  const sortedSets = sets.sort((a, b) => a.set_number - b.set_number)

  // Calculate match statistics
  const totalSets = sortedSets.length
  const couple1Sets = sortedSets.filter(set => set.winner_couple_id === set.couple1_games > set.couple2_games ? 'couple1' : null).length
  const couple2Sets = totalSets - couple1Sets
  const totalDuration = sortedSets.reduce((acc, set) => acc + (set.duration_minutes || 0), 0)

  const renderSetScore = (set: SetData, index: number) => {
    const isSetWinner1 = set.couple1_games > set.couple2_games
    const isSetWinner2 = set.couple2_games > set.couple1_games
    const isTieBreak = set.couple1_games >= 6 && set.couple2_games >= 6

    return (
      <TooltipProvider key={set.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              'bg-white border rounded-surface px-2 text-center transition-all duration-200 hover:shadow-md flex flex-col',
              isTieBreak
                ? 'border-orange-300 bg-orange-50'
                : 'border-slate-200 hover:border-slate-300'
            )}>
              {/* Set number indicator - now with reserved space */}
              <div className="flex justify-center mb-1">
                <Badge
                  variant="outline"
                  className={cn(
                    'h-4 px-1 text-xs',
                    isTieBreak
                      ? 'border-orange-400 text-orange-700 bg-orange-50'
                      : 'border-slate-300 text-slate-600 bg-white'
                  )}
                >
                  S{set.set_number}
                </Badge>
              </div>

              {/* Score display */}
              <div className="font-mono font-semibold text-sm py-1">
                {couplePosition === 'both' ? (
                  <div className="space-y-0.5">
                    <div className={cn(
                      isSetWinner1 ? 'text-green-700' : 'text-slate-600'
                    )}>
                      {set.couple1_games}
                    </div>
                    <Separator className="my-0.5" />
                    <div className={cn(
                      isSetWinner2 ? 'text-green-700' : 'text-slate-600'
                    )}>
                      {set.couple2_games}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center">
                    <span className={cn(
                      (couplePosition === 'couple1' && isSetWinner1) ||
                      (couplePosition === 'couple2' && isSetWinner2)
                        ? 'text-green-700 font-bold'
                        : 'text-slate-600'
                    )}>
                      {couplePosition === 'couple1' ? set.couple1_games : set.couple2_games}
                    </span>
                  </div>
                )}
              </div>

              {/* Winner indicator - now with reserved space */}
              <div className="flex justify-center mt-1">
                {(isSetWinner1 || isSetWinner2) ? (
                  <div className="bg-green-500 rounded-full p-0.5">
                    <Trophy className="h-2 w-2 text-white" />
                  </div>
                ) : (
                  <div className="h-3 w-3" /> // Reservar espacio para mantener alineación
                )}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="font-semibold">Set {set.set_number}</p>
              <p className="text-xs">
                {set.couple1_games} - {set.couple2_games}
                {isTieBreak && ' (Tie-break)'}
              </p>
              {set.duration_minutes && (
                <p className="text-xs opacity-80 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {set.duration_minutes} min
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Sets display */}
      <div className={layoutConfig[layout]}>
        {sortedSets.map(renderSetScore)}
      </div>

      {/* Match progress (optional) */}
      {showProgress && couplePosition === 'both' && (
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs text-slate-600">
            <span>Sets ganados</span>
            <span>{couple1Sets} - {couple2Sets}</span>
          </div>
          <Progress
            value={(couple1Sets / Math.max(couple1Sets + couple2Sets, 1)) * 100}
            className="h-1"
          />
        </div>
      )}

      {/* Duration info (optional) */}
      {showDuration && totalDuration > 0 && (
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Clock className="h-3 w-3" />
          <span>{totalDuration} min total</span>
        </div>
      )}
    </div>
  )
}