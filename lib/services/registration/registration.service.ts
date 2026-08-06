/**
 * 🎾 REGISTRATION SERVICE
 * 
 * Service principal que orquesta el sistema de inscripciones usando el patrón Strategy.
 * 
 * Características:
 * - API uniforme para todos los tipos de torneo
 * - Selección automática de estrategia según tipo de torneo
 * - Manejo centralizado de errores y logging
 * - Validaciones transversales antes de delegar a estrategias
 */

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { createRegistrationStrategy, RegistrationStrategyError } from './registration-strategy.factory'
import { validateMixedPairGender } from '@/lib/services/tournament-category-config'
import { sendTournamentMessage } from '@/lib/services/messages'
import { syncTournamentCapacityRegistrationLock } from '@/lib/services/tournament-capacity.service'
import type { IRegistrationStrategy } from './registration-strategy.interface'
import type {
  RegisterCoupleRequest,
  RegisterNewPlayersRequest,
  RegisterIndividualRequest,
  RegisterAuthenticatedPlayerRequest,
  RemoveCoupleRequest,
  CoupleRegistrationResult,
  PlayerRegistrationResult,
  RemovalResult,
  RegistrationContext,
  Tournament,
  TournamentType
} from './types/registration-types'
import { hasRealDni, sanitizeDniInput } from '@/lib/utils/player-dni'
import { hasSameNormalizedPlayerName } from '@/lib/utils/player-identity'

export class RegistrationService {
  private supabase: any

  constructor() {
    // El supabase client se inicializa por request para mantener el contexto de auth
  }

  // ===== MÉTODOS PÚBLICOS PRINCIPALES =====

  /**
   * Registra una pareja existente en un torneo
   * 
   * @param request - Datos de la pareja a registrar
   * @returns Resultado del registro con detalles específicos del tipo de torneo
   */
  async registerCouple(request: RegisterCoupleRequest): Promise<CoupleRegistrationResult> {
    console.log(`[RegistrationService] Iniciando registro de pareja para torneo ${request.tournamentId}`)

    try {
      // Preparar contexto
      const context = await this.prepareContext(request.tournamentId)
      if (!context.success || !context.context) {
        return { success: false, error: context.error }
      }

      // Obtener estrategia apropiada
      const strategy = this.getStrategy(context.context.tournament.type)

      // Validaciones adicionales antes de delegar
      const validation = await this.validateCoupleRegistrationRequest(request, context.context)
      if (!validation.success) {
        return { success: false, error: validation.error }
      }

      // Delegar a la estrategia específica
      const result = await strategy.registerCouple(request, context.context)

      // Log del resultado
      this.logRegistrationResult('registerCouple', request.tournamentId, result)
      await this.notifyInscriptionCreated(result.inscriptionId, context.context)
      await this.handleTournamentCapacitySideEffects(request.tournamentId, result.success)

      return result

    } catch (error) {
      console.error('[RegistrationService] Error inesperado en registerCouple:', error)
      return { 
        success: false, 
        error: error instanceof RegistrationStrategyError ? 
          error.message : 
          'Error interno del servidor'
      }
    }
  }

  /**
   * Registra una pareja creando ambos jugadores nuevos
   */
  async registerNewPlayersAsCouple(request: RegisterNewPlayersRequest): Promise<CoupleRegistrationResult> {
    console.log(`[RegistrationService] Registrando jugadores nuevos como pareja en torneo ${request.tournamentId}`)

    try {
      const context = await this.prepareContext(request.tournamentId)
      if (!context.success || !context.context) {
        return { success: false, error: context.error }
      }

      const strategy = this.getStrategy(context.context.tournament.type)

      const validation = await this.validateNewPlayersRequest(request, context.context)
      if (!validation.success) {
        return { success: false, error: validation.error }
      }

      const result = await strategy.registerNewPlayersAsCouple(request, context.context)
      this.logRegistrationResult('registerNewPlayersAsCouple', request.tournamentId, result)
      await this.notifyInscriptionCreated(result.inscriptionId, context.context)
      await this.handleTournamentCapacitySideEffects(request.tournamentId, result.success)

      return result

    } catch (error) {
      console.error('[RegistrationService] Error en registerNewPlayersAsCouple:', error)
      return { 
        success: false, 
        error: error instanceof RegistrationStrategyError ? 
          error.message : 
          'Error interno del servidor'
      }
    }
  }

