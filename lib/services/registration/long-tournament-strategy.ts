/**
 * 🎾 LONG TOURNAMENT REGISTRATION STRATEGY
 * 
 * Estrategia de inscripciones para torneos tipo LONG.
 * Características:
 * - Maneja tabla 'inscriptions' + 'zone_couples'
 * - Asigna automáticamente a la zona general (única zona)
 * - Todas las parejas van a la misma zona para etapa de grupos
 * - Después se generan brackets según posiciones de zona
 */

import { BaseRegistrationStrategy } from './registration-strategy.interface'
import { validateMixedPairGender } from '@/lib/services/tournament-category-config'
import { ensureLongTournamentGeneralZone } from '@/lib/services/tournaments/long-general-zone'
import {
  ensureCanonicalZoneMembership,
  removeTournamentCoupleMembership,
} from '@/lib/services/tournament-zone-membership'
import { normalizePlayerDni } from '@/lib/utils/player-dni'
import { findExistingPlayerByIdentity } from '@/lib/utils/player-identity'
import { shouldRequireInscriptionValidation } from './inscription-validation'
import { createClientServiceRole } from '@/utils/supabase/server'
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
  TournamentType,
  Gender
} from './types/registration-types'

export class LongTournamentStrategy extends BaseRegistrationStrategy {
  readonly tournamentType: TournamentType = 'LONG'

  // ===== REGISTRO DE PAREJAS =====

  async registerCouple(
    request: RegisterCoupleRequest,
    context: RegistrationContext
  ): Promise<CoupleRegistrationResult> {
    const { tournamentId, player1Id, player2Id } = request
    const { supabase, user } = context

    console.log(`[LongStrategy] Registrando pareja en torneo LONG ${tournamentId}`, { player1Id, player2Id })

    // Validaciones básicas
    const validation = await this.validateCoupleRegistration(request, context)
    if (!validation.isValid) {
      return { success: false, error: validation.error }
    }

    try {
      // Verificar permisos
      const permissionCheck = await this.checkRegistrationPermissions(context)
      if (!permissionCheck.success) {
        return { success: false, error: permissionCheck.error }
      }

      if (request.isOrganizerRegistration && !permissionCheck.isOrganizer) {
        return { success: false, error: 'No tiene permisos para registrar como organizador.' }
      }

      const isOrganizerRegistration = Boolean(
        request.isOrganizerRegistration && permissionCheck.isOrganizer
      )

      // Categorizar jugadores si es necesario
      const categorizationResult = await this.categorizePlayers(player1Id, player2Id, context)
      if (!categorizationResult.success) {
        return { success: false, error: categorizationResult.error }
      }

      // Verificar que los jugadores no estén ya inscritos
      const existingCheck = await this.checkExistingPlayerInscriptions(player1Id, player2Id, tournamentId, supabase)
      if (!existingCheck.success) {
        return { success: false, error: existingCheck.error }
      }

      // Crear o encontrar la pareja
      const coupleResult = await this.createOrFindCouple(player1Id, player2Id, supabase)
      if (!coupleResult.success || !coupleResult.coupleId) {
        return { success: false, error: coupleResult.error }
      }

      const coupleId = coupleResult.coupleId

      // Verificar inscripción existente de la pareja
      const { data: existingInscription } = await supabase
        .from('inscriptions')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('couple_id', coupleId)
        .maybeSingle()

      if (existingInscription) {
        return { success: false, error: 'Esta pareja ya está inscrita en el torneo.' }
      }

      // 1. Registrar en inscriptions
      // Si es inscripcion del organizador, player_id queda null
      // Si es inscripcion del jugador, player_id es el id del jugador que inscribe
      const { data: inscription, error: inscriptionError } = await supabase
        .from('inscriptions')
        .insert({
          tournament_id: tournamentId,
          couple_id: coupleId,
          player_id: isOrganizerRegistration ? null : player1Id,
          is_pending: shouldRequireInscriptionValidation({
            validateInscriptions: context.tournament.validate_inscriptions,
            actorRole: context.user.role,
            isOrganizerRegistration,
          })
        })
        .select('id')
        .single()

      if (inscriptionError) {
        console.error('[LongStrategy] Error al registrar pareja:', inscriptionError)
        return { success: false, error: 'No se pudo inscribir la pareja.' }
      }

      // 2. Asignar automáticamente a la zona general (específico de LONG)
      const zoneAssignmentResult = await this.assignCoupleToGeneralZone(coupleId, tournamentId, supabase)
      
      if (!zoneAssignmentResult.success) {
        // ❌ Si la asignación a zona falla, rollback de la inscripción
        console.error(`[LongStrategy] Zone assignment failed for couple ${coupleId}:`, zoneAssignmentResult.error)
        
        try {
          await supabase
            .from('inscriptions')
            .delete()
            .eq('id', inscription.id)
          console.log(`[LongStrategy] Rollback: Inscription ${inscription.id} deleted due to zone assignment failure`)
        } catch (rollbackError) {
          console.error(`[LongStrategy] CRITICAL: Failed to rollback inscription ${inscription.id}:`, rollbackError)
        }
        
        return {
          success: false,
          error: `No se pudo asignar la pareja a la zona: ${zoneAssignmentResult.error}`,
          rollbackPerformed: true
        }
      }

      console.log(`✅ [LongStrategy] Pareja registrada: ${coupleId}, Zona asignada: ${zoneAssignmentResult.success}`)

      return {
        success: true,
        inscriptionId: inscription.id,
        coupleId: coupleId,
        inscription: inscription,
        zoneAssigned: zoneAssignmentResult.success,
        zoneId: zoneAssignmentResult.zoneId
      }

    } catch (error) {
      console.error('[LongStrategy] Error inesperado:', error)
      return { success: false, error: 'Error interno del servidor.' }
    }
  }

