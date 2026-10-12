import type { Database } from '@/database.types';

type MatchStatus = Database["public"]["Enums"]["match_status"];

export type Role = "CLUB" | "PLAYER" | "COACH" | "ORGANIZADOR"
export type Round = "ZONE" | "32VOS" | "16VOS" | "8VOS" | "4TOS" | "SEMIFINAL" | "FINAL"

// Tournament Format Types
export type TournamentFormat = "AMERICAN_2" | "AMERICAN_3" | "LONG";

export interface TournamentFormatConfig {
  zoneRounds: number;
  setsPerMatch: number;
  zoneCapacity: {
    ideal: number;
    max: number;
  };
  edgeRules: EdgeRule[];
}

export interface EdgeRule {
  condition: "ZONE_OVERFLOW" | "ODD_COUPLES" | "LATE_REGISTRATION";
  action: "ADD_ROUND" | "CREATE_ZONE" | "MERGE_ZONES" | "MODIFY_ROUNDS";
  parameters?: Record<string, any>;
}

export interface ZoneOverflowStrategy {
  type: "NORMAL_ZONE" | "OVERFLOW_ZONE" | "NEW_ZONE";
  zones?: string[];
  warning?: string;
  disabled?: boolean;
}
export type Category = {
  name: string // "2da", "3ra", "4ta", etc.
  lower_range: number
  upper_range: number
}


export type Club = {
  id: string
  name: string
  address: string;
  cover_image_url?: string | null
  image?: string // For compatibility with components that expect image field
}

export type Player = {
  id: string
  firstName: string
  lastName: string
  score: number
  category: string // Category name, calculated automatically based on score, foreign key to category table
  preferredHand?: "LEFT" | "RIGHT" // Mano hábil
  racket?: string // Paleta
  preferredSide?: "FOREHAND" | "BACKHAND" // Lado del que juega
  createdAt: string
  club_name: string
  gender: "MALE" | "FEMALE"
  profileImage?: string // Profile image URL
}

export type PlayerDTO = {
  id: string
  first_name: string
  last_name: string
  dni: string | null,
  dni_is_temporary?: boolean | null
  score: number
  category_name: string
  gender: Gender
}

export type Tournament = {
  id: string
  name: string
  club: Club
  createdAt: string
  category: string // Category ID
  gender: string
  status: "NOT_STARTED" | "IN_PROGRESS" | "FINISHED"
  type: "AMERICAN" | "LONG"
  format_type?: TournamentFormat
  format_config?: TournamentFormatConfig
  startDate: string
  endDate: string
  pre_tournament_image_url?: string | null
  enableTransferProof?: boolean
  transferAlias?: string | null
  transferAmount?: number | null
  price?: number | null
  description?: string
  address?: string
  time?: string
  prize?: string
  maxParticipants?: number
  currentParticipants?: number
}

export type Couple = {
  id: string
  player_1: string
  player_2: string
}
export type CoupleWithStats = {
  id: string
  player1: PlayerDTO | null
  player2: PlayerDTO | null
}

export type MatchResult = {
  sets: {
    setNumber: number;
    player1Score: number;
    player2Score: number;
  }[];
  winner: string;
};

export type AmericanMatchResult = {
  games: {
    gameNumber: number;
    couple1Score: number;
    couple2Score: number;
  }[];
  winner: string;
};

export type LargeMatchResult = {
  sets: {
    setNumber: number;
    couple1Score: number;
    couple2Score: number;
  }[];
  tiebreak?: {
    couple1Score: number;
    couple2Score: number;
  };
  winner: string;
};

export interface BaseMatch {
  id: string;
  tournament_id: string;
  couple_1: Couple;
  couple_2: Couple;
  created_at: string;
  round: Round;
  status: MatchStatus; // Uses: PENDING, IN_PROGRESS, FINISHED, CANCELED
  court?: string | null;
  date?: string; // Adding date field since it's used in the table
  // Optional result fields (games or sets won by each couple)
  result_couple1?: string | null;
  result_couple2?: string | null;
}

export interface AmericanMatch extends BaseMatch {
  type: "AMERICAN";
  result_couple_1?: AmericanMatchResult;
  result_couple_2?: AmericanMatchResult;
}

