"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { Loader2, AlertCircle, Zap, Trophy } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { NewMatchCard } from './NewMatchCard'

// ============================================================================
// TYPES
// ============================================================================

interface BracketMatch {
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
}

interface MatchHierarchy {
  parent_match_id: string
  child_match_id: string
  parent_slot: number
  parent_round: string
  child_round: string
}

interface MatchPoints {
  points_winner: number
  points_loser: number
}

interface SetMatch {
  set_number: number
  couple1_games: number
  couple2_games: number
  winner_couple_id: string
}

export interface UnifiedReadOnlyBracketVisualizationProps {
  tournamentId: string
  tournamentType: 'AMERICAN' | 'LONG'
  tournamentStatus?: string
  isPublicView?: boolean
  userRole?: 'PLAYER' | 'CLUB' | 'COACH' | 'ADMIN' | null
  emphasizePoints?: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ROUND_ORDER = ['32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']
const ROUND_TRANSLATIONS = {
  '32VOS': '32vos de Final',
  '16VOS': '16vos de Final',
  '8VOS': 'Octavos de Final',
  '4TOS': 'Cuartos de Final',
  'SEMIFINAL': 'Semifinales',
  'FINAL': 'Final'
}

// ============================================================================
// CUSTOM HOOK - FETCH MATCHES WITH POINTS
// ============================================================================

function useMatchesWithPoints(tournamentId: string, tournamentType: 'AMERICAN' | 'LONG') {
  const [matches, setMatches] = useState<BracketMatch[]>([])
  const [hierarchy, setHierarchy] = useState<MatchHierarchy[]>([])
  const [pointsData, setPointsData] = useState<Record<string, MatchPoints>>({})
  const [setsData, setSetsData] = useState<Record<string, SetMatch[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasPoints, setHasPoints] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        // Fetch matches, hierarchy, and tournament info in parallel
        const [matchesRes, hierarchyRes] = await Promise.all([
          fetch(`/api/tournaments/${tournamentId}/matches`),
          fetch(`/api/tournaments/${tournamentId}/match-hierarchy`).catch(() => null)
        ])

        // Process matches
        if (!matchesRes.ok) throw new Error('Error fetching matches')
        const matchesData = await matchesRes.json()
        const bracketMatches = matchesData.matches?.filter((m: BracketMatch) =>
          m.round !== 'ZONE' && ROUND_ORDER.includes(m.round)
        ) || []
        setMatches(bracketMatches)

        // Process hierarchy (optional)
        if (hierarchyRes?.ok) {
          const hierarchyData = await hierarchyRes.json()
          setHierarchy(hierarchyData.hierarchy || [])
        }

        // Try to fetch points (without failing if they don't exist)
        try {
          const pointsRes = await fetch(`/api/tournaments/${tournamentId}/match-points`)
          if (pointsRes.ok) {
            const pointsData = await pointsRes.json()
            if (pointsData.points && Object.keys(pointsData.points).length > 0) {
              setPointsData(pointsData.points)
              setHasPoints(true)
            }
          }
        } catch (pointsError) {
          console.log('No points data available (legacy tournament)')
          setHasPoints(false)
        }

        // ✅ ALWAYS fetch sets (works for both AMERICAN and LONG tournaments)
        // For AMERICAN: endpoint returns empty object
        // For LONG: endpoint returns detailed set_matches data
        console.log('🔍 [UnifiedReadOnly] Fetching sets...')

        try {
          const setsRes = await fetch(`/api/tournaments/${tournamentId}/set-matches`)
          console.log('🔍 [UnifiedReadOnly] Sets API response status:', setsRes.status)

          if (setsRes.ok) {
            const setsData = await setsRes.json()
            console.log('🔍 [UnifiedReadOnly] Sets data received:', setsData)

            if (setsData.sets && Object.keys(setsData.sets).length > 0) {
              console.log('✅ [UnifiedReadOnly] Sets loaded successfully:', {
                matchesWithSets: Object.keys(setsData.sets).length,
                sampleSet: Object.values(setsData.sets)[0]
              })
              setSetsData(setsData.sets)
            } else {
              console.log('ℹ️ [UnifiedReadOnly] No sets available (empty response)')
            }
          } else {
            console.warn('⚠️ [UnifiedReadOnly] Sets API failed with status:', setsRes.status)
          }
        } catch (setsError) {
          console.warn('⚠️ [UnifiedReadOnly] Error fetching sets:', setsError)
        }

        // DEBUGGING: Log matches con result_couple1/2
        console.log('🔍 [UnifiedReadOnly] Sample matches with results:',
          bracketMatches.slice(0, 2).map((m: any) => ({
            id: m.id,
            round: m.round,
            status: m.status,
            result_couple1: m.result_couple1,
            result_couple2: m.result_couple2
          }))
        )

      } catch (err) {
        console.error('Error fetching bracket data:', err)
        setError(err instanceof Error ? err.message : 'Error loading bracket')
      } finally {
        setLoading(false)
      }
    }

    if (tournamentId) {
      fetchData()
    }
  }, [tournamentId, tournamentType])

  return { matches, hierarchy, pointsData, setsData, hasPoints, loading, error }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function UnifiedReadOnlyBracketVisualization({
  tournamentId,
  tournamentType,
  tournamentStatus = "UNKNOWN",
  isPublicView = false,
  userRole = null,
  emphasizePoints = false
}: UnifiedReadOnlyBracketVisualizationProps) {

  // ✅ Validación defensiva: Detectar si el usuario está autenticado
  const isAuthenticated = userRole !== null && userRole !== undefined
  const canShowPlayerLinks = isAuthenticated

  console.log('🔍 [UnifiedReadOnlyBracket] Auth status:', {
    tournamentType,
    isPublicView,
    userRole,
    isAuthenticated,
    canShowPlayerLinks
  })

  const { matches, hierarchy, pointsData, setsData, hasPoints, loading, error } = useMatchesWithPoints(tournamentId, tournamentType)

  // Organize matches by round with hierarchy
  const bracketLayout = useMemo(() => {
    if (!matches.length) return {}

    // Detect existing rounds
    const existingRounds = ROUND_ORDER.filter(round =>
      matches.some(match => match.round === round)
    )

    // Group matches by round
    const matchesByRound = existingRounds.reduce((acc, round) => {
      acc[round] = matches.filter(match => match.round === round)
      return acc
    }, {} as Record<string, BracketMatch[]>)

    // Apply order: hierarchy if exists, otherwise basic order
    existingRounds.forEach(round => {
      const roundMatches = matchesByRound[round]

      if (hierarchy.length > 0) {
        // Sort by parent_slot if hierarchy exists
        const hierarchyMap = new Map<string, number>()
        hierarchy.forEach(h => {
          if (h.parent_round === round) {
            hierarchyMap.set(h.parent_match_id, h.parent_slot)
          }
        })

        roundMatches.sort((a, b) => {
          const slotA = hierarchyMap.get(a.id) || 999
          const slotB = hierarchyMap.get(b.id) || 999
          return slotA - slotB
        })
      } else {
        // Fallback: sort by 'order' or 'order_in_round'
        roundMatches.sort((a, b) => {
          const orderA = (a as any).order || (a as any).order_in_round || 0
          const orderB = (b as any).order || (b as any).order_in_round || 0
          return orderA - orderB
        })
      }
    })

    return { rounds: existingRounds, matchesByRound }
  }, [matches, hierarchy])

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
        <span className="text-slate-600">Cargando bracket...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800">
          <strong>Error:</strong> {error}
        </AlertDescription>
      </Alert>
    )
  }

  // Empty state
  if (!matches.length) {
    return (
      <div className="text-center py-16">
        <Trophy className="h-16 w-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-700 mb-2">No hay bracket disponible</h3>
        <p className="text-slate-500">Este torneo no tiene partidos eliminatorios generados.</p>
      </div>
    )
  }

  const { rounds, matchesByRound } = bracketLayout

  return (
    <div className="space-y-6">
      {/* Header informativo (solo para vista pública) */}
      {isPublicView && (
        <div className="bg-gradient-to-r from-slate-700 to-slate-600 text-white rounded-surface p-6 shadow-md">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Trophy className="h-6 w-6" />
            <h2 className="text-xl font-bold">Bracket del Torneo</h2>
          </div>
          <p className="text-center text-slate-200 text-sm">
            {tournamentType === 'LONG' ? 'Torneo Largo' : 'Torneo Americano'} • Vista Pública
          </p>
        </div>
      )}

      {/* Layout responsivo del bracket - SIN DOBLE SCROLL */}
      <div className="w-full">
        {/* Mobile: Stack vertical de rondas */}
        <div className="lg:hidden space-y-8">
          {rounds?.map((round) => {
            const roundMatches = matchesByRound?.[round] || []
            return (
              <div key={round} className="w-full">
                {/* Header de la ronda - Badge flotante */}
                <div className="flex justify-center mb-4">
                  <Badge variant="outline" className="text-sm font-medium text-slate-700 border-slate-300 px-3 py-1">
                    {ROUND_TRANSLATIONS[round as keyof typeof ROUND_TRANSLATIONS] || round} · {roundMatches.length} {roundMatches.length === 1 ? 'partido' : 'partidos'}
                  </Badge>
                </div>
                {/* Cards de los partidos */}
                <div className="space-y-4 flex flex-col items-center">
                  {roundMatches.map((match) => {
                    const matchSets = setsData[match.id]
                    console.log('🔍 [UnifiedReadOnly] Rendering card:', {
                      matchId: match.id,
                      round: match.round,
                      hasSets: !!matchSets,
                      setsCount: matchSets?.length || 0,
                      sets: matchSets
                    })

                    return (
                      <NewMatchCard
                        key={match.id}
                        match={match}
                        points={pointsData[match.id]}
                        sets={matchSets}
                        tournamentType={tournamentType}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Desktop: Grid horizontal sin scroll interno */}
        <div className="hidden lg:grid gap-8 auto-cols-fr grid-flow-col justify-start">
          {rounds?.map((round) => {
            const roundMatches = matchesByRound?.[round] || []
            return (
              <div key={round} className="min-w-[320px]">
                {/* Header de la ronda - Badge flotante */}
                <div className="flex justify-center mb-4">
                  <Badge variant="outline" className="text-sm font-medium text-slate-700 border-slate-300 px-3 py-1">
                    {ROUND_TRANSLATIONS[round as keyof typeof ROUND_TRANSLATIONS] || round} · {roundMatches.length} {roundMatches.length === 1 ? 'partido' : 'partidos'}
                  </Badge>
                </div>
                {/* Cards de los partidos */}
                <div className="space-y-6 flex flex-col items-center">
                  {roundMatches.map((match) => {
                    const matchSets = setsData[match.id]
                    console.log('🔍 [UnifiedReadOnly] Rendering card (desktop):', {
                      matchId: match.id,
                      round: match.round,
                      hasSets: !!matchSets,
                      setsCount: matchSets?.length || 0
                    })

                    return (
                      <NewMatchCard
                        key={match.id}
                        match={match}
                        points={pointsData[match.id]}
                        sets={matchSets}
                        tournamentType={tournamentType}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer informativo con diseño moderno */}
      <div className="mt-12 pt-6 border-t-2 border-slate-200">
        <div className="bg-gradient-to-r from-slate-50 via-blue-50 to-slate-50 rounded-elevated p-6 text-center">
          {hasPoints ? (
            <div className="flex items-center justify-center gap-3 text-slate-700">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div className="text-left">
                <p className="font-bold text-lg text-slate-900">Sistema de Puntos Activado</p>
                <p className="text-sm text-slate-600">Incluye detección automática de BATACAZO</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 text-slate-600">
              <Trophy className="h-8 w-8 text-blue-600" />
              <span className="text-lg font-medium">Bracket Tradicional</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