  async registerNewPlayersAsCouple(
    request: RegisterNewPlayersRequest,
    context: RegistrationContext
  ): Promise<CoupleRegistrationResult> {
    const { tournamentId, player1, player2 } = request
    const { supabase } = context

    console.log(`[LongStrategy] Registrando jugadores nuevos como pareja en torneo LONG ${tournamentId}`)

    try {
      // Validar género del torneo
      const genderValidation = await this.validatePlayersGender(player1.gender, player2.gender, context.tournament)
      if (!genderValidation.success) {
        return { success: false, error: genderValidation.error }
      }

      // Crear player1
      const player1Result = await this.createNewPlayer(player1, supabase)
      if (!player1Result.success || !player1Result.playerId) {
        return { success: false, error: player1Result.error }
      }

      // Crear player2
      const player2Result = await this.createNewPlayer(player2, supabase)
      if (!player2Result.success || !player2Result.playerId) {
        return { success: false, error: player2Result.error }
      }

      // Ahora registrar como pareja (incluirá asignación a zona automáticamente)
      return await this.registerCouple({
        tournamentId,
        player1Id: player1Result.playerId,
        player2Id: player2Result.playerId,
        isOrganizerRegistration: request.isOrganizerRegistration,
      }, context)

    } catch (error) {
      console.error('[LongStrategy] Error creando jugadores nuevos:', error)
      return { success: false, error: 'Error al crear los jugadores.' }
    }
  }

  // ===== REGISTRO INDIVIDUAL =====

