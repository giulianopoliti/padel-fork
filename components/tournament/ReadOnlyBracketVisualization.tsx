"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { 
  Loader2, 
  Trophy, 
  Users, 
  Eye, 
  Zap,
  AlertTriangle
} from "lucide-react"
import { fetchTournamentMatches, getMatchPoints } from "@/app/api/tournaments/actions"
import MatchStatusBadge from "./match-status-badge"
import PointsCircle from "./match-points/PointsCircle"
import BatacazoBadge from "./match-points/BatacazoBadge"
import { Database } from "@/database.types"
import { MatchPointsCouple } from "@/types"
import Link from "next/link"
import { cn } from "@/lib/utils"

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type MatchStatus = Database["public"]["Enums"]["match_status"]

interface ReadOnlyBracketVisualizationProps {
  tournamentId: string
  className?: string
  showRoundHeaders?: boolean
  compactMode?: boolean
  tournamentStatus?: string
  emphasizePoints?: boolean // When true, points are more prominent
}

interface BracketMatchV2 {
  id: string
  round: string
  status: MatchStatus
  couple1_id?: string | null
  couple2_id?: string | null
  couple1_player1_name?: string
  couple1_player2_name?: string
  couple2_player1_name?: string
  couple2_player2_name?: string
  result_couple1?: string | null
  result_couple2?: string | null
  winner_id?: string | null
  court?: string | null
  order?: number
  couple1?: {
    id: string
    player1_id: string
    player2_id: string
  }
  couple2?: {
    id: string
    player1_id: string
    player2_id: string
  }
}