  /**
   * Registra un jugador individual
   */
  async registerIndividualPlayer(request: RegisterIndividualRequest): Promise<PlayerRegistrationResult> {
    console.log(`[RegistrationService] Registrando jugador individual ${request.playerId} en torneo ${request.tournamentId}`)

    try {
      const context = await this.prepareContext(request.tournamentId)
      if (!context.success || !context.context) {
        return { success: false, error: context.error }
      }

      const strategy = this.getStrategy(context.context.tournament.type)

      const validation = await this.validateIndividualRegistrationRequest(request, context.context)
      if (!validation.success) {
        return { success: false, error: validation.error }
      }

      const result = await strategy.registerIndividualPlayer(request, context.context)
      this.logRegistrationResult('registerIndividualPlayer', request.tournamentId, result)
      await this.notifyInscriptionCreated(result.inscriptionId, context.context)

      return result

    } catch (error) {
      console.error('[RegistrationService] Error en registerIndividualPlayer:', error)
      return { 
        success: false, 
        error: error instanceof RegistrationStrategyError ? 
          error.message : 
          'Error interno del servidor'
      }
    }
  }

  /**
   * Registra un jugador autenticado (logueado)
   */
  async registerAuthenticatedPlayer(request: RegisterAuthenticatedPlayerRequest): Promise<PlayerRegistrationResult> {
    console.log(`[RegistrationService] Registrando jugador autenticado en torneo ${request.tournamentId}`)

    try {
      const context = await this.prepareContext(request.tournamentId)
      if (!context.success || !context.context) {
        return { success: false, error: context.error }
      }

      const strategy = this.getStrategy(context.context.tournament.type)

      // Para jugadores autenticados, validaciones adicionales de contexto de usuario
      const validation = await this.validateAuthenticatedPlayerRequest(request, context.context)
      if (!validation.success) {
        return { success: false, error: validation.error }
      }

      const result = await strategy.registerAuthenticatedPlayer(request, context.context)
      this.logRegistrationResult('registerAuthenticatedPlayer', request.tournamentId, result)
      await this.notifyInscriptionCreated(result.inscriptionId, context.context)

      return result

    } catch (error) {
      console.error('[RegistrationService] Error en registerAuthenticatedPlayer:', error)
      return { 
        success: false, 
        error: error instanceof RegistrationStrategyError ? 
          error.message : 
          'Error interno del servidor'
      }
    }
  }

  /**
   * Convierte una inscripción individual en pareja
   */
  async convertIndividualToCouple(request: RegisterCoupleRequest): Promise<CoupleRegistrationResult> {
    console.log(`[RegistrationService] Convirtiendo inscripción individual a pareja en torneo ${request.tournamentId}`)

    try {
      const context = await this.prepareContext(request.tournamentId)
      if (!context.success || !context.context) {
        return { success: false, error: context.error }
      }

      const strategy = this.getStrategy(context.context.tournament.type)

      const validation = await this.validateCoupleConversionRequest(request, context.context)
      if (!validation.success) {
        return { success: false, error: validation.error }
      }

      const result = await strategy.convertIndividualToCouple(request, context.context)
      this.logRegistrationResult('convertIndividualToCouple', request.tournamentId, result)
      await this.notifyInscriptionCreated(result.inscriptionId, context.context)
      await this.handleTournamentCapacitySideEffects(request.tournamentId, result.success)

      return result

    } catch (error) {
      console.error('[RegistrationService] Error en convertIndividualToCouple:', error)
      return { 
        success: false, 
        error: error instanceof RegistrationStrategyError ? 
          error.message : 
          'Error interno del servidor'
      }
    }
  }

  /**
   * Elimina una pareja del torneo
   */
  async removeCouple(request: RemoveCoupleRequest): Promise<RemovalResult> {
    console.log(`[RegistrationService] Eliminando pareja ${request.coupleId} del torneo ${request.tournamentId}`)

    try {
      const context = await this.prepareContext(request.tournamentId)
      if (!context.success || !context.context) {
        return { success: false, error: context.error }
      }

      const strategy = this.getStrategy(context.context.tournament.type)

      const validation = await this.validateCoupleRemovalRequest(request, context.context)
      if (!validation.success) {
        return { success: false, error: validation.error }
      }

      const result = await strategy.removeCouple(request, context.context)
      this.logRegistrationResult('removeCouple', request.tournamentId, result)
      await this.notifyInscriptionCancelled(request, context.context, result.success)
      await this.handleTournamentCapacitySideEffects(request.tournamentId, result.success)

      return result

    } catch (error) {
      console.error('[RegistrationService] Error en removeCouple:', error)
      return { 
        success: false, 
        error: error instanceof RegistrationStrategyError ? 
          error.message : 
          'Error interno del servidor'
      }
    }
  }