  async registerIndividualPlayer(
    request: RegisterIndividualRequest,
    context: RegistrationContext
  ): Promise<PlayerRegistrationResult> {
    const { tournamentId, playerId } = request
    const { supabase } = context

    console.log(`[LongStrategy] Registrando jugador individual ${playerId} en torneo LONG ${tournamentId}`)

    try {
      // ✅ CATEGORIZAR JUGADOR INDIVIDUAL ANTES DE INSCRIBIR
      const categorizationResult = await this.categorizePlayers(playerId, playerId, context)
      if (!categorizationResult.success) {
        console.log(`⚠️ [LongStrategy] Advertencia en categorización individual: ${categorizationResult.error}`)
        // No fallar el registro por problemas de categorización, solo loggear
      }

      // Verificar si ya está inscrito
      const { data: existingInscription } = await supabase
        .from('inscriptions')
        .select('id, couple_id, is_pending')
        .eq('tournament_id', tournamentId)
        .eq('player_id', playerId)
        .maybeSingle()

      if (existingInscription) {
        if (existingInscription.is_pending) {
          return { success: false, error: 'Ya tiene una solicitud pendiente para este torneo.' }
        }
        return {
          success: false,
          error: existingInscription.couple_id ? 'Ya inscrito como pareja.' : 'Ya inscrito.'
        }
      }

      // Registrar como individual (sin asignación a zona hasta que se forme pareja)
      const { data: inscription, error: insertError } = await supabase
        .from('inscriptions')
        .insert({
          player_id: playerId,
          tournament_id: tournamentId,
          couple_id: null,
          is_pending: shouldRequireInscriptionValidation({
            validateInscriptions: context.tournament.validate_inscriptions,
            actorRole: context.user.role,
          })
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('[LongStrategy] Error registrando individual:', insertError)
        return { success: false, error: 'Error al inscribir jugador individual.' }
      }

      console.log(`✅ [LongStrategy] Jugador individual registrado: ${playerId} (sin zona hasta formar pareja)`)

      return {
        success: true,
        inscriptionId: inscription.id,
        playerId: playerId,
        wasCategorized: categorizationResult.success // ✅ Incluir información de categorización
      }

    } catch (error) {
      console.error('[LongStrategy] Error inesperado:', error)
      return { success: false, error: 'Error interno del servidor.' }
    }
  }

  async registerAuthenticatedPlayer(
    request: RegisterAuthenticatedPlayerRequest,
    context: RegistrationContext
  ): Promise<PlayerRegistrationResult> {
    const { tournamentId, phone } = request
    const { supabase, user } = context

    console.log(`[LongStrategy] Registrando jugador autenticado ${user.id} en torneo LONG`)

    try {
      // Obtener el perfil de jugador del usuario
      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (playerError || !playerData?.id) {
        return { 
          success: false, 
          error: playerError?.code === 'PGRST116' ? 
            'Perfil de jugador no encontrado.' : 
            'Error buscando perfil.' 
        }
      }

      const categorizationResult = await this.categorizePlayers(playerData.id, playerData.id, context)
      if (!categorizationResult.success) {
        console.log(`⚠️ [LongStrategy] Advertencia en categorización autenticada: ${categorizationResult.error}`)
      }

      const { data: existingInscription } = await supabase
        .from('inscriptions')
        .select('id, couple_id, is_pending')
        .eq('tournament_id', tournamentId)
        .eq('player_id', playerData.id)
        .maybeSingle()

      if (existingInscription) {
        if (existingInscription.is_pending) {
          return { success: false, error: 'Ya tiene una solicitud pendiente para este torneo.' }
        }

        return {
          success: false,
          error: existingInscription.couple_id ? 'Ya inscrito como pareja.' : 'Ya inscrito.'
        }
      }

      // Registrar como individual con datos adicionales
      const { data: inscription, error: insertError } = await supabase
        .from('inscriptions')
        .insert({
          player_id: playerData.id,
          tournament_id: tournamentId,
          couple_id: null,
          phone: phone || null,
          created_at: new Date().toISOString(),
          is_pending: shouldRequireInscriptionValidation({
            validateInscriptions: context.tournament.validate_inscriptions,
            actorRole: context.user.role,
          })
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('[LongStrategy] Error registrando autenticado:', insertError)
        return { success: false, error: 'Error al inscribir.' }
      }

      console.log(`✅ [LongStrategy] Jugador autenticado registrado: ${playerData.id} (sin zona hasta formar pareja)`)

      return {
        success: true,
        inscriptionId: inscription.id,
        playerId: playerData.id,
        wasCategorized: categorizationResult.success
      }

    } catch (error) {
      console.error('[LongStrategy] Error inesperado:', error)
      return { success: false, error: 'Error interno del servidor.' }
    }
  }

  // ===== CONVERSIÓN DE INDIVIDUAL A PAREJA =====

  async convertIndividualToCouple(
    request: RegisterCoupleRequest,
    context: RegistrationContext
  ): Promise<CoupleRegistrationResult> {
    const { tournamentId, player1Id, player2Id } = request
    const { supabase } = context

    console.log(`[LongStrategy] Convirtiendo inscripción individual a pareja en torneo LONG`)

    try {
      // Encontrar inscripciones individuales para eliminar
      const { data: individualInscriptions } = await supabase
        .from('inscriptions')
        .select('id, player_id')
        .eq('tournament_id', tournamentId)
        .is('couple_id', null)
        .in('player_id', [player1Id, player2Id])

      // Registrar la pareja (incluirá asignación automática a zona)
      const coupleResult = await this.registerCouple(request, context)
      
      if (coupleResult.success && individualInscriptions) {
        // Eliminar inscripciones individuales
        const inscriptionIds = individualInscriptions.map((i: any) => i.id)
        await supabase
          .from('inscriptions')
          .delete()
          .in('id', inscriptionIds)

        console.log(`✅ [LongStrategy] Eliminadas ${inscriptionIds.length} inscripciones individuales y pareja asignada a zona`)
      }

      return coupleResult

    } catch (error) {
      console.error('[LongStrategy] Error convirtiendo a pareja:', error)
      return { success: false, error: 'Error al convertir inscripción.' }
    }
  }

  // ===== ELIMINACIÓN DE PAREJAS =====

  async removeCouple(
    request: RemoveCoupleRequest,
    context: RegistrationContext
  ): Promise<RemovalResult> {
    const { tournamentId, coupleId } = request
    const { supabase } = context

    console.log(`[LongStrategy] Eliminando pareja ${coupleId} del torneo LONG ${tournamentId}`)

    try {
      // Verificar que la pareja esté inscrita
      const { data: inscription } = await supabase
        .from('inscriptions')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('couple_id', coupleId)
        .maybeSingle()

      if (!inscription) {
        return { success: false, error: 'La pareja no está inscrita en este torneo.' }
      }

      // ✅ VALIDACIÓN ESTRICTA: Verificar si la pareja tiene CUALQUIER partido en el torneo
      const { data: existingMatches } = await supabase
        .from('matches')
        .select('id, status, round')
        .eq('tournament_id', tournamentId)
        .or(`couple1_id.eq.${coupleId},couple2_id.eq.${coupleId}`)
        .limit(1)

      if (existingMatches && existingMatches.length > 0) {
        return {
          success: false,
          error: 'No se puede eliminar una pareja que tiene partidos creados en el torneo. Elimínala desde "Armado de Zonas".'
        }
      }

      console.log(`[LongStrategy] Pareja ${coupleId} no tiene partidos - procede con eliminación`)

      // 1. Primero eliminar de zone_couples (específico de LONG)
      const zoneRemovalResult = await this.removeCoupleFromZones(coupleId, tournamentId, supabase)

      if (!zoneRemovalResult.success) {
        console.error('[LongStrategy] Error eliminando de zonas, abortando para evitar registros huérfanos:', zoneRemovalResult.error)
        return { success: false, error: 'Error al eliminar la pareja de las zonas. La inscripción no fue borrada.' }
      }

      // 2. Eliminar inscripción
      const { error: deleteError } = await supabase
        .from('inscriptions')
        .delete()
        .eq('id', inscription.id)

      if (deleteError) {
        console.error('[LongStrategy] Error eliminando inscripción:', deleteError)
        return { success: false, error: 'Error al eliminar la inscripción.' }
      }

      console.log(`✅ [LongStrategy] Pareja eliminada: ${coupleId}, Removida de ${zoneRemovalResult.zonesCount} zonas`)

      return {
        success: true,
        message: 'Pareja eliminada correctamente del torneo y zonas.',
        removedFromZones: zoneRemovalResult.success,
        zonesCount: zoneRemovalResult.zonesCount
      }

    } catch (error) {
      console.error('[LongStrategy] Error inesperado:', error)
      return { success: false, error: 'Error interno del servidor.' }
    }
  }

  // ===== ACCIONES POST-REGISTRO (ESPECÍFICAS DE LONG) =====

  async executePostRegistrationActions(
    coupleId: string,
    context: RegistrationContext
  ): Promise<{ success: boolean; details?: any }> {
    const { tournament, supabase } = context

    console.log(`[LongStrategy] Ejecutando acciones post-registro para pareja ${coupleId}`)

    try {
      // Asignar a zona general (acción específica de LONG)
      const zoneResult = await this.assignCoupleToGeneralZone(coupleId, tournament.id, supabase)
      
      // Futuro: Aquí se pueden agregar más acciones específicas de LONG
      // - Calcular rankings preliminares
      // - Notificaciones específicas
      // - Preparar datos para zona de grupos

      return {
        success: zoneResult.success,
        details: {
          zoneAssigned: zoneResult.success,
          zoneId: zoneResult.zoneId,
          message: 'Couple assigned to general zone for LONG tournament'
        }
      }

    } catch (error) {
      console.error('[LongStrategy] Error en acciones post-registro:', error)
      return { success: false, details: { error: 'Error in post-registration actions' } }
    }
  }

  async executePreRemovalActions(
    coupleId: string,
    context: RegistrationContext
  ): Promise<{ success: boolean; details?: any }> {
    const { tournament, supabase } = context

    console.log(`[LongStrategy] Ejecutando acciones pre-eliminación para pareja ${coupleId}`)

    try {
      // Remover de zonas (acción específica de LONG)
      const removalResult = await this.removeCoupleFromZones(coupleId, tournament.id, supabase)
      
      // Futuro: Aquí se pueden agregar más acciones específicas de LONG
      // - Actualizar rankings de zona
      // - Notificar otros jugadores
      // - Limpiar datos de zona

      return {
        success: removalResult.success,
        details: {
          removedFromZones: removalResult.success,
          zonesCount: removalResult.zonesCount,
          message: 'Couple removed from zones for LONG tournament'
        }
      }

    } catch (error) {
      console.error('[LongStrategy] Error en acciones pre-eliminación:', error)
      return { success: false, details: { error: 'Error in pre-removal actions' } }
    }
  }

  // ===== MÉTODOS ESPECÍFICOS DE LONG TOURNAMENTS =====

  /**
   * Asigna una pareja a la zona general del torneo LONG
   * En torneos LONG hay una única zona donde todas las parejas juegan primero
   */
  private async assignCoupleToGeneralZone(
    coupleId: string,
    tournamentId: string,
    supabase: any
  ): Promise<{ success: boolean; zoneId?: string; error?: string }> {
    try {
      console.log(`[LongStrategy] 🎯 INICIANDO assignCoupleToGeneralZone: tournament=${tournamentId}, couple=${coupleId}`)

      const ensuredZoneResult = await ensureLongTournamentGeneralZone(tournamentId)
      if (!ensuredZoneResult.success) {
        console.error('[LongStrategy] Error ensuring LONG general zone:', {
          tournamentId,
          coupleId,
          ensuredZoneResult,
        })
        return {
          success: false,
          error: ensuredZoneResult.error || 'No se encontró zona para el torneo'
        }
      }

      // Buscar la zona del torneo (debe haber una sola para LONG)
      const { data: zone, error: zoneError } = await supabase
        .from('zones')
        .select('id')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (zoneError) {
        console.error('[LongStrategy] Error buscando zona:', zoneError)
        // No encontrar zona no es un error crítico, el torneo puede no tener zonas configuradas aún
        return { success: false, error: 'No se encontró zona para el torneo' }
      }

      if (!zone) {
        console.warn('[LongStrategy] No existe zona para el torneo LONG:', tournamentId)
        return { success: false, error: 'No hay zona configurada para este torneo' }
      }

      // Verificar si ya está asignada
      const membershipResult = await ensureCanonicalZoneMembership({
        supabase,
        tournamentId,
        zoneId: zone.id,
        coupleId,
      })

      if (!membershipResult.success) {
        console.error('[LongStrategy] Error asignando membresia canonica de zona:', {
          error: membershipResult.error,
          zoneId: zone.id,
          coupleId,
        })
        return { success: false, error: `Error al asignar pareja a zona: ${membershipResult.error}` }
      }

      if (membershipResult.mirrorWarning) {
        console.warn('[LongStrategy] zone_couples mirror warning:', membershipResult.mirrorWarning)
      }

      console.log(`✅ [LongStrategy] Pareja ${coupleId} asignada exitosamente a zona ${zone.id}`)
      return { success: true, zoneId: zone.id }

    } catch (error) {
      console.error('[LongStrategy] Error inesperado asignando a zona:', error)
      return { success: false, error: 'Error interno asignando a zona' }
    }
  }

  /**
   * Remueve una pareja de todas las zonas del torneo LONG
   */
  private async removeCoupleFromZones(
    coupleId: string,
    tournamentId: string,
    supabase: any
  ): Promise<{ success: boolean; zonesCount?: number; error?: string }> {
    try {
      console.log(`[LongStrategy] Removiendo pareja ${coupleId} de zonas del torneo ${tournamentId}`)

      const removalResult = await removeTournamentCoupleMembership({
        supabase,
        tournamentId,
        coupleId,
        deleteInscription: false,
      })

      if (!removalResult.success) {
        console.error('[LongStrategy] Error removiendo membresia de zonas:', removalResult.error)
        return { success: false, error: 'Error eliminando pareja de las zonas' }
      }

      // ✅ FIX: Remover de zone_positions también (evita registros huérfanos)
      const positionsRemovalError: { message?: string } | null = null

      if (positionsRemovalError) {
        console.error('[LongStrategy] Error removiendo de zone_positions:', positionsRemovalError)
        return { success: false, error: 'Error eliminando posiciones de pareja' }
      }

      const zoneIds = { length: removalResult.zonesCount }
      console.log(`✅ [LongStrategy] Pareja ${coupleId} removida de ${zoneIds.length} zonas y zone_positions`)
      return { success: true, zonesCount: removalResult.zonesCount }

    } catch (error) {
      console.error('[LongStrategy] Error inesperado removiendo de zonas:', error)
      return { success: false, error: 'Error interno removiendo de zonas' }
    }
  }

  // ===== MÉTODOS AUXILIARES PRIVADOS (REUTILIZADOS) =====

  private async checkRegistrationPermissions(context: RegistrationContext): Promise<{ success: boolean; isOrganizer?: boolean; error?: string }> {
    const { user, tournament, supabase } = context

    try {
      const { checkTournamentPermissions } = await import('@/utils/tournament-permissions')
      const permissionResult = await checkTournamentPermissions(user.id, tournament.id)

      if (!permissionResult.hasPermission) {
        const { data: userProfile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single()

        if (userProfile?.role === 'PLAYER') {
          return { success: true, isOrganizer: false }
        }

        return { success: false, error: 'No tienes permisos para inscribir parejas en este torneo' }
      }

      return { success: true, isOrganizer: true }

    } catch (error) {
      console.error('[LongStrategy] Error verificando permisos:', error)
      return { success: false, error: 'Error verificando permisos' }
    }
  }

  private async categorizePlayers(
    player1Id: string, 
    player2Id: string, 
    context: RegistrationContext
  ): Promise<{ success: boolean; error?: string }> {
    const { tournament, supabase } = context

    if (!tournament.category_name && !tournament.category_config) {
      return { success: true }
    }

    try {
      const { checkAndCategorizePlayer } = await import('@/utils/player-categorization')

      const categorization1 = await checkAndCategorizePlayer(player1Id, tournament, supabase)
      if (!categorization1.success) {
        return { success: false, error: categorization1.message }
      }

      const categorization2 = await checkAndCategorizePlayer(player2Id, tournament, supabase)
      if (!categorization2.success) {
        return { success: false, error: categorization2.message }
      }

      return { success: true }

    } catch (error) {
      console.error('[LongStrategy] Error categorizando jugadores:', error)
      return { success: false, error: 'Error en categorización de jugadores' }
    }
  }

  private async checkExistingPlayerInscriptions(
    player1Id: string,
    player2Id: string,
    tournamentId: string,
    _supabase: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = await createClientServiceRole()
      const { data: existingInscriptions } = await supabase
        .from('inscriptions')
        .select(`
          id, 
          player_id, 
          couple_id,
          couples (
            id,
            player1_id,
            player2_id
          )
        `)
        .eq('tournament_id', tournamentId)
        .not('couple_id', 'is', null)

      if (existingInscriptions && existingInscriptions.length > 0) {
        const playerInCouple = existingInscriptions.some((inscription: any) => {
          const couple = Array.isArray(inscription.couples)
            ? inscription.couples[0]
            : inscription.couples

          if (couple) {
            const { player1_id, player2_id } = couple
            return player1_id === player1Id || player1_id === player2Id || 
                   player2_id === player1Id || player2_id === player2Id
          }
          return false
        })

        if (playerInCouple) {
          return { success: false, error: 'Uno de los jugadores ya está inscrito en otra pareja para este torneo.' }
        }
      }

      return { success: true }

    } catch (error) {
      console.error('[LongStrategy] Error verificando inscripciones existentes:', error)
      return { success: false, error: 'Error al verificar inscripciones existentes.' }
    }
  }

  private async createOrFindCouple(
    player1Id: string,
    player2Id: string,
    supabase: any
  ): Promise<{ success: boolean; coupleId?: string; error?: string }> {
    try {
      const { data: existingCouple } = await supabase
        .from('couples')
        .select('id')
        .or(`and(player1_id.eq.${player1Id},player2_id.eq.${player2Id}),and(player1_id.eq.${player2Id},player2_id.eq.${player1Id})`)
        .maybeSingle()

      if (existingCouple) {
        return { success: true, coupleId: existingCouple.id }
      }

      const { data: newCouple, error: coupleError } = await supabase
        .from('couples')
        .insert({ player1_id: player1Id, player2_id: player2Id })
        .select('id')
        .single()

      if (coupleError || !newCouple?.id) {
        console.error('[LongStrategy] Error creando pareja:', coupleError)
        return { success: false, error: 'No se pudo crear la pareja.' }
      }

      return { success: true, coupleId: newCouple.id }

    } catch (error) {
      console.error('[LongStrategy] Error en createOrFindCouple:', error)
      return { success: false, error: 'Error manejando pareja.' }
    }
  }

  private async validatePlayersGender(
    player1Gender: Gender,
    player2Gender: Gender,
    tournament: any
  ): Promise<{ success: boolean; error?: string }> {
    return validateMixedPairGender(tournament.gender, player1Gender, player2Gender)
  }

  private async createNewPlayer(
    playerData: { firstName: string; lastName: string; phone?: string; dni?: string | null; gender: Gender; forceCreateNew?: boolean },
    supabase: any
  ): Promise<{ success: boolean; playerId?: string; error?: string }> {
    try {
      const normalizedDni = normalizePlayerDni(playerData.dni)
      if (!playerData.forceCreateNew) {
        const existingPlayerResult = await findExistingPlayerByIdentity({
          supabase,
          firstName: playerData.firstName,
          lastName: playerData.lastName,
          dni: playerData.dni,
          gender: playerData.gender,
        })

        if (existingPlayerResult.error) {
          return { success: false, error: existingPlayerResult.error }
        }

        if (existingPlayerResult.player) {
          return { success: true, playerId: existingPlayerResult.player.id }
        }
      }

      const { data: newPlayer, error: playerError } = await supabase
        .from('players')
        .insert({
          first_name: playerData.firstName,
          last_name: playerData.lastName,
          phone: playerData.phone || null, // ✅ OPCIONAL: Manejar undefined como null
          dni: normalizedDni.dni,
          dni_is_temporary: normalizedDni.dniIsTemporary,
          gender: playerData.gender,
          score: null, // ✅ Será categorizado por categorizePlayers() después
          category_name: null, // ✅ Será asignado por categorizePlayers() después
          is_categorized: false // ✅ Será marcado por categorizePlayers() después
        })
        .select('id')
        .single()

      if (playerError || !newPlayer?.id) {
        console.error('[LongStrategy] Error creando jugador:', playerError)
        return { success: false, error: 'Error al crear el jugador.' }
      }

      return { success: true, playerId: newPlayer.id }

    } catch (error) {
      console.error('[LongStrategy] Error inesperado creando jugador:', error)
      return { success: false, error: 'Error interno creando jugador.' }
    }
  }
}
