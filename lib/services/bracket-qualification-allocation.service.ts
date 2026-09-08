import type { AdvancementConfig, BracketMode } from '@/types/tournament-format-v2'

type AllocationValidation = { isValid: true; errors: [] } | { isValid: false; errors: string[] }

const isNonNegativeInteger = (value: number) => Number.isInteger(value) && value >= 0

export const BracketQualificationAllocationService = {
  getDefaultAllocation(totalCouples: number, bracketMode: BracketMode): AdvancementConfig {
    if (bracketMode === 'SINGLE') {
      return { kind: 'SINGLE', advanceCount: totalCouples, allocationMode: 'AUTO' }
    }
    if (bracketMode === 'GOLD_SILVER') {
      const goldCount = Math.floor(totalCouples / 2)
      return { kind: 'GOLD_SILVER', goldCount, silverCount: totalCouples - goldCount, eliminatedCount: 0, allocationMode: 'AUTO' }
    }
    return { kind: 'NONE' }
  },

  normalizeAllocation(totalCouples: number, config: AdvancementConfig): AdvancementConfig {
    if (config.kind === 'SINGLE') {
      return { ...config, allocationMode: config.allocationMode ?? 'CUSTOM' }
    }
    if (config.kind === 'GOLD_SILVER') {
      return {
        ...config,
        eliminatedCount: totalCouples - config.goldCount - config.silverCount,
        allocationMode: config.allocationMode ?? 'CUSTOM',
      }
    }
    return config
  },

  applyAutomaticAllocation(totalCouples: number, config: AdvancementConfig): AdvancementConfig {
    if (config.kind !== 'SINGLE' && config.kind !== 'GOLD_SILVER') return config
    if (config.allocationMode !== 'AUTO') return this.normalizeAllocation(totalCouples, config)
    return this.getDefaultAllocation(totalCouples, config.kind === 'SINGLE' ? 'SINGLE' : 'GOLD_SILVER')
  },

  validateAllocation(totalCouples: number, config: AdvancementConfig): AllocationValidation {
    const errors: string[] = []
    if (totalCouples < 0) errors.push('La cantidad de parejas no puede ser negativa.')
    if (config.kind === 'SINGLE') {
      if (!isNonNegativeInteger(config.advanceCount) || config.advanceCount < 2 || config.advanceCount > totalCouples) errors.push(`La llave única debe clasificar entre 2 y ${totalCouples} parejas.`)
    }
    if (config.kind === 'GOLD_SILVER') {
      if (!isNonNegativeInteger(config.goldCount) || config.goldCount < 2) errors.push('La Copa de Oro debe tener al menos 2 parejas.')
      if (!isNonNegativeInteger(config.silverCount) || config.silverCount < 2) errors.push('La Copa de Plata debe tener al menos 2 parejas.')
      if (config.goldCount + config.silverCount > totalCouples) errors.push('Oro y Plata no pueden superar el total de parejas.')
      const expectedEliminatedCount = totalCouples - config.goldCount - config.silverCount
      if (!isNonNegativeInteger(config.eliminatedCount) || config.eliminatedCount !== expectedEliminatedCount) {
        errors.push(`La cantidad de eliminadas debe ser ${expectedEliminatedCount}.`)
      }
    }
    return errors.length ? { isValid: false, errors } : { isValid: true, errors: [] }
  },
}
