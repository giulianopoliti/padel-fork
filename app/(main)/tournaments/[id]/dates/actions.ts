'use server'

import { withTournamentSortValues } from '@/lib/tournaments/tournament-sort-values'
import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { checkTournamentPermissions } from "@/utils/tournament-permissions"
import {
  type FechaBracketKey,
  type FechaRoundType,
  resolveFechaBracketKeyForTournament,
} from "@/lib/services/fecha-bracket-policy"

// Helper: Convert date to ensure correct storage for Argentina timezone
const adjustDateForArgentina = (dateString: string): string => {
  // dateString comes as YYYY-MM-DD from HTML date input
  // We need to ensure it's stored as the correct date in Argentina timezone
  const argentinaDate = new Date(dateString + 'T12:00:00-03:00')

  const year = argentinaDate.getFullYear()
  const month = String(argentinaDate.getMonth() + 1).padStart(2, '0')
  const day = String(argentinaDate.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export interface CreateFechaData {
  tournament_id: string
  fecha_number: number
  name: string
  description?: string
  start_date?: string
  end_date?: string
  round_type: FechaRoundType
  bracket_key?: FechaBracketKey
  max_matches_per_couple?: number
}

export interface ActionResult<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface TournamentFecha {
  id: string
  tournament_id: string
  fecha_number: number
  name: string
  description?: string
  start_date?: string
  end_date?: string
  round_type: FechaRoundType
  bracket_key: FechaBracketKey
  max_matches_per_couple?: number | null
  status: string
  created_at: string
  updated_at: string
}

// Helper function to get error messages
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Create a new tournament fecha (date/phase)
 * Only CLUB owners or ORGANIZADORs with access to the tournament's club can create fechas
 */
export async function createTournamentFecha(
  fechaData: CreateFechaData
): Promise<ActionResult<any>> {
  try {
    const supabase = await createClient()

    // Verify user authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      }
    }

    // Verify user has permissions to create fechas in this tournament
    const permissionResult = await checkTournamentPermissions(user.id, fechaData.tournament_id)
    if (!permissionResult.hasPermission) {
      return {
        success: false,
        error: permissionResult.reason || 'No tienes permisos para crear fechas en este torneo'
      }
    }

    // Validate fecha data
    if (!fechaData.name.trim()) {
      return {
        success: false,
        error: 'El nombre de la fecha es obligatorio'
      }
    }

    if (fechaData.fecha_number < 1) {
      return {
        success: false,
        error: 'El número de fecha debe ser mayor a 0'
      }
    }

    // Check if fecha number already exists for this tournament
    const { data: existingFecha } = await supabase
      .from('tournament_fechas')
      .select('id')
      .eq('tournament_id', fechaData.tournament_id)
      .eq('fecha_number', fechaData.fecha_number)
      .single()

    if (existingFecha) {
      return {
        success: false,
        error: `Ya existe una fecha con el número ${fechaData.fecha_number}`
      }
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('status, type, format_config')
      .eq('id', fechaData.tournament_id)
      .single()

    if (tournamentError || !tournament) {
      return {
        success: false,
        error: 'No se pudo validar la configuración del torneo para crear la fecha.'
      }
    }

    const bracketScopeResolution = resolveFechaBracketKeyForTournament(tournament, {
      roundType: fechaData.round_type,
      requestedBracketKey: fechaData.bracket_key,
    })

    if (!bracketScopeResolution.ok) {
      return {
        success: false,
        error: bracketScopeResolution.error || 'Configuración de copa inválida para esta fecha.'
      }
    }

    // Prepare fecha data for insertion with timezone adjustment
    const fechaToInsert = {
      tournament_id: fechaData.tournament_id,
      fecha_number: fechaData.fecha_number,
      name: fechaData.name.trim(),
      description: fechaData.description?.trim() || null,
      start_date: fechaData.start_date ? adjustDateForArgentina(fechaData.start_date) : null,
      end_date: fechaData.end_date ? adjustDateForArgentina(fechaData.end_date) : null,
      round_type: fechaData.round_type,
      bracket_key: bracketScopeResolution.bracketKey,
      max_matches_per_couple: fechaData.max_matches_per_couple ?? null,
      status: 'NOT_STARTED'
    }

    // Insert the fecha
    const { data: newFecha, error: insertError } = await supabase
      .from('tournament_fechas')
      .insert(fechaToInsert)
      .select()
      .single()

    if (insertError) {
      throw insertError
    }

    // Transition to ZONE_PHASE automatically for long tournaments when first ZONE fecha is created
    if (newFecha && fechaData.round_type === 'ZONE') {
      console.log(`[createTournamentFecha] ZONE fecha created, checking tournament transition...`)

      try {
        if (tournament.type === 'LONG' && tournament.status === 'NOT_STARTED') {
          console.log(`[createTournamentFecha] Transitioning LONG tournament to ZONE_PHASE...`)

          const { error: statusUpdateError } = await supabase
            .from('tournaments')
            .update(withTournamentSortValues({ status: 'ZONE_PHASE' }))
            .eq('id', fechaData.tournament_id)

          if (statusUpdateError) {
            console.warn('[createTournamentFecha] Error updating tournament status to ZONE_PHASE:', statusUpdateError)
          } else {
            console.log(`[createTournamentFecha] Tournament ${fechaData.tournament_id} transitioned to ZONE_PHASE`)
          }
        }
      } catch (transitionError) {
        console.error('[createTournamentFecha] Error in tournament status transition:', transitionError)
      }
    }

    // Revalidate tournament pages
    revalidatePath(`/tournaments/${fechaData.tournament_id}`)
    revalidatePath(`/tournaments/${fechaData.tournament_id}/dates`)
    revalidatePath(`/tournaments/${fechaData.tournament_id}/schedules`)

    return {
      success: true,
      data: newFecha,
      message: `Fecha ${fechaData.fecha_number} creada exitosamente`
    }

  } catch (error) {
    console.error('Error creating tournament fecha:', error)
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

/**
 * Get tournament fechas by round type for long bracket integration
 * This enables linking bracket rounds to specific fechas with time slots
 */
export async function getFechasByRoundType(
  tournamentId: string,
  roundType: FechaRoundType,
  bracketKey?: FechaBracketKey
): Promise<ActionResult<TournamentFecha[]>> {
  try {
    const supabase = await createClient()

    // Verify user authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      }
    }

    // Query fechas by tournament and round type
    let query = supabase
      .from('tournament_fechas')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('round_type', roundType)
      .order('fecha_number', { ascending: true })

    if (bracketKey) {
      query = query.eq('bracket_key', bracketKey)
    }

    const { data: fechas, error: queryError } = await query

    if (queryError) {
      throw queryError
    }

    return {
      success: true,
      data: fechas || []
    }

  } catch (error) {
    console.error('Error fetching fechas by round type:', error)
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

/**
 * Get time slots for a specific round in a tournament
 * Aggregates time slots from all fechas of the specified round type
 */
export async function getTimeSlotsForRound(
  tournamentId: string,
  roundType: FechaRoundType,
  bracketKey?: FechaBracketKey
): Promise<ActionResult<any[]>> {
  try {
    const supabase = await createClient()

    // Verify user authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      }
    }

    // First get fechas of the specified round type
    let fechasQuery = supabase
      .from('tournament_fechas')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('round_type', roundType)

    if (bracketKey) {
      fechasQuery = fechasQuery.eq('bracket_key', bracketKey)
    }

    const { data: fechas, error: fechasError } = await fechasQuery

    if (fechasError) {
      throw fechasError
    }

    if (!fechas || fechas.length === 0) {
      return {
        success: true,
        data: []
      }
    }

    const fechaIds = fechas.map(f => f.id)

    // Query time slots for those fechas
    const { data: timeSlots, error: queryError } = await supabase
      .from('tournament_time_slots')
      .select(`
        *,
        fecha:fecha_id (
          id,
          tournament_id,
          round_type,
          bracket_key,
          name
        )
      `)
      .in('fecha_id', fechaIds)
      .eq('slot_type', 'TIME_RANGE')
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })

    if (queryError) {
      throw queryError
    }

    // Format the results
    const filteredTimeSlots = (timeSlots || []).map(slot => ({
      id: slot.id,
      fecha_id: slot.fecha_id,
      date: slot.date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      court_name: slot.court_name,
      max_matches: slot.max_matches,
      fecha: slot.fecha
    }))

    return {
      success: true,
      data: filteredTimeSlots
    }

  } catch (error) {
    console.error('Error fetching time slots for round:', error)
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}
