'use server'

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { 
  UserAccess, 
  ScheduleData, 
  PlayerScheduleData, 
  ActionResult, 
  CreateTimeSlotData, 
  UpdateAvailabilityData,
  UpdateFreeDatePreferenceData,
  TimeSlotWithAvailability,
  CoupleAvailability,
  TournamentBasic,
  TournamentFecha 
} from './types'
import { validateTimeSlot, getBracketLabel, getErrorMessage } from './utils'
import { checkUserTournamentInscription } from '@/utils/tournament-permissions'
import { interpretAvailabilityNote } from '@/lib/services/match-recommendation/note-interpreter'

export type { CreateTimeSlotData } from './types'

// Helper: Ensure date is correctly stored for Argentina timezone
// The issue is that when we send "2025-10-02", Supabase client may interpret it as UTC midnight
// which becomes 2025-10-01 21:00 in Argentina, causing the date to shift backwards
const adjustDateForArgentina = (dateString: string): string => {
  // Create a date object explicitly in Argentina timezone to ensure correct interpretation
  // We use noon to avoid any midnight boundary issues
  const argentinaDateTime = `${dateString}T12:00:00-03:00`
  const date = new Date(argentinaDateTime)

  // Convert back to YYYY-MM-DD format, but using the date as interpreted in Argentina
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

// Helper: Validate user permissions
const validateUserPermissions = async (
  supabase: any,
  userId: string, 
  tournamentId: string
): Promise<UserAccess | null> => {
  try {
    // Get user profile
    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()

    if (!userProfile) return null

    // Get tournament
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('club_id')
      .eq('id', tournamentId)
      .single()

    if (!tournament) return null

    let isOrganizer = false
    let isInscribed = false
    let coupleId: string | undefined = undefined
    let playerId: string | undefined = undefined
    let clubId: string | undefined = undefined

    // Check if user is CLUB owner
    if (userProfile.role === 'CLUB') {
      const { data: club } = await supabase
        .from('clubes')
        .select('id')
        .eq('user_id', userId)
        .single()

      if (club && club.id === tournament.club_id) {
        isOrganizer = true
        clubId = club.id
      }
    }

    // Check if user is ORGANIZADOR that manages this club
    if (userProfile.role === 'ORGANIZADOR') {
      const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organizacion_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single()

      if (orgMember) {
        const { data: orgClub } = await supabase
          .from('organization_clubs')
          .select('id')
          .eq('organizacion_id', orgMember.organizacion_id)
          .eq('club_id', tournament.club_id)
          .single()

        if (orgClub) {
          isOrganizer = true
          clubId = tournament.club_id
        }
      }
    }

    // Check if user is inscribed player using centralized function
    if (userProfile.role === 'PLAYER') {
      const inscriptionResult = await checkUserTournamentInscription(userId, tournamentId)

      if (inscriptionResult.isInscribed && !inscriptionResult.isEliminated && !inscriptionResult.isPending) {
        isInscribed = true
        coupleId = inscriptionResult.coupleId
        playerId = inscriptionResult.playerId
      }
    }

    return {
      userId,
      role: userProfile.role,
      isOrganizer,
      isInscribed,
      coupleId,
      playerId,
      clubId
    }

  } catch (error) {
    console.error('Error validating user permissions:', error)
    return null
  }
}

// Helper: Check if player belongs to couple
const playerBelongsToCouple = async (
  supabase: any,
  playerId: string,
  coupleId: string
): Promise<boolean> => {
  try {
    const { data: couple } = await supabase
      .from('couples')
      .select('player1_id, player2_id')
      .eq('id', coupleId)
      .single()

    return couple && (couple.player1_id === playerId || couple.player2_id === playerId)
  } catch (error) {
    return false
  }
}

// 1. Check User Access
export async function checkUserAccess(
  tournamentId: string
): Promise<ActionResult<UserAccess>> {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      }
    }

    const userAccess = await validateUserPermissions(supabase, user.id, tournamentId)
    
    if (!userAccess) {
      return {
        success: false,
        error: 'No tienes permisos para acceder a este torneo'
      }
    }

    if (!userAccess.isOrganizer && !userAccess.isInscribed) {
      // Check if user is a player and get their inscription status
      if (userAccess.role === 'PLAYER') {
        const inscriptionResult = await checkUserTournamentInscription(user.id, tournamentId)
        if (inscriptionResult.isEliminated) {
          return {
            success: false,
            error: 'Tu pareja ha sido eliminada del torneo y no puede acceder a los horarios'
          }
        }
        if (inscriptionResult.isPending) {
          return {
            success: false,
            error: 'Tu inscripción todavía está pendiente de aprobación'
          }
        }
      }

      return {
        success: false,
        error: 'Debes ser organizador o estar inscrito en el torneo'
      }
    }

    return {
      success: true,
      data: userAccess
    }

  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// 2. Get Schedule Data (for organizers)
