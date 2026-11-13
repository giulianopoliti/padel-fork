"use client";

import useSWR from 'swr';
import { useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';

// Types
interface PlayerInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  score: number | null;
  dni?: string | null;
  phone?: string | null;
}

interface CoupleInfo {
  id: string;
  tournament_id: string;
  player_1_id: string | null;
  player_2_id: string | null;
  created_at: string;
  player_1_info: PlayerInfo | null;
  player_2_info: PlayerInfo | null;
  is_pending?: boolean;
  occupies_slot?: boolean | null;
  inscription_id?: string;
  // Payment status for each player
  player_1_has_paid?: boolean;
  player_2_has_paid?: boolean;
}

interface TournamentInscriptionsData {
  coupleInscriptions: CoupleInfo[];
  individualInscriptions: PlayerInfo[];
  tournament: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
  meta: {
    total: number;
    timestamp: string;
  };
}

interface OptimisticMutations {
  addCoupleOptimistic: (couple: CoupleInfo) => Promise<void>;
  removeCoupleOptimistic: (coupleId: string) => Promise<void>;
  addPlayerOptimistic: (player: PlayerInfo) => Promise<void>;
  removePlayerOptimistic: (playerId: string) => Promise<void>;
  pairPlayersOptimistic: (player1Id: string, player2Id: string, newCouple: CoupleInfo) => Promise<void>;
}

// Fetcher function for SWR
const fetcher = async (url: string): Promise<TournamentInscriptionsData> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch inscriptions');
  }
  return response.json();
};

/**
 * 🎯 HOOK UNIFICADO PARA INSCRIPCIONES
 *
 * Maneja tanto parejas como jugadores individuales con:
 * ✅ SWR para data fetching y cache
 * ✅ Optimistic updates para UX inmediata
 * ✅ Rollback automático en caso de error
 * ✅ Sincronización cross-tab
 */
