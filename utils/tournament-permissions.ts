import { Database } from '@/database.types'
import { createClient } from '@/utils/supabase/server'

type SupabaseClient = ReturnType<typeof createClient>

// ============================================================================
// LEGACY TYPES (Sistema Actual - En uso)
// ============================================================================

interface PermissionResult {
  hasPermission: boolean
  reason?: string
  userRole?: string
  source?: 'club_owner' | 'organization_member' | 'admin'
}

// ============================================================================
// NEW TYPES (Sistema V2 - Granular Access Levels)
// ============================================================================

/**
 * Niveles de acceso granulares para torneos
 * @see docs/PERMISSIONS_SPEC.md para detalles completos
 */
export type AccessLevel =
  | 'FULL_MANAGEMENT'      // ADMIN, CLUB owner, ORGANIZADOR owner
  | 'PLAYER_ACTIVE'        // Player inscrito y activo
  | 'PLAYER_ELIMINATED'    // Player inscrito pero eliminado
  | 'PUBLIC_VIEW'          // ORGANIZADOR no owner, PLAYER no inscrito, GUEST
  | 'NO_ACCESS'            // Errores o usuario inválido

/**
 * Permisos específicos que puede tener un usuario
 */
export type TournamentPermission =
  // Permisos de gestión (solo FULL_MANAGEMENT)
  | 'manage_tournament'
  | 'update_results'
  | 'manage_inscriptions'
  | 'upload_images'
  | 'start_tournament'
  | 'cancel_tournament'
  | 'generate_brackets'
  | 'assign_courts'
  | 'manage_schedules'
  | 'recategorize_players'
  | 'modify_tournament_status'
  // Permisos de jugador activo
  | 'view_own_matches'
  | 'view_own_schedule'
  | 'view_own_statistics'
  // Permisos públicos
  | 'view_public'
  | 'view_public_bracket'
  | 'view_public_zones'
  | 'view_public_matches'
  // Permisos de inscripción
  | 'register_couple'

/**
 * Resultado detallado del chequeo de acceso a torneos
 */
export interface TournamentAccessResult {
  /** Nivel de acceso del usuario al torneo */
  accessLevel: AccessLevel

  /** Lista de permisos específicos que tiene el usuario */
  permissions: TournamentPermission[]

  /** Metadata adicional sobre el acceso */
  metadata: {
    /** Rol del usuario en el sistema */
    userRole?: 'ADMIN' | 'CLUB' | 'ORGANIZADOR' | 'PLAYER' | 'COACH'

    /** ¿Usuario está inscrito en el torneo? */
    isInscribed?: boolean

    /** ¿Usuario está eliminado del torneo? */
    isEliminated?: boolean

    /** ¿La inscripción todavía requiere aprobación? */
    isPending?: boolean

    /** ID de la pareja si está inscrito */
    coupleId?: string

    /** ID del jugador si está inscrito */
    playerId?: string

    /** Fuente del permiso de gestión */
    source?: 'admin' | 'club_owner' | 'organization_member' | 'player' | 'public'

    /** Razón del nivel de acceso */
    reason?: string
  }
}

/**
 * Centralized function to check tournament permissions
 * Supports CLUB owners and ORGANIZADOR members with access to the tournament's club
 */
