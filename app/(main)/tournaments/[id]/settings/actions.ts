"use server"

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { linkTournamentClubs, unlinkTournamentClubs } from '@/lib/services/tournaments/club-links'
import { getZonesFromTournament, deleteZonesAndData, deleteMatchesHierarchy, deleteCoupleSeeds, deleteBracketMatchesFromTournament, getBracketMatchesFromTournament, deleteBracketOperationsLog, deleteMatchResultsHistory} from '@/app/api/tournaments/[id]/modify-status-tournament/actions'
import type { TournamentFormatConfigV2 } from '@/types/tournament-format-v2'
import { getZoneStageAndMatchesPerCouple } from '@/lib/services/zone-fixture-planner.service'
import {
  canSwitchAmericanMultiZoneRuntime,
  isFormatStatusAllowedForRuntimeSwitch,
  shouldUseLegacyQualifying
} from '@/lib/services/tournament-format-policy'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import {
  calculateExpectedZoneMatches,
  getPersistedBracketArtifacts
} from '@/lib/services/bracket-generation-validation'
import { syncTournamentCapacityRegistrationLock } from '@/lib/services/tournament-capacity.service'
import { MAX_TOURNAMENT_PRICE } from '@/lib/constants/tournaments'
import { mergeTournamentOperationalSettings } from '@/lib/services/tournament-operational-settings'

interface QualifyingAdvancementSettings {
  enabled: boolean
  couples_advance: number | null
}

interface UpdateTournamentBasicInfoParams {
  tournamentId: string
  name: string
  description?: string | null
  max_participants?: number | null
  price?: number | null
  start_date?: string | null
  end_date?: string | null
  hide_venue?: boolean
}

interface ActionResult {
  success: boolean
  error?: string
  code?: string
  message?: string
  data?: any
}

interface ResetPreviewResult {
  success: boolean
  error?: string
  data?: {
    zonesCount: number
    matchesCount: number
    zoneCouplesCount: number
    zonePositionsCount: number
  }
}

interface BackFromBracketPreviewResult {
  success: boolean
  error?: string
  data?: {
    seedsCount: number
    hierarchyCount: number
    bracketMatchesCount: number
    finishedBracketMatches: number
    pendingBracketMatches: number
  }
}

