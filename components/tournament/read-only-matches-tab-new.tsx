"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { EnhancedMatchCard } from "@/components/tournament/enhanced"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trophy, Loader2, CheckCircle, Clock, Users } from "lucide-react"
import { fetchTournamentMatches, getMatchPoints } from "@/app/api/tournaments/actions"
import MatchStatusBadge from "./match-status-badge"
import PointsCircle from "./match-points/PointsCircle"
import BatacazoBadge from "./match-points/BatacazoBadge"
import { Database } from "@/database.types"
import { MatchPointsCouple } from "@/types"
import Link from "next/link"

type MatchStatus = Database["public"]["Enums"]["match_status"]

interface ReadOnlyMatchesTabNewProps {
  tournamentId: string
  tournamentStatus: string // Para ocultar cancha si está finalizado
}

// Componente para nombres de jugadores clickeables
const PlayerName = ({ playerId, playerName }: { playerId: string; playerName: string }) => {
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

// Componente para una pareja clickeable con puntos
const CoupleNames = ({ 
  couple, 
  playerNames, 
  points,
  isWinner = false
}: { 
  couple?: { player1_id: string; player2_id: string };
  playerNames: string;
  points?: number;
  isWinner?: boolean;
}) => {
  if (!couple?.player1_id || !couple?.player2_id) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-medium text-slate-900">{playerNames}</span>
        {points !== undefined && (
          <>
            <PointsCircle points={points} isWinner={isWinner} size="sm" />
            {isWinner && points > 18 && (
              <BatacazoBadge points={points} size="sm" />
            )}
          </>
        )}
      </div>
    )
  }

  const [player1Name, player2Name] = playerNames.split(' / ')
  
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium">
        <PlayerName playerId={couple.player1_id} playerName={player1Name} />
        <span className="text-slate-500"> / </span>
        <PlayerName playerId={couple.player2_id} playerName={player2Name} />
      </span>
      {points !== undefined && (
        <>
          <PointsCircle points={points} isWinner={isWinner} size="sm" />
          {isWinner && points > 18 && (
            <BatacazoBadge points={points} size="sm" />
          )}
        </>
      )}
    </div>
  )
}