export async function checkTournamentPermissions(
  userId: string, 
  tournamentId: string, 
): Promise<PermissionResult> {
  const supabase = await createClient()
  try {
    // 1. Get user role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()
    
    if (userError || !userData) {
      return {
        hasPermission: false,
        reason: 'Error al obtener datos del usuario'
      }
    }
    
    const userRole = userData.role
    
    // 2. ADMIN users have full access
    if (userRole === 'ADMIN') {
      return {
        hasPermission: true,
        userRole,
        source: 'admin'
      }
    }
    
    // 3. Get tournament data
    const { data: tournamentData, error: tournamentError } = await supabase
      .from('tournaments')
      .select('club_id, organization_id')
      .eq('id', tournamentId)
      .single()
    
    if (tournamentError || !tournamentData) {
      return {
        hasPermission: false,
        reason: 'Error al obtener datos del torneo',
        userRole
      }
    }
    
    // 4. For CLUB users, check direct ownership
    if (userRole === 'CLUB') {
      const { data: clubData, error: clubError } = await supabase
        .from('clubes')
        .select('id')
        .eq('user_id', userId)
        .eq('id', tournamentData.club_id)
        .single()
      
      if (clubError || !clubData) {
        return {
          hasPermission: false,
          reason: 'No eres el propietario de este torneo',
          userRole
        }
      }
      
      return {
        hasPermission: true,
        userRole,
        source: 'club_owner'
      }
    }
    
    // 5. For ORGANIZADOR users, check organization membership and club access
    if (userRole === 'ORGANIZADOR') {
      const hasOrgPermission = await checkOrganizationPermissions(userId, tournamentData.organization_id);
      
      if (!hasOrgPermission) {
        return {
          hasPermission: false,
          reason: 'No tienes acceso a este torneo como organizador',
          userRole
        }
      }
      
      return {
        hasPermission: true,
        userRole,
        source: 'organization_member'
      }
    }
    
    // 6. Other roles don't have permission
    return {
      hasPermission: false,
      reason: 'Rol de usuario no autorizado para gestionar torneos',
      userRole
    }
    
  } catch (error) {
    console.error('Error checking tournament permissions:', error)
    return {
      hasPermission: false,
      reason: 'Error interno al verificar permisos'
    }
  }
}



export async function checkOrganizationPermissions(userId: string, tournamentOrganizationId?: string): Promise<boolean> {
  if (!tournamentOrganizationId) {
    return false
  }

  const supabase = await createClient()
  const {data: organizador, error: organizadorError} = await supabase
    .from('organization_members')
    .select('organizacion_id')
    .eq('user_id', userId)
    .eq('organizacion_id', tournamentOrganizationId)
    .eq('is_active', true)
    .maybeSingle()

  if (organizadorError || !organizador) {
    return false
  }

  return true
}

/**
 * Get all clubs that a user can manage (either as CLUB owner or ORGANIZADOR member)
 */
export async function getUserManagedClubs(
  userId: string,
): Promise<{ club_id: string; source: 'owned' | 'organization' }[]> {
  const supabase = await createClient()
  try {
    // Get user role
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()

    if (!userData) return []

    const clubs: { club_id: string; source: 'owned' | 'organization' }[] = []

    // If CLUB role, get owned club
    if (userData.role === 'CLUB') {
      const { data: clubData } = await supabase
        .from('clubes')
        .select('id')
        .eq('user_id', userId)

      if (clubData) {
        clubs.push(...clubData.map(club => ({ 
          club_id: club.id, 
          source: 'owned' as const 
        })))
      }
    }

    // If ORGANIZADOR role, get organization clubs
    if (userData.role === 'ORGANIZADOR') {
      const { data: orgClubs } = await supabase
        .from('organization_members')
        .select(`
          organization_clubs(
            club_id
          )
        `)
        .eq('user_id', userId)
        .eq('is_active', true)

      if (orgClubs) {
        const organizationClubs = orgClubs
          .flatMap(member => member.organization_clubs)
          .map(oc => ({ 
            club_id: oc.club_id, 
            source: 'organization' as const 
          }))
        
        clubs.push(...organizationClubs)
      }
    }

    return clubs
  } catch (error) {
    console.error('Error getting user managed clubs:', error)
    return []
  }
}

/**
 * USER INSCRIPTION CHECKING
 * Functions to verify if a user is inscribed in a tournament
 */

export interface UserInscriptionResult {
  isInscribed: boolean
  coupleId?: string
  playerId?: string
  isEliminated?: boolean
  isPending?: boolean
  inscriptionDetails?: {
    id: string
    created_at: string
    is_eliminated: boolean
    couple: {
      id: string
      player1_id: string
      player2_id: string
      player1_name?: string
      player2_name?: string
    }
  }
  reason?: string
}

/**
 * Check if a user is inscribed in a tournament (either as player1 or player2 of a couple)
 * This fixes the issue where only the player who registered the couple is considered "inscribed"
 */
