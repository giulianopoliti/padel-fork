'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useBracketData } from '@/components/tournament/bracket-v2/hooks/useBracketData'
import { getMatchSchedulingData, type SchedulingData } from '../../match-scheduling/actions'
import type { BracketKey } from '@/types/tournament-format-v2'
import type { RoundFechaSubstitute } from '@/lib/services/long-fecha-substitutions'

type RoundType = 'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL'

interface TournamentFecha {
  id: string
  tournament_id: string
  fecha_number: number
  name: string
  description?: string
  start_date?: string
  end_date?: string
  round_type: RoundType
  bracket_key: 'MAIN' | 'GOLD' | 'SILVER'
  max_matches_per_couple?: number | null
  status: string
  created_at: string
  updated_at: string
}

interface UseLongBracketDataConfig {
  selectedRound?: string
  selectedRoundType?: RoundType
  selectedFechaId?: string
  includeSchedulingData?: boolean
  bracketKey?: BracketKey
}

export interface UseLongBracketDataResult {
  bracketData: any
  bracketLoading: boolean
  bracketError: Error | null
  schedulingData: SchedulingData | null
  schedulingLoading: boolean
  schedulingError: string | null
  roundFechas: TournamentFecha[]
  roundTimeSlots: any[]
  roundAvailability: any[]
  roundSubstitutes: RoundFechaSubstitute[]
  roundSchedulingLoading: boolean
  roundSchedulingError: string | null
  isLoading: boolean
  hasError: boolean
  refetchBracket: () => Promise<void>
  refetchScheduling: () => Promise<void>
  refetchRoundScheduling: () => Promise<void>
  refetchAll: () => Promise<void>
}

export function useLongBracketData(
  tournamentId: string,
  config: UseLongBracketDataConfig = {}
): UseLongBracketDataResult {
  const {
    selectedRoundType,
    selectedFechaId,
    includeSchedulingData = false,
    bracketKey
  } = config

  const {
    data: bracketData,
    loading: bracketLoading,
    error: bracketError,
    refetch: refetchBracket
  } = useBracketData(tournamentId, {
    algorithm: 'serpentine',
    bracketKey,
    enableRealtime: false,
    enabled: true
  })

  const [schedulingState, setSchedulingState] = useState<{
    data: SchedulingData | null
    loading: boolean
    error: string | null
  }>({
    data: null,
    loading: false,
    error: null
  })

  const [roundSchedulingState, setRoundSchedulingState] = useState<{
    fechas: TournamentFecha[]
    timeSlots: any[]
    availability: any[]
    substitutes: RoundFechaSubstitute[]
    loading: boolean
    error: string | null
  }>({
    fechas: [],
    timeSlots: [],
    availability: [],
    substitutes: [],
    loading: false,
    error: null
  })
  const roundRequest = useRef<AbortController | null>(null)

  const fetchSchedulingData = useCallback(async (fechaId: string) => {
    if (!includeSchedulingData || !fechaId || fechaId === 'current') {
      return
    }

    setSchedulingState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const result = await getMatchSchedulingData(tournamentId, fechaId)
      if (result.success && result.data) {
        setSchedulingState({
          data: result.data,
          loading: false,
          error: null
        })
      } else {
        setSchedulingState({
          data: null,
          loading: false,
          error: result.error || 'Error al cargar datos de scheduling'
        })
      }
    } catch {
      setSchedulingState({
        data: null,
        loading: false,
        error: 'Error inesperado al cargar datos de scheduling'
      })
    }
  }, [tournamentId, includeSchedulingData])

  const fetchRoundSchedulingData = useCallback(async (
    roundType: RoundType,
    activeBracketKey?: BracketKey
  ) => {
    if (!roundType) return

    roundRequest.current?.abort()
    const request = new AbortController()
    roundRequest.current = request
    setRoundSchedulingState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const effectiveBracketKey = roundType === 'ZONE' ? undefined : activeBracketKey
      const searchParams = new URLSearchParams({ round_type: roundType })

      if (effectiveBracketKey) {
        searchParams.set('bracket_key', effectiveBracketKey)
      }

      const response = await fetch(
        `/api/tournaments/${tournamentId}/round-scheduling?${searchParams.toString()}`,
        {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          signal: request.signal,
        }
      )

      const result = await response.json()
      if (request.signal.aborted) return
      if (!response.ok || !result?.success) {
        setRoundSchedulingState({
          fechas: [],
          timeSlots: [],
          availability: [],
          substitutes: [],
          loading: false,
          error: result?.error || 'Error al cargar datos de la ronda'
        })
        return
      }

      setRoundSchedulingState({
        fechas: Array.isArray(result?.data?.fechas) ? result.data.fechas : [],
        timeSlots: Array.isArray(result?.data?.timeSlots) ? result.data.timeSlots : [],
        availability: Array.isArray(result?.data?.availability) ? result.data.availability : [],
        substitutes: Array.isArray(result?.data?.substitutes) ? result.data.substitutes : [],
        loading: false,
        error: null
      })
    } catch {
      if (request.signal.aborted) return
      setRoundSchedulingState({
        fechas: [],
        timeSlots: [],
        availability: [],
        substitutes: [],
        loading: false,
        error: 'Error inesperado al cargar datos de la ronda'
      })
    }
  }, [tournamentId])

  useEffect(() => {
    if (selectedFechaId && includeSchedulingData) {
      fetchSchedulingData(selectedFechaId)
    }
  }, [selectedFechaId, includeSchedulingData, fetchSchedulingData])

  useEffect(() => {
    if (selectedRoundType) {
      void fetchRoundSchedulingData(selectedRoundType, bracketKey)
      return () => roundRequest.current?.abort()
    }
    setRoundSchedulingState({ fechas: [], timeSlots: [], availability: [], substitutes: [], loading: false, error: null })
  }, [selectedRoundType, bracketKey, fetchRoundSchedulingData])

  const refetchScheduling = useCallback(async () => {
    if (selectedFechaId) {
      await fetchSchedulingData(selectedFechaId)
    }
  }, [selectedFechaId, fetchSchedulingData])

  const refetchRoundScheduling = useCallback(async () => {
    if (selectedRoundType) {
      await fetchRoundSchedulingData(selectedRoundType, bracketKey)
    }
  }, [selectedRoundType, bracketKey, fetchRoundSchedulingData])

  const refetchAll = useCallback(async () => {
    await Promise.all([
      refetchBracket(),
      refetchScheduling(),
      refetchRoundScheduling()
    ])
  }, [refetchBracket, refetchScheduling, refetchRoundScheduling])

  const isLoading = bracketLoading || schedulingState.loading || roundSchedulingState.loading
  const hasError = !!bracketError || !!schedulingState.error || !!roundSchedulingState.error

  return {
    bracketData,
    bracketLoading,
    bracketError,
    schedulingData: schedulingState.data,
    schedulingLoading: schedulingState.loading,
    schedulingError: schedulingState.error,
    roundFechas: roundSchedulingState.fechas,
    roundTimeSlots: roundSchedulingState.timeSlots,
    roundAvailability: roundSchedulingState.availability,
    roundSubstitutes: roundSchedulingState.substitutes,
    roundSchedulingLoading: roundSchedulingState.loading,
    roundSchedulingError: roundSchedulingState.error,
    isLoading,
    hasError,
    refetchBracket,
    refetchScheduling,
    refetchRoundScheduling,
    refetchAll
  }
}