async function getRegisteredCouplesCountForFormatValidation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournamentId: string
): Promise<{ count: number; source: 'couple_only' | 'all_inscriptions' }> {
  const { count: coupleInscriptionsCount, error: couplesCountError } = await supabase
    .from('inscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('es_prueba', false)
    .eq('inscription_type', 'couple')

  if (!couplesCountError && typeof coupleInscriptionsCount === 'number') {
    return { count: coupleInscriptionsCount, source: 'couple_only' }
  }

  const { count: inscriptionsCount, error: inscriptionsCountError } = await supabase
    .from('inscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('es_prueba', false)

  if (inscriptionsCountError) {
    throw new Error(
      `No se pudo validar inscripciones (${couplesCountError?.message || 'couples query failed'} / ${inscriptionsCountError.message})`
    )
  }

  return { count: inscriptionsCount || 0, source: 'all_inscriptions' }
}

type ZoneSnapshot = {
  id: string
  name: string
  coupleCount: number
  matchCount: number
}

const LONG_SINGLE_ZONE_BRACKET_MODE_SWITCH_PRESETS = [
  'LONG_SINGLE_ZONE_BRACKET',
  'LONG_SINGLE_ZONE_GOLD_SILVER',
] as const

function canSwitchLongSingleZoneBracketMode(
  currentPresetId?: string | null,
  nextPresetId?: string | null
): boolean {
  return Boolean(
    currentPresetId &&
    nextPresetId &&
    currentPresetId !== nextPresetId &&
    LONG_SINGLE_ZONE_BRACKET_MODE_SWITCH_PRESETS.includes(
      currentPresetId as (typeof LONG_SINGLE_ZONE_BRACKET_MODE_SWITCH_PRESETS)[number]
    ) &&
    LONG_SINGLE_ZONE_BRACKET_MODE_SWITCH_PRESETS.includes(
      nextPresetId as (typeof LONG_SINGLE_ZONE_BRACKET_MODE_SWITCH_PRESETS)[number]
    )
  )
}

const toTournamentDateISOString = (dateString: string): string => {
  if (dateString.includes('T')) {
    const date = new Date(dateString)

    if (Number.isNaN(date.getTime())) {
      throw new Error('Fecha invalida')
    }

    return date.toISOString()
  }

  const argentinaDate = new Date(`${dateString}T12:00:00-03:00`)

  if (Number.isNaN(argentinaDate.getTime())) {
    throw new Error('Fecha invalida')
  }

  return argentinaDate.toISOString()
}

function revalidateTournamentSettingsPaths(tournamentId: string) {
  revalidatePath(`/tournaments/${tournamentId}`)
  revalidatePath(`/tournaments/${tournamentId}/settings`, 'layout')
  revalidatePath('/tournaments')
  revalidatePath('/tournaments/upcoming')
  revalidatePath('/tournaments/in-progress')
  revalidatePath('/tournaments/past')
  revalidatePath('/panel')
}

async function getZoneSnapshots(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournamentId: string
): Promise<ZoneSnapshot[]> {
  const { data: zones, error: zonesError } = await supabase
    .from('zones')
    .select('id, name')
    .eq('tournament_id', tournamentId)

  if (zonesError || !zones) {
    throw new Error(zonesError?.message || 'No se pudieron obtener las zonas del torneo')
  }

  if (zones.length === 0) {
    return []
  }

  const zoneIds = zones.map((zone) => zone.id)

  const { data: zonePositions, error: zonePositionsError } = await supabase
    .from('zone_positions')
    .select('zone_id')
    .in('zone_id', zoneIds)

  if (zonePositionsError) {
    throw new Error(`No se pudieron obtener las parejas por zona: ${zonePositionsError.message}`)
  }

  const { data: zoneMatches, error: zoneMatchesError } = await supabase
    .from('matches')
    .select('zone_id')
    .in('zone_id', zoneIds)

  if (zoneMatchesError) {
    throw new Error(`No se pudieron obtener los partidos de zona: ${zoneMatchesError.message}`)
  }

  const coupleCountByZone = new Map<string, number>()
  for (const position of zonePositions || []) {
    const current = coupleCountByZone.get(position.zone_id) || 0
    coupleCountByZone.set(position.zone_id, current + 1)
  }

  const matchCountByZone = new Map<string, number>()
  for (const match of zoneMatches || []) {
    if (!match.zone_id) continue
    const current = matchCountByZone.get(match.zone_id) || 0
    matchCountByZone.set(match.zone_id, current + 1)
  }

  return zones.map((zone) => ({
    id: zone.id,
    name: zone.name || 'Zona sin nombre',
    coupleCount: coupleCountByZone.get(zone.id) || 0,
    matchCount: matchCountByZone.get(zone.id) || 0,
  }))
}

export async function updateAdvancementSettings(
  tournamentId: string,
  settings: QualifyingAdvancementSettings
) {
  const supabase = await createClient()

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, type, format_type, format_config')
    .eq('id', tournamentId)
    .single()

  if (tournamentError || !tournament) {
    throw new Error('No se pudo validar el torneo antes de actualizar la configuración')
  }

  if (!shouldUseLegacyQualifying(tournament)) {
    throw new Error('La clasificación legacy no se puede editar en torneos con format_config v2')
  }

  const { error } = await supabase
    .from('tournament_ranking_config')
    .update({
      qualifying_advancement_settings: settings
    })
    .eq('tournament_id', tournamentId)
  if (error) {
    console.error('Error updating advancement settings:', error)
    throw new Error('Error al actualizar la configuración')
  }

  revalidateTournamentSettingsPaths(tournamentId)
}

export async function updateLongBracketMatchRequirement(
  tournamentId: string,
  enabled: boolean
): Promise<ActionResult> {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'No autorizado. Debes iniciar sesion.' }
    }

    const permissionCheck = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionCheck.hasPermission) {
      return {
        success: false,
        error: permissionCheck.reason || 'No tienes permisos para editar este torneo',
      }
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, type')
      .eq('id', tournamentId)
      .single()

    if (tournamentError || !tournament) {
      return { success: false, error: 'No se pudo validar el torneo' }
    }

    if (tournament.type !== 'LONG') {
      return { success: false, error: 'Esta configuracion solo aplica a torneos Long' }
    }

    const { data: rankingConfig, error: configError } = await supabase
      .from('tournament_ranking_config')
      .select('id, operational_settings')
      .eq('tournament_id', tournamentId)
      .eq('is_active', true)
      .maybeSingle()

    if (configError || !rankingConfig) {
      return { success: false, error: 'No se encontro la configuracion activa del torneo' }
    }

    const operationalSettings = mergeTournamentOperationalSettings(
      rankingConfig.operational_settings,
      { enforceLongBracketMatchRequirement: enabled }
    )

    const { error: updateError } = await supabase
      .from('tournament_ranking_config')
      .update({ operational_settings: operationalSettings })
      .eq('id', rankingConfig.id)

    if (updateError) {
      console.error('Error updating long bracket match requirement:', updateError)
      return { success: false, error: 'Error al actualizar la configuracion' }
    }

    revalidateTournamentSettingsPaths(tournamentId)
    revalidatePath(`/tournaments/${tournamentId}/bracket`)

    return {
      success: true,
      data: {
        enabled,
        message: enabled
          ? 'La llave volvera a exigir partidos completos por pareja.'
          : 'La llave podra generarse con la tabla de posiciones actual.',
      },
    }
  } catch (error: any) {
    return { success: false, error: error?.message || 'Error inesperado' }
  }
}