export async function checkUserTournamentInscription(
  userId: string, 
  tournamentId: string
): Promise<UserInscriptionResult> {
  const supabase = await createClient()
  
  try {
    // 1. Get user's player profile
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (playerError || !player) {
      return {
        isInscribed: false,
        reason: 'Perfil de jugador no encontrado'
      }
    }

    // 2. Get all inscriptions for this tournament with couple details
    const { data: inscriptions, error: inscriptionError } = await supabase
      .from('inscriptions')
      .select(`
        id,
        created_at,
        couple_id,
        player_id,
        is_eliminated,
        is_pending,
        couples:couple_id (
          id,
          player1_id,
          player2_id,
          player1:players!couples_player1_id_fkey (
            first_name,
            last_name
          ),
          player2:players!couples_player2_id_fkey (
            first_name,
            last_name
          )
        )
      `)
      .eq('tournament_id', tournamentId)
      .eq('es_prueba', false)

    if (inscriptionError) {
      return {
        isInscribed: false,
        reason: 'Error al consultar inscripciones'
      }
    }

    if (!inscriptions || inscriptions.length === 0) {
      return {
        isInscribed: false,
        reason: 'No hay inscripciones para este torneo'
      }
    }

    // 3. Find inscription where current player is either player1 or player2
    const userInscription = inscriptions.find(inscription => {
      if (inscription.player_id === player.id) return true
      const couple = Array.isArray(inscription.couples) ? inscription.couples[0] : inscription.couples as any
      if (!couple) return false
      return couple.player1_id === player.id || couple.player2_id === player.id
    })

    if (!userInscription) {
      return {
        isInscribed: false,
        reason: 'Usuario no está inscrito en este torneo'
      }
    }

    // 4. Check if the couple is eliminated
    if (userInscription.is_eliminated) {
      return {
        isInscribed: true,
        isEliminated: true,
        isPending: false,
        coupleId: userInscription.couple_id,
        playerId: player.id,
        reason: 'La pareja ha sido eliminada del torneo'
      }
    }

    // 5. Build inscription details
    const couple = (Array.isArray(userInscription.couples) ? userInscription.couples[0] : userInscription.couples) as any
    const inscriptionDetails = couple ? {
      id: userInscription.id,
      created_at: userInscription.created_at,
      is_eliminated: userInscription.is_eliminated,
      couple: {
        id: couple.id,
        player1_id: couple.player1_id,
        player2_id: couple.player2_id,
        player1_name: `${couple.player1?.first_name || ''} ${couple.player1?.last_name || ''}`.trim(),
        player2_name: `${couple.player2?.first_name || ''} ${couple.player2?.last_name || ''}`.trim()
      }
    } : undefined

    return {
      isInscribed: true,
      isEliminated: false,
      isPending: Boolean(userInscription.is_pending),
      coupleId: userInscription.couple_id,
      playerId: player.id,
      inscriptionDetails,
      reason: 'Usuario inscrito correctamente'
    }

  } catch (error) {
    console.error('Error checking user tournament inscription:', error)
    return {
      isInscribed: false,
      reason: 'Error interno al verificar inscripción'
    }
  }
}

/**
 * Enhanced tournament permissions that includes inscription checking
 * Combines both admin/organizer permissions AND player inscription status
 */
export interface EnhancedPermissionResult extends PermissionResult {
  inscriptionResult?: UserInscriptionResult
}

export async function checkEnhancedTournamentPermissions(
  userId: string,
  tournamentId: string
): Promise<EnhancedPermissionResult> {
  // First check admin/organizer permissions
  const basicPermissions = await checkTournamentPermissions(userId, tournamentId)

  // If user has management permissions, they don't need to be inscribed
  if (basicPermissions.hasPermission) {
    return basicPermissions
  }

  // If not an organizer/admin, check if they're inscribed as a player
  const inscriptionResult = await checkUserTournamentInscription(userId, tournamentId)

  return {
    ...basicPermissions,
    hasPermission: basicPermissions.hasPermission || (inscriptionResult.isInscribed && !inscriptionResult.isPending),
    reason: inscriptionResult.isInscribed && !inscriptionResult.isPending
      ? 'Acceso como jugador inscrito'
      : basicPermissions.reason || inscriptionResult.reason,
    inscriptionResult
  }
}