  // ===== MÉTODOS AUXILIARES PÚBLICOS =====

  /**
   * Obtiene información sobre las estrategias disponibles
   */
  getAvailableStrategies() {
    const { getAvailableStrategies } = require('./registration-strategy.factory')
    return getAvailableStrategies()
  }

  /**
   * Valida un tipo de torneo sin crear contexto completo
   */
  validateTournamentType(tournamentType: string): { isValid: boolean; error?: string } {
    try {
      const strategy = createRegistrationStrategy(tournamentType as TournamentType)
      return { isValid: true }
    } catch (error) {
      return { 
        isValid: false, 
        error: error instanceof RegistrationStrategyError ? 
          error.message : 
          'Tipo de torneo inválido'
      }
    }
  }

  // ===== MÉTODOS PRIVADOS =====

  /**
   * Prepara el contexto necesario para las operaciones de registro
   */
  private async prepareContext(tournamentId: string): Promise<{
    success: boolean
    context?: RegistrationContext
    error?: string
  }> {
    try {
      // Inicializar cliente Supabase para este request
      this.supabase = await createClient()

      // Obtener usuario autenticado
      const { data: { user }, error: authError } = await this.supabase.auth.getUser()
      if (authError || !user) {
        console.error('[RegistrationService] Error de autenticación:', authError?.message)
        return { success: false, error: 'Usuario no autenticado' }
      }

      // Obtener rol real del usuario
      const { data: userProfile, error: userProfileError } = await this.supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (userProfileError) {
        console.error('[RegistrationService] Error obteniendo perfil de usuario:', userProfileError?.message)
        return { success: false, error: 'Error obteniendo perfil de usuario' }
      }

      const userRole = userProfile?.role || 'USER'
      console.log(`[RegistrationService] Usuario autenticado: ${user.email}, Rol: ${userRole}`)

      // Obtener datos del torneo
      const { data: tournament, error: tournamentError } = await this.supabase
        .from('tournaments')
        .select(`
          id,
          name,
          type,
          gender,
          organization_id,
          category_name,
          category_config,
          status,
          validate_inscriptions,
          enable_transfer_proof,
          transfer_alias,
          transfer_amount,
          enable_trust_based_payment_policy,
          trust_policy_min_played_tournaments,
          transfer_amount_per_player
        `)
        .eq('id', tournamentId)
        .single()

      if (tournamentError || !tournament) {
        console.error('[RegistrationService] Error obteniendo torneo:', tournamentError?.message)
        return { success: false, error: 'Torneo no encontrado' }
      }

      // Crear contexto completo
      const context: RegistrationContext = {
        tournament: {
          id: tournament.id,
          name: tournament.name,
          type: tournament.type,
          gender: tournament.gender,
          organization_id: tournament.organization_id,
          category_name: tournament.category_name,
          category_config: tournament.category_config,
          status: tournament.status,
          validate_inscriptions: tournament.validate_inscriptions ?? false,
          enable_transfer_proof: tournament.enable_transfer_proof ?? false,
          transfer_alias: tournament.transfer_alias ?? null,
          transfer_amount: tournament.transfer_amount ?? null,
          enable_trust_based_payment_policy: tournament.enable_trust_based_payment_policy ?? false,
          trust_policy_min_played_tournaments: tournament.trust_policy_min_played_tournaments ?? 2,
          transfer_amount_per_player: tournament.transfer_amount_per_player ?? null,
        },
        user: {
          id: user.id,
          role: userRole
        },
        supabase: this.supabase
      }

      return { success: true, context }

    } catch (error) {
      console.error('[RegistrationService] Error preparando contexto:', error)
      return { success: false, error: 'Error preparando contexto de registro' }
    }
  }

  /**
   * Obtiene la estrategia apropiada para el tipo de torneo
   */
  private getStrategy(tournamentType: TournamentType): IRegistrationStrategy {
    return createRegistrationStrategy(tournamentType)
  }

  private async notifyInscriptionCreated(
    inscriptionId: string | undefined,
    context: RegistrationContext
  ): Promise<void> {
    if (!inscriptionId) return

    try {
      const { data: inscription } = await context.supabase
        .from('inscriptions')
        .select('is_pending, payment_proof_status')
        .eq('id', inscriptionId)
        .maybeSingle()

      await sendTournamentMessage({
        type: 'INSCRIPTION_SUBMITTED_ADMIN',
        supabase: context.supabase,
        inscriptionId,
      })

      if (inscription?.is_pending) {
        await sendTournamentMessage({
          type: 'INSCRIPTION_PENDING_PLAYER',
          supabase: context.supabase,
          inscriptionId,
        })
      } else if (inscription?.payment_proof_status !== 'PENDING_REVIEW') {
        await sendTournamentMessage({
          type: 'INSCRIPTION_APPROVED_PLAYER',
          supabase: context.supabase,
          inscriptionId,
        })
      }
    } catch (error) {
      console.error('[RegistrationService] Error enviando email de inscripcion:', error)
    }
  }

