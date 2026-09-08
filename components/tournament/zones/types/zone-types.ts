/**
 * Clean, serializable types for Tournament Zones
 * 
 * These types ensure all data passed between Server and Client Components
 * contains only plain objects that can be safely serialized.
 */

// Player statistics for a couple
export interface CoupleStats {
  played: number
  won: number
  lost: number
  scored: number
  conceded: number
  points: number
}

// Clean, serializable couple data
export interface SerializableCouple {
  id: string
  position?: number
  player1Name: string
  player2Name: string
  stats: CoupleStats
  // Optional metadata for operations (always serializable)
  metadata?: {
    player1Id?: string
    player2Id?: string
    isDisqualified?: boolean
    disqualificationId?: string
    disqualificationPhase?: string
    registrationDate?: string // ISO string, not Date object
    // Keep original data for name preservation during optimistic updates
    originalPlayerData?: {
      player1?: {
        id?: string
        firstName?: string
        lastName?: string
        score?: number
      }
      player2?: {
        id?: string
        firstName?: string
        lastName?: string
        score?: number
      }
    }
  }
}

// Clean zone data structure
export interface CleanZone {
  id: string
  name: string
  capacity: number
  maxCouples: number
  couples: SerializableCouple[]
  createdAt: string // ISO string
}

// Available couples waiting to be assigned
export interface AvailableCouple {
  id: string
  player1Name: string
  player2Name: string
  metadata?: {
    player1Id?: string
    player2Id?: string
    player1Score?: number
    player2Score?: number
  }
}

// API response structures
export interface ZonesDataResponse {
  success: boolean
  zones?: CleanZone[]
  error?: string
}

export interface AvailableCouplesResponse {
  success: boolean
  couples?: AvailableCouple[]
  error?: string
}

// Mutation result types
export interface MutationResult {
  success: boolean
  message?: string
  error?: string
}

// Tournament zones complete data
export interface TournamentZonesData {
  zones: CleanZone[]
  availableCouples: AvailableCouple[]
  isLoading: boolean
  error: string | null
}

export interface TournamentZonesDataWithUtils extends TournamentZonesData {
  refresh: () => Promise<void>
  optimisticUpdate: (updateFn: any) => Promise<void>
}

// Match data types for results display
export interface Match {
  id: string
  couple1_id: string
  couple2_id: string
  result_couple1?: number
  result_couple2?: number
  status: string
  winner_id?: string
  zone_id?: string
  round?: string
  court?: number | null
}

export interface MatchResult {
  status: string
  result: string | null
  isPending: boolean
  isWin?: boolean
}
