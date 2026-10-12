import { ZoneRulesSyncService } from '@/lib/services/zone-rules-sync.service'
import { applyZoneMembershipChangesAtomically } from '@/lib/services/zone-position/atomic-position-persistence'
import { createClientServiceRole } from '@/utils/supabase/server'
import { scheduleInscriptionProofCleanup } from '@/lib/services/inscription-proofs'

type SupabaseClientLike = any

type EnsureZoneMembershipParams = {
  supabase: SupabaseClientLike
  tournamentId: string
  zoneId: string
  coupleId: string
  position?: number
  mirrorZoneCouples?: boolean
}

type EnsureZoneMembershipResult = {
  success: boolean
  zoneId: string
  coupleId: string
  zonePositionId?: string
  mirroredToZoneCouples?: boolean
  mirrorWarning?: string
  error?: string
}

type RemoveTournamentCoupleMembershipParams = {
  supabase: SupabaseClientLike
  tournamentId: string
  coupleId: string
  deleteInscription?: boolean
}

type RemoveTournamentCoupleMembershipResult = {
  success: boolean
  zonesCount: number
  error?: string
}

const isDuplicateError = (error: any) => {
  return error?.code === '23505' || String(error?.message || '').toLowerCase().includes('duplicate')
}

const getNextZonePosition = async (
  supabase: SupabaseClientLike,
  zoneId: string,
  fallbackPosition?: number
) => {
  if (fallbackPosition && fallbackPosition > 0) {
    return fallbackPosition
  }

  const { data, error } = await supabase
    .from('zone_positions')
    .select('position')
    .eq('zone_id', zoneId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || 'Error calculando posicion de zona')
  }

  return data?.position ? data.position + 1 : 1
}

const mirrorZoneCouple = async (
  supabase: SupabaseClientLike,
  zoneId: string,
  coupleId: string
): Promise<{ mirrored: boolean; warning?: string }> => {
  const { data: existing, error: existingError } = await supabase
    .from('zone_couples')
    .select('zone_id')
    .eq('zone_id', zoneId)
    .eq('couple_id', coupleId)
    .maybeSingle()

  if (existingError && !isDuplicateError(existingError)) {
    return { mirrored: false, warning: existingError.message }
  }

  if (existing) {
    return { mirrored: true }
  }

  const { error: mirrorError } = await supabase
    .from('zone_couples')
    .insert({ zone_id: zoneId, couple_id: coupleId })

  if (mirrorError && !isDuplicateError(mirrorError)) {
    return { mirrored: false, warning: mirrorError.message }
  }

  return { mirrored: true }
}

export const ensureCanonicalZoneMembership = async ({
  supabase,
  tournamentId,
  zoneId,
  coupleId,
  position,
  mirrorZoneCouples = true,
}: EnsureZoneMembershipParams): Promise<EnsureZoneMembershipResult> => {
  try {
    const { data: inscription, error: inscriptionError } = await supabase
      .from('inscriptions')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('couple_id', coupleId)
      .maybeSingle()

    if (inscriptionError || !inscription) {
      return {
        success: false,
        zoneId,
        coupleId,
        error: inscriptionError?.message || 'La pareja no tiene una inscripcion valida en el torneo',
      }
    }

    const { data: existingPosition, error: existingError } = await supabase
      .from('zone_positions')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('zone_id', zoneId)
      .eq('couple_id', coupleId)
      .maybeSingle()

    if (existingError) {
      return {
        success: false,
        zoneId,
        coupleId,
        error: existingError.message,
      }
    }

    let zonePositionId = existingPosition?.id

    if (!zonePositionId) {
      const nextPosition = await getNextZonePosition(supabase, zoneId, position)
      const { data: insertedPosition, error: insertError } = await supabase
        .from('zone_positions')
        .insert({
          tournament_id: tournamentId,
          zone_id: zoneId,
          couple_id: coupleId,
          position: nextPosition,
          is_definitive: false,
          points: 0,
          wins: 0,
          losses: 0,
          games_for: 0,
          games_against: 0,
          games_difference: 0,
          player_score_total: 0,
          sets_for: 0,
          sets_against: 0,
          sets_difference: 0,
        })
        .select('id')
        .single()

      if (insertError) {
        if (!isDuplicateError(insertError)) {
          return {
            success: false,
            zoneId,
            coupleId,
            error: insertError.message,
          }
        }

        const { data: racedPosition, error: racedError } = await supabase
          .from('zone_positions')
          .select('id')
          .eq('tournament_id', tournamentId)
          .eq('zone_id', zoneId)
          .eq('couple_id', coupleId)
          .maybeSingle()

        if (racedError || !racedPosition?.id) {
          return {
            success: false,
            zoneId,
            coupleId,
            error: racedError?.message || insertError.message,
          }
        }

        zonePositionId = racedPosition.id
      } else {
        zonePositionId = insertedPosition?.id
      }
    }

    if (!mirrorZoneCouples) {
      return {
        success: true,
        zoneId,
        coupleId,
        zonePositionId,
        mirroredToZoneCouples: false,
      }
    }

    const mirrorResult = await mirrorZoneCouple(supabase, zoneId, coupleId)

    return {
      success: true,
      zoneId,
      coupleId,
      zonePositionId,
      mirroredToZoneCouples: mirrorResult.mirrored,
      mirrorWarning: mirrorResult.warning,
    }
  } catch (error: any) {
    return {
      success: false,
      zoneId,
      coupleId,
      error: error?.message || 'Error asegurando membresia de zona',
    }
  }
}

export const removeTournamentCoupleMembership = async ({
  supabase,
  tournamentId,
  coupleId,
  deleteInscription = false,
}: RemoveTournamentCoupleMembershipParams): Promise<RemoveTournamentCoupleMembershipResult> => {
  const { data: memberships, error: membershipsError } = await supabase
    .from('zone_positions')
    .select('zone_id')
    .eq('tournament_id', tournamentId)
    .eq('couple_id', coupleId)

  if (membershipsError) {
    return { success: false, zonesCount: 0, error: membershipsError.message }
  }

  const zoneIds = (memberships || []).map((membership: { zone_id: string }) => membership.zone_id)

  if (deleteInscription) {
    const { error: inscriptionError } = await supabase
      .from('inscriptions')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('couple_id', coupleId)

    if (inscriptionError) {
      return { success: false, zonesCount: zoneIds.length, error: inscriptionError.message }
    }
    scheduleInscriptionProofCleanup()
  } else if (zoneIds.length > 0) {
    try {
      const serviceClient = await createClientServiceRole()
      await applyZoneMembershipChangesAtomically(
        serviceClient,
        tournamentId,
        zoneIds.map((zoneId: string) => ({
          couple_id: coupleId,
          from_zone_id: zoneId,
          to_zone_id: null,
          to_position: null,
        }))
      )
    } catch (error: any) {
      return { success: false, zonesCount: zoneIds.length, error: error.message }
    }
  }

  const syncResults = await ZoneRulesSyncService.syncZoneRulesForZones(supabase, zoneIds)
  const syncError = syncResults.find((result) => !result.success)
  if (syncError) {
    console.warn('[removeTournamentCoupleMembership] zone rules sync warning:', syncError.error)
  }

  return { success: true, zonesCount: zoneIds.length }
}