  private async notifyInscriptionCancelled(
    request: RemoveCoupleRequest,
    context: RegistrationContext,
    shouldNotify: boolean
  ): Promise<void> {
    if (!shouldNotify) return

    try {
      await sendTournamentMessage({
        type: 'INSCRIPTION_CANCELLED_ADMIN',
        supabase: context.supabase,
        tournamentId: request.tournamentId,
        coupleId: request.coupleId,
      })
    } catch (error) {
      console.error('[RegistrationService] Error enviando email de cancelacion:', error)
    }
  }

  /**
   * Valida request de registro de pareja
   */
  private async validateCoupleRegistrationRequest(
    request: RegisterCoupleRequest,
    context: RegistrationContext
  ): Promise<{ success: boolean; error?: string }> {
    // Validaciones básicas
    if (!request.player1Id || !request.player2Id) {
      return { success: false, error: 'IDs de jugadores son requeridos' }
    }

    if (request.player1Id === request.player2Id) {
      return { success: false, error: 'Un jugador no puede formar pareja consigo mismo' }
    }

    // Validar que los jugadores existan
    const { data: players } = await context.supabase
      .from('players')
      .select('id, gender')
      .in('id', [request.player1Id, request.player2Id])

    if (!players || players.length !== 2) {
      return { success: false, error: 'Uno o ambos jugadores no existen' }
    }

    const player1 = players.find((player: any) => player.id === request.player1Id)
    const player2 = players.find((player: any) => player.id === request.player2Id)

    const mixedValidation = validateMixedPairGender(
      context.tournament.gender,
      player1?.gender,
      player2?.gender,
    )

    if (!mixedValidation.success) {
      return { success: false, error: mixedValidation.error }
    }

    return { success: true }
  }

  /**
   * Valida request de nuevos jugadores
   */
  private async validateNewPlayersRequest(
    request: RegisterNewPlayersRequest,
    context: RegistrationContext
  ): Promise<{ success: boolean; error?: string }> {
    const { player1, player2 } = request

    // ✅ Validar campos requeridos (phone NO es requerido)
    const requiredFields = ['firstName', 'lastName', 'gender']

    for (const field of requiredFields) {
      if (!player1[field as keyof typeof player1] || !player2[field as keyof typeof player2]) {
        return { success: false, error: `Campo ${field} es requerido para ambos jugadores` }
      }
    }

    // Validar que no tengan el mismo DNI real
    if (hasRealDni(player1.dni) && hasRealDni(player2.dni) && sanitizeDniInput(player1.dni) === sanitizeDniInput(player2.dni)) {
      return { success: false, error: 'Los jugadores no pueden tener el mismo DNI' }
    }

    if (hasSameNormalizedPlayerName(player1.firstName, player1.lastName, player2.firstName, player2.lastName)) {
      return { success: false, error: 'Los jugadores no pueden tener el mismo nombre y apellido' }
    }

    const mixedValidation = validateMixedPairGender(
      context.tournament.gender,
      player1.gender,
      player2.gender,
    )

    if (!mixedValidation.success) {
      return { success: false, error: mixedValidation.error }
    }

    return { success: true }
  }

  /**
   * Valida request de registro individual
   */
  private async validateIndividualRegistrationRequest(
    request: RegisterIndividualRequest,
    context: RegistrationContext
  ): Promise<{ success: boolean; error?: string }> {
    if (!request.playerId) {
      return { success: false, error: 'ID de jugador es requerido' }
    }

    // Verificar que el jugador existe
    const { data: player } = await context.supabase
      .from('players')
      .select('id')
      .eq('id', request.playerId)
      .single()

    if (!player) {
      return { success: false, error: 'El jugador no existe' }
    }

    const tournamentValidation = await this.validateTournamentRegistrationState(context.tournament.id)
    if (!tournamentValidation.success) {
      return tournamentValidation
    }

    return { success: true }
  }

