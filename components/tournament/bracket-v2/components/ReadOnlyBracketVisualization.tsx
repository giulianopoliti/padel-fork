"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Loader2, AlertCircle, Zap, Trophy } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NewMatchCard } from './NewMatchCard'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import type { BracketKey } from '@/types/tournament-format-v2'
import { getBracketLabelByKey } from '@/lib/services/bracket-key-policy'

// Types
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

interface ReadOnlyBracketVisualizationProps {
  tournamentId: string
  tournamentStatus?: string
  tournamentType?: string
  tournamentFormatConfig?: unknown
}

// Utilidades
const ROUND_ORDER = ['32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']
const ROUND_TRANSLATIONS = {
  '32VOS': '32vos de Final',
  '16VOS': '16vos de Final', 
  '8VOS': 'Octavos de Final',
  '4TOS': 'Cuartos de Final',
  'SEMIFINAL': 'Semifinales',
  'FINAL': 'Final'
}

// Hook para obtener datos de partidos con puntos
function useMatchesWithPoints(
  tournamentId: string,
  bracketKey: BracketKey,
  initialTournamentType: 'AMERICAN' | 'LONG' = 'AMERICAN'
) {
  const [matches, setMatches] = useState<BracketMatch[]>([])
  const [hierarchy, setHierarchy] = useState<MatchHierarchy[]>([])
  const [pointsData, setPointsData] = useState<Record<string, MatchPoints>>({})
  const [setsData, setSetsData] = useState<Record<string, any[]>>({})
  const [tournamentType, setTournamentType] = useState<'AMERICAN' | 'LONG'>(initialTournamentType)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasPoints, setHasPoints] = useState(false)
  const requestSequenceRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestSequenceRef.current
    const abortController = new AbortController()
    const signal = abortController.signal

    const safelyApply = (callback: () => void) => {
      if (requestSequenceRef.current !== requestId || signal.aborted) return
      callback()
    }

    const fetchData = async () => {
      try {
        safelyApply(() => {
          setLoading(true)
          setError(null)
          setMatches([])
          setHierarchy([])
          setPointsData({})
          setSetsData({})
          setHasPoints(false)
        })

        // Fetch paralelo de matches, hierarchy, y tournament info
        const bracketKeyQuery = `?bracket_key=${encodeURIComponent(bracketKey)}`
        const [matchesRes, hierarchyRes, tournamentRes] = await Promise.all([
          fetch(`/api/tournaments/${tournamentId}/matches${bracketKeyQuery}`, { signal }),
          fetch(`/api/tournaments/${tournamentId}/match-hierarchy${bracketKeyQuery}`, { signal }).catch(() => null),
          fetch(`/api/tournaments/${tournamentId}`, { signal }).catch(() => null)
        ])

        // Procesar matches
        if (!matchesRes.ok) throw new Error('Error fetching matches')
        const matchesData = await matchesRes.json()
        const bracketMatches = matchesData.matches?.filter((m: BracketMatch) =>
          m.round !== 'ZONE' && ROUND_ORDER.includes(m.round)
        ) || []
        safelyApply(() => setMatches(bracketMatches))

        // Procesar hierarchy (opcional)
        if (hierarchyRes?.ok) {
          const hierarchyData = await hierarchyRes.json()
          safelyApply(() => setHierarchy(hierarchyData.hierarchy || []))
        }

        // Detectar tipo de torneo (el endpoint /api/tournaments/[id] retorna matches, no datos del torneo,
        // por lo que confiamos en el initialTournamentType pasado como prop)
        if (tournamentRes?.ok) {
          const tournamentData = await tournamentRes.json()
          const detectedType = tournamentData.type || tournamentData.tournament_type
          if (detectedType) {
            safelyApply(() => setTournamentType(detectedType as 'AMERICAN' | 'LONG'))
          }
        }

        // Intentar obtener puntos (sin fallar si no existen)
        try {
          const pointsRes = await fetch(`/api/tournaments/${tournamentId}/match-points`, { signal })
          if (pointsRes.ok) {
            const pointsData = await pointsRes.json()
            if (pointsData.points && Object.keys(pointsData.points).length > 0) {
              safelyApply(() => {
                setPointsData(pointsData.points)
                setHasPoints(true)
              })
            }
          }
        } catch (pointsError) {
          console.log('No points data available (legacy tournament)')
          safelyApply(() => setHasPoints(false))
        }

        // Intentar obtener sets (para torneos LONG)
        try {
          const setsRes = await fetch(`/api/tournaments/${tournamentId}/set-matches`, { signal })
          if (setsRes.ok) {
            const setsData = await setsRes.json()
            if (setsData.sets) {
              safelyApply(() => setSetsData(setsData.sets))
            }
          }
        } catch (setsError) {
          console.log('No sets data available')
        }

      } catch (err) {
        if (signal.aborted) return
        console.error('Error fetching bracket data:', err)
        safelyApply(() => setError(err instanceof Error ? err.message : 'Error loading bracket'))
      } finally {
        safelyApply(() => setLoading(false))
      }
    }

    if (tournamentId) {
      fetchData()
    }

    return () => {
      abortController.abort()
    }
  }, [tournamentId, bracketKey])

  return { matches, hierarchy, pointsData, setsData, tournamentType, hasPoints, loading, error }
}