export async function getScheduleData(
  tournamentId: string,
  fechaId: string
): Promise<ActionResult<ScheduleData>> {
  try {
    const supabase = await createClient()
    
    // Validate user access
    const accessResult = await checkUserAccess(tournamentId)
    if (!accessResult.success || !accessResult.data) {
      return accessResult as unknown as ActionResult<ScheduleData>
    }

    if (!accessResult.data.isOrganizer) {
      return {
        success: false,
        error: 'Solo los organizadores pueden ver la matriz completa'
      }
    }

    // Get tournament info
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select(`
        id, name, club_id, type, status,
        clubes!inner(name)
      `)
      .eq('id', tournamentId)
      .single()

    if (tournamentError) {
      throw tournamentError
    }

    // Get fecha info
    const { data: rawFecha, error: fechaError } = await supabase
      .from('tournament_fechas')
      .select('*')
      .eq('id', fechaId)
      .single()

    if (fechaError || !rawFecha) {
      throw fechaError
    }

    const fecha: TournamentFecha = {
      ...(rawFecha as TournamentFecha),
      bracket_label: getBracketLabel((rawFecha as any).bracket_key)
    }

    // Get time slots with availability
    const { data: timeSlots, error: timeSlotsError } = await supabase
      .from('tournament_time_slots')
      .select(`
        *,
        couple_time_availability (
          couple_id,
          is_available,
          notes,
          couples (
            id,
            player1:players!couples_player1_id_fkey (first_name, last_name),
            player2:players!couples_player2_id_fkey (first_name, last_name)
          )
        )
      `)
      .eq('fecha_id', fechaId)
      .eq('is_available', true)
      .eq('slot_type', 'TIME_RANGE')
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })

    if (timeSlotsError) {
      throw timeSlotsError
    }

    // Transform data
    const formattedTimeSlots: TimeSlotWithAvailability[] = (timeSlots || []).map(slot => ({
      ...slot,
      availableCouples: slot.couple_time_availability
        ?.filter((cta: any) => cta.is_available)
        .map((cta: any) => ({
          couple_id: cta.couple_id,
          couple: {
            id: cta.couples.id,
            player1: {
              id: cta.couples.player1.id,
              first_name: cta.couples.player1.first_name || '',
              last_name: cta.couples.player1.last_name || ''
            },
            player2: {
              id: cta.couples.player2.id,
              first_name: cta.couples.player2.first_name || '',
              last_name: cta.couples.player2.last_name || ''
            }
          },
          is_available: cta.is_available,
          notes: cta.notes
        })) || [],
      totalAvailable: slot.couple_time_availability?.filter((cta: any) => cta.is_available)?.length || 0
    }))

    const tournamentBasic: TournamentBasic = {
      id: tournament.id,
      name: tournament.name || '',
      club_id: tournament.club_id || '',
      clubName: (tournament.clubes as any)?.name || '',
      status: tournament.status || 'NOT_STARTED',
      type: tournament.type || 'AMERICAN'
    }

    return {
      success: true,
      data: {
        tournament: tournamentBasic,
        fecha,
        timeSlots: formattedTimeSlots,
        userAccess: accessResult.data
      }
    }

  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// 3. Get Player Schedule Data (for inscribed players)
