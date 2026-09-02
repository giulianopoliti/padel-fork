'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2, Trophy } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import { getBracketLabelByKey } from '@/lib/services/bracket-key-policy'
import { BracketDragDropProvider } from '@/components/tournament/bracket-v2/context/bracket-drag-context'
import { ImprovedBracketRenderer } from '@/components/tournament/bracket-v2/components/ImprovedBracketRenderer'
import { useBracketData } from '@/components/tournament/bracket-v2/hooks/useBracketData'
import type { BracketKey } from '@/types/tournament-format-v2'

interface PublicBracketTreeViewProps {
  tournamentId: string
  tournamentType: 'AMERICAN' | 'LONG'
  tournamentFormatConfig?: unknown
}

interface MatchSetScore {
  id: string
  set_number: number
  couple1_games: number
  couple2_games: number
}

export default function PublicBracketTreeView({
  tournamentId,
  tournamentType,
  tournamentFormatConfig,
}: PublicBracketTreeViewProps) {
  const resolvedFormat = useMemo(() => (
    TournamentFormatResolver.getResolvedFormat({
      type: tournamentType,
      format_config: tournamentFormatConfig,
    })
  ), [tournamentFormatConfig, tournamentType])

  const isGoldSilverFormat = resolvedFormat.effectiveBracketMode === 'GOLD_SILVER'
  const [activeBracketKey, setActiveBracketKey] = useState<BracketKey>(
    () => (isGoldSilverFormat ? 'GOLD' : 'MAIN')
  )
  const [setScoresByMatch, setSetScoresByMatch] = useState<Record<string, MatchSetScore[]>>({})

  useEffect(() => {
    if (isGoldSilverFormat && activeBracketKey === 'MAIN') {
      setActiveBracketKey('GOLD')
    }
    if (!isGoldSilverFormat && activeBracketKey !== 'MAIN') {
      setActiveBracketKey('MAIN')
    }
  }, [activeBracketKey, isGoldSilverFormat])

  const {
    data: bracketData,
    loading,
    error,
  } = useBracketData(tournamentId, {
    algorithm: 'serpentine',
    bracketKey: activeBracketKey,
    enableRealtime: false,
    config: {
      features: {
        enableDragDrop: false,
        enableLiveScoring: false,
        showSeeds: true,
        showZoneInfo: true,
        showStatistics: true,
        autoProcessBYEs: false,
      },
    },
  })

  useEffect(() => {
    if (tournamentType !== 'LONG') {
      setSetScoresByMatch({})
      return
    }

    const abortController = new AbortController()

    const fetchSetScores = async () => {
      try {
        const response = await fetch(
          `/api/tournaments/${tournamentId}/set-matches?bracket_key=${encodeURIComponent(activeBracketKey)}`,
          { signal: abortController.signal }
        )

        if (!response.ok) {
          setSetScoresByMatch({})
          return
        }

        const data = await response.json()
        setSetScoresByMatch(data.sets || {})
      } catch (fetchError) {
        if (!abortController.signal.aborted) {
          setSetScoresByMatch({})
        }
      }
    }

    fetchSetScores()

    return () => abortController.abort()
  }, [activeBracketKey, tournamentId, tournamentType])

  const cupSelector = isGoldSilverFormat ? (
    <div className="rounded-surface border border-slate-200 bg-white p-1.5 shadow-sm">
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          size="lg"
          variant={activeBracketKey === 'GOLD' ? 'default' : 'ghost'}
          className="h-11 text-base font-semibold"
          onClick={() => setActiveBracketKey('GOLD')}
        >
          Oro
        </Button>
        <Button
          type="button"
          size="lg"
          variant={activeBracketKey === 'SILVER' ? 'default' : 'ghost'}
          className="h-11 text-base font-semibold"
          onClick={() => setActiveBracketKey('SILVER')}
        >
          Plata
        </Button>
      </div>
    </div>
  ) : null

  if (loading) {
    return (
      <div className="space-y-3">
        {cupSelector}
        <div className="rounded-surface border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            Cargando llave...
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-3">
        {cupSelector}
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>Error al cargar la llave:</strong> {error.message}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!bracketData?.matches?.length) {
    return (
      <div className="space-y-3">
        {cupSelector}
        <div className="rounded-surface border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <Trophy className="mx-auto mb-4 h-14 w-14 text-slate-300" />
          <h3 className="text-lg font-semibold text-slate-800">No hay llave disponible</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
            {isGoldSilverFormat
              ? `Todavia no hay partidos eliminatorios cargados para ${getBracketLabelByKey(activeBracketKey)}.`
              : 'Este torneo todavia no tiene partidos eliminatorios generados.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {cupSelector}
      <div className="rounded-surface border border-slate-200 bg-white p-3 shadow-sm">
        <div>
          <p className="text-sm font-medium text-slate-500">Llave del torneo</p>
          <h2 className="text-lg font-semibold text-slate-900">
            {getBracketLabelByKey(activeBracketKey)}
          </h2>
        </div>
      </div>

      <BracketDragDropProvider key={activeBracketKey}>
        <ImprovedBracketRenderer
          key={activeBracketKey}
          bracketData={bracketData}
          tournamentId={tournamentId}
          tournamentType={tournamentType}
          isOwner={false}
          enableDragDrop={false}
          setScoresByMatch={setScoresByMatch}
          className="border-slate-200 bg-white"
        />
      </BracketDragDropProvider>
    </div>
  )
}
