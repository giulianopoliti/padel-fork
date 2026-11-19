/**
 * Tournament Zones Data Hook
 * 
 * Fetches and transforms tournament zones data with proper serialization.
 * Uses SWR for caching and revalidation.
 */

import useSWR from 'swr'
import { useCallback } from 'react'
import type { 
  TournamentZonesData, 
  TournamentZonesDataWithUtils,
  CleanZone, 
  AvailableCouple,
  ZonesDataResponse,
  AvailableCouplesResponse
} from '../types/zone-types'
import { 
  transformZonesData, 
  transformAvailableCouplesData 
} from '../utils/data-serialization'

interface DisqualificationsResponse {
  success: boolean
  disqualifications?: Array<{
    id: string
    couple_id: string
    phase: string
  }>
  error?: string
}

// Fetcher function for zones
async function fetchZones(tournamentId: string): Promise<CleanZone[]> {
  const response = await fetch(`/api/tournaments/${tournamentId}/zones`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch zones: ${response.statusText}`)
  }
  
  const data: ZonesDataResponse = await response.json()
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch zones')
  }
  
  // Transform raw data to clean, serializable format
  return transformZonesData(data.zones || [])
}

// Fetcher function for available couples
async function fetchAvailableCouples(tournamentId: string): Promise<AvailableCouple[]> {
  const response = await fetch(`/api/tournaments/${tournamentId}/available-couples`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch available couples: ${response.statusText}`)
  }
  
  const data: AvailableCouplesResponse = await response.json()
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch available couples')
  }
  
  // Transform raw data to clean, serializable format
  return transformAvailableCouplesData(data.couples || [])
}

async function fetchActiveZoneDisqualifications(tournamentId: string) {
  const response = await fetch(`/api/tournaments/${tournamentId}/disqualifications?phase=ZONE_PHASE`)

  if (!response.ok) {
    throw new Error(`Failed to fetch disqualifications: ${response.statusText}`)
  }

  const data: DisqualificationsResponse = await response.json()
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch disqualifications')
  }

  return data.disqualifications || []
}

// Combined fetcher for both zones and available couples
async function fetchTournamentZonesData(tournamentId: string): Promise<{
  zones: CleanZone[]
  availableCouples: AvailableCouple[]
}> {
  try {
    // Fetch both datasets in parallel
    const [zones, availableCouples, disqualifications] = await Promise.all([
      fetchZones(tournamentId),
      fetchAvailableCouples(tournamentId),
      fetchActiveZoneDisqualifications(tournamentId).catch(() => [])
    ])

    const disqualificationsByCouple = new Map(
      disqualifications.map((disqualification) => [disqualification.couple_id, disqualification])
    )
    const zonesWithDisqualificationState = zones.map((zone) => ({
      ...zone,
      couples: zone.couples.map((couple) => {
        const disqualification = disqualificationsByCouple.get(couple.id)
        if (!disqualification) return couple

        return {
          ...couple,
          metadata: {
            ...couple.metadata,
            isDisqualified: true,
            disqualificationId: disqualification.id,
            disqualificationPhase: disqualification.phase,
          },
        }
      }),
    }))
    
    return {
      zones: zonesWithDisqualificationState,
      availableCouples
    }
  } catch (error) {
    console.error('[fetchTournamentZonesData] Error:', error)
    throw error
  }
}

// SWR configuration
const SWR_CONFIG = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  refreshInterval: 0, // No auto-refresh - manual only
  dedupingInterval: 5000, // Prevent duplicate requests within 5s
  errorRetryCount: 3,
  errorRetryInterval: 1000
}

/**
 * Hook to fetch tournament zones data with proper serialization
 */
export function useTournamentZonesData(tournamentId: string): TournamentZonesDataWithUtils {
  // Generate SWR key
  const swrKey = tournamentId ? `/tournament-zones/${tournamentId}` : null
  
  // Use SWR to fetch data
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR(
    swrKey,
    () => fetchTournamentZonesData(tournamentId),
    SWR_CONFIG
  )
  
  // Manual refresh function
  const refresh = useCallback(async () => {
    try {
      await mutate()
    } catch (error) {
      console.error('[useTournamentZonesData] Refresh error:', error)
    }
  }, [mutate])
  
  // Optimistic update function for mutations
  const optimisticUpdate = useCallback(async (
    updateFn: (current: { zones: CleanZone[], availableCouples: AvailableCouple[] }) => {
      zones: CleanZone[], 
      availableCouples: AvailableCouple[]
    }
  ) => {
    try {
      // Apply optimistic update
      await mutate(current => current ? updateFn(current) : current, {
        revalidate: false // Don't revalidate immediately
      })
    } catch (error) {
      console.error('[useTournamentZonesData] Optimistic update error:', error)
      // Revert on error
      await mutate()
    }
  }, [mutate])
  
  // Return hook data
  const result: TournamentZonesDataWithUtils = {
    zones: data?.zones || [],
    availableCouples: data?.availableCouples || [],
    isLoading,
    error: error?.message || null,
    refresh,
    optimisticUpdate
  }
  return result
}

/**
 * Hook for zones data only (lighter)
 */
export function useZonesOnly(tournamentId: string) {
  const swrKey = tournamentId ? `/zones-only/${tournamentId}` : null
  
  const { data, error, isLoading, mutate } = useSWR(
    swrKey,
    () => fetchZones(tournamentId),
    SWR_CONFIG
  )
  
  return {
    zones: data || [],
    isLoading,
    error: error?.message || null,
    refresh: mutate
  }
}

/**
 * Hook for available couples only (lighter)
 */
export function useAvailableCouplesOnly(tournamentId: string) {
  const swrKey = tournamentId ? `/available-couples-only/${tournamentId}` : null
  
  const { data, error, isLoading, mutate } = useSWR(
    swrKey,
    () => fetchAvailableCouples(tournamentId),
    SWR_CONFIG
  )
  
  return {
    availableCouples: data || [],
    isLoading,
    error: error?.message || null,
    refresh: mutate
  }
}