export interface LargeMatch extends BaseMatch {
  type: "LARGE";
  result_couple_1?: LargeMatchResult;
  result_couple_2?: LargeMatchResult;
}

export type Match = AmericanMatch | LargeMatch;

export type User = {
  id: string
  email: string
  role: Role
  playerId?: string // If the user is a player
  clubId?: string // If the user is a club
  coachId?: string // If the user is a coach
  avatar_url?: string // User profile avatar URL
  auth_id?: string
  created_at?: string
}

// 🚀 TIPO OPTIMIZADO: Detalles completos del usuario con IDs de rol específicos
export interface DetailedUserDetails extends User {
  player_id?: string | null;
  club_id?: string | null;
  coach_id?: string | null;
  organizador_id?: string | null;
  player_status?: string | null; // Para manejar el estado del jugador (active/inactive)
  name?: string | null; // Organization name or club name
  first_name?: string | null; // Player first name
  last_name?: string | null; // Player last name
  logo_url?: string | null; // Organization logo
}

export type Zone = {
  id: string
  name: string
  description?: string
  created_at: string
  couples: Couple[]
  max_couples?: number
  rounds_per_couple?: number
}


export type TournamentStatus = 
  | 'NOT_STARTED'        // Inscripciones abiertas
  | 'ZONE_PHASE'         // Fase de zonas activa
  | 'BRACKET_PHASE'      // Fase eliminatoria
  | 'FINISHED'           // Torneo finalizado  
  | 'CANCELED'           // Torneo cancelado
  | 'FINISHED_POINTS_PENDING'      // Puntos pendientes
  | 'FINISHED_POINTS_CALCULATED'   // Puntos aplicados
  // Legacy states - mantener para compatibilidad
  | 'IN_PROGRESS'        // Legacy: en progreso general
  | 'PAIRING'            // Legacy: emparejamiento
  | 'ZONE_REGISTRATION'  // Legacy: registro de zonas
  | 'ZONES_READY'        // Legacy: zonas listas
  | 'MATCHES_READY'      // Legacy: matches listos
  | 'ELIMINATION';       // Legacy: eliminación

// Interfaces para cálculo de puntos
export interface MatchPoints {
  playerId: string;
  points: number;
  matchId: string;
  playerName: string;
}

export interface PlayerScore {
  playerId: string;
  pointsBefore: number;
  pointsAfter: number;
  pointsEarned: number;
  playerName: string;
  bonus?: number; // puntos extra por resultado final
}

export interface TournamentPointsCalculation {
  playerScores: PlayerScore[];
  totalMatches: number;
  matchPoints?: Omit<MatchPointsCouple, 'id' | 'created_at'>[];
}

export type MatchPointsCouple = Database['public']['Tables']['match_points_couples']['Row'];

export enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  MIXED = "MIXED",
}

// Bracket status enum
export type TournamentBracketStatus = 
  | 'NOT_STARTED'           // Aún se pueden agregar parejas
  | 'REGISTRATION_LOCKED'   // No más parejas nuevas
  | 'BRACKET_GENERATED'     // Bracket creado con placeholders
  | 'BRACKET_ACTIVE';       // Matches del bracket en progreso

// Zone position interface for dynamic bracket
export interface ZonePosition {
  id: string;
  tournament_id: string;
  zone_id: string;
  couple_id: string;
  position: number;         // 1-4 position in zone
  is_definitive: boolean;   // True when position is final
  points: number;
  wins: number;
  losses: number;
  games_for: number;
  games_against: number;
  created_at: string;
  updated_at: string;
}

// Nuevos tipos para restricciones y capacidades de torneo
export interface TournamentCapabilities {
  canRegisterCouples: boolean
  canMoveCouples: boolean
  canDeleteCouples: boolean
  canGenerateBracket: boolean
  canModifyZones: boolean
  canStartTournament: boolean
  phase: TournamentStatus
}

export interface CoupleMovementRestriction {
  allowed: boolean
  reason?: string
  details?: string
  hasPlayedMatches?: boolean
}

// Extender Tournament interface
export type TournamentWithCapabilities = Tournament & {
  capabilities?: TournamentCapabilities
  bracketGeneratedAt?: string
}
