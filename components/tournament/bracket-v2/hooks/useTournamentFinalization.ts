'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import type { BracketKey } from '@/types/tournament-format-v2'
import type { TournamentBonuses } from '@/lib/tournaments/finalization'

interface TournamentFinalizationState {
  expectedRevision?: number | null
  status: string
  canShowPointsCalculation: boolean
  canFinalize: boolean
  allMatchesFinished: boolean
  reason: string | null
  bracketKeys: BracketKey[]
  bonuses: TournamentBonuses
  winner_id: string | null
}

const fetchFinalization = async (url: string): Promise<TournamentFinalizationState> => {
  const response = await fetch(url, { cache: 'no-store' })
  const data = await response.json()
  if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo verificar el torneo.')
  return {
    status: data.status,
    expectedRevision: data.expectedRevision,
    canShowPointsCalculation: data.status === 'FINISHED_POINTS_PENDING' && data.allMatchesFinished,
    canFinalize: data.canFinalize,
    allMatchesFinished: data.allMatchesFinished,
    reason: data.reason,
    bracketKeys: data.bracketKeys,
    bonuses: data.bonuses,
    winner_id: data.winner_id,
  }
}

export const useTournamentFinalization = (tournamentId: string) => {
  const { data, error, isLoading, mutate } = useSWR<TournamentFinalizationState>(
    `/api/tournaments/${tournamentId}/finalization-status`, fetchFinalization,
    { dedupingInterval: 2000, revalidateOnFocus: true },
  )
  const refetch = useCallback(async () => { await mutate() }, [mutate])
  return {
    status: data?.status ?? 'UNKNOWN',
    expectedRevision: data?.expectedRevision,
    canShowPointsCalculation: !error && (data?.canShowPointsCalculation ?? false),
    canFinalize: !error && (data?.canFinalize ?? false),
    allMatchesFinished: data?.allMatchesFinished ?? false,
    reason: error ? (error instanceof Error ? error.message : 'No se pudo verificar el torneo.') : data?.reason ?? null,
    bracketKeys: data?.bracketKeys ?? [],
    bonuses: data?.bonuses ?? {},
    winner_id: data?.winner_id ?? null,
    loading: isLoading,
    refetch,
  }
}