export default function ReadOnlyMatchesTabNew({ tournamentId, tournamentStatus }: ReadOnlyMatchesTabNewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [matches, setMatches] = useState<any[]>([])
  const [matchPoints, setMatchPoints] = useState<Record<string, MatchPointsCouple>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadMatches = async () => {
      try {
        setIsLoading(true)
        
        // Cargar partidos y puntos en paralelo
        const [matchesResult, pointsResult] = await Promise.all([
          fetchTournamentMatches(tournamentId),
          getMatchPoints(tournamentId, null) // null para usar createClient() internamente
        ])
        
        if (matchesResult.success && matchesResult.matches) {
          setMatches(matchesResult.matches)
        } else {
          setError(matchesResult.error || "Error al cargar los partidos")
        }
        
        if (pointsResult) {
          setMatchPoints(pointsResult)
        }
      } catch (err) {
        console.error("Error loading matches:", err)
        setError("Ocurrió un error inesperado")
      } finally {
        setIsLoading(false)
      }
    }

    loadMatches()
  }, [tournamentId])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2 className="h-8 w-8 text-slate-600 animate-spin" />
        <span className="ml-3 text-slate-500">Cargando partidos...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-surface border border-red-200 text-center">
        <div className="font-semibold mb-1">Error al cargar partidos</div>
        <div className="text-sm">{error}</div>
      </div>
    )
  }

  if (!matches || matches.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Trophy className="h-10 w-10 text-slate-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900 mb-2">No hay partidos programados</h3>
        <p className="text-slate-500 max-w-md mx-auto">
          Aún no se han programado partidos para este torneo. Los partidos se generarán automáticamente cuando comience.
        </p>
      </div>
    )
  }

  // Agrupar partidos por zona en lugar de por ronda
  const matchesByZone: Record<string, any[]> = {}
  const eliminationMatches: any[] = []
  
  matches.forEach((match) => {
    // Si el match tiene zona, agrupar por zona
    if (match.zone_name && match.round === "ZONE") {
      if (!matchesByZone[match.zone_name]) {
        matchesByZone[match.zone_name] = []
      }
      matchesByZone[match.zone_name].push(match)
    } else if (match.round && match.round !== "ZONE") {
      // Partidos eliminatorios (8vos, 4tos, etc.)
      eliminationMatches.push(match)
    }
  })

  // Ordenar zonas alfabéticamente
  const sortedZones = Object.keys(matchesByZone).sort()
  
  // Agrupar partidos eliminatorios por ronda para mostrar después de las zonas
  // Filtrar partidos BYE de la sección de partidos eliminatorios
  const eliminationByRound: Record<string, any[]> = {}
  eliminationMatches
    .filter((match) => {
      // Filtrar partidos BYE: excluir si couple1_id o couple2_id es null o "BYE_MARKER"
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
    .forEach((match) => {
      if (!eliminationByRound[match.round]) {
        eliminationByRound[match.round] = []
      }
      eliminationByRound[match.round].push(match)
    })

  const roundOrder = ["32VOS", "16VOS", "8VOS", "4TOS", "SEMIFINAL", "FINAL"]
  const roundTranslation: Record<string, string> = {
    "32VOS": "32vos de Final",
    "16VOS": "16vos de Final", 
    "8VOS": "Octavos de Final",
    "4TOS": "Cuartos de Final",
    "SEMIFINAL": "Semifinales",
    "FINAL": "Final",
  }

  // Función para obtener los puntos de una pareja en un partido
  const getCouplePoints = (match: any, coupleId: string) => {
    const points = matchPoints[match.id]
    if (!points || match.status !== "FINISHED") return undefined
    
    const isWinner = match.winner_id === coupleId
    return isWinner ? points.points_winner : points.points_loser
  }

  const isTournamentFinished = tournamentStatus === "FINISHED"

  return (
    <div className="space-y-6">
      {/* Partidos de Zonas */}
      {sortedZones.map((zoneName) => (
        <Card key={zoneName} className="border-gray-200 shadow-sm">
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200 py-4 px-6">
            <h3 className="text-lg font-semibold text-blue-900 flex items-center gap-3">
              <div className="bg-blue-200 p-2 rounded-surface">
                <Users className="h-5 w-5 text-blue-700" />
              </div>
              {zoneName}
              <span className="text-sm font-normal text-blue-700 ml-2">
                ({matchesByZone[zoneName].length} partidos)
              </span>
            </h3>
          </div>
          <CardContent className="p-0">
            {/* Tabla desktop */}
            <div className="hidden md:block">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-b border-gray-200">
                    <TableHead className="font-semibold text-slate-700 w-[30%]">Pareja 1</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center w-[20%]">Resultado</TableHead>
                    <TableHead className="font-semibold text-slate-700 w-[30%]">Pareja 2</TableHead>
                    <TableHead className="font-semibold text-slate-700 w-[20%]">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchesByZone[zoneName].map((match) => (
                    <TableRow key={match.id} className="hover:bg-slate-50 border-b border-gray-100">
                      <TableCell className="w-[30%]">
                        <CoupleNames 
                          couple={match.couple1}
                          playerNames={`${match.couple1_player1_name} / ${match.couple1_player2_name}`}
                          points={getCouplePoints(match, match.couple1_id)}
                          isWinner={match.winner_id === match.couple1_id}
                        />
                      </TableCell>
                      <TableCell className="text-center w-[20%]">
                        {match.status === "FINISHED" ? (
                          <div className="flex justify-center items-center gap-2">
                            <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-1 rounded">
                              {match.result_couple1}
                            </span>
                            <span className="text-slate-400">-</span>
                            <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-1 rounded">
                              {match.result_couple2}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="w-[30%]">
                        <CoupleNames 
                          couple={match.couple2}
                          playerNames={`${match.couple2_player1_name} / ${match.couple2_player2_name}`}
                          points={getCouplePoints(match, match.couple2_id)}
                          isWinner={match.winner_id === match.couple2_id}
                        />
                      </TableCell>
                      <TableCell className="w-[20%]">
                        <MatchStatusBadge 
                          status={match.status as MatchStatus}
                          court={match.court}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Vista Mobile */}
            <div className="md:hidden p-4 space-y-4">
              {matchesByZone[zoneName].map((match) => (
                <EnhancedMatchCard
                  key={match.id}
                  match={match}
                  tournamentType="AMERICAN"
                  layout="compact"
                  showCourt={!isTournamentFinished}
                  showSchedule={false}
                  getCouplePoints={(coupleId: string) => getCouplePoints(match, coupleId)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Partidos Eliminatorios */}
      {roundOrder
        .filter((roundKey) => eliminationByRound[roundKey])
        .map((roundKey) => (
          <Card key={roundKey} className="border-gray-200 shadow-sm">
            <div className="bg-slate-50 border-b border-slate-200 py-4 px-6">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-3">
                <div className="bg-slate-200 p-2 rounded-surface">
                  <Trophy className="h-5 w-5 text-slate-600" />
                </div>
                {roundTranslation[roundKey]}
                <span className="text-sm font-normal text-slate-600 ml-2">
                  ({eliminationByRound[roundKey].length} partidos)
                </span>
              </h3>
            </div>
            <CardContent className="p-0">
              {/* Tabla desktop */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow className="border-b border-gray-200">
                      <TableHead className="font-semibold text-slate-700 w-[30%]">Pareja 1</TableHead>
                      <TableHead className="font-semibold text-slate-700 text-center w-[20%]">Resultado</TableHead>
                      <TableHead className="font-semibold text-slate-700 w-[30%]">Pareja 2</TableHead>
                      <TableHead className="font-semibold text-slate-700 w-[20%]">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eliminationByRound[roundKey].map((match) => (
                      <TableRow key={match.id} className="hover:bg-slate-50 border-b border-gray-100">
                        <TableCell className="w-[30%]">
                          <CoupleNames 
                            couple={match.couple1}
                            playerNames={`${match.couple1_player1_name} / ${match.couple1_player2_name}`}
                            points={getCouplePoints(match, match.couple1_id)}
                            isWinner={match.winner_id === match.couple1_id}
                          />
                        </TableCell>
                        <TableCell className="text-center w-[20%]">
                          {match.status === "FINISHED" ? (
                            <div className="flex justify-center items-center gap-2">
                              <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-1 rounded">
                                {match.result_couple1}
                              </span>
                              <span className="text-slate-400">-</span>
                              <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-1 rounded">
                                {match.result_couple2}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="w-[30%]">
                          <CoupleNames 
                            couple={match.couple2}
                            playerNames={`${match.couple2_player1_name} / ${match.couple2_player2_name}`}
                            points={getCouplePoints(match, match.couple2_id)}
                            isWinner={match.winner_id === match.couple2_id}
                          />
                        </TableCell>
                        <TableCell className="w-[20%]">
                          <MatchStatusBadge 
                            status={match.status as MatchStatus}
                            court={match.court}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Vista Mobile */}
              <div className="md:hidden p-4 space-y-4">
                {eliminationByRound[roundKey].map((match) => (
                  <EnhancedMatchCard
                    key={match.id}
                    match={match}
                    tournamentType="LONG"
                    layout="compact"
                    showCourt={!isTournamentFinished}
                    showSchedule={false}
                    getCouplePoints={(coupleId: string) => getCouplePoints(match, coupleId)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  )
} 