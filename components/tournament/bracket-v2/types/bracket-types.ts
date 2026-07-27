/**
 * BRACKET TYPES V2 - SISTEMA MODERNO DE BRACKETS
 * 
 * Tipos fundamentales para el nuevo sistema de visualización de brackets.
 * Diseñados para ser:
 * - Extensibles (soportar diferentes formatos de torneo)
 * - Type-safe (TypeScript estricto)
 * - Modulares (separación clara de responsabilidades)
 * - Compatibles con el algoritmo serpenteo existente
 * 
 * @author Claude Code Assistant
 * @version 2.0.0
 * @created 2025-01-17
 */

// ============================================================================
// ENUMS Y TIPOS BASE
// ============================================================================

/**
 * Estados posibles de un match en el sistema
 */
export type MatchStatus = 
  | 'DRAFT'          // Match oculto para jugadores hasta publicacion
  | 'PENDING'        // Match programado pero no iniciado
  | 'IN_PROGRESS'    // Match en curso
  | 'FINISHED'       // Match completado con resultado
  | 'CANCELED'       // Match cancelado
  | 'BYE'           // Match con BYE (avance automático)
  | 'WAITING_OPPONENT' // Esperando que se defina el oponente

/**
 * Rounds disponibles en el sistema de eliminación
 * Ordenados desde el primer round hasta la final
 */
export type Round = 
  | '32VOS'     // 32 participantes -> 16
  | '16VOS'     // 16 participantes -> 8  
  | '8VOS'      // 8 participantes -> 4
  | '4TOS'      // 4 participantes -> 2
  | 'SEMIFINAL' // 2 matches para definir finalistas
  | 'FINAL'     // Match definitorio

/**
 * Algoritmos de bracket soportados
 */
export type BracketAlgorithm = 
  | 'traditional'  // Seeding tradicional estándar
  | 'serpentine'   // Algoritmo serpenteo (1A vs 1B solo en final)
  | 'custom'       // Algoritmo personalizado futuro

/**
 * Formatos de match soportados (extensible para futuro)
 */
export type MatchFormat = 
  | 'best-of-1'    // Un solo set (actual)
  | 'best-of-3'    // Mejor de 3 sets (futuro)
  | 'best-of-5'    // Mejor de 5 sets (futuro)

/**
 * Tipos de scoring soportados
 */
export type ScoringType = 
  | 'standard'     // Scoring tradicional de tenis
  | 'no-ad'        // Sin ventaja
  | 'super-tiebreak' // Super tiebreak decisivo

// ============================================================================
// INTERFACES DE DATOS CORE
// ============================================================================

/**
 * Información básica de un jugador
 */
export interface PlayerData {
  id: string
  first_name: string
  last_name: string
  /** Score/ranking del jugador (opcional) */
  score?: number
}

/**
 * Información completa de una pareja
 */
export interface CoupleData {
  id: string
  player1_id: string
  player2_id: string
  /** Nombre generado de la pareja (player1 / player2) */
  name?: string
  /** Detalles del jugador 1 */
  player1_details?: PlayerData
  /** Detalles del jugador 2 */
  player2_details?: PlayerData
  /** Información de seeding si está disponible */
  seed?: SeedInfo
}

/**
 * Información de seeding de una pareja
 * Conecta con la tabla tournament_couple_seeds
 */
export interface SeedInfo {
  /** ID de tournament_couple_seeds */
  id?: string
  /** Seed global en el torneo (1 = mejor seed) */
  seed: number
  /** Posicion especifica en el bracket (1-16 tipicamente) */
  bracket_position: number
  /** ID de la zona de origen */
  zone_id?: string | null
  /** ID de la pareja asociada */
  couple_id: string
  /** Nombre de la zona para display */
  zone_name?: string | null
  /** Posicion que obtuvo en su zona (1 = ganador zona) */
  zone_position?: number | null
  /** Si el seed sigue siendo un placeholder pendiente */
  is_placeholder?: boolean
  /** Zona que debe resolver este placeholder */
  placeholder_zone_id?: string | null
  /** Posicion de zona que debe resolver este placeholder */
  placeholder_position?: number | null
  /** Texto original del placeholder */
  placeholder_label?: string | null
  /** Si fue creado como placeholder aunque luego haya sido resuelto */
  created_as_placeholder?: boolean
}

/**
 * Información de una zona del torneo
 */
export interface ZoneData {
  id: string
  name: string
  /** Parejas asignadas a esta zona */
  couples: CoupleData[]
  /** Indica si la zona ya finalizó */
  is_completed: boolean
}

// ============================================================================
// SISTEMA DE PARTICIPANTES (SLOTS)
// ============================================================================

/**
 * Tipos de participante en un slot de match
 */
export type ParticipantType = 
  | 'couple'      // Pareja real confirmada
  | 'placeholder' // Placeholder (ej: "Ganador Zona A")  
  | 'bye'         // BYE (avance automático)
  | 'empty'       // Slot vacío (sin pareja asignada)