interface RoundGroup {
  round: string
  matches: BracketMatchV2[]
  displayName: string
  totalMatches: number
  completedMatches: number
  canPlay: number
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const PlayerName = ({ playerId, playerName }: { playerId?: string; playerName?: string }) => {
  if (!playerId || !playerName) {
    return <span className="text-slate-500">Por determinar</span>
  }
  
  return (
    <Link 
      href={`/ranking/${playerId}`} 
      className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
    >
      {playerName}
    </Link>
  )
}

const CoupleDisplay = ({ 
  couple, 
  playerNames, 
  points,
  isWinner = false,
  emphasizePoints = false
}: { 
  couple?: { player1_id: string; player2_id: string };
  playerNames: string;
  points?: number;
  isWinner?: boolean;
  emphasizePoints?: boolean;
}) => {
  if (!couple?.player1_id || !couple?.player2_id) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-slate-900">{playerNames}</span>
        {points !== undefined && (
          <>
            <PointsCircle 
              points={points} 
              isWinner={isWinner} 
              size={emphasizePoints ? "md" : "sm"} 
            />
            {isWinner && points > 18 && (
              <BatacazoBadge 
                points={points} 
                size={emphasizePoints ? "md" : "sm"} 
              />
            )}
          </>
        )}
      </div>
    )
  }

  const [player1Name, player2Name] = playerNames.split(' / ')
  
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-medium">
        <PlayerName playerId={couple.player1_id} playerName={player1Name} />
        <span className="text-slate-500"> / </span>
        <PlayerName playerId={couple.player2_id} playerName={player2Name} />
      </span>
      {points !== undefined && (
        <>
          <PointsCircle 
            points={points} 
            isWinner={isWinner} 
            size={emphasizePoints ? "md" : "sm"} 
          />
          {isWinner && points > 18 && (
            <BatacazoBadge 
              points={points} 
              size={emphasizePoints ? "md" : "sm"} 
            />
          )}
        </>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ReadOnlyBracketVisualization({
  tournamentId,
  className,
  showRoundHeaders = true,
  compactMode = false,
  tournamentStatus,
  emphasizePoints
}: ReadOnlyBracketVisualizationProps) {
  // State management
  const [isLoading, setIsLoading] = useState(true)
  const [matches, setMatches] = useState<BracketMatchV2[]>([])
  const [matchPoints, setMatchPoints] = useState<Record<string, MatchPointsCouple>>({})
  const [error, setError] = useState<string | null>(null)
  const [selectedRound, setSelectedRound] = useState<string>('all')

  // Determine if we should emphasize points
  const shouldEmphasizePoints = emphasizePoints || tournamentStatus === 'FINISHED_POINTS_CALCULATED'
  
  // Load bracket data
  useEffect(() => {
    const loadBracketData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Load matches and points in parallel
        const [matchesResult, pointsResult] = await Promise.all([
          fetchTournamentMatches(tournamentId),
          getMatchPoints(tournamentId, null)
        ])

        if (matchesResult.success && matchesResult.matches) {
          // Filter elimination matches only
          const eliminationMatches = matchesResult.matches
            .filter((match: any) => 
              match.type === "ELIMINATION" || (match.round && match.round !== "ZONE")
            )
            .filter((match: any) => {
              // Filter out BYE matches for cleaner display
              const hasBye = 
                match.couple1_id === null || 
                match.couple2_id === null || 
                match.couple1_id === "BYE_MARKER" || 
                match.couple2_id === "BYE_MARKER" ||
                !match.couple1_player1_name || 
                !match.couple1_player2_name ||
                !match.couple2_player1_name || 
                !match.couple2_player2_name ||
                match.couple1_player1_name.includes('BYE') ||
                match.couple1_player2_name.includes('BYE') ||
                match.couple2_player1_name.includes('BYE') ||
                match.couple2_player2_name.includes('BYE')
              
              return !hasBye
            })
            .map((match: any): BracketMatchV2 => ({
              id: match.id,
              round: match.round,
              status: match.status,
              couple1_id: match.couple1_id,
              couple2_id: match.couple2_id,
              couple1_player1_name: match.couple1_player1_name,
              couple1_player2_name: match.couple1_player2_name,
              couple2_player1_name: match.couple2_player1_name,
              couple2_player2_name: match.couple2_player2_name,
              result_couple1: match.result_couple1,
              result_couple2: match.result_couple2,
              winner_id: match.winner_id,
              court: match.court,
              order: match.order,
              couple1: match.couple1 ? {
                id: match.couple1.id,
                player1_id: match.couple1.player1_id,
                player2_id: match.couple1.player2_id,
              } : undefined,
              couple2: match.couple2 ? {
                id: match.couple2.id,
                player1_id: match.couple2.player1_id,
                player2_id: match.couple2.player2_id,
              } : undefined
            }))

          setMatches(eliminationMatches)
        } else {
          setError(matchesResult.error || "Error al cargar los partidos de bracket")
        }

        // Load points (optional - graceful handling if missing)
        if (pointsResult) {
          setMatchPoints(pointsResult)
        }
      } catch (err) {
        console.error("Error loading bracket data:", err)
        setError("Ocurrió un error inesperado al cargar el bracket")
      } finally {
        setIsLoading(false)
      }
    }

    loadBracketData()
  }, [tournamentId])

  // Group matches by round with statistics
  const roundGroups = useMemo(() => {
    const groups = new Map<string, BracketMatchV2[]>()
    
    matches.forEach(match => {
      if (!groups.has(match.round)) {
        groups.set(match.round, [])
      }
      groups.get(match.round)!.push(match)
    })

    // Round order and display names
    const roundOrder = ['8VOS', '4TOS', 'SEMIFINAL', 'FINAL', '16VOS', '32VOS']
    const roundDisplayNames: Record<string, string> = {
      '8VOS': 'Octavos de Final',
      '4TOS': 'Cuartos de Final', 
      'SEMIFINAL': 'Semifinales',
      'FINAL': 'Final',
      '16VOS': 'Dieciseisavos',
      '32VOS': 'Treintaidosavos'
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        const indexA = roundOrder.indexOf(a)
        const indexB = roundOrder.indexOf(b)
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
      })
      .map(([round, roundMatches]): RoundGroup => {
        const sortedMatches = roundMatches.sort((a, b) => (a.order || 0) - (b.order || 0))
        const completedMatches = sortedMatches.filter(m => m.status === 'FINISHED').length
        const canPlay = sortedMatches.filter(m => 
          m.couple1_id && m.couple2_id && m.status === 'PENDING'
        ).length

        return {
          round,
          matches: sortedMatches,
          displayName: roundDisplayNames[round] || round,
          totalMatches: sortedMatches.length,
          completedMatches,
          canPlay
        }
      })
  }, [matches])

  // Filter rounds based on selection
  const filteredRounds = useMemo(() => {
    if (selectedRound === 'all') return roundGroups
    return roundGroups.filter(group => group.round === selectedRound)
  }, [roundGroups, selectedRound])

  // Get points for a couple in a match
  const getCouplePoints = (match: BracketMatchV2, coupleId: string | null | undefined) => {
    if (!coupleId || !matchPoints[match.id] || match.status !== "FINISHED") return undefined
    
    const points = matchPoints[match.id]
    const isWinner = match.winner_id === coupleId
    return isWinner ? points.points_winner : points.points_loser
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2 className="h-8 w-8 text-slate-600 animate-spin" />
        <span className="ml-3 text-slate-500">Cargando bracket...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-surface border border-red-200 text-center">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
        <div className="font-semibold mb-1">Error al cargar bracket</div>
        <div className="text-sm">{error}</div>
      </div>
    )
  }

  // Empty state
  if (matches.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Trophy className="h-10 w-10 text-slate-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900 mb-2">No hay bracket disponible</h3>
        <p className="text-slate-500 max-w-md mx-auto">
          El bracket eliminatorio aún no ha sido generado o no hay partidos disponibles.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('bg-white rounded-surface', className)}>

      
      {/* Round Tabs */}
      <Tabs value={selectedRound} onValueChange={setSelectedRound} className="w-full">
        <div className="border-b border-gray-200 px-6 pt-6">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-5">
            <TabsTrigger value="all" className="text-xs">Todas</TabsTrigger>
            {roundGroups.slice(0, 4).map(group => (
              <TabsTrigger key={group.round} value={group.round} className="text-xs">
                {group.round === 'SEMIFINAL' ? 'Semi' : group.round}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="h-[calc(100vh-16rem)]">
          <div className="p-6 space-y-8">
            <TabsContent value="all" className="mt-0 space-y-8">
              {filteredRounds.map(group => (
                <RoundSection 
                  key={group.round} 
                  group={group} 
                  matchPoints={matchPoints}
                  getCouplePoints={getCouplePoints}
                  compactMode={compactMode}
                  showRoundHeaders={showRoundHeaders}
                  emphasizePoints={shouldEmphasizePoints}
                />
              ))}
            </TabsContent>

            {roundGroups.map(group => (
              <TabsContent key={group.round} value={group.round} className="mt-0">
                <RoundSection 
                  group={group} 
                  matchPoints={matchPoints}
                  getCouplePoints={getCouplePoints}
                  compactMode={compactMode}
                  showRoundHeaders={showRoundHeaders}
                  emphasizePoints={shouldEmphasizePoints}
                />
              </TabsContent>
            ))}
          </div>
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </Tabs>
    </div>
  )
}

// ============================================================================
// ROUND SECTION COMPONENT
// ============================================================================

function RoundSection({ 
  group, 
  matchPoints, 
  getCouplePoints, 
  compactMode,
  showRoundHeaders,
  emphasizePoints
}: {
  group: RoundGroup
  matchPoints: Record<string, MatchPointsCouple>
  getCouplePoints: (match: BracketMatchV2, coupleId: string | null | undefined) => number | undefined
  compactMode: boolean
  showRoundHeaders: boolean
  emphasizePoints: boolean
}) {
  return (
    <div className="space-y-4">
      {/* Round Header */}
      {showRoundHeaders && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className={cn(
              "font-semibold text-gray-900",
              compactMode ? "text-lg" : "text-xl"
            )}>
              {group.displayName}
            </h3>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {group.totalMatches} partidos
              </span>
              <span className="flex items-center gap-1">
                <Trophy className="h-4 w-4" />
                {group.completedMatches} finalizados
              </span>
              {group.canPlay > 0 && (
                <span className="flex items-center gap-1">
                  <Zap className="h-4 w-4" />
                  {group.canPlay} listos
                </span>
              )}
            </div>
          </div>
          
          {/* Progress Badge */}
          <Badge 
            variant={group.completedMatches === group.totalMatches ? "default" : "secondary"}
            className={cn(
              group.completedMatches === group.totalMatches && "bg-green-600"
            )}
          >
            {group.completedMatches}/{group.totalMatches}
          </Badge>
        </div>
      )}

      {/* Matches Grid */}
      <div className={cn(
        'grid gap-4',
        compactMode 
          ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' 
          : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
      )}>
        {group.matches.map((match) => (
          <MatchCard 
            key={match.id} 
            match={match} 
            getCouplePoints={getCouplePoints}
            compactMode={compactMode}
            emphasizePoints={emphasizePoints}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// MATCH CARD COMPONENT
// ============================================================================

function MatchCard({ 
  match, 
  getCouplePoints, 
  compactMode,
  emphasizePoints
}: {
  match: BracketMatchV2
  getCouplePoints: (match: BracketMatchV2, coupleId: string | null | undefined) => number | undefined
  compactMode: boolean
  emphasizePoints: boolean
}) {
  const isCompleted = match.status === "FINISHED"
  
  return (
    <Card className={cn(
      'hover:shadow-md transition-shadow border-gray-200',
      isCompleted && 'bg-green-50 border-green-200'
    )}>
      <CardContent className={cn('p-0', compactMode && 'text-sm')}>
        {/* Couple 1 */}
        <div className={cn(
          'px-4 py-3 border-b border-gray-100',
          isCompleted && match.winner_id === match.couple1_id && 'bg-green-100 border-l-4 border-green-500'
        )}>
          <div className="flex justify-between items-center gap-2">
            <div className="flex-1 min-w-0">
              <CoupleDisplay 
                couple={match.couple1}
                playerNames={`${match.couple1_player1_name || ''} / ${match.couple1_player2_name || ''}`}
                points={getCouplePoints(match, match.couple1_id)}
                isWinner={match.winner_id === match.couple1_id}
                emphasizePoints={emphasizePoints}
              />
            </div>
            {isCompleted && (
              <Badge variant="secondary" className="bg-slate-100 text-slate-900 font-bold">
                {match.result_couple1}
              </Badge>
            )}
          </div>
        </div>

        {/* Couple 2 */}
        <div className={cn(
          'px-4 py-3 border-b border-gray-100',
          isCompleted && match.winner_id === match.couple2_id && 'bg-green-100 border-l-4 border-green-500'
        )}>
          <div className="flex justify-between items-center gap-2">
            <div className="flex-1 min-w-0">
              <CoupleDisplay 
                couple={match.couple2}
                playerNames={`${match.couple2_player1_name || ''} / ${match.couple2_player2_name || ''}`}
                points={getCouplePoints(match, match.couple2_id)}
                isWinner={match.winner_id === match.couple2_id}
                emphasizePoints={emphasizePoints}
              />
            </div>
            {isCompleted && (
              <Badge variant="secondary" className="bg-slate-100 text-slate-900 font-bold">
                {match.result_couple2}
              </Badge>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-gray-50 flex justify-center items-center gap-2">
          <MatchStatusBadge status={match.status} />
          {match.court && (
            <Badge variant="outline" className="bg-white text-slate-700 border-slate-300 text-xs">
              Cancha {match.court}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}