export async function updateTournamentStatusVisibility(
  tournamentId: string,
  enabled: boolean
): Promise<ActionResult> {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'No autorizado. Debes iniciar sesion.' }
    }

    const permissionCheck = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionCheck.hasPermission) {
      return {
        success: false,
        error: permissionCheck.reason || 'No tienes permisos para editar este torneo',
      }
    }

    const { data: rankingConfig, error: configError } = await supabase
      .from('tournament_ranking_config')
      .select('id, operational_settings')
      .eq('tournament_id', tournamentId)
      .eq('is_active', true)
      .maybeSingle()

    if (configError || !rankingConfig) {
      return { success: false, error: 'No se encontro la configuracion activa del torneo' }
    }

    const operationalSettings = mergeTournamentOperationalSettings(
      rankingConfig.operational_settings,
      { showTournamentStatus: enabled }
    )

    const { error: updateError } = await supabase
      .from('tournament_ranking_config')
      .update({ operational_settings: operationalSettings })
      .eq('id', rankingConfig.id)

    if (updateError) {
      console.error('Error updating tournament status visibility:', updateError)
      return { success: false, error: 'Error al actualizar la configuracion' }
    }

    revalidateTournamentSettingsPaths(tournamentId)

    return {
      success: true,
      data: {
        enabled,
        message: enabled
          ? 'El estado del torneo se mostrara en la informacion publica.'
          : 'El estado del torneo quedara oculto en la informacion publica.',
      },
    }
  } catch (error: any) {
    return { success: false, error: error?.message || 'Error inesperado' }
  }
}

export async function updateTournamentFormatConfig(
  tournamentId: string,
  formatConfig: TournamentFormatConfigV2
): Promise<ActionResult> {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'No autorizado. Debes iniciar sesión.' }
    }

    const permissionCheck = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionCheck.hasPermission) {
      return {
        success: false,
        error: permissionCheck.reason || 'No tienes permisos para editar este torneo'
      }
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, type, status, format_type, format_config, bracket_status, bracket_generated_at')
      .eq('id', tournamentId)
      .single()

    if (tournamentError || !tournament) {
      return { success: false, error: 'No se pudo validar el torneo antes de actualizar el formato' }
    }

    const currentResolved = TournamentFormatResolver.getResolvedFormat({
      type: tournament.type,
      format_type: tournament.format_type,
      format_config: tournament.format_config,
    })
    const nextResolved = TournamentFormatResolver.getResolvedFormat({
      type: tournament.type,
      format_type: tournament.format_type,
      format_config: formatConfig,
    })
    const isAmericanTournament = tournament.type === 'AMERICAN' || tournament.type === 'AMERICANO'
    const runtimeSwitchRequested =
      isAmericanTournament &&
      canSwitchAmericanMultiZoneRuntime(currentResolved.presetId, nextResolved.presetId)
    const longSingleZoneBracketModeSwitchRequested = canSwitchLongSingleZoneBracketMode(
      currentResolved.presetId,
      nextResolved.presetId
    )

    if (
      isAmericanTournament &&
      tournament.status === 'ZONE_PHASE' &&
      !runtimeSwitchRequested
    ) {
      return {
        success: false,
        code: 'UNSUPPORTED_RUNTIME_PRESET_TRANSITION',
        error:
          'En fase de zonas solo se permite cambiar entre formatos americanos multizona compatibles, ' +
          'mientras no exista llave generada.',
      }
    }

    if (longSingleZoneBracketModeSwitchRequested) {
      const hasBracketFlag =
        tournament.bracket_status === 'BRACKET_GENERATED' ||
        tournament.bracket_status === 'BRACKET_ACTIVE' ||
        Boolean(tournament.bracket_generated_at)

      if (hasBracketFlag) {
        return {
          success: false,
          code: 'BRACKET_ALREADY_EXISTS',
          error: 'No se puede cambiar entre llave unica y Oro/Plata porque la llave ya fue generada.',
        }
      }

      const bracketArtifacts = await getPersistedBracketArtifacts(tournamentId)
      if (bracketArtifacts.exists) {
        return {
          success: false,
          code: 'BRACKET_ARTIFACTS_EXIST',
          error: 'No se puede cambiar entre llave unica y Oro/Plata porque existen artefactos persistidos de llave.',
        }
      }
    }

    let zoneSnapshots: ZoneSnapshot[] = []
    if (runtimeSwitchRequested) {
      if (!isFormatStatusAllowedForRuntimeSwitch(tournament.status)) {
        return {
          success: false,
          code: 'INVALID_TOURNAMENT_STATUS',
          error: `Solo se puede cambiar el formato en NOT_STARTED o ZONE_PHASE. Estado actual: ${tournament.status}.`,
        }
      }

      const hasBracketFlag =
        tournament.bracket_status === 'BRACKET_GENERATED' ||
        tournament.bracket_status === 'BRACKET_ACTIVE' ||
        Boolean(tournament.bracket_generated_at)

      if (hasBracketFlag) {
        return {
          success: false,
          code: 'BRACKET_ALREADY_EXISTS',
          error: 'No se puede cambiar el formato porque el torneo ya tiene llave generada.',
        }
      }

      const bracketArtifacts = await getPersistedBracketArtifacts(tournamentId)
      if (bracketArtifacts.exists) {
        return {
          success: false,
          code: 'BRACKET_ARTIFACTS_EXIST',
          error: 'No se puede cambiar el formato porque existen artefactos persistidos de llave.',
        }
      }

      zoneSnapshots = await getZoneSnapshots(supabase, tournamentId)

      if (nextResolved.effectiveTargetMatchesPerCouple === 3) {
        const oversizedZone = zoneSnapshots.find((zone) => zone.coupleCount > 4)
        if (oversizedZone) {
          return {
            success: false,
            code: 'ZONE_CAPACITY_EXCEEDED_FOR_MZ3',
            error: `No se puede pasar a MZ3 porque ${oversizedZone.name} tiene ${oversizedZone.coupleCount} parejas (máximo 4).`,
          }
        }
      }

      if (
        currentResolved.effectiveTargetMatchesPerCouple === 3 &&
        nextResolved.effectiveTargetMatchesPerCouple === 2
      ) {
        for (const zone of zoneSnapshots) {
          const stageInfo = getZoneStageAndMatchesPerCouple(zone.coupleCount, formatConfig)
          const expectedMatches = calculateExpectedZoneMatches(zone.coupleCount, stageInfo.matchesPerCouple)

          if (zone.matchCount > expectedMatches) {
            return {
              success: false,
              code: 'MZ3_TO_MZ2_OVER_LIMIT',
              error:
                `No se puede pasar a MZ2: ${zone.name} tiene ${zone.matchCount} partidos creados ` +
                `y MZ2 admite ${expectedMatches} para ${zone.coupleCount} parejas.`,
            }
          }
        }
      }
    }

    if (formatConfig.advancementConfig.kind === 'SINGLE') {
      let registeredCouplesCount = 0
      try {
        const counts = await getRegisteredCouplesCountForFormatValidation(supabase, tournamentId)
        registeredCouplesCount = counts.count
      } catch (countError: any) {
        console.error('[updateTournamentFormatConfig] Error validating inscriptions:', countError)
        return { success: false, error: 'Error al validar inscripciones del torneo' }
      }

      if (
        registeredCouplesCount > 0 &&
        formatConfig.advancementConfig.advanceCount > registeredCouplesCount
      ) {
        return {
          success: false,
          error: `No puedes configurar ${formatConfig.advancementConfig.advanceCount} parejas para la llave cuando hay ${registeredCouplesCount} inscriptas.`,
        }
      }
    }

    const { error: updateError } = await supabase
      .from('tournaments')
      .update({ format_config: formatConfig })
      .eq('id', tournamentId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    if (runtimeSwitchRequested) {
      for (const zone of zoneSnapshots) {
        const stageInfo = getZoneStageAndMatchesPerCouple(zone.coupleCount, formatConfig)
        const { error: zoneUpdateError } = await supabase
          .from('zones')
          .update({ rounds_per_couple: stageInfo.matchesPerCouple })
          .eq('id', zone.id)

        if (zoneUpdateError) {
          await supabase
            .from('tournaments')
            .update({ format_config: tournament.format_config })
            .eq('id', tournamentId)

          return {
            success: false,
            code: 'ZONE_ROUNDS_SYNC_FAILED',
            error: `No se pudo sincronizar rounds_per_couple en ${zone.name}: ${zoneUpdateError.message}`,
          }
        }
      }
    }

    revalidateTournamentSettingsPaths(tournamentId)

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message || 'Error inesperado al actualizar el formato' }
  }
}