export async function getPlayerScheduleData(
  tournamentId: string,
  fechaId: string
): Promise<ActionResult<PlayerScheduleData>> {
  try {
    const supabase = await createClient()
    
    // Validate user access
    const accessResult = await checkUserAccess(tournamentId)
    if (!accessResult.success || !accessResult.data) {
      return accessResult as unknown as ActionResult<PlayerScheduleData>
    }

    if (!accessResult.data.isInscribed || !accessResult.data.coupleId) {
      return {
        success: false,
        error: 'Solo los jugadores inscritos pueden ver los horarios'
      }
    }

    // Get tournament info
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select(`
        id, name, club_id, type, status,
        clubes!inner(name)
      `)
      .eq('id', tournamentId)
      .single()

    if (tournamentError) {
      throw tournamentError
    }

    // Get fecha info
    const { data: rawFecha, error: fechaError } = await supabase
      .from('tournament_fechas')
      .select('*')
      .eq('id', fechaId)
      .single()

    if (fechaError || !rawFecha) {
      throw fechaError
    }

    const fecha: TournamentFecha = {
      ...(rawFecha as TournamentFecha),
      bracket_label: getBracketLabel((rawFecha as any).bracket_key)
    }

    const isBracketFecha = fecha.round_type !== 'ZONE'
    const isGoldSilverBracketFecha = isBracketFecha && (fecha.bracket_key === 'GOLD' || fecha.bracket_key === 'SILVER')

    let bracketAssignment: PlayerScheduleData['bracket_assignment'] = null
    let canEditAvailability = true
    let availabilityRestrictionReason: string | null = null

    if (isGoldSilverBracketFecha && accessResult.data.coupleId) {
      const { data: seedAssignment, error: seedAssignmentError } = await supabase
        .from('tournament_couple_seeds')
        .select('bracket_key')
        .eq('tournament_id', tournamentId)
        .eq('couple_id', accessResult.data.coupleId)
        .in('bracket_key', ['GOLD', 'SILVER'])
        .maybeSingle()

      if (seedAssignmentError) {
        throw seedAssignmentError
      }

      if (seedAssignment?.bracket_key === 'GOLD' || seedAssignment?.bracket_key === 'SILVER') {
        bracketAssignment = {
          key: seedAssignment.bracket_key,
          label: seedAssignment.bracket_key === 'GOLD' ? 'Copa de Oro' : 'Copa de Plata'
        }
      }

      if (!bracketAssignment) {
        canEditAvailability = false
        availabilityRestrictionReason = 'Tu copa todavía no está definida. Cuando se asignen seeds de llave, vas a poder marcar disponibilidad.'
      } else if (bracketAssignment.key !== fecha.bracket_key) {
        canEditAvailability = false
        availabilityRestrictionReason = `Tu pareja está asignada a ${bracketAssignment.label}, pero esta fecha corresponde a ${fecha.bracket_label}.`
      }
    }

    // Get time slots with user's availability only
    const { data: timeSlots, error: timeSlotsError } = await supabase
      .from('tournament_time_slots')
      .select(`
        id, date, start_time, end_time, court_name, description, slot_type, is_system,
        couple_time_availability!inner (
          is_available,
          notes
        )
      `)
      .eq('fecha_id', fechaId)
      .eq('is_available', true)
      .eq('couple_time_availability.couple_id', accessResult.data.coupleId)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })

    if (timeSlotsError) {
      throw timeSlotsError
    }

    // Also get slots where user hasn't marked availability yet
    const { data: allTimeSlots, error: allTimeSlotsError } = await supabase
      .from('tournament_time_slots')
      .select('id, date, start_time, end_time, court_name, description, slot_type, is_system')
      .eq('fecha_id', fechaId)
      .eq('is_available', true)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })

    if (allTimeSlotsError) {
      throw allTimeSlotsError
    }

    // Get user's availability for all slots
    const { data: userAvailability } = await supabase
      .from('couple_time_availability')
      .select('time_slot_id, is_available, notes')
      .eq('couple_id', accessResult.data.coupleId)

    const availabilityMap = new Map(
      userAvailability?.map(av => [av.time_slot_id, av]) || []
    )

    // Get couple information
    const { data: coupleData, error: coupleError } = await supabase
      .from('couples')
      .select(`
        id,
        player1:players!couples_player1_id_fkey (first_name, last_name),
        player2:players!couples_player2_id_fkey (first_name, last_name)
      `)
      .eq('id', accessResult.data.coupleId)
      .single()

    if (coupleError) {
      throw coupleError
    }

    // Transform data
    const formattedTimeSlots = (allTimeSlots || []).map(slot => {
      const availability = availabilityMap.get(slot.id)
      return {
        id: slot.id,
        fecha_id: fechaId,
        date: slot.date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        court_name: slot.court_name,
        description: slot.description,
        is_available: true,
        max_matches: 1,
        created_at: new Date().toISOString(),
        slot_type: slot.slot_type === 'FREE_DATE' ? 'FREE_DATE' as const : 'TIME_RANGE' as const,
        is_system: Boolean(slot.is_system),
        my_availability: availability ? {
          couple_id: accessResult.data?.coupleId!,
          is_available: availability.is_available,
          notes: availability.notes || null
        } : undefined
      }
    })

    const tournamentBasic: TournamentBasic = {
      id: tournament.id,
      name: tournament.name || '',
      club_id: tournament.club_id || '',
      clubName: (tournament.clubes as any)?.name || '',
      status: tournament.status || 'NOT_STARTED',
      type: tournament.type || 'AMERICAN'
    }

    return {
      success: true,
      data: {
        tournament: tournamentBasic,
        fecha,
        bracket_assignment: bracketAssignment,
        can_edit_availability: canEditAvailability,
        availability_restriction_reason: availabilityRestrictionReason,
        timeSlots: formattedTimeSlots,
        coupleInfo: {
          id: coupleData.id,
          player1_name: `${(coupleData.player1 as any)?.first_name || ''} ${(coupleData.player1 as any)?.last_name || ''}`.trim(),
          player2_name: `${(coupleData.player2 as any)?.first_name || ''} ${(coupleData.player2 as any)?.last_name || ''}`.trim()
        },
        userAccess: accessResult.data
      }
    }

  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// 4. Create Time Slot (organizers only)