// ============================================================================
// NEW FUNCTION (Sistema V2 - Granular Access Levels)
// ============================================================================

/**
 * Check tournament access with granular access levels
 *
 * Esta función reemplaza y mejora `checkEnhancedTournamentPermissions` al proveer
 * niveles de acceso más específicos y una lista detallada de permisos.
 *
 * **Uso recomendado:**
 * - Úsala en nuevos componentes que necesiten lógica de permisos granular
 * - Permite distinguir entre PLAYER_ACTIVE, PLAYER_ELIMINATED y PUBLIC_VIEW
 * - Provee lista explícita de permisos para cada nivel de acceso
 *
 * **Migración desde funciones legacy:**
 * ```typescript
 * // ANTES (legacy)
 * const { hasPermission } = await checkTournamentPermissions(userId, tournamentId)
 *
 * // DESPUÉS (v2)
 * const { accessLevel, permissions } = await checkTournamentAccess(userId, tournamentId)
 * const canManage = accessLevel === 'FULL_MANAGEMENT'
 * const canViewSchedules = permissions.includes('view_own_schedule')
 * ```
 *
 * @param userId - ID del usuario (null para usuarios no autenticados)
 * @param tournamentId - ID del torneo
 * @returns TournamentAccessResult con accessLevel, permissions y metadata
 *
 * @see docs/PERMISSIONS_SPEC.md para especificación completa
 *
 * @example
 * ```typescript
 * // Usuario autenticado
 * const access = await checkTournamentAccess(user.id, tournamentId)
 *
 * if (access.accessLevel === 'FULL_MANAGEMENT') {
 *   // Mostrar controles de administración
 * } else if (access.accessLevel === 'PLAYER_ACTIVE') {
 *   // Mostrar vista de jugador con sus partidos
 * } else if (access.accessLevel === 'PUBLIC_VIEW') {
 *   // Mostrar vista pública
 * }
 *
 * // Usuario no autenticado (GUEST)
 * const publicAccess = await checkTournamentAccess(null, tournamentId)
 * // publicAccess.accessLevel === 'PUBLIC_VIEW'
 * ```
 */