/**
 * Updates tournament basic information (name, description, max_participants, price)
 * Validates permissions and business rules before updating
 */
export async function updateTournamentBasicInfo(
  params: UpdateTournamentBasicInfoParams
): Promise<ActionResult> {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        success: false,
        error: 'No autorizado. Debes iniciar sesión.'
      }
    }

    // Check permissions using centralized function
    const permissionCheck = await checkTournamentPermissions(user.id, params.tournamentId)

    if (!permissionCheck.hasPermission) {
      return {
        success: false,
        error: permissionCheck.reason || 'No tienes permisos para editar este torneo'
      }
    }

    // Validate required fields
    if (!params.name || params.name.trim().length === 0) {
      return {
        success: false,
        error: 'El nombre del torneo es obligatorio'
      }
    }

    if (params.name.trim().length > 100) {
      return {
        success: false,
        error: 'El nombre del torneo no puede exceder 100 caracteres'
      }
    }

    if (params.price !== undefined && params.price !== null) {
      if (!Number.isInteger(params.price)) {
        return {
          success: false,
          error: 'El precio por jugador debe ser un numero entero'
        }
      }

      if (params.price < 0) {
        return {
          success: false,
          error: 'El precio por jugador no puede ser negativo'
        }
      }

      if (params.price > MAX_TOURNAMENT_PRICE) {
        return {
          success: false,
          error: 'El precio por jugador es demasiado alto'
        }
      }
    }

    // If max_participants is being changed, validate against current inscriptions
    if (params.max_participants !== undefined && params.max_participants !== null) {
      // Get current inscriptions count
      const { count: inscriptionsCount, error: countError } = await supabase
        .from('inscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', params.tournamentId)
        .eq('es_prueba', false)

      if (countError) {
        return {
          success: false,
          error: 'Error al validar inscripciones actuales'
        }
      }

      // Don't allow reducing max_participants below current inscriptions
      if (inscriptionsCount && params.max_participants < inscriptionsCount) {
        return {
          success: false,
          error: `No puedes reducir el máximo de participantes a ${params.max_participants} porque ya hay ${inscriptionsCount} parejas inscritas`
        }
      }

      // Validate reasonable range
      if (params.max_participants < 2) {
        return {
          success: false,
          error: 'El torneo debe permitir al menos 2 parejas'
        }
      }

      if (params.max_participants > 256) {
        return {
          success: false,
          error: 'El torneo no puede tener más de 256 parejas'
        }
      }
    }

    if (params.start_date && params.end_date && params.start_date > params.end_date) {
      return {
        success: false,
        error: 'La fecha de cierre no puede ser anterior a la fecha de inicio'
      }
    }

    // Build update object
    const updateData: any = {
      name: params.name.trim(),
      description: params.description?.trim() || null,
    }

    // Only include max_participants if it was provided
    if (params.max_participants !== undefined && params.max_participants !== null) {
      updateData.max_participants = params.max_participants
    }

    if (params.price !== undefined) {
      updateData.price = params.price
    }

    if (params.start_date !== undefined) {
      updateData.start_date = params.start_date ? toTournamentDateISOString(params.start_date) : null
    }

    if (params.end_date !== undefined) {
      updateData.end_date = params.end_date ? toTournamentDateISOString(params.end_date) : null
    }

    if (params.hide_venue !== undefined) {
      updateData.hide_venue = Boolean(params.hide_venue)
    }

    // Update tournament
    const { data: updatedTournament, error: updateError } = await supabase
      .from('tournaments')
      .update(updateData)
      .eq('id', params.tournamentId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating tournament:', updateError)
      return {
        success: false,
        error: 'Error al actualizar el torneo. Por favor, intenta de nuevo.'
      }
    }

    try {
      await syncTournamentCapacityRegistrationLock(params.tournamentId)
    } catch (capacityError) {
      console.error('Error syncing tournament capacity after settings update:', capacityError)
    }

    // Revalidate the tournament pages
    revalidateTournamentSettingsPaths(params.tournamentId)

    return {
      success: true,
      data: updatedTournament
    }

  } catch (error) {
    console.error('Unexpected error in updateTournamentBasicInfo:', error)
    return {
      success: false,
      error: 'Error inesperado al actualizar el torneo'
    }
  }
}