export async function createTimeSlot(
  data: CreateTimeSlotData
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient()
    
    // Get tournament ID from fecha
    const { data: fecha } = await supabase
      .from('tournament_fechas')
      .select('tournament_id')
      .eq('id', data.fecha_id)
      .single()

    if (!fecha) {
      return {
        success: false,
        error: 'Fecha no encontrada'
      }
    }

    // Validate user access
    const accessResult = await checkUserAccess(fecha.tournament_id)
    if (!accessResult.success || !accessResult.data) {
      return accessResult as ActionResult<void>
    }

    if (!accessResult.data.isOrganizer) {
      return {
        success: false,
        error: 'Solo los organizadores pueden crear horarios'
      }
    }

    // Get existing time slots for validation
    const { data: existingSlots } = await supabase
      .from('tournament_time_slots')
      .select('*')
      .eq('fecha_id', data.fecha_id)
      .eq('slot_type', 'TIME_RANGE')

    // Validate time slot
    const validation = validateTimeSlot(data, existingSlots || [])
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.errors.join(', ')
      }
    }

    // Create time slot with timezone correction for Argentina (GMT-3)
    // The date input sends YYYY-MM-DD format, but we need to ensure it's stored correctly
    // for Argentina timezone users
    const adjustedDate = adjustDateForArgentina(data.date)

    const { error: insertError } = await supabase
      .from('tournament_time_slots')
      .insert({
        fecha_id: data.fecha_id,
        date: adjustedDate,
        start_time: data.start_time,
        end_time: data.end_time,
        max_matches: data.max_matches || 1,
        description: data.description,
        court_name: data.court_name,
        is_available: true
      })

    if (insertError) {
      throw insertError
    }

    revalidatePath(`/tournaments/${fecha.tournament_id}/schedules`)
    
    return {
      success: true,
      message: 'Horario creado exitosamente'
    }

  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// 5. Delete Time Slot (organizers only)
