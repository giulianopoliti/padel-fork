'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { createTournamentFecha, type CreateFechaData } from '../dates/actions'
import { createTimeSlot, getScheduleData, type CreateTimeSlotData } from '../schedules/actions'
import {
  type FechaBracketKey,
  type FechaRoundType,
  resolveFechaBracketKeyForTournament,
} from '@/lib/services/fecha-bracket-policy'

// Helper: Convert date to ensure correct storage for Argentina timezone
const adjustDateForArgentina = (dateString: string): string => {
  // dateString comes as YYYY-MM-DD from HTML date input
  // We need to ensure it's stored as the correct date in Argentina timezone

  // Create a date object interpreted in Argentina timezone (GMT-3)
  // by appending time and timezone info
  const argentinaDate = new Date(dateString + 'T12:00:00-03:00')

  // Convert back to YYYY-MM-DD format
  const year = argentinaDate.getFullYear()
  const month = String(argentinaDate.getMonth() + 1).padStart(2, '0')
  const day = String(argentinaDate.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

// Re-export functions (not types) from existing modules
export { createTournamentFecha, createTimeSlot, getScheduleData }

// New unified actions specific to the schedule management page

export async function getUnifiedScheduleData(tournamentId: string) {
  try {
    const supabase = await createClient()

    // Get tournament fechas with time slot counts
    const { data: fechas, error: fechasError } = await supabase
      .from('tournament_fechas')
      .select(`
        *,
        time_slots:tournament_time_slots(
          id,
          date,
          start_time,
          end_time,
          max_matches,
          court_name,
          description,
          created_at
        )
      `)
      .eq('tournament_id', tournamentId)
      .order('fecha_number', { ascending: true })

    if (fechasError) {
      console.error('Error fetching fechas:', fechasError)
      return {
        success: false,
        error: 'Error al cargar las fechas del torneo'
      }
    }

    // Get tournament couples for availability calculations
    const { data: couples, error: couplesError } = await supabase
      .from('tournament_couples')
      .select(`
        id,
        player1:players!tournament_couples_player1_id_fkey(
          id,
          first_name,
          last_name
        ),
        player2:players!tournament_couples_player2_id_fkey(
          id,
          first_name,
          last_name
        )
      `)
      .eq('tournament_id', tournamentId)

    if (couplesError) {
      console.error('Error fetching couples:', couplesError)
      return {
        success: false,
        error: 'Error al cargar las parejas del torneo'
      }
    }

    // Enhance fechas with statistics
    const enhancedFechas = fechas?.map(fecha => ({
      ...fecha,
      time_slots_count: fecha.time_slots?.length || 0,
      has_time_slots: (fecha.time_slots?.length || 0) > 0,
      completion_percentage: calculateFechaCompletion(fecha)
    })) || []

    return {
      success: true,
      data: {
        fechas: enhancedFechas,
        total_couples: couples?.length || 0,
        couples: couples || []
      }
    }

  } catch (error) {
    console.error('Error in getUnifiedScheduleData:', error)
    return {
      success: false,
      error: 'Error inesperado al cargar los datos'
    }
  }
}

function calculateFechaCompletion(fecha: any): number {
  const hasTimeSlots = (fecha.time_slots?.length || 0) > 0
  if (!hasTimeSlots) return 0

  // Basic completion: if has time slots, it's 60% complete
  // TODO: Add more sophisticated calculation based on:
  // - Number of time slots vs expected
  // - Couple availability data
  // - Match generation status
  return hasTimeSlots ? 60 : 0
}

export async function deleteTournamentFecha(fechaId: string) {
  try {
    const supabase = await createClient()

    // First check if fecha has any time slots
    const { data: timeSlots, error: timeSlotsError } = await supabase
      .from('tournament_time_slots')
      .select('id')
      .eq('fecha_id', fechaId)
      .eq('slot_type', 'TIME_RANGE')

    if (timeSlotsError) {
      return {
        success: false,
        error: 'Error al verificar los horarios de la fecha'
      }
    }

    if (timeSlots && timeSlots.length > 0) {
      return {
        success: false,
        error: 'No se puede eliminar una fecha que tiene horarios configurados. Elimina primero los horarios.'
      }
    }

    // Delete the fecha
    const { error: deleteError } = await supabase
      .from('tournament_fechas')
      .delete()
      .eq('id', fechaId)

    if (deleteError) {
      console.error('Error deleting fecha:', deleteError)
      return {
        success: false,
        error: 'Error al eliminar la fecha'
      }
    }

    // Revalidate the page
    revalidatePath('/tournaments/[id]/schedule-management')

    return {
      success: true,
      message: 'Fecha eliminada exitosamente'
    }

  } catch (error) {
    console.error('Error in deleteTournamentFecha:', error)
    return {
      success: false,
      error: 'Error inesperado al eliminar la fecha'
    }
  }
}

export async function updateTournamentFecha(fechaId: string, updateData: {
  name?: string
  description?: string
  start_date?: string
  end_date?: string
  status?: string
  max_matches_per_couple?: number
  estimated_match_duration_minutes?: 60 | 75 | 90
  round_type?: FechaRoundType
  bracket_key?: FechaBracketKey
}) {
  try {
    if (
      updateData.estimated_match_duration_minutes !== undefined &&
      ![60, 75, 90].includes(updateData.estimated_match_duration_minutes)
    ) {
      return { success: false, error: 'La duracion debe ser 60, 75 o 90 minutos' }
    }

    const supabase = await createClient()

    const { data: existingFecha, error: existingFechaError } = await supabase
      .from('tournament_fechas')
      .select('id, tournament_id, round_type, bracket_key')
      .eq('id', fechaId)
      .single()

    if (existingFechaError || !existingFecha) {
      return {
        success: false,
        error: 'Fecha no encontrada'
      }
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, type, format_config')
      .eq('id', existingFecha.tournament_id)
      .single()

    if (tournamentError || !tournament) {
      return {
        success: false,
        error: 'No se pudo validar la configuración del torneo para actualizar la fecha.'
      }
    }

    const nextRoundType = (updateData.round_type || existingFecha.round_type) as FechaRoundType
    const nextBracketKeyRequest = updateData.bracket_key || existingFecha.bracket_key

    const bracketScopeResolution = resolveFechaBracketKeyForTournament(tournament, {
      roundType: nextRoundType,
      requestedBracketKey: nextBracketKeyRequest,
    })

    if (!bracketScopeResolution.ok) {
      return {
        success: false,
        error: bracketScopeResolution.error || 'Configuración de copa inválida para esta fecha.'
      }
    }

    const { data: linkedMatches, error: linkedMatchesError } = await supabase
      .from('fecha_matches')
      .select(`
        match_id,
        matches!inner (
          id,
          type,
          bracket_key
        )
      `)
      .eq('fecha_id', fechaId)

    if (linkedMatchesError) {
      return {
        success: false,
        error: 'No se pudo validar la compatibilidad de partidos vinculados a la fecha.'
      }
    }

    const incompatibleMatch = (linkedMatches || []).find((row: any) => {
      if (row.matches?.type !== 'ELIMINATION') return false
      const matchBracketKey = row.matches?.bracket_key || 'MAIN'
      return matchBracketKey !== bracketScopeResolution.bracketKey
    })

    if (incompatibleMatch) {
      return {
        success: false,
        error: `No se puede cambiar la copa de esta fecha porque ya tiene partidos de otra llave vinculados.`
      }
    }

    // Prepare update data with timezone adjustment
    const adjustedUpdateData: Record<string, any> = {
      ...updateData,
      round_type: nextRoundType,
      bracket_key: bracketScopeResolution.bracketKey,
    }

    if (updateData.start_date) {
      adjustedUpdateData.start_date = adjustDateForArgentina(updateData.start_date)
    }
    if (updateData.end_date) {
      adjustedUpdateData.end_date = adjustDateForArgentina(updateData.end_date)
    }

    const { data, error } = await supabase
      .from('tournament_fechas')
      .update(adjustedUpdateData)
      .eq('id', fechaId)
      .select()
      .single()

    if (error) {
      console.error('Error updating fecha:', error)
      return {
        success: false,
        error: 'Error al actualizar la fecha'
      }
    }

    // Revalidate the page
    revalidatePath('/tournaments/[id]/schedule-management')

    return {
      success: true,
      data,
      message: 'Fecha actualizada exitosamente'
    }

  } catch (error) {
    console.error('Error in updateTournamentFecha:', error)
    return {
      success: false,
      error: 'Error inesperado al actualizar la fecha'
    }
  }
}

export async function cloneTimeSlots(sourceFechaId: string, targetFechaId: string) {
  try {
    const supabase = await createClient()

    // Get source time slots
    const { data: sourceTimeSlots, error: sourceError } = await supabase
      .from('tournament_time_slots')
      .select('date, start_time, end_time, max_matches, court_name, description')
      .eq('fecha_id', sourceFechaId)
      .eq('slot_type', 'TIME_RANGE')

    if (sourceError || !sourceTimeSlots) {
      return {
        success: false,
        error: 'Error al obtener los horarios de origen'
      }
    }

    if (sourceTimeSlots.length === 0) {
      return {
        success: false,
        error: 'La fecha de origen no tiene horarios para clonar'
      }
    }

    // Create new time slots for target fecha
    const newTimeSlots = sourceTimeSlots.map(slot => ({
      ...slot,
      fecha_id: targetFechaId
    }))

    const { error: insertError } = await supabase
      .from('tournament_time_slots')
      .insert(newTimeSlots)

    if (insertError) {
      console.error('Error cloning time slots:', insertError)
      return {
        success: false,
        error: 'Error al clonar los horarios'
      }
    }

    // Revalidate the page
    revalidatePath('/tournaments/[id]/schedule-management')

    return {
      success: true,
      message: `${sourceTimeSlots.length} horarios clonados exitosamente`
    }

  } catch (error) {
    console.error('Error in cloneTimeSlots:', error)
    return {
      success: false,
      error: 'Error inesperado al clonar los horarios'
    }
  }
}