/**
 * Gets tournament details for editing
 */
export async function getTournamentForEdit(tournamentId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        success: false,
        error: 'No autorizado'
      }
    }

    // Check permissions
    const permissionCheck = await checkTournamentPermissions(user.id, tournamentId)

    if (!permissionCheck.hasPermission) {
      return {
        success: false,
        error: permissionCheck.reason || 'No tienes permisos para ver este torneo'
      }
    }

    // Get tournament data
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select(`
        id,
        name,
        description,
        max_participants,
        price,
        pre_tournament_image_url,
        status,
        bracket_status,
        club_id,
        clubes (
          cover_image_url
        )
      `)
      .eq('id', tournamentId)
      .single()

    if (tournamentError || !tournament) {
      return {
        success: false,
        error: 'Torneo no encontrado'
      }
    }

    // Get inscriptions count
    const { count: inscriptionsCount } = await supabase
      .from('inscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('es_prueba', false)

    return {
      success: true,
      data: {
        ...tournament,
        inscriptions_count: inscriptionsCount || 0
      }
    }

  } catch (error) {
    console.error('Error in getTournamentForEdit:', error)
    return {
      success: false,
      error: 'Error al obtener datos del torneo'
    }
  }
}

export async function addTournamentClubsAction(tournamentId: string, clubIds: string[]): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'No autorizado' }

    const permissionCheck = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionCheck.hasPermission) return { success: false, error: permissionCheck.reason || 'Sin permisos' }

    const result = await linkTournamentClubs({ supabase, userId: user.id, tournamentId, clubIds })
    if (!result.success) return { success: false, error: result.message || 'No se pudo agregar clubes' }

    revalidateTournamentSettingsPaths(tournamentId)
    revalidatePath(`/tournaments/${tournamentId}`)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Error inesperado' }
  }
}

export async function removeTournamentClubsAction(tournamentId: string, clubIds: string[]): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'No autorizado' }

    const permissionCheck = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionCheck.hasPermission) return { success: false, error: permissionCheck.reason || 'Sin permisos' }

    const result = await unlinkTournamentClubs({ supabase, userId: user.id, tournamentId, clubIds })
    if (!result.success) return { success: false, error: result.message || 'No se pudo quitar clubes' }

    revalidateTournamentSettingsPaths(tournamentId)
    revalidatePath(`/tournaments/${tournamentId}`)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Error inesperado' }
  }
}

/**
 * Toggle draft matches mode for a tournament
 * When enabled, newly created matches start in DRAFT status
 */
