'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, AlertCircle, Users, Zap, Loader2, Trophy, Clock, AlertTriangle } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import type { LongTournamentValidationResult } from '@/utils/tournament-long-validation'

interface LongBracketGeneratorProps {
  tournamentId: string
  tournament: any
  onBracketGenerated?: () => void
}

export function LongBracketGenerator({
  tournamentId,
  tournament,
  onBracketGenerated
}: LongBracketGeneratorProps) {
  const [validation, setValidation] = useState<LongTournamentValidationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const { toast } = useToast()

  const checkValidation = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/validate-long-bracket`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      setValidation(data)

      console.log('[LONG-BRACKET-UI] Validation result:', data)
    } catch (error) {
      console.error('Error validating bracket generation:', error)
      toast({
        title: 'Error de Validación',
        description: 'No se pudieron verificar los requisitos del torneo',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const generateBracket = async () => {
    if (!validation?.canGenerate) {
      toast({
        title: 'No se Puede Generar la Llave',
        description: 'No se cumplen los requisitos del torneo',
        variant: 'destructive'
      })
      return
    }

    setGenerating(true)
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/generate-placeholder-bracket`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (result.success) {
        toast({
          title: '¡Llave Generada!',
          description: `Llave generada exitosamente para ${result.data?.totalSeeds || result.seeding?.totalCouples || 0} parejas`,
        })

        // Callback to parent component
        onBracketGenerated?.()

        // Optional: Redirect to bracket view
        setTimeout(() => {
          window.location.href = `/tournaments/${tournamentId}/bracket`
        }, 1500)

      } else {
        toast({
          title: 'Error al Generar',
          description: result.error || 'No se pudo generar la llave',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Error generating bracket:', error)
      toast({
        title: 'Error de Generación',
        description: 'Ocurrió un error inesperado',
        variant: 'destructive'
      })
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    if (tournament?.type === 'LONG' && tournament?.status === 'ZONE_PHASE') {
      checkValidation()
    }
  }, [tournamentId, tournament])

  // Don't show component if not LONG tournament
  if (tournament?.type !== 'LONG') {
    return null
  }

  // Don't show if already in bracket phase
  if (tournament?.status === 'BRACKET_PHASE') {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert>
            <Trophy className="h-4 w-4" />
            <AlertDescription>
              La llave del torneo ya ha sido generada.
              <a
                href={`/tournaments/${tournamentId}/bracket`}
                className="ml-2 underline hover:no-underline"
              >
                Ver llave →
              </a>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Verificando requisitos del torneo...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-600" />
          Generar Llave del Torneo
        </CardTitle>
        <CardDescription>
          Podés generar la llave antes de terminar zonas, siempre que cada zona tenga creados los partidos mínimos requeridos por el formato activo.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {validation && (
          <div className="space-y-4">
            {/* Tournament Info */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  Total de Parejas: {validation.details?.totalCouples || 0}
                </span>
              </div>
                <Badge variant="outline" className="text-blue-600 border-blue-200">
                Formato Largo
              </Badge>
            </div>

            {/* Qualifying Advancement Info */}
            {validation.details?.qualifyingAdvancementEnabled && (
              <div className="bg-amber-50 border border-amber-200 rounded-surface p-3">
                <div className="flex items-center gap-2 text-amber-800">
                  <Trophy className="w-4 h-4" />
                  <span className="text-sm font-medium">Clasificación Limitada</span>
                </div>
                <div className="mt-1 text-xs text-amber-700">
                  Solo {validation.details.couplesAdvance} de {validation.details.totalCouples} parejas avanzarán al bracket
                </div>
              </div>
            )}

            {/* Progress Info */}
            {validation.details && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Completadas: {validation.details.completedCouples}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-600" />
                  <span>Pendientes: {validation.details.pendingCouples}</span>
                </div>
              </div>
            )}

            {/* Validation Result */}
            {validation.canGenerate ? (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  ✅ Se cumplieron los requisitos de generación. ¡Listo para generar llave!
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div className="font-medium">{validation.reason}</div>
                    {validation.details && (
                      <div className="text-sm space-y-1">
                        <div>
                          Progreso: {validation.details.completedCouples} / {validation.details.totalCouples} parejas completadas
                        </div>
                        <div>
                          {validation.details.pendingCouples} parejas necesitan completar sus partidos de zona
                        </div>
                        {validation.details.averageMatches && (
                          <div>
                            Promedio de partidos por pareja: {validation.details.averageMatches.toFixed(1)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Detailed Incomplete Couples */}
            {validation.details?.incompleteCouplesDetail && validation.details.incompleteCouplesDetail.length > 0 && (
              <div className="text-sm text-muted-foreground">
                <details className="cursor-pointer bg-muted/30 rounded-control p-3">
                  <summary className="font-medium hover:text-foreground">
                    Ver parejas incompletas ({validation.details.incompleteCouplesDetail.length})
                  </summary>
                  <div className="mt-3 space-y-2">
                    {validation.details.incompleteCouplesDetail.map((couple, index) => (
                      <div key={index} className="flex justify-between items-center text-xs bg-background rounded px-2 py-1">
                        <span>Pareja {couple.couple_id}</span>
                        <span className="text-orange-600">
                          {couple.matches_played} partidos
                          <span className="text-muted-foreground ml-1">
                            ({couple.matches_needed} faltantes)
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        )}

        {/* Generate Button */}
        <Button
          onClick={generateBracket}
          disabled={!validation?.canGenerate || generating}
          className="w-full"
          size="lg"
        >
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generando Bracket...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-4 w-4" />
              Generar Llave
              {validation?.details?.qualifyingAdvancementEnabled && (
                <span className="ml-1 text-xs">
                  ({validation.details.totalCouplesAdvancing} parejas)
                </span>
              )}
            </>
          )}
        </Button>

        {/* Info Footer */}
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• Esto generará llaves de eliminación basadas en el rendimiento de zona</div>
          <div>• El seeding se determinará por victorias, diferencia de juegos y juegos totales</div>
          {validation?.details?.qualifyingAdvancementEnabled ? (
            <div>• Solo las mejores {validation.details.couplesAdvance} parejas avanzarán a eliminación</div>
          ) : (
            <div>• Todas las parejas avanzarán a la llave de eliminación</div>
          )}
          <div>• Las posiciones definitivas avanzan directo y las no definitivas se crean como placeholders</div>
        </div>
      </CardContent>
    </Card>
  )
}
