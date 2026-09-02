'use client'

import React from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Trophy,
  Clock,
  MapPin,
  Calendar,
  TrendingUp,
  ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import PlayerAvatar from './PlayerAvatar'
import SetScoreDisplay from './SetScoreDisplay'
import MatchStatusBadge, { getMatchStatus } from './MatchStatusBadge'

interface Match {
  id: string
  round: string
  status: string
  couple1_id: string | null
  couple2_id: string | null
  winner_id: string | null
  result_couple1: string | null
  result_couple2: string | null
  couple1_player1_name?: string
  couple1_player2_name?: string
  couple2_player1_name?: string
  couple2_player2_name?: string
  couple1?: { player1_id: string; player2_id: string }
  couple2?: { player1_id: string; player2_id: string }
  zone_name?: string
  court?: string
  fecha_matches?: Array<{
    scheduled_date?: string
    scheduled_start_time?: string
    court_assignment?: string
  }>
}

interface EnhancedMatchCardProps {
  match: Match
  tournamentType?: 'AMERICAN' | 'LONG'
  layout?: 'compact' | 'standard' | 'detailed'
  showCourt?: boolean
  showSchedule?: boolean
  getCouplePoints?: (coupleId: string) => number | undefined
  className?: string
}

const layoutConfig = {
  compact: {
    card: 'min-h-[100px]',
    header: 'pb-2 px-4 pt-3',
    content: 'pt-2 pb-3 px-4',
    coupleSpacing: 'gap-2',
    showAvatars: false
  },
  standard: {
    card: 'min-h-[140px]',
    header: 'pb-3 px-5 pt-4',
    content: 'pt-3 pb-4 px-5',
    coupleSpacing: 'gap-3',
    showAvatars: true
  },
  detailed: {
    card: 'min-h-[180px]',
    header: 'pb-4 px-6 pt-5',
    content: 'pt-4 pb-5 px-6',
    coupleSpacing: 'gap-4',
    showAvatars: true
  }
}

const roundTranslations: Record<string, string> = {
  '32VOS': '32vos',
  '16VOS': '16vos',
  '8VOS': 'Octavos',
  '4TOS': 'Cuartos',
  'SEMIFINAL': 'Semis',
  'FINAL': 'Final',
  'ZONE': 'Zona'
}

