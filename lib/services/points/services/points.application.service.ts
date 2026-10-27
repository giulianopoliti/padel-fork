import type { SupabaseClient } from '@supabase/supabase-js'
import type { PointsCalculationResult } from '../types'

/** Old callers must enter the reviewed, atomic confirmation instead of writing scores. */
export class PointsApplicationService {
  static async applyPoints(_result: PointsCalculationResult, _supabase: SupabaseClient): Promise<{ success: boolean; message: string }> {
    return { success: false, message: 'Abrí Revisar puntos y ascensos y confirmá la revisión vigente antes de acreditar.' }
  }
}