export async function toggleDraftMatches(
  tournamentId: string,
  enabled: boolean
): Promise<ActionResult> {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return {
        success: false,
        error: 'No autorizado. Debes iniciar sesión.'
      }
    }

    // Check permissions
    const permissionCheck = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionCheck.hasPermission) {
      return {
        success: false,
        error: permissionCheck.reason || 'No tienes permisos para editar este torneo'
      }
    }

    // Update tournament configuration
    const { error: updateError } = await supabase
      .from('tournaments')
      .update({ enable_draft_matches: enabled })
      .eq('id', tournamentId)

    if (updateError) {
      console.error('Error toggling draft matches:', updateError)
      return {
        success: false,
        error: 'Error al actualizar la configuración de borradores'
      }
    }

    // Revalidate paths
    // Si igual querés mantener revalidación:
    revalidatePath(`/tournaments/${tournamentId}`)
    // O podrías revalidar solo esa, en lugar de las otras dos

    // 🚀 Redirige al detalle del torneo
    redirect(`/tournaments/${tournamentId}`)

    return {
      success: true,
      data: {
        enabled,
        message: enabled
          ? 'Modo borrador activado. Los nuevos partidos se crearán como borradores.'
          : 'Modo borrador desactivado. Los nuevos partidos serán visibles inmediatamente.'
      }
    }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Error inesperado' }
  }
}

/**
 * Gets preview of data that will be deleted when resetting tournament
 * Returns counts of zones, matches, zone couples, and zone positions
 */
export async function getResetTournamentPreview(
  tournamentId: string
): Promise<ResetPreviewResult> {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        success: false,
        error: 'No autorizado. Debes iniciar sesión.'
      }
    }

    // Check permissions using centralized function
    const permissionCheck = await checkTournamentPermissions(user.id, tournamentId)

    if (!permissionCheck.hasPermission) {
      return {
        success: false,
        error: permissionCheck.reason || 'No tienes permisos para editar este torneo'
      }
    }

    // Verify that the tournament exists and is in zone phase
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('id, status')
      .eq('id', tournamentId)
      .single()
    
    if (tErr || !tournament) {
      return {
        success: false,
        error: 'Torneo no encontrado'
      }
    }
    
    if (tournament.status !== 'ZONE_PHASE') {
      return {
        success: false,
        error: 'El torneo no está en fase de zonas. Solo se puede revertir desde este estado.'
      }
    }

    // Get all zones from the tournament
    const zonesResult = await getZonesFromTournament(tournamentId)
    
    if (!zonesResult.success) {
      return {
        success: false,
        error: zonesResult.error || 'Error al obtener las zonas del torneo'
      }
    }

    const zoneIds = zonesResult.zoneIds || []

    // Count zone matches (matches with round = 'ZONE')
    const { count: matchesCount, error: matchesError } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('round', 'ZONE')

    if (matchesError) {
      return {
        success: false,
        error: 'Error al contar los partidos de zona'
      }
    }

    // Count zone couples
    const { count: zoneCouplesCount, error: zoneCouplesError } = await supabase
      .from('zone_couples')
      .select('*', { count: 'exact', head: true })
      .in('zone_id', zoneIds)

    if (zoneCouplesError) {
      return {
        success: false,
        error: 'Error al contar las asignaciones de parejas a zonas'
      }
    }

    // Count zone positions
    const { count: zonePositionsCount, error: zonePositionsError } = await supabase
      .from('zone_positions')
      .select('*', { count: 'exact', head: true })
      .in('zone_id', zoneIds)

    if (zonePositionsError) {
      return {
        success: false,
        error: 'Error al contar las posiciones de zona'
      }
    }

    return {
      success: true,
      data: {
        zonesCount: zoneIds.length,
        matchesCount: matchesCount || 0,
        zoneCouplesCount: zoneCouplesCount || 0,
        zonePositionsCount: zonePositionsCount || 0
      }
    }

  } catch (error) {
    console.error('Error in getResetTournamentPreview:', error)
    return {
      success: false,
      error: 'Error interno del servidor'
    }
  }
}

/**
 * Reverts a tournament from ZONE_PHASE back to NOT_STARTED status
 * Deletes all zones and related data, then updates tournament status
 */