export default function EnhancedMatchCard({
  match,
  tournamentType = 'LONG',
  layout = 'standard',
  showCourt = true,
  showSchedule = true,
  getCouplePoints,
  className
}: EnhancedMatchCardProps) {
  const config = layoutConfig[layout]
  const isFinished = match.status === 'FINISHED'
  const isWinner1 = match.winner_id === match.couple1_id
  const isWinner2 = match.winner_id === match.couple2_id
  const matchStatus = getMatchStatus(match)

  // Player names
  const couple1Names = match.couple1_player1_name && match.couple1_player2_name
    ? `${match.couple1_player1_name} / ${match.couple1_player2_name}`
    : 'Por determinar'

  const couple2Names = match.couple2_player1_name && match.couple2_player2_name
    ? `${match.couple2_player1_name} / ${match.couple2_player2_name}`
    : 'Por determinar'

  // Schedule info
  const scheduleInfo = match.fecha_matches?.[0]
  const hasSchedule = scheduleInfo?.scheduled_date

  // Zone or round label
  const zoneOrRoundLabel = match.zone_name
    ? `Zona ${match.zone_name.replace(/^Zone\s+/i, '').trim()}`
    : roundTranslations[match.round] || match.round

  // Points - total accumulated
  const couple1TotalPoints = getCouplePoints ? getCouplePoints(match.couple1_id || '') : undefined
  const couple2TotalPoints = getCouplePoints ? getCouplePoints(match.couple2_id || '') : undefined

  // Points earned in THIS match (for AMERICAN tournaments)
  const couple1MatchPoints = isFinished && tournamentType === 'AMERICAN' && match.result_couple1
    ? parseInt(match.result_couple1)
    : null

  const couple2MatchPoints = isFinished && tournamentType === 'AMERICAN' && match.result_couple2
    ? parseInt(match.result_couple2)
    : null

  // Accessibility label
  const ariaLabel = `${zoneOrRoundLabel}: ${couple1Names} contra ${couple2Names}. Estado: ${matchStatus}${isFinished && match.winner_id ? `. Ganadores: ${isWinner1 ? couple1Names : couple2Names}` : ''}`

  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all duration-300',
        'border border-blue-200/50 bg-white/60 backdrop-blur-sm',
        'hover:shadow-2xl hover:border-blue-300/60',
        'rounded-surface',
        config.card,
        className
      )}
      role="article"
      aria-label={ariaLabel}
    >
      {/* Glassmorphism overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-slate-50/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Shimmer effect on hover */}
      <div className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-blue-400/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />

      {/* Winner accent border */}
      {isFinished && match.winner_id && (
        <div className={cn(
          'absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-600 to-blue-700',
          'shadow-sm'
        )} />
      )}

      <CardHeader className={cn('relative', config.header)}>
        <div className="flex items-center justify-between">
          {/* Round/Zone badge */}
          <Badge
            variant="outline"
            className="bg-blue-800 text-white border-blue-700 hover:bg-blue-700 transition-colors text-xs font-semibold"
          >
            {zoneOrRoundLabel}
          </Badge>

          {/* Status badge */}
          <MatchStatusBadge
            status={matchStatus}
            size={layout === 'compact' ? 'sm' : 'md'}
            animated={true}
          />
        </div>

        {/* Schedule and court info */}
        {layout !== 'compact' && (hasSchedule || match.court) && (showSchedule || showCourt) && (
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
            {hasSchedule && showSchedule && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>
                  {(() => {
                    // Fix timezone issue: parse date components directly to avoid UTC interpretation
                    const [year, month, day] = scheduleInfo.scheduled_date.split('T')[0].split('-').map(Number)
                    const date = new Date(year, month - 1, day)
                    return date.toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'short'
                    })
                  })()}
                  {scheduleInfo.scheduled_start_time && (
                    <span className="ml-1">{scheduleInfo.scheduled_start_time}</span>
                  )}
                </span>
              </div>
            )}

            {(match.court || scheduleInfo?.court_assignment) && showCourt && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span>Cancha {match.court || scheduleInfo?.court_assignment}</span>
              </div>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className={cn('relative', config.content)}>
        <div className={cn('flex flex-col', config.coupleSpacing)} role="group" aria-label="Parejas del partido">
          {/* Couple 1 */}
          <div
            className={cn(
              'relative flex items-center justify-between py-2 px-3 rounded-surface transition-all duration-200',
              isWinner1
                ? 'bg-blue-50/80 border-l-4 border-l-blue-600'
                : 'bg-slate-50/80 hover:bg-slate-100/80'
            )}
            role="group"
            aria-label={`Pareja 1: ${couple1Names}${isWinner1 ? ' - Ganadores' : ''}`}
          >
            {/* Left: Winner indicator + Names */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Winner trophy icon */}
              {isWinner1 && (
                <div className="flex-shrink-0">
                  <div className="bg-blue-600 rounded-full p-1">
                    <Trophy className="h-3 w-3 text-white" />
                  </div>
                </div>
              )}

              {/* Player names */}
              <div className="flex-1 min-w-0">
                {config.showAvatars && couple1Names.includes(' / ') ? (
                  <div className="space-y-1">
                    <PlayerAvatar
                      playerId={match.couple1?.player1_id}
                      playerName={couple1Names.split(' / ')[0]}
                      isWinner={isWinner1}
                      size={layout === 'detailed' ? 'md' : 'sm'}
                      showTooltip={layout === 'detailed'}
                    />
                    <PlayerAvatar
                      playerId={match.couple1?.player2_id}
                      playerName={couple1Names.split(' / ')[1]}
                      isWinner={isWinner1}
                      size={layout === 'detailed' ? 'md' : 'sm'}
                      showTooltip={layout === 'detailed'}
                    />
                  </div>
                ) : (
                  <div className={cn(
                    'truncate transition-colors text-sm',
                    isWinner1 ? 'font-semibold text-blue-900' : 'text-slate-700'
                  )}>
                    {couple1Names}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Score/Result */}
            <div className="flex-shrink-0 ml-3">
              {isFinished && tournamentType === 'LONG' && (
                <SetScoreDisplay
                  matchId={match.id}
                  couplePosition="couple1"
                  layout="compact"
                />
              )}
              {isFinished && tournamentType === 'AMERICAN' && couple1MatchPoints !== null && (
                <Badge
                  className={cn(
                    'font-mono font-bold text-sm',
                    isWinner1
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-300 text-slate-700'
                  )}
                >
                  {couple1MatchPoints}
                </Badge>
              )}
              {tournamentType === 'AMERICAN' && couple1TotalPoints !== undefined && !isFinished && (
                <Badge variant="outline" className="text-xs text-slate-600 border-slate-300">
                  {couple1TotalPoints} pts
                </Badge>
              )}
            </div>
          </div>

          {/* Couple 2 */}
          <div
            className={cn(
              'relative flex items-center justify-between py-2 px-3 rounded-surface transition-all duration-200',
              isWinner2
                ? 'bg-blue-50/80 border-l-4 border-l-blue-600'
                : 'bg-slate-50/80 hover:bg-slate-100/80'
            )}
            role="group"
            aria-label={`Pareja 2: ${couple2Names}${isWinner2 ? ' - Ganadores' : ''}`}
          >
            {/* Left: Winner indicator + Names */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Winner trophy icon */}
              {isWinner2 && (
                <div className="flex-shrink-0">
                  <div className="bg-blue-600 rounded-full p-1">
                    <Trophy className="h-3 w-3 text-white" />
                  </div>
                </div>
              )}

              {/* Player names */}
              <div className="flex-1 min-w-0">
                {config.showAvatars && couple2Names.includes(' / ') ? (
                  <div className="space-y-1">
                    <PlayerAvatar
                      playerId={match.couple2?.player1_id}
                      playerName={couple2Names.split(' / ')[0]}
                      isWinner={isWinner2}
                      size={layout === 'detailed' ? 'md' : 'sm'}
                      showTooltip={layout === 'detailed'}
                    />
                    <PlayerAvatar
                      playerId={match.couple2?.player2_id}
                      playerName={couple2Names.split(' / ')[1]}
                      isWinner={isWinner2}
                      size={layout === 'detailed' ? 'md' : 'sm'}
                      showTooltip={layout === 'detailed'}
                    />
                  </div>
                ) : (
                  <div className={cn(
                    'truncate transition-colors text-sm',
                    isWinner2 ? 'font-semibold text-blue-900' : 'text-slate-700'
                  )}>
                    {couple2Names}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Score/Result */}
            <div className="flex-shrink-0 ml-3">
              {isFinished && tournamentType === 'LONG' && (
                <SetScoreDisplay
                  matchId={match.id}
                  couplePosition="couple2"
                  layout="compact"
                />
              )}
              {isFinished && tournamentType === 'AMERICAN' && couple2MatchPoints !== null && (
                <Badge
                  className={cn(
                    'font-mono font-bold text-sm',
                    isWinner2
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-300 text-slate-700'
                  )}
                >
                  {couple2MatchPoints}
                </Badge>
              )}
              {tournamentType === 'AMERICAN' && couple2TotalPoints !== undefined && !isFinished && (
                <Badge variant="outline" className="text-xs text-slate-600 border-slate-300">
                  {couple2TotalPoints} pts
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Match Points Summary - Only show for AMERICAN after match finishes */}
        {isFinished && tournamentType === 'AMERICAN' && (couple1MatchPoints !== null || couple2MatchPoints !== null) && (
          <div className="mt-3 pt-3 border-t border-blue-100">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3 w-3 text-blue-500" />
                <span className="text-blue-800 font-medium">Puntos ganados en este partido:</span>
              </div>
              <div className="flex items-center gap-4">
                {couple1MatchPoints !== null && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={cn(
                          'flex items-center gap-1 font-mono',
                          isWinner1 ? 'text-blue-700 font-bold' : 'text-slate-600'
                        )}>
                          <ChevronRight className="h-3 w-3" />
                          <span>+{couple1MatchPoints}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{couple1Names}: +{couple1MatchPoints} pts</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {couple2MatchPoints !== null && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={cn(
                          'flex items-center gap-1 font-mono',
                          isWinner2 ? 'text-blue-700 font-bold' : 'text-slate-600'
                        )}>
                          <ChevronRight className="h-3 w-3" />
                          <span>+{couple2MatchPoints}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{couple2Names}: +{couple2MatchPoints} pts</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Detailed sets view for LONG tournaments */}
        {isFinished && tournamentType === 'LONG' && layout === 'detailed' && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <SetScoreDisplay
              matchId={match.id}
              couplePosition="both"
              layout="stacked"
              showProgress={true}
              showDuration={true}
            />
          </div>
        )}
      </CardContent>

      {/* Subtle corner indicator on hover */}
      <div className="absolute top-0 right-0 w-0 h-0 border-l-[16px] border-b-[16px] border-l-transparent border-b-blue-100 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
    </Card>
  )
}
