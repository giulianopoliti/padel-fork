import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import type {
  PlannedZone,
  TournamentFormatConfigV2,
  TournamentFormatZoneRules,
  ZoneFixturePlan,
} from '@/types/tournament-format-v2'

function buildLegacyMultiZoneDistribution(totalCouples: number): number[] {
  if (totalCouples < 6) {
    throw new Error(`El torneo requiere al menos 6 parejas. Recibidas: ${totalCouples}.`)
  }

  let numZonesOf4 = 0
  let numZonesOf3 = 0

  switch (totalCouples % 4) {
    case 0:
      numZonesOf4 = totalCouples / 4
      break
    case 1:
      if (totalCouples < 9) {
        throw new Error(`No se pueden formar zonas con ${totalCouples} parejas (resto 1). Se requieren al menos 9.`)
      }
      numZonesOf4 = Math.floor(totalCouples / 4) - 2
      numZonesOf3 = 3
      break
    case 2:
      numZonesOf4 = Math.floor(totalCouples / 4) - 1
      numZonesOf3 = 2
      break
    case 3:
      numZonesOf4 = Math.floor(totalCouples / 4)
      numZonesOf3 = 1
      break
  }

  return [...new Array(numZonesOf4).fill(4), ...new Array(numZonesOf3).fill(3)]
}

export function getZoneStageAndMatchesPerCouple(
  zoneSize: number,
  config: TournamentFormatConfigV2
): { stage: 'FIXED_MATCH_COUNT' | 'ROUND_ROBIN'; matchesPerCouple: number; notes: string[] } {
  const notes: string[] = []

  if (zoneSize <= 1) {
    notes.push('Con menos de 2 parejas no hay partido oficial posible.')
    return {
      stage: 'ROUND_ROBIN',
      matchesPerCouple: 0,
      notes,
    }
  }

  if (config.baseType === 'AMERICAN' && zoneSize === 2) {
    notes.push('Zona temporal de 2 parejas: se permite un partido oficial mientras se completa la zona.')
    return {
      stage: 'ROUND_ROBIN',
      matchesPerCouple: 1,
      notes,
    }
  }

  if (config.zoneMode === 'SINGLE_ZONE' && config.baseType === 'AMERICAN' && config.bracketMode === 'SINGLE' && zoneSize === 3) {
    notes.push('Con 3 parejas se juega round robin completo de 2 partidos por pareja.')
    return {
      stage: 'ROUND_ROBIN',
      matchesPerCouple: 2,
      notes,
    }
  }

  if (config.baseType === 'AMERICAN' && config.zoneMode === 'MULTI_ZONE' && config.targetMatchesPerCouple === 3 && zoneSize === 3) {
    notes.push('Excepcion valida: zona de 3 juega round robin completo de 2 partidos por pareja.')
    return {
      stage: 'ROUND_ROBIN',
      matchesPerCouple: 2,
      notes,
    }
  }

  if (config.zoneStage === 'ROUND_ROBIN') {
    return {
      stage: 'ROUND_ROBIN',
      matchesPerCouple: Math.max(zoneSize - 1, 0),
      notes,
    }
  }

  return {
    stage: 'FIXED_MATCH_COUNT',
    matchesPerCouple: config.targetMatchesPerCouple || 0,
    notes,
  }
}

function validateZoneSize(size: number, rules: TournamentFormatZoneRules): string | null {
  if (size < rules.minSize) {
    return `Zona invalida: minimo ${rules.minSize} parejas`
  }

  if (size > rules.maxSize) {
    return `Zona invalida: maximo ${rules.maxSize} parejas`
  }

  if (!rules.allowedSizes.includes(size)) {
    return `Zona de ${size} parejas no permitida para este formato`
  }

  return null
}

export class ZoneFixturePlanner {
  static planForTournament(
    tournament: { format_config?: unknown; format_type?: string | null; type?: string | null },
    totalCouples: number
  ): ZoneFixturePlan {
    const resolved = TournamentFormatResolver.getResolvedFormat(tournament, { totalCouples })
    return this.plan(totalCouples, resolved)
  }

  static plan(totalCouples: number, config: TournamentFormatConfigV2): ZoneFixturePlan {
    const resolved = TournamentFormatResolver.getResolvedFormat({ format_config: config }, { totalCouples })
    const errors: string[] = []
    const notes = [...resolved.appliedNotes]
    const zones: PlannedZone[] = []

    if (resolved.zoneMode === 'SINGLE_ZONE') {
      const validationError = validateZoneSize(totalCouples, resolved.zoneRules)
      if (validationError) {
        errors.push(validationError)
      }

      const stageInfo = getZoneStageAndMatchesPerCouple(totalCouples, resolved)
      zones.push({
        index: 0,
        name: 'Zona General',
        size: totalCouples,
        stage: stageInfo.stage,
        matchesPerCouple: stageInfo.matchesPerCouple,
        notes: stageInfo.notes,
      })

      return {
        zoneMode: resolved.zoneMode,
        totalCouples,
        zones,
        notes,
        isValid: errors.length === 0,
        errors,
      }
    }

    let distribution: number[] = []

    try {
      distribution = buildLegacyMultiZoneDistribution(totalCouples)
    } catch (error: any) {
      errors.push(error.message || 'No se pudo calcular la distribucion de zonas')
    }

    distribution.forEach((size, index) => {
      const validationError = validateZoneSize(size, resolved.zoneRules)
      if (validationError) {
        errors.push(validationError)
      }

      const stageInfo = getZoneStageAndMatchesPerCouple(size, resolved)
      zones.push({
        index,
        name: `Zona ${String.fromCharCode(65 + index)}`,
        size,
        stage: stageInfo.stage,
        matchesPerCouple: stageInfo.matchesPerCouple,
        notes: stageInfo.notes,
      })
    })

    return {
      zoneMode: resolved.zoneMode,
      totalCouples,
      zones,
      notes,
      isValid: errors.length === 0,
      errors,
    }
  }
}