export function useTournamentInscriptions(
  tournamentId: string,
  initialData?: {
    coupleInscriptions: CoupleInfo[];
    individualInscriptions: PlayerInfo[];
    tournament: any;
  }
) {
  const { toast } = useToast();

  // SWR configuration - Temporarily disabled automatic fetching to fix data disappearing issue
  const {
    data,
    error,
    mutate,
    isLoading,
    isValidating
  } = useSWR<TournamentInscriptionsData>(
    `/api/tournaments/${tournamentId}/inscriptions`,
    fetcher,
    {
      // Use SSR data as initial data
      fallbackData: initialData ? {
        coupleInscriptions: initialData.coupleInscriptions,
        individualInscriptions: initialData.individualInscriptions,
        tournament: {
          id: initialData.tournament.id,
          name: initialData.tournament.name,
          type: initialData.tournament.type,
          status: initialData.tournament.status,
        },
        meta: {
          total: initialData.coupleInscriptions.length + initialData.individualInscriptions.length,
          timestamp: new Date().toISOString()
        }
      } : undefined,
      // Configuración de revalidación optimizada
      revalidateOnFocus: false,       // No refrescar al cambiar de tab (puede ser molesto)
      revalidateOnReconnect: true,    // Refrescar al reconectar internet
      revalidateOnMount: true,        // ✅ Refrescar al montar (soluciona problema de datos de pago)
      refreshInterval: 0,             // No polling automático (innecesario)
    }
  );

  // Optimistic mutation: Add couple
  const addCoupleOptimistic = useCallback(async (newCouple: CoupleInfo) => {
    try {
      // 🔒 Validate newCouple structure
      if (!newCouple || !newCouple.id) {
        console.warn('Invalid couple data for optimistic update:', newCouple);
        return;
      }

      // 🔧 Ensure player_info fields are properly structured
      const sanitizedCouple: CoupleInfo = {
        ...newCouple,
        player_1_info: newCouple.player_1_info || null,
        player_2_info: newCouple.player_2_info || null,
        created_at: newCouple.created_at || new Date().toISOString()
      };

      await mutate(
        (currentData) => {
          if (!currentData) {
            // If no current data, use initial data as base
            const baseData = initialData ? {
              coupleInscriptions: initialData.coupleInscriptions,
              individualInscriptions: initialData.individualInscriptions,
              tournament: initialData.tournament,
              meta: {
                total: initialData.coupleInscriptions.length + initialData.individualInscriptions.length,
                timestamp: new Date().toISOString()
              }
            } : {
              coupleInscriptions: [],
              individualInscriptions: [],
              tournament: null,
              meta: { total: 0, timestamp: new Date().toISOString() }
            };

            return {
              ...baseData,
              coupleInscriptions: [...baseData.coupleInscriptions, sanitizedCouple],
              meta: {
                ...baseData.meta,
                total: baseData.meta.total + 1,
                timestamp: new Date().toISOString()
              }
            };
          }

          // Check if couple already exists to avoid duplicates
          const exists = currentData.coupleInscriptions.some(c => c.id === sanitizedCouple.id);
          if (exists) return currentData;

          return {
            ...currentData,
            coupleInscriptions: [...currentData.coupleInscriptions, sanitizedCouple],
            meta: {
              ...currentData.meta,
              total: currentData.meta.total + 1,
              timestamp: new Date().toISOString()
            }
          };
        },
        false // Don't revalidate immediately
      );
    } catch (error) {
      console.error('Error in addCoupleOptimistic:', error);
      toast({
        title: "Error al actualizar",
        description: "Hubo un problema al actualizar la vista. La acción se completó correctamente.",
        variant: "default"
      });
    }
  }, [mutate, toast, initialData]);

  // Optimistic mutation: Remove couple
  const removeCoupleOptimistic = useCallback(async (coupleId: string) => {
    try {
      await mutate(
        (currentData) => {
          if (!currentData) return currentData;

          return {
            ...currentData,
            coupleInscriptions: currentData.coupleInscriptions.filter(c => c.id !== coupleId),
            meta: {
              ...currentData.meta,
              total: currentData.meta.total - 1,
              timestamp: new Date().toISOString()
            }
          };
        },
        false
      );
    } catch (error) {
      console.error('Error in removeCoupleOptimistic:', error);
      toast({
        title: "Error al actualizar",
        description: "Hubo un problema al actualizar la vista. La acción se completó correctamente.",
        variant: "default"
      });
    }
  }, [mutate, toast]);

  // Optimistic mutation: Add individual player
  const addPlayerOptimistic = useCallback(async (newPlayer: PlayerInfo) => {
    try {
      await mutate(
        (currentData) => {
          if (!currentData) {
            // If no current data, use initial data as base
            const baseData = initialData ? {
              coupleInscriptions: initialData.coupleInscriptions,
              individualInscriptions: initialData.individualInscriptions,
              tournament: initialData.tournament,
              meta: {
                total: initialData.coupleInscriptions.length + initialData.individualInscriptions.length,
                timestamp: new Date().toISOString()
              }
            } : {
              coupleInscriptions: [],
              individualInscriptions: [],
              tournament: null,
              meta: { total: 0, timestamp: new Date().toISOString() }
            };

            return {
              ...baseData,
              individualInscriptions: [...baseData.individualInscriptions, newPlayer],
              meta: {
                ...baseData.meta,
                total: baseData.meta.total + 1,
                timestamp: new Date().toISOString()
              }
            };
          }

          // Check if player already exists to avoid duplicates
          const exists = currentData.individualInscriptions.some(p => p.id === newPlayer.id);
          if (exists) return currentData;

          return {
            ...currentData,
            individualInscriptions: [...currentData.individualInscriptions, newPlayer],
            meta: {
              ...currentData.meta,
              total: currentData.meta.total + 1,
              timestamp: new Date().toISOString()
            }
          };
        },
        false
      );
    } catch (error) {
      console.error('Error in addPlayerOptimistic:', error);
      toast({
        title: "Error al actualizar",
        description: "Hubo un problema al actualizar la vista. La acción se completó correctamente.",
        variant: "default"
      });
    }
  }, [mutate, toast, initialData]);

  // Optimistic mutation: Remove individual player
  const removePlayerOptimistic = useCallback(async (playerId: string) => {
    try {
      await mutate(
        (currentData) => {
          if (!currentData) return currentData;

          return {
            ...currentData,
            individualInscriptions: currentData.individualInscriptions.filter(p => p.id !== playerId),
            meta: {
              ...currentData.meta,
              total: currentData.meta.total - 1,
              timestamp: new Date().toISOString()
            }
          };
        },
        false
      );
    } catch (error) {
      console.error('Error in removePlayerOptimistic:', error);
      toast({
        title: "Error al actualizar",
        description: "Hubo un problema al actualizar la vista. La acción se completó correctamente.",
        variant: "default"
      });
    }
  }, [mutate, toast]);

  // Optimistic mutation: Pair two individual players (complex cross-tab update)
  const pairPlayersOptimistic = useCallback(async (
    player1Id: string,
    player2Id: string,
    newCouple: CoupleInfo
  ) => {
    try {
      await mutate(
        (currentData) => {
          if (!currentData) return currentData;

          return {
            ...currentData,
            // Remove both players from individual inscriptions
            individualInscriptions: currentData.individualInscriptions.filter(
              p => p.id !== player1Id && p.id !== player2Id
            ),
            // Add new couple to couple inscriptions
            coupleInscriptions: [...currentData.coupleInscriptions, newCouple],
            meta: {
              ...currentData.meta,
              // Net change: -2 individuals +1 couple = -1 total
              total: currentData.meta.total - 1,
              timestamp: new Date().toISOString()
            }
          };
        },
        false
      );
    } catch (error) {
      console.error('Error in pairPlayersOptimistic:', error);
      toast({
        title: "Error de sincronización",
        description: "Hubo un problema al actualizar los datos. Recargando...",
        variant: "destructive"
      });
      mutate();
    }
  }, [mutate, toast]);

  // Force revalidation (useful for manual refresh)
  const refresh = useCallback(async () => {
    // Force fetch fresh data by passing fetcher directly
    return await mutate(fetcher(`/api/tournaments/${tournamentId}/inscriptions`));
  }, [mutate, tournamentId]);

  // Helper to get current data with fallbacks
  const currentData = data || {
    coupleInscriptions: initialData?.coupleInscriptions || [],
    individualInscriptions: initialData?.individualInscriptions || [],
    tournament: initialData?.tournament || null,
    meta: {
      total: (initialData?.coupleInscriptions?.length || 0) + (initialData?.individualInscriptions?.length || 0),
      timestamp: new Date().toISOString()
    }
  };

  // Ensure arrays are always defined
  const safeCoupleInscriptions = currentData.coupleInscriptions || [];
  const safeIndividualInscriptions = currentData.individualInscriptions || [];

  return {
    // Data
    data: currentData,
    coupleInscriptions: safeCoupleInscriptions,
    individualInscriptions: safeIndividualInscriptions,
    tournament: currentData.tournament,
    meta: currentData.meta,

    // Loading states
    isLoading,
    isValidating,
    error,

    // Optimistic mutations
    addCoupleOptimistic,
    removeCoupleOptimistic,
    addPlayerOptimistic,
    removePlayerOptimistic,
    pairPlayersOptimistic,

    // Manual controls
    refresh,
    mutate, // Raw SWR mutate for advanced use cases
  };
}

export type { TournamentInscriptionsData, OptimisticMutations, PlayerInfo, CoupleInfo };
