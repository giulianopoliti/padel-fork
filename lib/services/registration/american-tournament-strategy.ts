/**
 * 🎾 AMERICAN TOURNAMENT REGISTRATION STRATEGY
 * 
 * Estrategia de inscripciones para torneos tipo AMERICAN.
 * Características:
 * - Solo maneja tabla 'inscriptions'
 * - No asigna automáticamente a zonas
 * - Permite inscripciones individuales y por parejas
 * - El organizador asigna zonas manualmente después
 */

import { BaseRegistrationStrategy } from './registration-strategy.interface'
import { validateMixedPairGender } from '@/lib/services/tournament-category-config'
import { normalizePlayerDni } from '@/lib/utils/player-dni'
import { findExistingPlayerByIdentity } from '@/lib/utils/player-identity'
import { resolveRegistrationPaymentPolicy } from './payment-policy'
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
  Player,
  Gender
} from './types/registration-types'

export class AmericanTournamentStrategy extends BaseRegistrationStrategy {
  readonly tournamentType: TournamentType = 'AMERICAN'

  // ===== REGISTRO DE PAREJAS =====

  async registerCouple(
    request: RegisterCoupleRequest,
    context: RegistrationContext
  ): Promise<CoupleRegistrationResult> {
    const { tournamentId, player1Id, player2Id } = request
    const { supabase, user } = context

    console.log(`[AmericanStrategy] Registrando pareja en torneo ${tournamentId}`, { player1Id, player2Id })

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
      const paymentPolicy = await resolveRegistrationPaymentPolicy({
        supabase,
        tournament: context.tournament,
        actorRole: user.role,
        isOrganizerRegistration,
        registeringPlayerId: isOrganizerRegistration ? null : player1Id,
        paymentMethod: request.paymentMethod ?? null,
      })

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

      // Registrar la pareja en inscriptions (SOLO tabla inscriptions para AMERICAN)
      // - Si es inscripción del ORGANIZADOR:
      //   - player_id = null (no hay jugador solicitante)
      //   - is_pending = false (inscripción directa, ya aprobada)
      // - Si es inscripción del JUGADOR:
      //   - player_id = player1Id (jugador que solicita inscripción)
      //   - is_pending = true (requiere aprobación del organizador)
      const { data: inscription, error: inscriptionError } = await supabase
        .from('inscriptions')
        .insert({
          tournament_id: tournamentId,
          couple_id: coupleId,
          player_id: isOrganizerRegistration ? null : player1Id,
          is_pending: paymentPolicy.isPending,
          payment_method: paymentPolicy.paymentMethod,
          payment_proof_status: paymentPolicy.proofRequired ? 'PENDING_REVIEW' : 'NOT_REQUIRED',
          payment_alias_snapshot: paymentPolicy.proofRequired ? context.tournament.transfer_alias ?? null : null,
          payment_amount_snapshot: paymentPolicy.totalAmount,
          payment_amount_per_player_snapshot: paymentPolicy.amountPerPlayer,
          payment_total_amount_snapshot: paymentPolicy.totalAmount,
          trust_policy_applied: paymentPolicy.policyApplied,
          trust_policy_min_tournaments_snapshot: paymentPolicy.minPlayedTournaments,
          trust_player_played_tournaments_snapshot: paymentPolicy.playedTournaments,
        })
        .select('id')
        .single()

      if (inscriptionError) {
        console.error('[AmericanStrategy] Error al registrar pareja:', inscriptionError)
        return { success: false, error: 'No se pudo inscribir la pareja.' }
      }

      console.log(`✅ [AmericanStrategy] Pareja registrada exitosamente: ${coupleId}`)

      return {
        success: true,
        inscriptionId: inscription.id,
        coupleId: coupleId,
        inscription: inscription,
        zoneAssigned: false // American no asigna zonas automáticamente
      }

    } catch (error) {
      console.error('[AmericanStrategy] Error inesperado:', error)
      return { success: false, error: 'Error interno del servidor.' }
    }
  }

  async registerNewPlayersAsCouple(
    request: RegisterNewPlayersRequest,
    context: RegistrationContext
  ): Promise<CoupleRegistrationResult> {
    const { tournamentId, player1, player2 } = request
    const { supabase } = context

    console.log(`[AmericanStrategy] Registrando jugadores nuevos como pareja en torneo ${tournamentId}`)

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

      // Ahora registrar como pareja
      return await this.registerCouple({
        tournamentId,
        player1Id: player1Result.playerId,
        player2Id: player2Result.playerId,
        isOrganizerRegistration: request.isOrganizerRegistration,
        paymentMethod: request.paymentMethod,
      }, context)

    } catch (error) {
      console.error('[AmericanStrategy] Error creando jugadores nuevos:', error)
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

    console.log(`[AmericanStrategy] Registrando jugador individual ${playerId} en torneo ${tournamentId}`)

    try {
      // ✅ CATEGORIZAR JUGADOR INDIVIDUAL ANTES DE INSCRIBIR
      const categorizationResult = await this.categorizePlayers(playerId, playerId, context)
      if (!categorizationResult.success) {
        console.log(`⚠️ [AmericanStrategy] Advertencia en categorización individual: ${categorizationResult.error}`)
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

      // Registrar como individual
      const paymentPolicy = await resolveRegistrationPaymentPolicy({
        supabase,
        tournament: context.tournament,
        actorRole: context.user.role,
        registeringPlayerId: playerId,
        paymentMethod: request.paymentMethod ?? null,
      })

      const { data: inscription, error: insertError } = await supabase
        .from('inscriptions')
        .insert({
          player_id: playerId,
          tournament_id: tournamentId,
          couple_id: null,
          is_pending: paymentPolicy.isPending,
          payment_method: paymentPolicy.paymentMethod,
          payment_proof_status: paymentPolicy.proofRequired ? 'PENDING_REVIEW' : 'NOT_REQUIRED',
          payment_alias_snapshot: paymentPolicy.proofRequired ? context.tournament.transfer_alias ?? null : null,
          payment_amount_snapshot: paymentPolicy.totalAmount,
          payment_amount_per_player_snapshot: paymentPolicy.amountPerPlayer,
          payment_total_amount_snapshot: paymentPolicy.totalAmount,
          trust_policy_applied: paymentPolicy.policyApplied,
          trust_policy_min_tournaments_snapshot: paymentPolicy.minPlayedTournaments,
          trust_player_played_tournaments_snapshot: paymentPolicy.playedTournaments,
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('[AmericanStrategy] Error registrando individual:', insertError)
        return { success: false, error: 'Error al inscribir jugador individual.' }
      }

      console.log(`✅ [AmericanStrategy] Jugador individual registrado: ${playerId}`)

      return {
        success: true,
        inscriptionId: inscription.id,
        playerId: playerId,
        wasCategorized: categorizationResult.success // ✅ Incluir información de categorización
      }

    } catch (error) {
      console.error('[AmericanStrategy] Error inesperado:', error)
      return { success: false, error: 'Error interno del servidor.' }
    }
  }

  async registerAuthenticatedPlayer(
    request: RegisterAuthenticatedPlayerRequest,
    context: RegistrationContext
  ): Promise<PlayerRegistrationResult> {
    const { tournamentId, phone } = request
    const { supabase, user } = context

    console.log(`[AmericanStrategy] Registrando jugador autenticado ${user.id}`)

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
        console.log(`⚠️ [AmericanStrategy] Advertencia en categorización autenticada: ${categorizationResult.error}`)
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
      const paymentPolicy = await resolveRegistrationPaymentPolicy({
        supabase,
        tournament: context.tournament,
        actorRole: context.user.role,
        registeringPlayerId: playerData.id,
        paymentMethod: request.paymentMethod ?? null,
      })

      const { data: inscription, error: insertError } = await supabase
        .from('inscriptions')
        .insert({
          player_id: playerData.id,
          tournament_id: tournamentId,
          couple_id: null,
          phone: phone || null,
          created_at: new Date().toISOString(),
          is_pending: paymentPolicy.isPending,
          payment_method: paymentPolicy.paymentMethod,
          payment_proof_status: paymentPolicy.proofRequired ? 'PENDING_REVIEW' : 'NOT_REQUIRED',
          payment_alias_snapshot: paymentPolicy.proofRequired ? context.tournament.transfer_alias ?? null : null,
          payment_amount_snapshot: paymentPolicy.totalAmount,
          payment_amount_per_player_snapshot: paymentPolicy.amountPerPlayer,
          payment_total_amount_snapshot: paymentPolicy.totalAmount,
          trust_policy_applied: paymentPolicy.policyApplied,
          trust_policy_min_tournaments_snapshot: paymentPolicy.minPlayedTournaments,
          trust_player_played_tournaments_snapshot: paymentPolicy.playedTournaments,
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('[AmericanStrategy] Error registrando autenticado:', insertError)
        return { success: false, error: 'Error al inscribir.' }
      }

      console.log(`✅ [AmericanStrategy] Jugador autenticado registrado: ${playerData.id}`)

      return {
        success: true,
        inscriptionId: inscription.id,
        playerId: playerData.id,
        wasCategorized: categorizationResult.success
      }

    } catch (error) {
      console.error('[AmericanStrategy] Error inesperado:', error)
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

    console.log(`[AmericanStrategy] Convirtiendo inscripción individual a pareja`)

    try {
      // Encontrar inscripciones individuales para eliminar
      const { data: individualInscriptions } = await supabase
        .from('inscriptions')
        .select('id, player_id')
        .eq('tournament_id', tournamentId)
        .is('couple_id', null)
        .in('player_id', [player1Id, player2Id])

      // Registrar la pareja
      const coupleResult = await this.registerCouple(request, context)
      
      if (coupleResult.success && individualInscriptions) {
        // Eliminar inscripciones individuales
        const inscriptionIds = individualInscriptions.map((i: { id: string }) => i.id)
        await supabase
          .from('inscriptions')
          .delete()
          .in('id', inscriptionIds)

        console.log(`✅ [AmericanStrategy] Eliminadas ${inscriptionIds.length} inscripciones individuales`)
      }

      return coupleResult

    } catch (error) {
      console.error('[AmericanStrategy] Error convirtiendo a pareja:', error)
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

    console.log(`[AmericanStrategy] Eliminando pareja ${coupleId} del torneo ${tournamentId}`)

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

      console.log(`[AmericanStrategy] Pareja ${coupleId} no tiene partidos - procede con eliminación`)

      // 1. Eliminar de zone_couples si está asignada a alguna zona
      // Deleting the inscription triggers atomic cleanup of both zone tables.

      // 2. Eliminar inscripción
      const { error: deleteError } = await supabase
        .from('inscriptions')
        .delete()
        .eq('id', inscription.id)

      if (deleteError) {
        console.error('[AmericanStrategy] Error eliminando inscripción:', deleteError)
        return { success: false, error: 'Error al eliminar la inscripción.' }
      }

      console.log(`✅ [AmericanStrategy] Pareja eliminada exitosamente de todas las tablas: ${coupleId}`)

      return {
        success: true,
        message: 'Pareja eliminada correctamente del torneo.',
        removedFromZones: true
      }

    } catch (error) {
      console.error('[AmericanStrategy] Error inesperado:', error)
      return { success: false, error: 'Error interno del servidor.' }
    }
  }

  // ===== ACCIONES POST-REGISTRO (ESPECÍFICAS DE AMERICAN) =====

  async executePostRegistrationActions(
    coupleId: string,
    context: RegistrationContext
  ): Promise<{ success: boolean; details?: any }> {
    // American no necesita acciones post-registro específicas
    // El organizador asigna zonas manualmente después
    console.log(`[AmericanStrategy] No se requieren acciones post-registro para torneo American`)
    return { success: true, details: { message: 'No actions required for American tournaments' } }
  }

  async executePreRemovalActions(
    coupleId: string,
    context: RegistrationContext
  ): Promise<{ success: boolean; details?: any }> {
    // American no necesita acciones pre-eliminación específicas
    // Solo elimina de inscriptions
    console.log(`[AmericanStrategy] No se requieren acciones pre-eliminación para torneo American`)
    return { success: true, details: { message: 'No pre-removal actions required for American tournaments' } }
  }

  // ===== MÉTODOS AUXILIARES PRIVADOS =====

  private async checkRegistrationPermissions(context: RegistrationContext): Promise<{ success: boolean; isOrganizer?: boolean; error?: string }> {
    const { user, tournament, supabase } = context

    try {
      // Importar dinámicamente para evitar dependencias circulares
      const { checkTournamentPermissions } = await import('@/utils/tournament-permissions')
      const permissionResult = await checkTournamentPermissions(user.id, tournament.id)

      if (!permissionResult.hasPermission) {
        // Verificar si es un jugador que puede auto-registrarse
        const { data: userProfile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single()

        if (userProfile?.role === 'PLAYER') {
          return { success: true, isOrganizer: false } // Los jugadores pueden auto-registrarse
        }

        return { success: false, error: 'No tienes permisos para inscribir parejas en este torneo' }
      }

      return { success: true, isOrganizer: true }

    } catch (error) {
      console.error('[AmericanStrategy] Error verificando permisos:', error)
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
      return { success: true } // No hay categorización requerida
    }

    try {
      // Importar función de categorización
      const { checkAndCategorizePlayer } = await import('@/app/api/tournaments/actions')

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
      console.error('[AmericanStrategy] Error categorizando jugadores:', error)
      return { success: false, error: 'Error en categorización de jugadores' }
    }
  }

  private async checkExistingPlayerInscriptions(
    player1Id: string,
    player2Id: string,
    tournamentId: string,
    supabase: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
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
        // Verificar si alguno está en una pareja
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
      console.error('[AmericanStrategy] Error verificando inscripciones existentes:', error)
      return { success: false, error: 'Error al verificar inscripciones existentes.' }
    }
  }

  private async createOrFindCouple(
    player1Id: string,
    player2Id: string,
    supabase: any
  ): Promise<{ success: boolean; coupleId?: string; error?: string }> {
    try {
      // Buscar pareja existente
      const { data: existingCouple } = await supabase
        .from('couples')
        .select('id')
        .or(`and(player1_id.eq.${player1Id},player2_id.eq.${player2Id}),and(player1_id.eq.${player2Id},player2_id.eq.${player1Id})`)
        .maybeSingle()

      if (existingCouple) {
        return { success: true, coupleId: existingCouple.id }
      }

      // Crear nueva pareja
      const { data: newCouple, error: coupleError } = await supabase
        .from('couples')
        .insert({ player1_id: player1Id, player2_id: player2Id })
        .select('id')
        .single()

      if (coupleError || !newCouple?.id) {
        console.error('[AmericanStrategy] Error creando pareja:', coupleError)
        return { success: false, error: 'No se pudo crear la pareja.' }
      }

      return { success: true, coupleId: newCouple.id }

    } catch (error) {
      console.error('[AmericanStrategy] Error en createOrFindCouple:', error)
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

      // Crear nuevo jugador
      const { data: newPlayer, error: playerError } = await supabase
        .from('players')
        .insert({
          first_name: playerData.firstName,
          last_name: playerData.lastName,
          phone: playerData.phone || null, // ✅ OPCIONAL: Manejar undefined como null
          dni: normalizedDni.dni,
          dni_is_temporary: normalizedDni.dniIsTemporary,
          gender: playerData.gender,
          score: null
        })
        .select('id')
        .single()

      if (playerError || !newPlayer?.id) {
        console.error('[AmericanStrategy] Error creando jugador:', playerError)
        return { success: false, error: 'Error al crear el jugador.' }
      }

      return { success: true, playerId: newPlayer.id }

    } catch (error) {
      console.error('[AmericanStrategy] Error inesperado creando jugador:', error)
      return { success: false, error: 'Error interno creando jugador.' }
    }
  }


}