/**
 * Datos de un placeholder
 * Se define en placeholder-types.ts para evitar imports circulares
 */
export interface PlaceholderData {
  /** Texto a mostrar (ej: "1° Zona A") */
  display: string
  /** ID de zona que alimenta el placeholder */
  zoneId?: string | null
  /** Nombre de zona para display */
  zoneName?: string | null
  /** Posicion esperada dentro de la zona */
  position?: number | null
  /** Match origen cuando el placeholder depende de un resultado anterior */
  sourceMatchId?: string | null
  /** Regla que define este placeholder */
  rule: PlaceholderRule
  /** Si ya se puede resolver a una pareja específica */
  isDefinitive: boolean
  /** Pareja real si ya está resuelta */
  resolvedCouple?: CoupleData
}

/**
 * Regla que define cómo resolver un placeholder
 */
export interface PlaceholderRule {
  type: 'zone-winner' | 'zone-runner-up' | 'zone-position' | 'match-winner'
  /** ID de zona (para placeholders de zona) */
  zoneId?: string
  /** Posición en zona (1 = ganador, 2 = segundo, etc) */
  position?: number
  /** ID de match padre (para placeholders de match) */
  parentMatchId?: string
}

/**
 * Slot de participante en un match
 * Puede contener una pareja real, un placeholder o un BYE
 */
export interface ParticipantSlot {
  /** Tipo de participante */
  type: ParticipantType
  /** Pareja real (si type === 'couple') */
  couple?: CoupleData
  /** Datos de placeholder (si type === 'placeholder') */
  placeholder?: PlaceholderData
  /** Información de seed (si está disponible) */
  seed?: SeedInfo
}

// ============================================================================
// RESULTADOS DE MATCHES
// ============================================================================

/**
 * Resultado de un set individual
 */
export interface SetResult {
  /** Puntos del slot 1 */
  slot1Score: number
  /** Puntos del slot 2 */
  slot2Score: number
  /** Resultado de tiebreaker si aplica */
  tiebreaker?: {
    slot1: number
    slot2: number
  }
}

/**
 * Resultado completo de un match
 * Extensible para diferentes formatos (1 set, 3 sets, etc)
 */
export interface MatchResultV2 {
  /** Ganador del match */
  winner: 'slot1' | 'slot2'
  /** Resultados de sets (array para soportar best-of-3, etc) */
  sets: SetResult[]
  /** Metadatos adicionales */
  metadata?: {
    /** Duración del match en minutos */
    duration?: number
    /** Cancha donde se jugó */
    court?: string
    /** Árbitro o referee */
    referee?: string
    /** Timestamp de finalización */
    finished_at?: string
  }
}

/**
 * Información de programación de un match
 */
export interface MatchScheduling {
  /** Cancha asignada */
  court?: string
  /** Hora programada */
  scheduled_time?: string
  /** Hora real de inicio */
  actual_start_time?: string
  /** Hora real de finalización */
  actual_end_time?: string
}

// ============================================================================
// MATCH PRINCIPAL
// ============================================================================

/**
 * Match del sistema de brackets V2
 * Diseñado para ser extensible y type-safe
 */
export interface BracketMatchV2 {
  /** ID único del match */
  id: string
  /** Round en el que se juega este match */
  round: Round
  /** Orden dentro del round (1, 2, 3...) */
  order_in_round: number
  /** Estado actual del match */
  status: MatchStatus
  
  /** Participantes del match */
  participants: {
    slot1: ParticipantSlot
    slot2: ParticipantSlot
  }
  
  /** Resultado del match (si está completado) */
  result?: MatchResultV2
  /** Información de programación */
  scheduling?: MatchScheduling
  
  // Campos de resultado directo para compatibilidad con componentes existentes
  result_couple1?: string | number | null
  result_couple2?: string | number | null
  winner_id?: string | null
  couple1_id?: string | null
  couple2_id?: string | null
  tournament_couple_seed1_id?: string | null
  tournament_couple_seed2_id?: string | null
  /** Metadatos adicionales */
  metadata?: {
    /** Si este match fue generado automáticamente */
    is_auto_generated?: boolean
    /** Timestamp de creación */
    created_at?: string
    /** Última actualización */
    updated_at?: string
    /** Información específica del algoritmo usado */
    algorithm_info?: {
      algorithm: BracketAlgorithm
      seed_pair?: [number, number] // Para algoritmo serpenteo
    }
  }
}

// ============================================================================
// POSICIONAMIENTO Y LAYOUT
// ============================================================================

/**
 * Posición calculada de un match en el layout visual
 */
export interface MatchPosition {
  /** Match al que corresponde esta posición */
  match: BracketMatchV2
  /** Coordenada X en pixels */
  x: number
  /** Coordenada Y en pixels */
  y: number
  /** Ancho en pixels */
  width: number
  /** Alto en pixels */
  height: number
}

