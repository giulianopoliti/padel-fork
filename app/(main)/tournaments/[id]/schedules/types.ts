import { Database } from '@/database.types'

// Base database types
type Tables = Database['public']['Tables']
type TournamentRow = Tables['tournaments']['Row']
type TournamentFechaRow = Tables['tournament_fechas']['Row']
type TimeSlotRow = Tables['tournament_time_slots']['Row']
type CoupleRow = Tables['couples']['Row']
type PlayerRow = Tables['players']['Row']
type UserRow = Tables['users']['Row']
type AvailabilityRow = Tables['couple_time_availability']['Row']

// User roles and permissions
export type UserRole = 'PLAYER' | 'COACH' | 'CLUB' | 'ORGANIZADOR'

export interface UserAccess {
  userId: string
  role: UserRole
  isOrganizer: boolean
  isInscribed: boolean
  coupleId?: string
  playerId?: string
  clubId?: string
}

// Tournament and fecha data
export interface TournamentBasic {
  id: string
  name: string
  club_id: string
  clubName: string
  status: string
  type: 'LONG' | 'AMERICAN'
}

export interface TournamentFecha {
  id: string
  tournament_id: string
  fecha_number: number
  name: string
  description?: string
  start_date?: string
  end_date?: string
  status: 'NOT_STARTED' | 'SCHEDULING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
  max_matches_per_couple?: number
  estimated_match_duration_minutes: 60 | 75 | 90
  round_type: 'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL'
  bracket_key: 'MAIN' | 'GOLD' | 'SILVER'
  bracket_label?: string | null
  created_at?: string
}

// Time slot related types
export interface TimeSlot {
  id: string
  fecha_id: string
  date: string
  start_time: string
  end_time: string
  court_name?: string
  max_matches: number
  is_available: boolean
  description?: string
  created_at: string
  slot_type: 'TIME_RANGE' | 'FREE_DATE'
  is_system: boolean
}

export interface TimeSlotWithAvailability extends TimeSlot {
  availableCouples: CoupleAvailability[]
  totalAvailable: number
}

// Couple and availability types
export interface CoupleBasic {
  id: string
  player1: {
    id: string
    first_name: string
    last_name: string
  }
  player2: {
    id: string
    first_name: string
    last_name: string
  }
}

export interface CoupleAvailability {
  couple_id: string
  couple: CoupleBasic
  is_available: boolean
  notes?: string
}

// Form data types
export interface CreateTimeSlotData {
  fecha_id: string
  date: string
  start_time: string
  end_time: string
  max_matches?: number
  court_name?: string
  description?: string
}

export interface UpdateAvailabilityData {
  couple_id: string
  time_slot_id: string
  is_available: boolean
  notes?: string
}

export interface UpdateFreeDatePreferenceData {
  couple_id: string
  time_slot_id: string
  requested: boolean
  notes?: string
}

// API Response types
export interface ScheduleData {
  tournament: TournamentBasic
  fecha: TournamentFecha
  timeSlots: TimeSlotWithAvailability[]
  userAccess: UserAccess
}

export interface PlayerScheduleData {
  tournament: TournamentBasic
  fecha: TournamentFecha
  bracket_assignment?: {
    key: 'GOLD' | 'SILVER'
    label: 'Copa de Oro' | 'Copa de Plata'
  } | null
  can_edit_availability?: boolean
  availability_restriction_reason?: string | null
  timeSlots: (TimeSlot & {
    my_availability?: {
      couple_id: string
      is_available: boolean
      notes?: string | null
    }
    couple_availabilities?: {
      is_available: boolean
    }[]
  })[]
  coupleInfo: {
    id: string
    player1_name: string
    player2_name: string
  }
  userAccess: UserAccess
}

// Action result types
export interface ActionResult<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// Form state types for React 19
export interface FormState {
  success: boolean
  message: string
  errors?: Record<string, string[]>
}

// Validation types
export interface TimeSlotValidation {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

// Filter and sorting types
export interface ScheduleFilters {
  date?: string
  court?: string
  availability?: 'all' | 'available' | 'unavailable'
  sortBy?: 'date' | 'time' | 'court' | 'availability'
  sortOrder?: 'asc' | 'desc'
}

// Constants for UI
export const MAX_NOTE_LENGTH = 200
