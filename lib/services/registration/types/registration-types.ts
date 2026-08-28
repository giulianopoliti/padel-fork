import type { TournamentCategoryConfig } from "@/lib/services/tournament-category-config"

/**
 * REGISTRATION TYPES
 *
 * Tipos comunes para el sistema de inscripciones con patron Strategy.
 * Estos tipos son compartidos entre todas las estrategias de registro.
 */

export type TournamentType = "AMERICAN" | "LONG"

export type Gender = "MALE" | "FEMALE" | "MIXED"

export type RegistrationType = "individual" | "couple"

// ===== INTERFACES BASE =====

export interface Player {
  id: string
  first_name: string
  last_name: string
  phone: string
  dni: string | null
  dni_is_temporary?: boolean
  gender: Gender
  score?: number
}

export interface Couple {
  id: string
  player1_id: string
  player2_id: string
}

export interface Inscription {
  id: string
  tournament_id: string
  couple_id?: string
  player_id?: string
  is_pending: boolean
  created_at: string
}

export interface Zone {
  id: string
  tournament_id: string
  name: string
  created_at: string
}

export interface ZoneCouple {
  zone_id: string
  couple_id: string
}

// ===== REQUEST/RESPONSE TYPES =====

export interface RegisterCoupleRequest {
  tournamentId: string
  player1Id: string
  player2Id: string
  /** Si es true, player_id quedara null (inscripcion hecha por organizador) */
  isOrganizerRegistration?: boolean
  termsAccepted?: boolean
  allowBlockedPlayerOverride?: boolean
}

export interface RegisterNewPlayersRequest {
  tournamentId: string
  isOrganizerRegistration?: boolean
  player1: {
    firstName: string
    lastName: string
    phone?: string
    dni?: string | null
    gender: Gender
    forceCreateNew?: boolean
  }
  player2: {
    firstName: string
    lastName: string
    phone?: string
    dni?: string | null
    gender: Gender
    forceCreateNew?: boolean
  }
}

export interface RegisterIndividualRequest {
  tournamentId: string
  playerId: string
}

export interface RegisterAuthenticatedPlayerRequest {
  tournamentId: string
  phone?: string
  termsAccepted?: boolean
}

export interface RemoveCoupleRequest {
  tournamentId: string
  coupleId: string
  recordLateWithdrawal?: boolean
}

// ===== RESULT TYPES =====

export interface RegistrationResult {
  success: boolean
  message?: string
  error?: string
  inscriptionId?: string
  coupleId?: string
  playerId?: string
  inscription?: any
}

export interface PlayerRegistrationResult extends RegistrationResult {
  playerId?: string
  wasCategorized?: boolean
  newScore?: number
}

export interface CoupleRegistrationResult extends RegistrationResult {
  coupleId?: string
  inscription?: Inscription
  zoneAssigned?: boolean
  zoneId?: string
  rollbackPerformed?: boolean
}

export interface RemovalResult {
  success: boolean
  message?: string
  error?: string
  removedFromZones?: boolean
  zonesCount?: number
}

// ===== CONTEXT DATA =====

export interface Tournament {
  id: string
  name: string
  type: TournamentType
  gender: Gender
  category_name?: string
  category_config?: TournamentCategoryConfig | null
  status: string
  validate_inscriptions: boolean
}

export interface RegistrationContext {
  tournament: Tournament
  user: {
    id: string
    role: string
  }
  supabase: any
}

// ===== VALIDATION TYPES =====

export interface ValidationResult {
  isValid: boolean
  error?: string
  warnings?: string[]
}

export interface PlayerValidationResult extends ValidationResult {
  player?: Player
  needsCategorization?: boolean
}

export interface TournamentValidationResult extends ValidationResult {
  tournament?: Tournament
  canRegister?: boolean
  reason?: string
}