/**
 * Línea conectora entre matches
 * Para el sistema SVG de líneas
 */
export interface ConnectorLine {
  /** Coordenada X inicial */
  x1: number
  /** Coordenada Y inicial */
  y1: number
  /** Coordenada X final */
  x2: number
  /** Coordenada Y final */
  y2: number
  /** Índice del round (para styling) */
  roundIndex: number
  /** Metadatos para styling */
  metadata?: {
    /** Tipo de línea */
    type?: 'horizontal' | 'vertical' | 'connector'
    /** Si conecta matches con BYE */
    hasBYE?: boolean
  }
}

/**
 * Dimensiones totales del bracket
 */
export interface BracketDimensions {
  /** Ancho total necesario */
  totalWidth: number
  /** Alto total necesario */
  totalHeight: number
  /** Número de columnas (rounds) */
  columns: number
  /** Número máximo de matches por columna */
  maxMatchesPerColumn: number
}

// ============================================================================
// CONFIGURACIÓN DEL BRACKET
// ============================================================================

/**
 * Configuración de layout del bracket
 */
export interface BracketLayoutConfig {
  /** Ancho de cada columna (round) */
  columnWidth: number
  /** Alto de cada match card */
  matchHeight: number
  /** Espaciado entre matches */
  spacing: number
  /** Si el layout debe ser responsive */
  responsive: boolean
}

/**
 * Features habilitadas en el bracket
 */
export interface BracketFeatures {
  /** Mostrar información de seeds */
  showSeeds: boolean
  /** Mostrar información de zonas */
  showZoneInfo: boolean
  /** Habilitar drag & drop */
  enableDragDrop: boolean
  /** Habilitar scoring en vivo */
  enableLiveScoring: boolean
  /** Mostrar estadísticas */
  showStatistics: boolean
  /** Procesar BYEs automáticamente */
  autoProcessBYEs: boolean
}

/**
 * Configuración completa del bracket
 */
export interface BracketConfig {
  /** Formato de matches */
  matchFormat: MatchFormat
  /** Tipo de scoring */
  scoring: ScoringType
  /** Configuración de layout */
  layout: BracketLayoutConfig
  /** Features habilitadas */
  features: BracketFeatures
  /** Algoritmo utilizado */
  algorithm: BracketAlgorithm
}

// ============================================================================
// PROPS DE COMPONENTES
// ============================================================================

/**
 * Props del componente principal BracketVisualizationV2
 */
export interface BracketVisualizationV2Props {
  /** ID del torneo */
  tournamentId: string
  /** Algoritmo de bracket a usar */
  algorithm?: BracketAlgorithm
  /** Configuración personalizada */
  config?: Partial<BracketConfig>
  /** Si el usuario es propietario (puede editar) */
  isOwner?: boolean
  /** Status del torneo (para mostrar vistas condicionales) */
  tournamentStatus?: string
  /** Callback cuando se actualiza un match */
  onMatchUpdate?: (matchId: string, result: MatchResultV2) => void
  /** Callback para refrescar datos */
  onDataRefresh?: () => void
  /** Callback cuando cambia el estado del bracket */
  onBracketStateChange?: (state: BracketState) => void
}

/**
 * Estados posibles del bracket completo
 */
export enum BracketState {
  /** No generado aún */
  NOT_GENERATED = 'NOT_GENERATED',
  /** Generado con placeholders */
  GENERATED_WITH_PLACEHOLDERS = 'GENERATED_WITH_PLACEHOLDERS', 
  /** Parcialmente resuelto */
  PARTIALLY_RESOLVED = 'PARTIALLY_RESOLVED',
  /** Completamente resuelto */
  FULLY_RESOLVED = 'FULLY_RESOLVED',
  /** Finalizado */
  COMPLETED = 'COMPLETED'
}

// ============================================================================
// TIPOS DE RESPUESTA DE API
// ============================================================================

/**
 * Respuesta estándar de las APIs del bracket
 */
export interface BracketApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  metadata?: {
    timestamp: string
    algorithm: BracketAlgorithm
    totalMatches?: number
  }
}

/**
 * Datos de matches desde la API
 */
export interface BracketDataResponse {
  matches: BracketMatchV2[]
  seeds: SeedInfo[]
  zones: ZoneData[]
  algorithm: BracketAlgorithm
  state: BracketState
}

// ============================================================================
// EXPORT PRINCIPAL
// ============================================================================

/**
 * Tipo principal que representa todo el bracket
 */
export interface BracketData {
  /** Matches del bracket */
  matches: BracketMatchV2[]
  /** Información de seeds */
  seeds: SeedInfo[]
  /** Datos de zonas */
  zones: ZoneData[]
  /** Configuración utilizada */
  config: BracketConfig
  /** Estado actual */
  state: BracketState
  /** Información del algoritmo */
  algorithmInfo: {
    algorithm: BracketAlgorithm
    guarantee?: string
    description?: string
  }
}
