"use client"
import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChevronLeft, ChevronRight, Trophy, Users, Target, Clock, CheckCircle } from "lucide-react"

interface Match {
  id: string
  round: string
  status: string
  couple1_player1_name?: string
  couple1_player2_name?: string
  couple2_player1_name?: string
  couple2_player2_name?: string
  result_couple1?: string | null
  result_couple2?: string | null
  winner_id?: string | null
  order?: number
}

interface MatchPosition {
  match: Match
  x: number
  y: number
  width: number
  height: number
}

interface ConnectorLine {
  x1: number
  y1: number
  x2: number
  y2: number
  roundIndex: number
}

export default function EnhancedBracketDemo() {
  const [currentView, setCurrentView] = useState<"zones" | "bracket">("bracket")
  const [animationStep, setAnimationStep] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [matchPositions, setMatchPositions] = useState<MatchPosition[]>([])
  const [connectorLines, setConnectorLines] = useState<ConnectorLine[]>([])
  const [isMobile, setIsMobile] = useState(false)
  const bracketRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)

  // Detect mobile size
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    // Check on mount
    checkIsMobile()

    // Add resize listener
    window.addEventListener('resize', checkIsMobile)
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  // Calculate responsive dimensions based on isMobile state
  const dimensions = {
    matchSpacing: isMobile ? 25 : 40,
    matchHeight: isMobile ? 80 : 104,
    columnWidth: isMobile ? 180 : 260,
    matchWidth: isMobile ? 160 : 220
  }

  // Intersection Observer para detectar cuando el componente es visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting)
      },
      {
        threshold: 0.3, // Se activa cuando el 30% del componente es visible
        rootMargin: '0px 0px -10% 0px' // Un poco antes de que llegue al centro
      }
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current)
      }
    }
  }, [])

  // Mock data para las zonas
  const zones = [
    {
      id: "zone-a",
      name: "Zona A",
      couples: [
        {
          id: "1",
          player1_name: "M. Politi",
          player2_name: "G. Politi",
          stats: { played: 2, won: 2, lost: 0, scored: 0, conceded: 0, points: 6 },
        },
        {
          id: "2",
          player1_name: "M. Rodriguez",
          player2_name: "A. Sanchez",
          stats: { played: 2, won: 1, lost: 1, scored: 0, conceded: 0, points: 3 },
        },
        {
          id: "3",
          player1_name: "P. Molina",
          player2_name: "P. Pilot",
          stats: { played: 2, won: 0, lost: 2, scored: 0, conceded: 0, points: 0 },
        },
      ],
    },
    {
      id: "zone-b",
      name: "Zona B",
      couples: [
        {
          id: "4",
          player1_name: "J. Politi",
          player2_name: "I. Politi",
          stats: { played: 2, won: 2, lost: 0, scored: 0, conceded: 0, points: 6 },
        },
        {
          id: "5",
          player1_name: "J. Valdez",
          player2_name: "E. Martinez",
          stats: { played: 2, won: 1, lost: 1, scored: 0, conceded: 0, points: 3 },
        },
        {
          id: "6",
          player1_name: "F. Lopez",
          player2_name: "L. Fernandez",
          stats: { played: 2, won: 0, lost: 2, scored: 0, conceded: 0, points: 0 },
        },
      ],
    },
    {
      id: "zone-c",
      name: "Zona C",
      couples: [
        {
          id: "7",
          player1_name: "S. Torres",
          player2_name: "J. Acosta",
          stats: { played: 2, won: 2, lost: 0, scored: 0, conceded: 0, points: 6 },
        },
        {
          id: "8",
          player1_name: "T. Rojas",
          player2_name: "S. Hernandez",
          stats: { played: 2, won: 1, lost: 1, scored: 0, conceded: 0, points: 3 },
        },
        {
          id: "9",
          player1_name: "J. Acosta",
          player2_name: "M. Gonzalez",
          stats: { played: 2, won: 0, lost: 2, scored: 0, conceded: 0, points: 0 },
        },
      ],
    },
  ]

  // Simplified bracket data
  const bracketMatches: Match[] = [
    // Cuartos de final
    {
      id: "1",
      round: "4TOS",
      status: "FINISHED",
      couple1_player1_name: "M. Politi",
      couple1_player2_name: "G. Politi",
      couple2_player1_name: "M. Rodriguez",
      couple2_player2_name: "A. Sanchez",
      result_couple1: "6",
      result_couple2: "3",
      winner_id: "couple1",
      order: 1,
    },
    {
      id: "2",
      round: "4TOS",
      status: "FINISHED",
      couple1_player1_name: "J. Politi",
      couple1_player2_name: "I. Politi",
      couple2_player1_name: "S. Torres",
      couple2_player2_name: "J. Acosta",
      result_couple1: "4",
      result_couple2: "6",
      winner_id: "couple2",
      order: 2,
    },
    {
      id: "3",
      round: "4TOS",
      status: "FINISHED",
      couple1_player1_name: "J. Valdez",
      couple1_player2_name: "E. Martinez",
      couple2_player1_name: "F. Lopez",
      couple2_player2_name: "L. Fernandez",
      result_couple1: "6",
      result_couple2: "2",
      winner_id: "couple1",
      order: 3,
    },
    {
      id: "4",
      round: "4TOS",
      status: "FINISHED",
      couple1_player1_name: "T. Rojas",
      couple1_player2_name: "S. Hernandez",
      couple2_player1_name: "J. Acosta",
      couple2_player2_name: "M. Gonzalez",
      result_couple1: "3",
      result_couple2: "6",
      winner_id: "couple2",
      order: 4,
    },
    // Semifinales
    {
      id: "5",
      round: "SEMIFINAL",
      status: "FINISHED",
      couple1_player1_name: "M. Politi",
      couple1_player2_name: "G. Politi",
      couple2_player1_name: "S. Torres",
      couple2_player2_name: "J. Acosta",
      result_couple1: "6",
      result_couple2: "4",
      winner_id: "couple1",
      order: 1,
    },
    {
      id: "6",
      round: "SEMIFINAL",
      status: "FINISHED",
      couple1_player1_name: "J. Valdez",
      couple1_player2_name: "E. Martinez",
      couple2_player1_name: "J. Acosta",
      couple2_player2_name: "M. Gonzalez",
      result_couple1: "7",
      result_couple2: "5",
      winner_id: "couple1",
      order: 2,
    },
    // Final
    {
      id: "7",
      round: "FINAL",
      status: "PENDING",
      couple1_player1_name: "M. Politi",
      couple1_player2_name: "G. Politi",
      couple2_player1_name: "J. Valdez",
      couple2_player2_name: "E. Martinez",
      result_couple1: null,
      result_couple2: null,
      winner_id: null,
      order: 1,
    },
  ]

  const calculatePositionsAndLines = () => {
    const { matchSpacing, matchHeight, columnWidth, matchWidth } = dimensions
    const roundOrder = ["4TOS", "SEMIFINAL", "FINAL"]

    const matchesByRound: Record<string, Match[]> = {}
    bracketMatches.forEach((match) => {
      const round = match.round || "Unknown"
      if (!matchesByRound[round]) {
        matchesByRound[round] = []
      }
      matchesByRound[round].push(match)
    })

    const activeRounds = roundOrder.filter((round) => matchesByRound[round] && matchesByRound[round].length > 0)

    const positions: MatchPosition[] = []
    const lines: ConnectorLine[] = []

    activeRounds.forEach((round, roundIndex) => {
      const roundMatches = matchesByRound[round]
      const x = roundIndex * columnWidth

      if (roundIndex === 0) {
        const startY = 40

        roundMatches.forEach((match, matchIndex) => {
          const y = startY + matchIndex * (matchHeight + matchSpacing)
          positions.push({
            match,
            x,
            y,
            width: matchWidth,
            height: matchHeight,
          })
        })
      } else {
        const prevRoundMatches = matchesByRound[activeRounds[roundIndex - 1]]

        roundMatches.forEach((match, matchIndex) => {
          const startParentIndex = matchIndex * 2
          const endParentIndex = startParentIndex + 1

          const startParent = positions.find((p) => p.match.id === prevRoundMatches[startParentIndex]?.id)
          const endParent = positions.find((p) => p.match.id === prevRoundMatches[endParentIndex]?.id)

          if (startParent && endParent) {
            const centerY =
              (startParent.y + startParent.height / 2 + endParent.y + endParent.height / 2) / 2 - matchHeight / 2

            positions.push({
              match,
              x,
              y: centerY,
              width: matchWidth,
              height: matchHeight,
            })

            const currentMatchPos = positions[positions.length - 1]
            const currentMatchCenterY = currentMatchPos.y + currentMatchPos.height / 2
            const startParentCenterY = startParent.y + startParent.height / 2
            const endParentCenterY = endParent.y + endParent.height / 2

            const connectionX = startParent.x + startParent.width + 20
            const midPointY = (startParentCenterY + endParentCenterY) / 2

            if (prevRoundMatches[startParentIndex]?.status === "FINISHED") {
              lines.push({
                x1: startParent.x + startParent.width,
                y1: startParentCenterY,
                x2: connectionX,
                y2: startParentCenterY,
                roundIndex: roundIndex - 1,
              })

              lines.push({
                x1: connectionX,
                y1: startParentCenterY,
                x2: connectionX,
                y2: midPointY,
                roundIndex: roundIndex - 1,
              })
            }

            if (prevRoundMatches[endParentIndex]?.status === "FINISHED") {
              lines.push({
                x1: endParent.x + endParent.width,
                y1: endParentCenterY,
                x2: connectionX,
                y2: endParentCenterY,
                roundIndex: roundIndex - 1,
              })

              lines.push({
                x1: connectionX,
                y1: endParentCenterY,
                x2: connectionX,
                y2: midPointY,
                roundIndex: roundIndex - 1,
              })
            }

            if (
              prevRoundMatches[startParentIndex]?.status === "FINISHED" ||
              prevRoundMatches[endParentIndex]?.status === "FINISHED"
            ) {
              lines.push({
                x1: connectionX,
                y1: midPointY,
                x2: currentMatchPos.x,
                y2: currentMatchCenterY,
                roundIndex: roundIndex - 1,
              })
            }
          } else if (startParent && !endParent) {
            const centerY = startParent.y + (startParent.height - matchHeight) / 2

            positions.push({
              match,
              x,
              y: centerY,
              width: matchWidth,
              height: matchHeight,
            })

            const currentMatchPos = positions[positions.length - 1]
            const currentMatchCenterY = currentMatchPos.y + currentMatchPos.height / 2
            const startParentCenterY = startParent.y + startParent.height / 2

            if (prevRoundMatches[startParentIndex]?.status === "FINISHED") {
              lines.push({
                x1: startParent.x + startParent.width,
                y1: startParentCenterY,
                x2: currentMatchPos.x,
                y2: currentMatchCenterY,
                roundIndex: roundIndex - 1,
              })
            }
          }
        })
      }
    })

    setMatchPositions(positions)
    setConnectorLines(lines)
  }

  // Ejecutar animación cuando es visible y está en bracket view
  useEffect(() => {
    if (isVisible && currentView === "bracket") {
      calculatePositionsAndLines()
      setAnimationStep(0)
      setIsAnimating(true)

      const timer = setInterval(() => {
        setAnimationStep((prev) => {
          const next = prev + 1
          if (next > 2) {
            clearInterval(timer)
            setIsAnimating(false)
            return 2
          }
          return next
        })
      }, 1200)

      return () => clearInterval(timer)
    }
  }, [isVisible, currentView])

  const switchView = (view: "zones" | "bracket") => {
    setCurrentView(view)
  }

  const roundOrder = ["4TOS", "SEMIFINAL", "FINAL"]
  const roundTranslation: Record<string, string> = {
    "4TOS": "Cuartos",
    SEMIFINAL: "Semifinales",
    FINAL: "Final",
  }

  const matchesByRound: Record<string, Match[]> = {}
  bracketMatches.forEach((match) => {
    const round = match.round || "Unknown"
    if (!matchesByRound[round]) {
      matchesByRound[round] = []
    }
    matchesByRound[round].push(match)
  })

  const activeRoundsForLayout = roundOrder.filter((round) => matchesByRound[round] && matchesByRound[round].length > 0)
  const totalWidthForLayout = activeRoundsForLayout.length * dimensions.columnWidth
  const maxMatchesInRound = Math.max(...activeRoundsForLayout.map((round) => matchesByRound[round].length))
  const calculatedTotalHeightForLayout = Math.max(350, 40 + maxMatchesInRound * (dimensions.matchHeight + dimensions.matchSpacing) + 40)

  return (
    <section ref={sectionRef} className="py-20 bg-slate-50">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Sistema de Gestión Profesional</h2>
          <p className="text-slate-600 max-w-3xl mx-auto text-sm sm:text-base">
            Desde zonas clasificatorias hasta brackets eliminatorios. Gestión automática, resultados en tiempo real y
            visualización perfecta.
          </p>
        </div>

        {/* Control de navegación */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-surface p-1 shadow-sm border border-slate-200 flex flex-col sm:flex-row w-full sm:w-auto">
            <Button
              onClick={() => switchView("bracket")}
              variant={currentView === "bracket" ? "default" : "ghost"}
              className={`px-4 sm:px-6 py-3 transition-all duration-300 text-sm sm:text-base ${
                currentView === "bracket" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-800"
              }`}
            >
              <Target className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
              Bracket Eliminatorio
            </Button>
            <Button
              onClick={() => switchView("zones")}
              variant={currentView === "zones" ? "default" : "ghost"}
              className={`px-4 sm:px-6 py-3 transition-all duration-300 text-sm sm:text-base ${
                currentView === "zones" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-800"
              }`}
            >
              <Users className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
              Zonas Clasificatorias
            </Button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto">
          {/* Vista de Zonas */}
          {currentView === "zones" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {zones.map((zone, index) => (
                <Card
                  key={zone.id}
                  className="overflow-hidden border shadow-sm transition-all duration-300 hover:shadow-md border-slate-200 bg-white"
                >
                  <CardHeader className="py-3 bg-blue-600">
                    <CardTitle className="text-base sm:text-lg font-bold text-white flex items-center justify-center">
                      <Trophy className="mr-2 h-4 w-4" />
                      {zone.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="font-semibold text-slate-700 text-xs">Pareja</TableHead>
                          <TableHead className="font-semibold text-slate-700 text-center text-xs">PJ</TableHead>
                          <TableHead className="font-semibold text-slate-700 text-center text-xs">PG</TableHead>
                          <TableHead className="font-semibold text-slate-700 text-center text-xs">PP</TableHead>
                          <TableHead className="font-semibold text-slate-700 text-center text-xs">Pts</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {zone.couples.map((couple, coupleIndex) => (
                          <TableRow
                            key={couple.id}
                            className={`hover:bg-slate-50 transition-colors ${
                              coupleIndex === 0 ? "bg-gradient-to-r from-blue-50/50 to-transparent" : ""
                            }`}
                          >
                            <TableCell className="font-medium text-slate-800 py-2">
                              <div className="flex items-center">
                                {coupleIndex === 0 && <Trophy className="mr-2 h-3 w-3 text-blue-500" />}
                                <div>
                                  <div className="text-xs font-semibold">{couple.player1_name}</div>
                                  <div className="text-xs text-slate-600">{couple.player2_name}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-slate-600 text-xs">{couple.stats.played}</TableCell>
                            <TableCell className="text-center text-blue-600 font-semibold text-xs">
                              {couple.stats.won}
                            </TableCell>
                            <TableCell className="text-center text-slate-600 font-semibold text-xs">
                              {couple.stats.lost}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="inline-flex items-center justify-center font-bold rounded-full h-6 w-6 text-xs bg-blue-100 text-blue-700">
                                {couple.stats.points}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Vista del Bracket */}
          {currentView === "bracket" && (
            <div className="bg-white rounded-surface p-3 sm:p-6 shadow-sm border border-slate-200">
              <div className="text-center mb-6">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">Bracket Eliminatorio</h3>
                <p className="text-slate-600 text-sm">Seguí el progreso del torneo en tiempo real</p>
                {isAnimating && (
                  <Badge className="mt-2 bg-blue-100 text-blue-700 border-blue-200">
                    <Clock className="h-3 w-3 mr-1 animate-spin" />
                    Generando bracket...
                  </Badge>
                )}
              </div>

              <div className="flex justify-center overflow-x-auto">
                <div
                  ref={bracketRef}
                  className="tournament-bracket bg-slate-50 rounded-surface border border-slate-200 p-2 sm:p-4 min-w-fit"
                  style={{ width: Math.max(totalWidthForLayout + 40, 320), height: calculatedTotalHeightForLayout }}
                >
                  <div
                    className="relative"
                    style={{ width: totalWidthForLayout, height: calculatedTotalHeightForLayout }}
                  >
                    <svg
                      className="absolute top-0 left-0 pointer-events-none"
                      width={totalWidthForLayout}
                      height={calculatedTotalHeightForLayout}
                      style={{ zIndex: 1 }}
                    >
                      {connectorLines.map((line, index) => (
                        <g key={index}>
                          <line
                            x1={line.x1}
                            y1={line.y1}
                            x2={line.x2}
                            y2={line.y2}
                            stroke="#64748b"
                            strokeWidth={isMobile ? "1.5" : "2"}
                            fill="none"
                            className={`transition-opacity duration-1000 ${
                              animationStep > line.roundIndex ? "opacity-100" : "opacity-0"
                            }`}
                          />
                        </g>
                      ))}
                    </svg>

                    {/* Headers de rondas */}
                    {activeRoundsForLayout.map((round: string, roundIndex: number) => (
                      <div
                        key={`header-${round}`}
                        className="absolute text-center"
                        style={{
                          left: roundIndex * dimensions.columnWidth,
                          top: 0,
                          width: dimensions.matchWidth,
                          zIndex: 2,
                        }}
                      >
                        <div className="bg-slate-900 text-white rounded-surface py-1.5 sm:py-2 px-2 sm:px-3 shadow-sm">
                          <h3 className="text-xs font-semibold">{roundTranslation[round] || round}</h3>
                        </div>
                      </div>
                    ))}

                    {/* Partidos */}
                    {matchPositions.map((position, index) => {
                      const match = position.match
                      const isCompleted = match.status === "FINISHED"
                      const roundIndex = activeRoundsForLayout.indexOf(match.round)

                      return (
                        <div
                          key={match.id}
                          className={`absolute transition-all duration-1000 ease-out ${
                            animationStep >= roundIndex ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"
                          }`}
                          style={{
                            left: position.x,
                            top: position.y,
                            width: position.width,
                            height: position.height,
                            zIndex: 3,
                            transitionDelay: `${roundIndex * 400 + (index % 4) * 150}ms`,
                          }}
                        >
                          <div
                            className={`bg-white rounded-surface shadow-md h-full transition-all hover:shadow-lg border-2 ${
                              isCompleted ? "border-slate-300" : "border-slate-200"
                            } overflow-hidden`}
                          >
                            {/* Pareja 1 */}
                            <div
                              className={`px-2 sm:px-3 py-1 sm:py-1.5 ${
                                isCompleted && match.winner_id === "couple1"
                                  ? "bg-emerald-50 border-l-4 border-emerald-500"
                                  : "bg-white"
                              }`}
                            >
                              <div className="flex justify-between items-center min-h-5 sm:min-h-6">
                                <div className="font-medium text-slate-900 text-xs truncate max-w-[80px] sm:max-w-[120px]">
                                  {match.couple1_player1_name && match.couple1_player2_name
                                    ? `${match.couple1_player1_name} / ${match.couple1_player2_name}`
                                    : "Por determinar"}
                                </div>
                                {isCompleted && (
                                  <div className="bg-slate-900 text-white text-xs font-bold px-1 sm:px-1.5 py-0.5 rounded shadow-sm">
                                    {match.result_couple1}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Separador */}
                            <div className="border-t border-slate-200"></div>

                            {/* Pareja 2 */}
                            <div
                              className={`px-2 sm:px-3 py-1 sm:py-1.5 ${
                                isCompleted && match.winner_id === "couple2"
                                  ? "bg-emerald-50 border-l-4 border-emerald-500"
                                  : "bg-white"
                              }`}
                            >
                              <div className="flex justify-between items-center min-h-5 sm:min-h-6">
                                <div className="font-medium text-slate-900 text-xs truncate max-w-[80px] sm:max-w-[120px]">
                                  {match.couple2_player1_name && match.couple2_player2_name
                                    ? `${match.couple2_player1_name} / ${match.couple2_player2_name}`
                                    : "Por determinar"}
                                </div>
                                {isCompleted && (
                                  <div className="bg-slate-900 text-white text-xs font-bold px-1 sm:px-1.5 py-0.5 rounded shadow-sm">
                                    {match.result_couple2}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Footer */}
                            <div className="px-2 sm:px-3 py-1 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                              <div className="flex items-center gap-1 sm:gap-2">
                                {isCompleted ? (
                                  <CheckCircle className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Clock className="h-3 w-3 text-amber-500" />
                                )}
                                <span
                                  className={`text-xs font-medium ${isCompleted ? "text-emerald-700" : "text-amber-600"}`}
                                >
                                  {isCompleted ? (isMobile ? "✓" : "Completado") : (isMobile ? "⏳" : "Pendiente")}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </section>
  )
}
