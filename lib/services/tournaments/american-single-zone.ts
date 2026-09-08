import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import { ensureCanonicalZoneMembership } from '@/lib/services/tournament-zone-membership'
import { ZoneRulesSyncService } from '@/lib/services/zone-rules-sync.service'
import { createClientServiceRole } from '@/utils/supabase/server'

const GENERAL_ZONE_NAME = 'Zona General'
const DEFAULT_CAPACITY = 32

type ManagedZone = {
  id: string
  name: string | null
  created_at?: string | null
}

export type EnsureAmericanSingleZoneResult = {
  success: boolean
  applies: boolean
  zoneId?: string
  created?: boolean
  assignedCouples?: number
  totalApprovedCouples?: number
  warning?: string
  error?: string
}

const pickGeneralZone = (zones: ManagedZone[]) => (
  zones.find((zone) => zone.name === GENERAL_ZONE_NAME) ?? zones[0] ?? null
)

/**
 * Keeps the structural zone of an American single-zone tournament consistent.
 * This operation is idempotent and never recreates matches or standings.
 */
export const ensureAmericanSingleZone = async (
  tournamentId: string
): Promise<EnsureAmericanSingleZoneResult> => {
  try {
    const supabase = await createClientServiceRole()
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, type, format_type, format_config, max_participants')
      .eq('id', tournamentId)
      .single()

    if (tournamentError || !tournament) {
      return { success: false, applies: false, error: 'No se encontró el torneo.' }
    }

    const resolvedFormat = TournamentFormatResolver.getResolvedFormat(tournament)
    if (resolvedFormat.baseType !== 'AMERICAN' || resolvedFormat.zoneMode !== 'SINGLE_ZONE') {
      return { success: true, applies: false }
    }

    const configuredMaximum = resolvedFormat.zoneRules.maxSize || DEFAULT_CAPACITY
    const targetCapacity = Math.min(
      tournament.max_participants || configuredMaximum,
      configuredMaximum
    )
    const roundsPerCouple = resolvedFormat.effectiveTargetMatchesPerCouple
      || resolvedFormat.targetMatchesPerCouple
      || 2

    const { data: existingZones, error: zonesError } = await supabase
      .from('zones')
      .select('id, name, created_at')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true })

    if (zonesError) {
      return { success: false, applies: true, error: 'No se pudieron consultar las zonas.' }
    }

    let zone = pickGeneralZone((existingZones || []) as ManagedZone[])
    let created = false

    if (!zone) {
      const { data: createdZone, error: createError } = await supabase
        .from('zones')
        .insert({
          tournament_id: tournamentId,
          name: GENERAL_ZONE_NAME,
          capacity: targetCapacity,
          max_couples: targetCapacity,
          rounds_per_couple: roundsPerCouple,
        })
        .select('id, name, created_at')
        .single()

      if (createError || !createdZone) {
        return {
          success: false,
          applies: true,
          error: createError?.message || 'No se pudo crear la Zona General.',
        }
      }

      zone = createdZone as ManagedZone
      created = true
    } else {
      const { error: updateError } = await supabase
        .from('zones')
        .update({
          name: GENERAL_ZONE_NAME,
          capacity: targetCapacity,
          max_couples: targetCapacity,
          rounds_per_couple: roundsPerCouple,
        })
        .eq('id', zone.id)

      if (updateError) {
        return { success: false, applies: true, error: updateError.message }
      }
    }

    const { data: inscriptions, error: inscriptionsError } = await supabase
      .from('inscriptions')
      .select('couple_id')
      .eq('tournament_id', tournamentId)
      .eq('is_pending', false)
      .not('couple_id', 'is', null)
      .order('created_at', { ascending: true })

    if (inscriptionsError) {
      return { success: false, applies: true, zoneId: zone.id, error: inscriptionsError.message }
    }

    const coupleIds = Array.from(new Set(
      (inscriptions || [])
        .map((inscription) => inscription.couple_id)
        .filter((coupleId): coupleId is string => Boolean(coupleId))
    ))

    let assignedCouples = 0
    for (const [index, coupleId] of coupleIds.entries()) {
      const membership = await ensureCanonicalZoneMembership({
        supabase,
        tournamentId,
        zoneId: zone.id,
        coupleId,
        position: index + 1,
      })

      if (!membership.success) {
        return {
          success: false,
          applies: true,
          zoneId: zone.id,
          assignedCouples,
          totalApprovedCouples: coupleIds.length,
          error: membership.error || 'No se pudo asignar una pareja a la Zona General.',
        }
      }
      assignedCouples += 1
    }

    const rulesResult = await ZoneRulesSyncService.syncZoneRulesForZone(supabase, zone.id)
    if (!rulesResult.success) {
      return {
        success: false,
        applies: true,
        zoneId: zone.id,
        assignedCouples,
        totalApprovedCouples: coupleIds.length,
        error: rulesResult.error || 'No se pudieron sincronizar las reglas de la Zona General.',
      }
    }

    const warning = (existingZones?.length || 0) > 1
      ? `El torneo tiene ${existingZones?.length} zonas; se administró ${zone.id} como Zona General sin borrar datos existentes.`
      : undefined

    return {
      success: true,
      applies: true,
      zoneId: zone.id,
      created,
      assignedCouples,
      totalApprovedCouples: coupleIds.length,
      warning,
    }
  } catch (error) {
    console.error('[ensureAmericanSingleZone] Unexpected error:', { tournamentId, error })
    return { success: false, applies: true, error: 'Error interno preparando la Zona General.' }
  }
}