export async function backTournamentToNotStartedAction(
  tournamentId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        success: false,
        error: 'No autorizado. Debes iniciar sesión.'
      }
    }

    // Check permissions using centralized function
    const permissionCheck = await checkTournamentPermissions(user.id, tournamentId)

    if (!permissionCheck.hasPermission) {
      return {
        success: false,
        error: permissionCheck.reason || 'No tienes permisos para editar este torneo'
      }
    }

    // Verify that the tournament exists and is in zone phase
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('id, status')
      .eq('id', tournamentId)
      .single()
    
    if (tErr || !tournament) {
      return {
        success: false,
        error: 'Torneo no encontrado'
      }
    }
    
    if (tournament.status !== 'ZONE_PHASE') {
      return {
        success: false,
        error: 'El torneo no está en fase de zonas. Solo se puede revertir desde este estado.'
      }
    }
    
    // Get all zones from the tournament using the abstracted function
    const zonesResult = await getZonesFromTournament(tournamentId)
    
    if (!zonesResult.success) {
      return {
        success: false,
        error: zonesResult.error || 'Error al obtener las zonas del torneo'
      }
    }

    if (!zonesResult.zoneIds || zonesResult.zoneIds.length === 0) {
      return {
        success: true,
        message: 'No hay zonas para eliminar en este torneo'
      }
    }

    const zoneIds = zonesResult.zoneIds
    
    // Delete zone matches first (matches with round = 'ZONE')
    const { error: matchesError } = await supabase
      .from('matches')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('round', 'ZONE')

    if (matchesError) {
      return {
        success: false,
        error: 'Error al eliminar los partidos de zona'
      }
    }
    
    // Delete zones and related data
    const deleteResult = await deleteZonesAndData(zoneIds)
    
    if (!deleteResult.success) {
      return {
        success: false,
        error: deleteResult.error || 'Error al eliminar las zonas y datos relacionados'
      }
    }

    // Update tournament status to NOT_STARTED
    const { error: statusError } = await supabase
      .from('tournaments')
      .update({ status: 'NOT_STARTED' })
      .eq('id', tournamentId)

    if (statusError) {
      return {
        success: false,
        error: 'Error al actualizar el estado del torneo'
      }
    }

    // Revalidate tournament pages
    revalidatePath(`/tournaments/${tournamentId}`)
    revalidateTournamentSettingsPaths(tournamentId)
    
    return {
      success: true,
      message: deleteResult.message || `Torneo revertido exitosamente. Se eliminaron ${zoneIds.length} zonas.`
    }

  } catch (error) {
    console.error('Error in backTournamentToNotStartedAction:', error)
    return {
      success: false,
      error: 'Error interno del servidor'
    }  }
}

/**
 * Gets preview of data that will be deleted when reverting from BRACKET_PHASE to ZONE_PHASE
 * Returns counts of seeds, hierarchy, and bracket matches
 */
export async function getBackFromBracketPreview(
  tournamentId: string
): Promise<BackFromBracketPreviewResult> {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'No autorizado. Debes iniciar sesión.' }
    }

    // Check permissions
    const permissionCheck = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionCheck.hasPermission) {
      return { success: false, error: permissionCheck.reason || 'No tienes permisos para editar este torneo' }
    }

    // Verify tournament exists and is in BRACKET_PHASE
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('id, status, type')
      .eq('id', tournamentId)
      .single()
    
    if (tErr || !tournament) {
      return { success: false, error: 'Torneo no encontrado' }
    }
    
    if (tournament.status !== 'BRACKET_PHASE') {
      return {
        success: false,
        error: 'El torneo no está en fase de bracket. Solo se puede revertir desde este estado.'
      }
    }

    // Count tournament_couple_seeds
    const { count: seedsCount, error: seedsError } = await supabase
      .from('tournament_couple_seeds')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)

    if (seedsError) {
      return { success: false, error: 'Error al contar los seeds' }
    }

    // Count match_hierarchy
    const { count: hierarchyCount, error: hierarchyError } = await supabase
      .from('match_hierarchy')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)

    if (hierarchyError) {
      return { success: false, error: 'Error al contar la jerarquía de partidos' }
    }

    // Count bracket matches (not ZONE) and their statuses
    const { data: bracketMatches, error: matchesError } = await supabase
      .from('matches')
      .select('id, status')
      .eq('tournament_id', tournamentId)
      .neq('round', 'ZONE')

    if (matchesError) {
      return { success: false, error: 'Error al contar los partidos de bracket' }
    }

    const finishedBracketMatches = bracketMatches?.filter(m => m.status === 'FINISHED').length || 0
    const bracketMatchesCount = bracketMatches?.length || 0
    const pendingBracketMatches = bracketMatchesCount - finishedBracketMatches
    return {
      success: true,
      data: {
        seedsCount: seedsCount || 0,
        hierarchyCount: hierarchyCount || 0,
        bracketMatchesCount: bracketMatchesCount,
        finishedBracketMatches,
        pendingBracketMatches
      }
    }

  } catch (error) {
    console.error('Error in getBackFromBracketPreview:', error)
    return { success: false, error: 'Error interno del servidor' }
  }
}



/**
 * Reverts a tournament from BRACKET_PHASE back to ZONE_PHASE status
 * Deletes seeds, hierarchy, and bracket matches, preserving zone data
 */
