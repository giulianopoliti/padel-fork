"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, Trophy, GitFork, Bug, CheckCircle, AlertCircle } from "lucide-react"

interface DebugMatch {
  id: string
  round: string
  order_in_round: number
  couple1_id: string | null
  couple2_id: string | null
  couple1?: {
    id: string
    player1?: { first_name: string, last_name: string }
    player2?: { first_name: string, last_name: string }
  }
  couple2?: {
    id: string
    player1?: { first_name: string, last_name: string }
    player2?: { first_name: string, last_name: string }
  }
  status: string
  winner_id?: string | null
}

interface SeedInfo {
  couple_id: string
  seed: number
  bracket_position: number
  zone_id: string
  couples?: {
    player1?: { first_name: string, last_name: string }
    player2?: { first_name: string, last_name: string }
  }
}

interface TournamentBracketDebugProps {
  tournamentId: string
  isOwner: boolean
  onDataRefresh?: () => void
}

export default function TournamentBracketDebug({
  tournamentId,
  isOwner,
  onDataRefresh
}: TournamentBracketDebugProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [matches, setMatches] = useState<DebugMatch[]>([])
  const [seeds, setSeeds] = useState<SeedInfo[]>([])
  const [zonesReady, setZonesReady] = useState<any>(null)

  const loadData = async () => {
    try {
      setLoading(true)

      // Cargar estado de zonas
      const zonesResponse = await fetch(`/api/tournaments/${tournamentId}/zones-ready`)
      if (zonesResponse.ok) {
        const zonesData = await zonesResponse.json()
        setZonesReady(zonesData)
      }

      // Cargar matches existentes
      const matchesResponse = await fetch(`/api/tournaments/${tournamentId}/matches`)
      if (matchesResponse.ok) {
        const matchesData = await matchesResponse.json()
        const eliminationMatches = Array.isArray(matchesData) 
          ? matchesData.filter((m: any) => m.type === 'ELIMINATION')
          : (matchesData.matches || []).filter((m: any) => m.type === 'ELIMINATION')
        setMatches(eliminationMatches)
      }

      // Cargar seeds si existen
      const seedsResponse = await fetch(`/api/tournaments/${tournamentId}/seeds`)
      if (seedsResponse.ok) {
        const seedsData = await seedsResponse.json()
        console.log('Seeds data:', seedsData) // Debug
        setSeeds(seedsData.seeds || [])
      }

    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [tournamentId])

  const handleGenerateWithNewAlgorithm = async () => {
    // En modo debug, ser más permisivo
    if (!zonesReady?.ready && !zonesReady?.debug) {
      toast({
        variant: "destructive",
        title: "Error",
        description: zonesReady?.message || "Las zonas no están listas para generar el bracket"
      })
      return
    }

    try {
      setGenerating(true)
      
      console.log("🐍 Generando bracket con NUEVO algoritmo...")
      
      // Primero generar seeding
      const seedingResponse = await fetch(`/api/tournaments/${tournamentId}/generate-seeding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!seedingResponse.ok) {
        const errorData = await seedingResponse.text()
        console.error('Seeding API Error:', seedingResponse.status, errorData)
        throw new Error(`Error generando seeding: ${seedingResponse.status} - ${errorData}`)
      }
      
      const seedingResult = await seedingResponse.json()
      console.log("✅ Seeding generado:", seedingResult)
      
      // Luego generar bracket usando el seeding
      const bracketResponse = await fetch(`/api/tournaments/${tournamentId}/generate-bracket-from-seeding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!bracketResponse.ok) {
        const errorData = await bracketResponse.text()
        console.error('Bracket API Error:', bracketResponse.status, errorData)
        throw new Error(`Error generando bracket: ${bracketResponse.status} - ${errorData}`)
      }
      
      const bracketResult = await bracketResponse.json()
      
      if (bracketResult.success) {
        toast({
          title: "🎯 ¡Nuevo algoritmo aplicado exitosamente!",
          description: `Seeding: ${seedingResult.totalCouples} parejas. Bracket: ${bracketResult.matches} partidos creados.`,
          duration: 6000
        })
        
        await loadData()
        onDataRefresh?.()
      } else {
        throw new Error(bracketResult.error || 'Error desconocido')
      }
      
    } catch (error: any) {
      console.error("Error:", error)
      toast({
        variant: "destructive",
        title: "Error generando bracket",
        description: error.message || "Error inesperado"
      })
    } finally {
      setGenerating(false)
    }
  }

  const formatCoupleName = (couple: any) => {
    if (!couple) return "TBD"
    const p1 = couple.player1 ? `${couple.player1.first_name} ${couple.player1.last_name}` : "?"
    const p2 = couple.player2 ? `${couple.player2.first_name} ${couple.player2.last_name}` : "?"
    return `${p1} / ${p2}`
  }

  const getSeedForCouple = (coupleId: string) => {
    return seeds.find(s => s.couple_id === coupleId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-600 mr-3" />
        <span className="text-slate-600">Cargando datos de debug...</span>
      </div>
    )
  }

  // Agrupar matches por round
  const matchesByRound = matches.reduce((acc, match) => {
    if (!acc[match.round]) {
      acc[match.round] = []
    }
    acc[match.round].push(match)
    return acc
  }, {} as Record<string, DebugMatch[]>)

  const rounds = Object.keys(matchesByRound).sort()

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <Bug className="h-8 w-8 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          🧪 Debug: Algoritmo Serpenteo Round-Robin por Zonas
        </h2>
        <p className="text-slate-600">
          Estrategia: Seed 1=1A, Seed 2=1B, Seed 3=1C, Seed 4=2A, etc.
        </p>
      </div>

      {/* Estado del sistema */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Estado de Zonas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {zonesReady?.ready ? (
              <div className="text-green-600">
                ✅ {zonesReady.totalCouples} parejas listas
              </div>
            ) : (
              <div className="text-amber-600">
                ⏳ Zonas pendientes
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Seeding
            </CardTitle>
          </CardHeader>
          <CardContent>
            {seeds.length > 0 ? (
              <div className="text-green-600">
                ✅ {seeds.length} seeds generados
              </div>
            ) : (
              <div className="text-slate-500">
                ⚪ Sin seeding
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GitFork className="h-4 w-4" />
              Bracket
            </CardTitle>
          </CardHeader>
          <CardContent>
            {matches.length > 0 ? (
              <div className="text-green-600">
                ✅ {matches.length} partidos
              </div>
            ) : (
              <div className="text-slate-500">
                ⚪ Sin bracket
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Botón de generación */}
      {isOwner && (
        <Card className="mb-8 border-emerald-200 bg-emerald-50">
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-emerald-900 mb-2">
                🚀 Probar Nuevo Algoritmo
              </h3>
              <p className="text-emerald-700 mb-2">
                Generar bracket usando el algoritmo de seeding perfecto
              </p>
              {zonesReady && (
                <p className="text-sm text-emerald-600 mb-4">
                  Estado: {zonesReady.message} {zonesReady.debug && "🧪 (Modo Debug)"}
                </p>
              )}
              <Button
                onClick={handleGenerateWithNewAlgorithm}
                disabled={generating}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                size="lg"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Generando...
                  </>
                ) : (
                  <>
                    <GitFork className="h-4 w-4 mr-2" />
                    Generar con Nuevo Algoritmo
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Información de Seeds */}
      {seeds.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Seeds Generados ({seeds.length}) - Patrón Round-Robin por Zonas
            </CardTitle>
            <div className="text-sm text-slate-600 bg-blue-50 p-3 rounded">
              <strong>Patrón Esperado:</strong> Seed 1→Zona A Pos 1, Seed 2→Zona B Pos 1, Seed 3→Zona C Pos 1, Seed 4→Zona A Pos 2, etc.
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {seeds.slice(0, 12).map((seed) => {
                const coupleNames = seed.couples ? 
                  `${seed.couples.player1?.first_name} ${seed.couples.player1?.last_name} / ${seed.couples.player2?.first_name} ${seed.couples.player2?.last_name}` :
                  seed.couple_id.substring(0, 8) + '...'
                
                return (
                  <div key={seed.couple_id} className="bg-slate-50 rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-emerald-700">Seed {seed.seed}</span>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="bg-blue-50">Zone {seed.zone_id}</Badge>
                        <Badge variant="outline">Bracket Pos {seed.bracket_position}</Badge>
                      </div>
                    </div>
                    <div className="text-slate-600 mb-1">
                      {coupleNames}
                    </div>
                    <div className="text-xs text-slate-500">
                      🎯 Round-robin pattern: Expected position in {seed.zone_id}
                    </div>
                  </div>
                )
              })}
              {seeds.length > 12 && (
                <div className="text-slate-500 p-2">
                  +{seeds.length - 12} más parejas...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Matches por Round */}
      {rounds.length > 0 ? (
        <div className="space-y-6">
          <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <GitFork className="h-5 w-5" />
            Bracket Generado
          </h3>
          
          {rounds.map((round) => {
            const roundMatches = matchesByRound[round].sort((a, b) => a.order_in_round - b.order_in_round)
            
            return (
              <Card key={round}>
                <CardHeader>
                  <CardTitle className="text-lg">{round}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {roundMatches.map((match, index) => {
                      const seed1 = getSeedForCouple(match.couple1_id || '')
                      const seed2 = getSeedForCouple(match.couple2_id || '')
                      
                      return (
                        <div key={match.id} className="border rounded-surface p-4 bg-slate-50">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="outline">Partido {index + 1}</Badge>
                            <Badge 
                              variant={match.status === 'FINISHED' ? 'default' : 'secondary'}
                            >
                              {match.status}
                            </Badge>
                          </div>
                          
                          <div className="grid md:grid-cols-2 gap-4">
                            <div className="flex items-center gap-3">
                              <div className="w-3 h-3 bg-blue-500 rounded-full flex-shrink-0"></div>
                              <div className="min-w-0">
                                <div className="font-medium text-blue-800">
                                  {formatCoupleName(match.couple1)}
                                </div>
                                {seed1 && (
                                  <div className="text-sm text-blue-600">
                                    🏆 Seed {seed1.seed} | Bracket Pos {seed1.bracket_position}
                                  </div>
                                )}
                                {!match.couple1_id && (
                                  <div className="text-sm text-slate-500">
                                    🔄 Ganador pendiente
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <div className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0"></div>
                              <div className="min-w-0">
                                <div className="font-medium text-red-800">
                                  {formatCoupleName(match.couple2)}
                                </div>
                                {seed2 && (
                                  <div className="text-sm text-red-600">
                                    🏆 Seed {seed2.seed} | Bracket Pos {seed2.bracket_position}
                                  </div>
                                )}
                                {!match.couple2_id && (
                                  <div className="text-sm text-slate-500">
                                    🔄 Ganador pendiente
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {match.winner_id && (
                            <div className="mt-3 pt-3 border-t">
                              <div className="text-sm text-green-600">
                                ✅ Ganador: {match.winner_id === match.couple1_id ? 
                                  formatCoupleName(match.couple1) : 
                                  formatCoupleName(match.couple2)
                                }
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-2">
              No hay bracket generado
            </h3>
            <p className="text-slate-500">
              Usa el botón de arriba para generar el bracket con el nuevo algoritmo
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}