interface SetMatch {
  set_number: number
  couple1_games: number
  couple2_games: number
  winner_couple_id: string
}

// Componente principal
export default function ReadOnlyBracketVisualization({
  tournamentId,
  tournamentStatus = "UNKNOWN",
  tournamentType: tournamentTypeProp,
  tournamentFormatConfig
}: ReadOnlyBracketVisualizationProps) {
  const resolvedFormat = useMemo(() => {
    return TournamentFormatResolver.getResolvedFormat({
      type: tournamentTypeProp || 'LONG',
      format_config: tournamentFormatConfig
    })
  }, [tournamentFormatConfig, tournamentTypeProp])
  const isGoldSilverFormat = resolvedFormat.effectiveBracketMode === 'GOLD_SILVER'
  const [activeBracketKey, setActiveBracketKey] = useState<BracketKey>(
    () => (isGoldSilverFormat ? 'GOLD' : 'MAIN')
  )

  useEffect(() => {
    if (isGoldSilverFormat && activeBracketKey === 'MAIN') {
      setActiveBracketKey('GOLD')
    }
    if (!isGoldSilverFormat && activeBracketKey !== 'MAIN') {
      setActiveBracketKey('MAIN')
    }
  }, [isGoldSilverFormat, activeBracketKey])

  const { matches, hierarchy, pointsData, setsData, tournamentType, hasPoints, loading, error } = useMatchesWithPoints(
    tournamentId,
    activeBracketKey,
    (tournamentTypeProp as 'AMERICAN' | 'LONG') || 'AMERICAN'
  )

  // Organizar matches por ronda con jerarquía
  const bracketLayout = useMemo(() => {
    if (!matches.length) return {}

    // Detectar rondas existentes
    const existingRounds = ROUND_ORDER.filter(round => 
      matches.some(match => match.round === round)
    )

    // Agrupar matches por ronda
    const matchesByRound = existingRounds.reduce((acc, round) => {
      acc[round] = matches.filter(match => match.round === round)
      return acc
    }, {} as Record<string, BracketMatch[]>)

    // Aplicar orden: jerarquía si existe, sino orden básico
    existingRounds.forEach(round => {
      const roundMatches = matchesByRound[round]
      
      if (hierarchy.length > 0) {
        // Ordenar por parent_slot si hay jerarquía
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
        // Fallback: ordenar por 'order' o 'order_in_round' 
        roundMatches.sort((a, b) => {
          const orderA = (a as any).order || (a as any).order_in_round || 0
          const orderB = (b as any).order || (b as any).order_in_round || 0
          return orderA - orderB
        })
      }
    })

    return { rounds: existingRounds, matchesByRound }
  }, [matches, hierarchy])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
        <span className="text-slate-600">Cargando bracket...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertDescription className="text-red-800">
          <strong>Error:</strong> {error}
        </AlertDescription>
      </Alert>
    )
  }

  if (!matches.length) {
    return (
      <div className="space-y-6">
        {isGoldSilverFormat && (
          <div className="rounded-surface border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-600">Visualizando</p>
                <p className="text-base font-semibold text-slate-900">{getBracketLabelByKey(activeBracketKey)}</p>
              </div>
              <div className="flex items-center gap-2 rounded-surface border border-slate-200 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={activeBracketKey === 'GOLD' ? 'default' : 'ghost'}
                  onClick={() => setActiveBracketKey('GOLD')}
                >
                  Oro
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activeBracketKey === 'SILVER' ? 'default' : 'ghost'}
                  onClick={() => setActiveBracketKey('SILVER')}
                >
                  Plata
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="text-center py-16">
          <Trophy className="h-16 w-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">No hay bracket disponible</h3>
          <p className="text-slate-500">
            {isGoldSilverFormat
              ? `No hay partidos eliminatorios cargados para ${getBracketLabelByKey(activeBracketKey)}.`
              : 'Este torneo no tiene partidos eliminatorios generados.'}
          </p>
        </div>
      </div>
    )
  }

  const { rounds, matchesByRound } = bracketLayout

  return (
    <div className="space-y-6">
      {isGoldSilverFormat && (
        <div className="rounded-surface border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-600">Visualizando</p>
              <p className="text-base font-semibold text-slate-900">{getBracketLabelByKey(activeBracketKey)}</p>
            </div>
            <div className="flex items-center gap-2 rounded-surface border border-slate-200 p-1">
              <Button
                type="button"
                size="sm"
                variant={activeBracketKey === 'GOLD' ? 'default' : 'ghost'}
                onClick={() => setActiveBracketKey('GOLD')}
              >
                Oro
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeBracketKey === 'SILVER' ? 'default' : 'ghost'}
                onClick={() => setActiveBracketKey('SILVER')}
              >
                Plata
              </Button>
            </div>
          </div>
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
                <div className="space-y-4">
                  {roundMatches.map((match) => (
                    <NewMatchCard
                      key={match.id}
                      match={match}
                      points={pointsData[match.id]}
                      sets={setsData[match.id]}
                      tournamentType={tournamentType}
                    />
                  ))}
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
                <div className="space-y-6">
                  {roundMatches.map((match) => (
                    <NewMatchCard
                      key={match.id}
                      match={match}
                      points={pointsData[match.id]}
                      sets={setsData[match.id]}
                      tournamentType={tournamentType}
                    />
                  ))}
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