export async function backTournamentFromBracketToZones(
  tournamentId: string
): Promise<ActionResult> {
  try {
    console.log('[backTournamentFromBracketToZones] Starting process for tournament:', tournamentId)
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('[backTournamentFromBracketToZones] Auth error:', authError)
      return { success: false, error: 'No autorizado. Debes iniciar sesión.' }
    }
    
    console.log('[backTournamentFromBracketToZones] User authenticated:', user.id)

    // Check permissions
    const permissionCheck = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionCheck.hasPermission) {
      console.error('[backTournamentFromBracketToZones] Permission denied:', permissionCheck.reason)
      return { success: false, error: permissionCheck.reason || 'No tienes permisos para editar este torneo' }
    }
    
    console.log('[backTournamentFromBracketToZones] Permissions validated')

    // Verify tournament exists and is in BRACKET_PHASE
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('id, status')
      .eq('id', tournamentId)
      .single()
    
    if (tErr || !tournament) {
      console.error('[backTournamentFromBracketToZones] Tournament not found:', tErr)
      return { success: false, error: 'Torneo no encontrado' }
    }
    
    console.log('[backTournamentFromBracketToZones] Tournament found with status:', tournament.status)
    
    if (tournament.status !== 'BRACKET_PHASE') {
      console.error('[backTournamentFromBracketToZones] Invalid status:', tournament.status)
      return {
        success: false,
        error: 'El torneo no está en fase de bracket. Solo se puede revertir desde este estado.'
      }
    }

    // ORDEN CORRECTO: Eliminar en orden inverso de dependencias FK
    // operations_log → matches, results_history → matches, hierarchy → matches, matches → seeds

    // Delete bracket_operations_log (FK to matches - must be deleted first)
    console.log('[backTournamentFromBracketToZones] Step 1: Deleting bracket operations log...')
    const logResult = await deleteBracketOperationsLog(tournamentId)
    if (!logResult.success) {
      console.error('[backTournamentFromBracketToZones] Failed to delete operations log:', logResult.error)
      return { success: false, error: logResult.error || 'Error al eliminar el log de operaciones de bracket' }
    }
    console.log('[backTournamentFromBracketToZones] Step 1 completed: Operations log deleted')

    // Delete match_results_history (FK to matches - must be deleted before matches)
    console.log('[backTournamentFromBracketToZones] Step 2: Deleting match results history...')
    const historyResult = await deleteMatchResultsHistory(tournamentId)
    if (!historyResult.success) {
      console.error('[backTournamentFromBracketToZones] Failed to delete match results history:', historyResult.error)
      return { success: false, error: historyResult.error || 'Error al eliminar el historial de resultados de partidos' }
    }
    console.log('[backTournamentFromBracketToZones] Step 2 completed: Match results history deleted')

    // Delete match_hierarchy (FK to matches - must be deleted before matches)
    console.log('[backTournamentFromBracketToZones] Step 3: Deleting match hierarchy...')
    const hierarchyResult = await deleteMatchesHierarchy(tournamentId)
    if (!hierarchyResult.success) {
      console.error('[backTournamentFromBracketToZones] Failed to delete hierarchy:', hierarchyResult.error)
      return { success: false, error: hierarchyResult.error || 'Error al eliminar la jerarquía de partidos' }
    }
    console.log('[backTournamentFromBracketToZones] Step 3 completed: Hierarchy deleted')
    // Delete bracket matches (FK to seeds - must be deleted before seeds)
    console.log('[backTournamentFromBracketToZones] Step 4: Deleting bracket matches...')
    const matchesResult = await deleteBracketMatchesFromTournament(tournamentId)
    if (!matchesResult.success) {
      console.error('[backTournamentFromBracketToZones] Failed to delete bracket matches:', matchesResult.error)
      return { success: false, error: matchesResult.error || 'Error al eliminar los partidos de bracket' }
    }
    console.log('[backTournamentFromBracketToZones] Step 4 completed: Bracket matches deleted')

    // Delete tournament_couple_seeds (no more FK dependencies)
    console.log('[backTournamentFromBracketToZones] Step 5: Deleting couple seeds...')
    const seedsResult = await deleteCoupleSeeds(tournamentId)
    if (!seedsResult.success) {
      console.error('[backTournamentFromBracketToZones] Failed to delete seeds:', seedsResult.error)
      return { success: false, error: seedsResult.error || 'Error al eliminar los seeds' }
    }
    console.log('[backTournamentFromBracketToZones] Step 5 completed: Seeds deleted')

    // Update tournament status to ZONE_PHASE
    console.log('[backTournamentFromBracketToZones] Step 6: Updating tournament status...')
    const { error: statusError } = await supabase
      .from('tournaments')
      .update({
        status: 'ZONE_PHASE',
        bracket_status: 'NOT_STARTED',
        bracket_generated_at: null,
        placeholder_brackets_generated_at: null
      })
      .eq('id', tournamentId)

    if (statusError) {
      console.error('[backTournamentFromBracketToZones] Failed to update status:', statusError)
      return { success: false, error: 'Error al actualizar el estado del torneo' }
    }
    console.log('[backTournamentFromBracketToZones] Step 6 completed: Tournament status updated')

    // Revalidate tournament pages
    console.log('[backTournamentFromBracketToZones] Revalidating paths...')
    revalidatePath(`/tournaments/${tournamentId}`)
    revalidateTournamentSettingsPaths(tournamentId)
    
    console.log('[backTournamentFromBracketToZones] Process completed successfully')
    return {
      success: true,
      message: 'Torneo revertido exitosamente a fase de zonas. Los datos de zona se mantuvieron intactos.'
    }

  } catch (error) {
    console.error('[backTournamentFromBracketToZones] Unexpected error:', error)
    return { success: false, error: `Error interno del servidor: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}