export async function deleteTimeSlot(
  timeSlotId: string
): Promise<ActionResult<{ availabilityCount?: number }>> {
  try {
    const supabase = await createClient()

    // Get time slot with fecha and tournament info
    const { data: timeSlot, error: timeSlotError } = await supabase
      .from('tournament_time_slots')
      .select(`
        id,
        fecha_id,
        tournament_fechas!inner(tournament_id)
      `)
      .eq('id', timeSlotId)
      .single()

    if (timeSlotError || !timeSlot) {
      return {
        success: false,
        error: 'Horario no encontrado'
      }
    }

    // Validate user access
    const accessResult = await checkUserAccess((timeSlot.tournament_fechas as any).tournament_id)
    if (!accessResult.success || !accessResult.data) {
      return accessResult as ActionResult<{ availabilityCount?: number }>
    }

    if (!accessResult.data.isOrganizer) {
      return {
        success: false,
        error: 'Solo los organizadores pueden eliminar horarios'
      }
    }

    // Check if time slot has availability data
    const { data: availabilityData, error: availabilityError } = await supabase
      .from('couple_time_availability')
      .select('id')
      .eq('time_slot_id', timeSlotId)

    if (availabilityError) {
      throw availabilityError
    }

    const availabilityCount = availabilityData?.length || 0

    if (availabilityCount > 0) {
      return {
        success: false,
        error: `No se puede eliminar este horario. ${availabilityCount} pareja${availabilityCount > 1 ? 's han' : ' ha'} marcado disponibilidad. Si eliminas el horario, sus disponibilidades también se perderán. Usa la opción "Forzar eliminación" si quieres proceder.`,
        data: { availabilityCount }
      }
    }

    // Note: Matches are associated with fechas, not specific time slots
    // So we don't need to check for time slot specific matches

    // Delete time slot
    const { error: deleteError } = await supabase
      .from('tournament_time_slots')
      .delete()
      .eq('id', timeSlotId)

    if (deleteError) {
      throw deleteError
    }

    revalidatePath(`/tournaments/${(timeSlot.tournament_fechas as any).tournament_id}/schedules`)

    return {
      success: true,
      message: 'Horario eliminado exitosamente'
    }

  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// 5b. Force Delete Time Slot (organizers only) - deletes availability data first
export async function forceDeleteTimeSlot(
  timeSlotId: string
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient()

    // Get time slot with fecha and tournament info
    const { data: timeSlot, error: timeSlotError } = await supabase
      .from('tournament_time_slots')
      .select(`
        id,
        fecha_id,
        tournament_fechas!inner(tournament_id)
      `)
      .eq('id', timeSlotId)
      .single()

    if (timeSlotError || !timeSlot) {
      return {
        success: false,
        error: 'Horario no encontrado'
      }
    }

    // Validate user access
    const accessResult = await checkUserAccess((timeSlot.tournament_fechas as any).tournament_id)
    if (!accessResult.success || !accessResult.data) {
      return accessResult as ActionResult<void>
    }

    if (!accessResult.data.isOrganizer) {
      return {
        success: false,
        error: 'Solo los organizadores pueden eliminar horarios'
      }
    }

    // Count availability data before deletion
    const { data: availabilityData } = await supabase
      .from('couple_time_availability')
      .select('id')
      .eq('time_slot_id', timeSlotId)

    const availabilityCount = availabilityData?.length || 0

    // First, delete all availability data for this time slot
    if (availabilityCount > 0) {
      const { error: deleteAvailabilityError } = await supabase
        .from('couple_time_availability')
        .delete()
        .eq('time_slot_id', timeSlotId)

      if (deleteAvailabilityError) {
        throw deleteAvailabilityError
      }
    }

    // Then delete the time slot
    const { error: deleteError } = await supabase
      .from('tournament_time_slots')
      .delete()
      .eq('id', timeSlotId)

    if (deleteError) {
      throw deleteError
    }

    revalidatePath(`/tournaments/${(timeSlot.tournament_fechas as any).tournament_id}/schedules`)

    const message = availabilityCount > 0
      ? `Horario eliminado exitosamente junto con ${availabilityCount} disponibilidad${availabilityCount > 1 ? 'es' : ''} de parejas`
      : 'Horario eliminado exitosamente'

    return {
      success: true,
      message
    }

  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// 6. Update Time Slot (organizers only)
export async function updateTimeSlot(
  timeSlotId: string,
  data: Partial<CreateTimeSlotData>
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient()

    // Get time slot with fecha and tournament info
    const { data: timeSlot, error: timeSlotError } = await supabase
      .from('tournament_time_slots')
      .select(`
        id,
        fecha_id,
        date,
        start_time,
        end_time,
        tournament_fechas!inner(tournament_id)
      `)
      .eq('id', timeSlotId)
      .single()

    if (timeSlotError || !timeSlot) {
      return {
        success: false,
        error: 'Horario no encontrado'
      }
    }

    // Validate user access
    const accessResult = await checkUserAccess((timeSlot.tournament_fechas as any).tournament_id)
    if (!accessResult.success || !accessResult.data) {
      return accessResult as ActionResult<void>
    }

    if (!accessResult.data.isOrganizer) {
      return {
        success: false,
        error: 'Solo los organizadores pueden modificar horarios'
      }
    }

    // Get existing time slots for validation (excluding current one)
    const { data: existingSlots } = await supabase
      .from('tournament_time_slots')
      .select('*')
      .eq('fecha_id', timeSlot.fecha_id)
      .neq('id', timeSlotId)
      .eq('slot_type', 'TIME_RANGE')

    // Create validation data combining existing data with updates
    const validationData: CreateTimeSlotData = {
      fecha_id: timeSlot.fecha_id,
      date: data.date ? adjustDateForArgentina(data.date) : timeSlot.date,
      start_time: data.start_time || timeSlot.start_time,
      end_time: data.end_time || timeSlot.end_time,
      max_matches: data.max_matches || 1,
      description: data.description || undefined
    }

    // Validate time slot
    const validation = validateTimeSlot(validationData, existingSlots || [])
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.errors.join(', ')
      }
    }

    // Prepare update data
    const updateData: any = {}
    if (data.date !== undefined) updateData.date = adjustDateForArgentina(data.date)
    if (data.start_time !== undefined) updateData.start_time = data.start_time
    if (data.end_time !== undefined) updateData.end_time = data.end_time
    if (data.max_matches !== undefined) updateData.max_matches = data.max_matches
    if (data.description !== undefined) updateData.description = data.description
    if (data.court_name !== undefined) updateData.court_name = data.court_name

    // Update time slot
    const { error: updateError } = await supabase
      .from('tournament_time_slots')
      .update(updateData)
      .eq('id', timeSlotId)

    if (updateError) {
      throw updateError
    }

    revalidatePath(`/tournaments/${(timeSlot.tournament_fechas as any).tournament_id}/schedules`)

    return {
      success: true,
      message: 'Horario actualizado exitosamente'
    }

  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// 7. Update Couple Availability (players only)
export async function updateCoupleAvailability(
  data: UpdateAvailabilityData
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      }
    }

    // Get tournament ID from time slot
    const { data: timeSlot } = await supabase
      .from('tournament_time_slots')
      .select(`
        fecha_id, slot_type, is_system, start_time, end_time,
        tournament_fechas!inner(tournament_id, round_type, bracket_key)
      `)
      .eq('id', data.time_slot_id)
      .single()

    if (!timeSlot) {
      return {
        success: false,
        error: 'Horario no encontrado'
      }
    }

    if (timeSlot.slot_type !== 'TIME_RANGE' || timeSlot.is_system) {
      return { success: false, error: 'Usa la acción de fecha libre para esta opción' }
    }

    // Validate user access
    const accessResult = await checkUserAccess((timeSlot.tournament_fechas as any).tournament_id)
    if (!accessResult.success || !accessResult.data) {
      return accessResult as ActionResult<void>
    }

    if (!accessResult.data.isInscribed || !accessResult.data.playerId) {
      return {
        success: false,
        error: 'Solo jugadores inscritos pueden marcar disponibilidad'
      }
    }

    // Verify player belongs to the couple
    const belongsToCouple = await playerBelongsToCouple(
      supabase, 
      accessResult.data.playerId, 
      data.couple_id
    )

    if (!belongsToCouple) {
      return {
        success: false,
        error: 'No perteneces a esta pareja'
      }
    }

    const fechaInfo = (timeSlot.tournament_fechas as any)
    const fechaRoundType = fechaInfo?.round_type || 'ZONE'
    const fechaBracketKey = fechaInfo?.bracket_key || 'MAIN'
    const isGoldSilverBracketFecha =
      fechaRoundType !== 'ZONE' && (fechaBracketKey === 'GOLD' || fechaBracketKey === 'SILVER')

    if (isGoldSilverBracketFecha) {
      const { data: seedAssignment, error: seedAssignmentError } = await supabase
        .from('tournament_couple_seeds')
        .select('bracket_key')
        .eq('tournament_id', fechaInfo.tournament_id)
        .eq('couple_id', data.couple_id)
        .in('bracket_key', ['GOLD', 'SILVER'])
        .maybeSingle()

      if (seedAssignmentError) {
        throw seedAssignmentError
      }

      if (!seedAssignment || !seedAssignment.bracket_key) {
        return {
          success: false,
          error: 'Tu copa todavía no está definida. Cuando se asignen seeds de llave podrás marcar disponibilidad.'
        }
      }

      if (seedAssignment.bracket_key !== fechaBracketKey) {
        const assignedLabel = seedAssignment.bracket_key === 'GOLD' ? 'Copa de Oro' : 'Copa de Plata'
        const requestedLabel = fechaBracketKey === 'GOLD' ? 'Copa de Oro' : 'Copa de Plata'
        return {
          success: false,
          error: `Tu pareja está asignada a ${assignedLabel}. Este horario pertenece a ${requestedLabel}.`
        }
      }
    }

    // Validate note length if provided
    if (data.notes && data.notes.length > 200) {
      return {
        success: false,
        error: 'La nota no puede superar 200 caracteres'
      }
    }

    // Upsert availability
    const { data: savedAvailability, error: upsertError } = await supabase
      .from('couple_time_availability')
      .upsert({
        couple_id: data.couple_id,
        time_slot_id: data.time_slot_id,
        is_available: data.is_available,
        notes: data.notes || null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'couple_id,time_slot_id'
      })
      .select('id')
      .single()

    if (upsertError) {
      throw upsertError
    }

    const interpretation = data.is_available
      ? await interpretAvailabilityNote(data.notes, timeSlot.start_time, timeSlot.end_time)
      : await interpretAvailabilityNote(null, timeSlot.start_time, timeSlot.end_time)

    const { error: interpretationError } = await supabase
      .from('couple_time_availability')
      .update(interpretation)
      .eq('id', savedAvailability.id)

    if (interpretationError) {
      throw interpretationError
    }

    revalidatePath(`/tournaments/${(timeSlot.tournament_fechas as any).tournament_id}/schedules`)
    
    return {
      success: true,
      message: data.is_available ? 'Disponibilidad marcada' : 'Disponibilidad removida'
    }

  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

export async function updateFreeDatePreference(
  data: UpdateFreeDatePreferenceData
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, error: 'Usuario no autenticado' }
    if (data.notes && data.notes.length > 200) {
      return { success: false, error: 'La nota no puede superar 200 caracteres' }
    }

    const { data: timeSlot, error: timeSlotError } = await supabase
      .from('tournament_time_slots')
      .select(`
        id, slot_type, is_system,
        tournament_fechas!inner(tournament_id, round_type, bracket_key)
      `)
      .eq('id', data.time_slot_id)
      .single()

    if (timeSlotError || !timeSlot || timeSlot.slot_type !== 'FREE_DATE' || !timeSlot.is_system) {
      return { success: false, error: 'La opción de fecha libre no es válida' }
    }

    const fechaInfo = timeSlot.tournament_fechas as any
    const accessResult = await checkUserAccess(fechaInfo.tournament_id)
    if (!accessResult.success || !accessResult.data) return accessResult as ActionResult<void>
    if (!accessResult.data.isInscribed || !accessResult.data.playerId) {
      return { success: false, error: 'Solo jugadores inscritos pueden solicitar fecha libre' }
    }
    if (accessResult.data.coupleId !== data.couple_id) {
      return { success: false, error: 'No perteneces a esta pareja' }
    }

    const belongsToCouple = await playerBelongsToCouple(
      supabase,
      accessResult.data.playerId,
      data.couple_id
    )
    if (!belongsToCouple) return { success: false, error: 'No perteneces a esta pareja' }

    const isGoldSilverBracketFecha =
      fechaInfo.round_type !== 'ZONE' && ['GOLD', 'SILVER'].includes(fechaInfo.bracket_key)

    if (isGoldSilverBracketFecha) {
      const { data: seedAssignment, error: seedAssignmentError } = await supabase
        .from('tournament_couple_seeds')
        .select('bracket_key')
        .eq('tournament_id', fechaInfo.tournament_id)
        .eq('couple_id', data.couple_id)
        .in('bracket_key', ['GOLD', 'SILVER'])
        .maybeSingle()

      if (seedAssignmentError) throw seedAssignmentError
      if (!seedAssignment?.bracket_key) {
        return { success: false, error: 'Tu copa todavía no está definida' }
      }
      if (seedAssignment.bracket_key !== fechaInfo.bracket_key) {
        return { success: false, error: 'Esta fecha no corresponde a la copa de tu pareja' }
      }
    }

    if (data.requested) {
      const { error: upsertError } = await supabase
        .from('couple_time_availability')
        .upsert({
          couple_id: data.couple_id,
          time_slot_id: data.time_slot_id,
          is_available: true,
          notes: data.notes || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'couple_id,time_slot_id' })
      if (upsertError) throw upsertError
    } else {
      const { error: deleteError } = await supabase
        .from('couple_time_availability')
        .delete()
        .eq('couple_id', data.couple_id)
        .eq('time_slot_id', data.time_slot_id)
      if (deleteError) throw deleteError
    }

    revalidatePath(`/tournaments/${fechaInfo.tournament_id}`)
    revalidatePath(`/tournaments/${fechaInfo.tournament_id}/schedules`)
    revalidatePath(`/tournaments/${fechaInfo.tournament_id}/match-scheduling`)

    return {
      success: true,
      message: data.requested ? 'Fecha libre solicitada' : 'Solicitud de fecha libre cancelada',
    }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) }
  }
}