  /**
   * Valida request de jugador autenticado
   */
  private async validateAuthenticatedPlayerRequest(
    request: RegisterAuthenticatedPlayerRequest,
    context: RegistrationContext
  ): Promise<{ success: boolean; error?: string }> {
    // Para jugadores autenticados, el ID viene del contexto de usuario
    // Solo validamos que el usuario tenga un perfil de jugador
    const { data: playerProfile } = await context.supabase
      .from('players')
      .select('id')
      .eq('user_id', context.user.id)
      .single()

    if (!playerProfile) {
      return { success: false, error: 'No tienes un perfil de jugador creado' }
    }

    const tournamentValidation = await this.validateTournamentRegistrationState(context.tournament.id)
    if (!tournamentValidation.success) {
      return tournamentValidation
    }

    return { success: true }
  }

  /**
   * Valida request de conversión de individual a pareja
   */
  private async validateCoupleConversionRequest(
    request: RegisterCoupleRequest,
    context: RegistrationContext
  ): Promise<{ success: boolean; error?: string }> {
    // Usar mismas validaciones que registro de pareja
    const basicValidation = await this.validateCoupleRegistrationRequest(request, context)
    if (!basicValidation.success) {
      return basicValidation
    }

    // Validar que al menos uno de los jugadores tenga inscripción individual
    const { data: individualInscriptions } = await context.supabase
      .from('inscriptions')
      .select('id, player_id')
      .eq('tournament_id', request.tournamentId)
      .is('couple_id', null)
      .in('player_id', [request.player1Id, request.player2Id])

    if (!individualInscriptions || individualInscriptions.length === 0) {
      return { success: false, error: 'Ninguno de los jugadores tiene inscripción individual en este torneo' }
    }

    return { success: true }
  }

  /**
   * Valida request de eliminación de pareja
   */
  private async validateCoupleRemovalRequest(
    request: RemoveCoupleRequest,
    context: RegistrationContext
  ): Promise<{ success: boolean; error?: string }> {
    if (!request.coupleId) {
      return { success: false, error: 'ID de pareja es requerido' }
    }

    // Verificar que la pareja existe
    const { data: couple } = await context.supabase
      .from('couples')
      .select('id')
      .eq('id', request.coupleId)
      .single()

    if (!couple) {
      return { success: false, error: 'La pareja no existe' }
    }

    return { success: true }
  }

  /**
   * Log estructurado de resultados de registro
   */
  private logRegistrationResult(
    operation: string,
    tournamentId: string,
    result: CoupleRegistrationResult | PlayerRegistrationResult | RemovalResult
  ): void {
    const logData = {
      operation,
      tournamentId,
      success: result.success,
      timestamp: new Date().toISOString()
    }

    if (result.success) {
      console.log(`✅ [RegistrationService] ${operation} exitoso:`, logData)
    } else {
      console.error(`❌ [RegistrationService] ${operation} falló:`, {
        ...logData,
        error: result.error
      })
    }
  }

  private async validateTournamentRegistrationState(
    tournamentId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const { TournamentValidationService } = await import('../tournament-validation.service')
    const tournamentValidation = await TournamentValidationService.validateCoupleRegistration(tournamentId)

    if (!tournamentValidation.allowed) {
      return {
        success: false,
        error: `${tournamentValidation.reason}${tournamentValidation.details ? ` - ${tournamentValidation.details}` : ''}`,
      }
    }

    return { success: true }
  }

  private async handleTournamentCapacitySideEffects(tournamentId: string, shouldSync: boolean): Promise<void> {
    if (shouldSync) {
      try {
        await syncTournamentCapacityRegistrationLock(tournamentId)
      } catch (error) {
        console.error('[RegistrationService] Error sincronizando cupo del torneo:', error)
      }
    }

    this.revalidateTournamentRegistrationPaths(tournamentId)
  }

  private revalidateTournamentRegistrationPaths(tournamentId: string): void {
    revalidatePath('/')
    revalidatePath('/panel')
    revalidatePath('/tournaments')
    revalidatePath('/tournaments/upcoming')
    revalidatePath(`/tournaments/${tournamentId}`)
  }
}

// ===== INSTANCIA SINGLETON =====

/**
 * Instancia singleton del servicio de registro
 * Evita crear múltiples instancias y mantiene consistencia
 */
let registrationServiceInstance: RegistrationService | null = null

/**
 * Factory function para obtener la instancia del servicio
 * 
 * @returns Instancia singleton del RegistrationService
 */
export function getRegistrationService(): RegistrationService {
  if (!registrationServiceInstance) {
    registrationServiceInstance = new RegistrationService()
    console.log('[RegistrationService] Nueva instancia creada')
  }
  return registrationServiceInstance
}

/**
 * Función para limpiar la instancia (útil para testing)
 */
export function resetRegistrationService(): void {
  registrationServiceInstance = null
  console.log('[RegistrationService] Instancia limpiada')
}