export async function checkTournamentAccess(
  userId: string | null,
  tournamentId: string
): Promise<TournamentAccessResult> {

  // ========================================================================
  // 1. GUEST (Usuario no autenticado) → PUBLIC_VIEW
  // ========================================================================
  if (!userId) {
    return {
      accessLevel: 'PUBLIC_VIEW',
      permissions: [
        'view_public',
        'view_public_bracket',
        'view_public_zones',
        'view_public_matches'
      ],
      metadata: {
        source: 'public',
        reason: 'Usuario no autenticado - Vista pública'
      }
    }
  }

  // ========================================================================
  // 2. Check Management Permissions (ADMIN, CLUB owner, ORGANIZADOR owner)
  // ========================================================================
  const managementPerms = await checkTournamentPermissions(userId, tournamentId)

  if (managementPerms.hasPermission) {
    return {
      accessLevel: 'FULL_MANAGEMENT',
      permissions: [
        // Permisos de gestión
        'manage_tournament',
        'update_results',
        'manage_inscriptions',
        'upload_images',
        'start_tournament',
        'cancel_tournament',
        'generate_brackets',
        'assign_courts',
        'manage_schedules',
        'recategorize_players',
        'modify_tournament_status',
        // También tiene acceso a permisos de jugador y públicos
        'view_own_matches',
        'view_own_schedule',
        'view_own_statistics',
        'view_public',
        'view_public_bracket',
        'view_public_zones',
        'view_public_matches',
        'register_couple'
      ],
      metadata: {
        userRole: managementPerms.userRole as any,
        source: managementPerms.source as any,
        reason: 'Usuario con permisos de gestión completa'
      }
    }
  }

  // ========================================================================
  // 3. Check Player Inscription
  // ========================================================================
  const inscription = await checkUserTournamentInscription(userId, tournamentId)

  if (inscription.isInscribed) {
    // 3a. PLAYER_ELIMINATED
    if (inscription.isEliminated) {
      return {
        accessLevel: 'PLAYER_ELIMINATED',
        permissions: [
          'view_public',
          'view_public_bracket',
          'view_public_zones',
          'view_public_matches'
          // NO tiene view_own_schedule ni view_own_matches (ya fue eliminado)
        ],
        metadata: {
          userRole: managementPerms.userRole as any,
          isInscribed: true,
          isEliminated: true,
          isPending: false,
          coupleId: inscription.coupleId,
          playerId: inscription.playerId,
          source: 'player',
          reason: 'Jugador eliminado del torneo'
        }
      }
    }

    if (inscription.isPending) {
      return {
        accessLevel: 'PUBLIC_VIEW',
        permissions: [
          'view_public',
          'view_public_bracket',
          'view_public_zones',
          'view_public_matches'
        ],
        metadata: {
          userRole: managementPerms.userRole as any,
          isInscribed: true,
          isEliminated: false,
          isPending: true,
          coupleId: inscription.coupleId,
          playerId: inscription.playerId,
          source: 'player',
          reason: 'Inscripción pendiente de aprobación'
        }
      }
    }

    // 3b. PLAYER_ACTIVE
    return {
      accessLevel: 'PLAYER_ACTIVE',
      permissions: [
        'view_own_matches',
        'view_own_schedule',
        'view_own_statistics',
        'view_public',
        'view_public_bracket',
        'view_public_zones',
        'view_public_matches',
        'register_couple' // Puede inscribir otras parejas si es coach
      ],
      metadata: {
        userRole: managementPerms.userRole as any,
        isInscribed: true,
        isEliminated: false,
        isPending: false,
        coupleId: inscription.coupleId,
        playerId: inscription.playerId,
        source: 'player',
        reason: 'Jugador activo inscrito en el torneo'
      }
    }
  }

  // ========================================================================
  // 4. PUBLIC_VIEW (Usuario autenticado pero sin permisos especiales)
  // ========================================================================
  // Esto incluye:
  // - ORGANIZADOR no owner del torneo
  // - PLAYER no inscrito
  // - COACH
  // - Cualquier otro usuario autenticado

  const canRegister = managementPerms.userRole === 'PLAYER' || managementPerms.userRole === 'COACH'

  return {
    accessLevel: 'PUBLIC_VIEW',
    permissions: [
      'view_public',
      'view_public_bracket',
      'view_public_zones',
      'view_public_matches',
      ...(canRegister ? ['register_couple' as TournamentPermission] : [])
    ],
    metadata: {
      userRole: managementPerms.userRole as any,
      isInscribed: false,
      source: 'public',
      reason: 'Usuario autenticado sin permisos especiales - Vista pública'
    }
  }
}

/**
 * Helper function: Check if user has a specific permission
 *
 * @example
 * ```typescript
 * const access = await checkTournamentAccess(userId, tournamentId)
 *
 * if (hasPermission(access, 'manage_tournament')) {
 *   // Usuario puede gestionar el torneo
 * }
 * ```
 */
export function hasPermission(
  access: TournamentAccessResult,
  permission: TournamentPermission
): boolean {
  return access.permissions.includes(permission)
}

/**
 * Helper function: Check if user has any of the specified permissions
 *
 * @example
 * ```typescript
 * const access = await checkTournamentAccess(userId, tournamentId)
 *
 * if (hasAnyPermission(access, ['view_own_schedule', 'manage_schedules'])) {
 *   // Usuario puede ver horarios (propios o todos)
 * }
 * ```
 */
export function hasAnyPermission(
  access: TournamentAccessResult,
  permissions: TournamentPermission[]
): boolean {
  return permissions.some(p => access.permissions.includes(p))
}

/**
 * Helper function: Check if user has all of the specified permissions
 *
 * @example
 * ```typescript
 * const access = await checkTournamentAccess(userId, tournamentId)
 *
 * if (hasAllPermissions(access, ['manage_tournament', 'update_results'])) {
 *   // Usuario tiene ambos permisos
 * }
 * ```
 */
export function hasAllPermissions(
  access: TournamentAccessResult,
  permissions: TournamentPermission[]
): boolean {
  return permissions.every(p => access.permissions.includes(p))
}
