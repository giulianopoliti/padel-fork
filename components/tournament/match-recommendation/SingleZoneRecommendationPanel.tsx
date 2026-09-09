'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock3, Plus, RefreshCw, Route, Sparkles } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import type { AmericanSingleZoneRecommendationPayload } from '@/lib/services/zone-match-recommendation/american-single-zone.service'
import {
  type ZoneRecommendationPair,
  zoneRecommendationPairKey,
} from '@/lib/services/zone-match-recommendation/types'

interface SingleZoneRecommendationPanelProps {
  tournamentId: string
  refreshTrigger?: number
  useDisabled?: boolean
  useDisabledReason?: string
  queuedPairKeys?: string[]
  onUseRecommendations?: (recommendation: {
    zoneId: string
    matches: ZoneRecommendationPair[]
    revision: string
  }) => void
}

interface RecommendationResponse {
  success: boolean
  recommendation?: AmericanSingleZoneRecommendationPayload
  error?: string
}

const EMPTY_PAIR_KEYS: string[] = []

const pairKey = (match: ZoneRecommendationPair) =>
  zoneRecommendationPairKey(match.couple1Id, match.couple2Id)

const pairLabel = (
  recommendation: AmericanSingleZoneRecommendationPayload,
  match: ZoneRecommendationPair,
) => `${recommendation.coupleNames[match.couple1Id] || 'Pareja'} vs. ${recommendation.coupleNames[match.couple2Id] || 'Pareja'}`

export default function SingleZoneRecommendationPanel({
  tournamentId,
  refreshTrigger = 0,
  useDisabled = false,
  useDisabledReason,
  queuedPairKeys = EMPTY_PAIR_KEYS,
  onUseRecommendations,
}: SingleZoneRecommendationPanelProps) {
  const [recommendation, setRecommendation] = useState<AmericanSingleZoneRecommendationPayload | null>(null)
  const [selectedPairKeys, setSelectedPairKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const queuedPairKeySet = useMemo(() => new Set(queuedPairKeys), [queuedPairKeys])

  const loadRecommendation = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/tournaments/${tournamentId}/zone-match-recommendation`, {
        cache: 'no-store',
      })
      const result = await response.json() as RecommendationResponse
      if (!response.ok || !result.success || !result.recommendation) {
        throw new Error(result.error || 'No se pudo calcular la recomendación')
      }
      setRecommendation(result.recommendation)
    } catch (loadError) {
      setRecommendation(null)
      setError(loadError instanceof Error ? loadError.message : 'No se pudo calcular la recomendación')
    } finally {
      setLoading(false)
    }
  }, [tournamentId])

  useEffect(() => {
    loadRecommendation()
  }, [loadRecommendation, refreshTrigger])

  useEffect(() => {
    const batch = recommendation?.recommendedBatch || []
    setSelectedPairKeys(new Set(
      batch.map(pairKey).filter(key => !queuedPairKeySet.has(key)),
    ))
  }, [queuedPairKeySet, recommendation?.revision])

  if (loading) {
    return (
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="flex min-h-32 items-center justify-center gap-3 text-sm text-blue-800">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          Calculando cruces compatibles…
        </CardContent>
      </Card>
    )
  }

  if (error || !recommendation) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{error || 'No se pudo cargar la recomendación.'}</span>
          <Button variant="outline" size="sm" onClick={loadRecommendation}>Reintentar</Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (recommendation.status === 'COMPLETE') {
    return (
      <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
        <AlertDescription>Todas las parejas alcanzaron su cantidad objetivo de partidos.</AlertDescription>
      </Alert>
    )
  }

  if (recommendation.status === 'IMPOSSIBLE' || recommendation.status === 'SEARCH_LIMIT_REACHED') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <p className="font-medium">No se encontró un cierre completo sin repetir cruces.</p>
          {recommendation.diagnostics[0]?.message && (
            <p className="mt-1 text-sm">{recommendation.diagnostics[0].message}</p>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  const recommendedBatch = recommendation.recommendedBatch || []
  if (recommendedBatch.length === 0) {
    return (
      <Alert className="border-amber-200 bg-amber-50 text-amber-950">
        <Clock3 className="h-4 w-4 text-amber-700" />
        <AlertDescription>
          Hay un plan válido, pero por ahora no existen cruces jugables entre parejas libres. Se actualizará cuando termine un partido.
        </AlertDescription>
      </Alert>
    )
  }

  const selectableMatches = recommendedBatch.filter(match => !queuedPairKeySet.has(pairKey(match)))
  const selectedMatches = selectableMatches.filter(match => selectedPairKeys.has(pairKey(match)))
  const batchPairKeys = new Set(recommendedBatch.map(pairKey))
  const futureMatches = recommendation.futurePlan.filter(match => !batchPairKeys.has(pairKey(match)))
  const allBatchQueued = selectableMatches.length === 0

  const handleToggleMatch = (match: ZoneRecommendationPair, checked: boolean) => {
    const key = pairKey(match)
    setSelectedPairKeys(current => {
      const next = new Set(current)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const handleAddMatches = (matches: ZoneRecommendationPair[]) => {
    if (!onUseRecommendations || matches.length === 0) return
    onUseRecommendations({
      zoneId: recommendation.zoneId,
      matches,
      revision: recommendation.revision,
    })
  }

  return (
    <Card className="overflow-hidden border-blue-200 bg-gradient-to-br from-white via-white to-blue-50/70 shadow-sm">
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
            <Sparkles className="h-5 w-5 text-blue-600" aria-hidden="true" />
            Cruces recomendados ahora
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
              {recommendedBatch.length} partido{recommendedBatch.length === 1 ? '' : 's'} compatible{recommendedBatch.length === 1 ? '' : 's'}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
              {recommendation.targetMatchesPerCouple} por pareja
            </Badge>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          Podés agregar uno, varios o todos. Ninguna pareja se repite dentro de este lote.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="divide-y divide-slate-100 overflow-hidden rounded-surface border border-blue-100 bg-white">
          {recommendedBatch.map((match, index) => {
            const key = pairKey(match)
            const isQueued = queuedPairKeySet.has(key)
            const isSelected = selectedPairKeys.has(key)
            const rowDisabled = useDisabled || isQueued

            return (
              <div key={key} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
                <label className={`flex min-w-0 flex-1 items-start gap-3 ${rowDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                  <Checkbox
                    className="mt-1"
                    checked={isQueued || isSelected}
                    disabled={rowDisabled}
                    onCheckedChange={checked => handleToggleMatch(match, checked === true)}
                    aria-label={`Seleccionar ${pairLabel(recommendation, match)}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-blue-600">
                      Partido {index + 1}
                    </span>
                    <span className="mt-1 grid gap-1 text-sm font-medium text-slate-900 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                      <span>{recommendation.coupleNames[match.couple1Id]}</span>
                      <span className="text-xs font-bold text-slate-400">VS</span>
                      <span>{recommendation.coupleNames[match.couple2Id]}</span>
                    </span>
                  </span>
                </label>

                {isQueued ? (
                  <Badge className="w-fit bg-emerald-100 text-emerald-800 hover:bg-emerald-100">En cola</Badge>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={useDisabled}
                    className="w-full gap-2 text-blue-700 hover:bg-blue-50 hover:text-blue-800 sm:w-auto"
                    onClick={() => handleAddMatches([match])}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Agregar
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        {useDisabled && useDisabledReason && (
          <p className="text-sm text-amber-700">{useDisabledReason}</p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" size="sm" onClick={loadRecommendation} className="gap-2 text-slate-600">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Recalcular
          </Button>

          {onUseRecommendations && !allBatchQueued && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={useDisabled || selectedMatches.length === 0}
                onClick={() => handleAddMatches(selectedMatches)}
              >
                Agregar seleccionados ({selectedMatches.length})
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={useDisabled}
                onClick={() => handleAddMatches(selectableMatches)}
              >
                Agregar todos ({selectableMatches.length})
              </Button>
            </div>
          )}
        </div>

        {allBatchQueued && (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>Todos los cruces recomendados están en la cola inferior.</AlertDescription>
          </Alert>
        )}

        {futureMatches.length > 0 && (
          <details className="group rounded-surface border border-slate-200 bg-white px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              <Route className="h-4 w-4 text-slate-500" aria-hidden="true" />
              Ver cierre previsto ({futureMatches.length} partido{futureMatches.length === 1 ? '' : 's'} posterior{futureMatches.length === 1 ? '' : 'es'})
            </summary>
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              {futureMatches.map(match => (
                <p key={pairKey(match)} className="text-sm text-slate-600">
                  {pairLabel(recommendation, match)}
                </p>
              ))}
              <p className="pt-1 text-xs text-slate-500">El cierre es informativo y se recalcula cuando cambia un partido.</p>
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
