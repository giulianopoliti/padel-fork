'use server'

import { createClient, createClientServiceRole } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { checkTournamentPermissions } from "@/utils/tournament-permissions"
import { updateZonePositionsForTournament } from "@/lib/services/ranking"
import { getFechaBracketLabel } from "@/lib/services/fecha-bracket-policy"
import { IncrementalPlaceholderUpdater } from "@/lib/services/incremental-placeholder-updater"
import { sendTournamentMessage } from "@/lib/services/messages"
import { applyLongMatchLineup, getLongMatchLineupChanges } from '@/lib/services/long-match-lineups'
import { summarizeZoneMatches, type MatchCounts, type OpponentStatus, type ZoneMatchSummary } from './utils/schedulingInsights'

// Types for match scheduling
export interface SchedulingData {
  couples: CoupleWithData[]
  timeSlots: TimeSlot[]
  availability: AvailabilityItem[]
  existingMatches: ExistingMatch[]
  estimatedMatchDurationMinutes?: number
}

export interface CoupleWithData {
  id: string
  player1: { name: string; last_name: string; phone?: string | null }
  player2: { name: string; last_name: string; phone?: string | null }
  zone_position: {
    zone_name: string
    position: number
    points: number
  } | null
  matches_in_fecha: number
  has_played_in_this_date: boolean // Has an active match assigned in this fecha, including drafts.
  zone_match_counts?: MatchCounts
  opponent_statuses?: Record<string, OpponentStatus>
  match_status: 'DRAFT' | 'PENDING' | 'FINISHED' | null // status of match in this fecha (null if no match)
  free_date_blocked: boolean
  free_date_notes: string | null
  fecha_substitute?: { slot: 1 | 2; playerName: string }
}

export interface TimeSlot {
  id: string
  start_time: string
  end_time: string
  court_name: string | null
  date: string
  max_matches: number
}

export interface AvailabilityItem {
  couple_id: string
  time_slot_id: string
  is_available: boolean
  notes: string | null
  preferred_start_time?: string | null
  preferred_end_time?: string | null
  note_interpretation_status?: string | null
}

export interface OrganizerAvailabilityData {
  coupleId: string
  timeSlotId: string
  isAvailable: boolean
  notes?: string | null
}

export interface ExistingMatch {
  id: string
  tournament_id?: string
  couple1_id: string | null
  couple2_id: string | null
  time_slot_id: string | null
  status: string
  // Specific scheduling information
  scheduled_date: string | null
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  court_assignment: string | null
  // Couple information with player names
  couple1?: {
    substitute_slot?: 1 | 2
    player1: { first_name: string; last_name: string }
    player2: { first_name: string; last_name: string }
  } | null
  couple2?: {
    substitute_slot?: 1 | 2
    player1: { first_name: string; last_name: string }
    player2: { first_name: string; last_name: string }
  } | null
  // Club information
  club_id: string | null
  club?: {
    name: string
    address: string | null
    formatted_address: string | null
    google_place_id: string | null
    latitude: number | null
    longitude: number | null
    maps_url: string | null
  } | null
}

export interface ActionResult<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// Helper function to get error messages
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

// Helper function to check if two couples have already played against each other in a tournament
const haveCouplesPlayedTogether = async (
  couple1Id: string,
  couple2Id: string,
  tournamentId: string,
  supabase: any
): Promise<boolean> => {
  try {
    const { data: existingMatches, error } = await supabase
      .from('matches')
      .select('id, status')
      .eq('tournament_id', tournamentId)
      .eq('round', 'ZONE')
      .eq('bracket_is_active', true)
      .in('status', ['DRAFT', 'PENDING', 'IN_PROGRESS', 'FINISHED', 'COMPLETED'])
      .or(`and(couple1_id.eq.${couple1Id},couple2_id.eq.${couple2Id}),and(couple1_id.eq.${couple2Id},couple2_id.eq.${couple1Id})`)

    if (error) {
      console.error('Error checking existing matches:', error)
      throw error
    }

    // Finished encounters and reserved matches both prevent a duplicate zone pairing.
    return existingMatches && existingMatches.length > 0
  } catch (error) {
    console.error('Exception checking existing matches:', error)
    throw error
  }
}

// Helper function to get match with tournament and zone information
const getMatchWithTournamentInfo = async (matchId: string, supabase: any) => {
  const { data: matchData, error } = await supabase
    .from('matches')
    .select(`
      id,
      status,
      couple1_id,
      couple2_id,
      tournament_id,
      zone_id,
      tournaments!inner (
        id,
        type,
        name
      )
    `)
    .eq('id', matchId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch match info: ${error.message}`)
  }

  return matchData
}

const unwrapRelation = <T>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

// 1. Get Match Scheduling Data
export async function getMatchSchedulingData(
  tournamentId: string,
  fechaId: string
): Promise<ActionResult<SchedulingData>> {
  try {
    const supabase = await createClient()
    
    // Verify user has access to this tournament
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      }
    }

    // Verify user has permissions (CLUB owner or ORGANIZADOR with access to this tournament)
    const permissionResult = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionResult.hasPermission) {
      return {
        success: false,
        error: permissionResult.reason || 'No tienes permisos para acceder a este torneo'
      }
    }

    // Scope the fecha before returning private player contact details.
    const { data: fecha, error: fechaError } = await supabase
      .from('tournament_fechas')
      .select('id, estimated_match_duration_minutes')
      .eq('id', fechaId)
      .eq('tournament_id', tournamentId)
      .eq('round_type', 'ZONE')
      .single()

    if (fechaError || !fecha) throw new Error('Fecha de zonas no encontrada en este torneo')

    const service = await createClientServiceRole()
    const { data: fechaLineups, error: fechaLineupError } = await service.rpc('get_long_fecha_substitution_lineups', {
      p_fecha_id: fechaId, p_actor_id: user.id,
    })
    if (fechaLineupError && fechaLineupError.code !== 'PGRST202') throw fechaLineupError
    const substitutions = new Map<string, { slot: 1 | 2; player_name: string }>(
      (fechaLineups ?? []).map((item: { couple_id: string; slot: 1 | 2; player_name: string }) => [item.couple_id, item]),
    )

    // Get all registered couples, independently of their availability or zone assignment.
    const { data: couplesData, error: couplesError } = await supabase
      .from('couples')
      .select(`
        id,
        player1:players!couples_player1_id_fkey (first_name, last_name, phone),
        player2:players!couples_player2_id_fkey (first_name, last_name, phone),
        inscriptions!inner (tournament_id),
        zone_positions!left (
          zone_id,
          tournament_id,
          position,
          points,
          zones (name)
        )
      `)
      .eq('inscriptions.tournament_id', tournamentId)

    if (couplesError) {
      throw couplesError
    }

    // Get time slots for this fecha
    const { data: timeSlotsData, error: timeSlotsError } = await supabase
      .from('tournament_time_slots')
      .select('id, start_time, end_time, court_name, date, max_matches')
      .eq('fecha_id', fechaId)
      .eq('is_available', true)
      .eq('slot_type', 'TIME_RANGE')
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })

    if (timeSlotsError) {
      throw timeSlotsError
    }

    // Get availability data for all couples and time slots
    const { data: availabilityData, error: availabilityError } = await supabase
      .from('couple_time_availability')
      .select(`
        couple_id,
        time_slot_id,
        is_available,
        notes,
        preferred_start_time,
        preferred_end_time,
        note_interpretation_status,
        tournament_time_slots!inner (fecha_id, slot_type)
      `)
      .eq('tournament_time_slots.fecha_id', fechaId)

    if (availabilityError) {
      throw availabilityError
    }

    // Keep all couples visible and annotate assignments in the selected fecha.
    const { data: fechaMatches, error: fechaMatchesError } = await supabase
      .from('fecha_matches')
      .select(`
        matches!inner (
          id,
          couple1_id,
          couple2_id,
          status,
          round
        )
      `)
      .eq('fecha_id', fechaId)
      .eq('matches.round', 'ZONE')
      .eq('matches.bracket_is_active', true)
      .in('matches.status', ['DRAFT', 'PENDING', 'IN_PROGRESS', 'FINISHED', 'COMPLETED'])

    if (fechaMatchesError) {
      throw fechaMatchesError
    }

    // Get existing matches for this fecha with scheduling info, couple names, and club
    // 🔒 ONLY ZONE matches - prevents bracket matches from appearing in match-scheduling
    // 🔒 EXCLUDE DRAFT matches - they are shown separately in DraftMatchesManager
    const { data: existingMatchesData, error: matchesError } = await supabase
      .from('fecha_matches')
      .select(`
        match_id,
        scheduled_time_slot_id,
        scheduled_date,
        scheduled_start_time,
        scheduled_end_time,
        court_assignment,
        matches!inner (
          id,
          couple1_id,
          couple2_id,
          status,
          club_id,
          round,
          couple1:couples!couple1_id (
            player1:players!couples_player1_id_fkey (first_name, last_name),
            player2:players!couples_player2_id_fkey (first_name, last_name)
          ),
          couple2:couples!couple2_id (
            player1:players!couples_player1_id_fkey (first_name, last_name),
            player2:players!couples_player2_id_fkey (first_name, last_name)
          ),
          club:clubes (
            name,
            address,
            formatted_address,
            google_place_id,
            latitude,
            longitude,
            maps_url
          )
        )
      `)
      .eq('fecha_id', fechaId)
      .eq('matches.round', 'ZONE')
      .eq('matches.bracket_is_active', true)
      .in('matches.status', ['PENDING', 'IN_PROGRESS', 'FINISHED', 'COMPLETED'])
      .neq('matches.status', 'DRAFT')  // 🆕 Exclude DRAFT matches from main view

    if (matchesError) {
      throw matchesError
    }

    // Fetch the full zone history in pages so totals and rematches include every fecha.
    const zoneMatches: ZoneMatchSummary[] = []
    const pageSize = 500
    for (let offset = 0; ; offset += pageSize) {
      const { data: page, error: historyError } = await supabase
        .from('matches')
        .select('id, couple1_id, couple2_id, status, round, bracket_is_active')
        .eq('tournament_id', tournamentId)
        .eq('round', 'ZONE')
        .eq('bracket_is_active', true)
        .in('status', ['DRAFT', 'PENDING', 'IN_PROGRESS', 'FINISHED', 'COMPLETED'])
        .order('id')
        .range(offset, offset + pageSize - 1)
      if (historyError) throw historyError
      zoneMatches.push(...(page || []))
      if (!page || page.length < pageSize) break
    }
    const zoneSummaries = summarizeZoneMatches(zoneMatches)
    const fechaSummaries = summarizeZoneMatches(
      (fechaMatches || []).flatMap(row => unwrapRelation<ZoneMatchSummary>(row.matches) ?? [])
    )

    // Transform couples data
    const couples: CoupleWithData[] = (couplesData || []).map(couple => {
      const zonePosition = couple.zone_positions?.find((position: { tournament_id: string }) => position.tournament_id === tournamentId)
      const player1 = unwrapRelation<any>(couple.player1)
      const player2 = unwrapRelation<any>(couple.player2)
      const zone = unwrapRelation<any>(zonePosition?.zones)
      const fechaCounts = fechaSummaries.get(couple.id)?.counts
      const substitute = substitutions.get(couple.id)
      const freeDatePreference = (availabilityData || []).find(item => {
        const slot = unwrapRelation<any>(item.tournament_time_slots)
        return item.couple_id === couple.id && slot?.slot_type === 'FREE_DATE' && item.is_available
      })

      return {
        id: couple.id,
        ...(substitute && { fecha_substitute: { slot: substitute.slot, playerName: substitute.player_name } }),
        player1: {
          name: player1?.first_name || '',
          last_name: player1?.last_name || '',
          phone: player1?.phone || null
        },
        player2: {
          name: player2?.first_name || '',
          last_name: player2?.last_name || '',
          phone: player2?.phone || null
        },
        zone_position: zonePosition ? {
          zone_name: zone?.name || '',
          position: zonePosition.position || 0,
          points: zonePosition.points || 0
        } : null,
        matches_in_fecha: fechaCounts?.played ?? 0,
        zone_match_counts: zoneSummaries.get(couple.id)?.counts || { played: 0, draft: 0, pending: 0 },
        opponent_statuses: zoneSummaries.get(couple.id)?.opponents || {},
        has_played_in_this_date: Boolean(fechaCounts),
        match_status: fechaCounts?.played ? 'FINISHED' : fechaCounts?.pending ? 'PENDING' : fechaCounts?.draft ? 'DRAFT' : null,
        free_date_blocked: Boolean(freeDatePreference),
        free_date_notes: freeDatePreference?.notes || null
      }
    })

    // Transform time slots
    const timeSlots: TimeSlot[] = (timeSlotsData || []).map(slot => ({
      id: slot.id,
      start_time: slot.start_time,
      end_time: slot.end_time,
      court_name: slot.court_name,
      date: slot.date,
      max_matches: slot.max_matches
    }))

    // Transform availability
    const availability: AvailabilityItem[] = (availabilityData || [])
      .filter(item => unwrapRelation<any>(item.tournament_time_slots)?.slot_type === 'TIME_RANGE')
      .map(item => ({
        couple_id: item.couple_id,
        time_slot_id: item.time_slot_id,
        is_available: item.is_available,
        notes: item.notes,
        preferred_start_time: item.preferred_start_time,
        preferred_end_time: item.preferred_end_time,
        note_interpretation_status: item.note_interpretation_status
      }))

    // Transform existing matches with scheduling information
    const lineups = await getLongMatchLineupChanges(supabase, (existingMatchesData || []).map(item => item.match_id))
    const existingMatches: ExistingMatch[] = (existingMatchesData || []).flatMap(item => {
      const match = unwrapRelation<any>(item.matches)
      if (!match) return []
      return [{
      id: match.id,
      tournament_id: tournamentId,
      couple1_id: match.couple1_id,
      couple2_id: match.couple2_id,
      time_slot_id: item.scheduled_time_slot_id,
      status: match.status,
      // Include specific scheduling data
      scheduled_date: item.scheduled_date,
      scheduled_start_time: item.scheduled_start_time,
      scheduled_end_time: item.scheduled_end_time,
      court_assignment: item.court_assignment,
      // Include couple names data
      couple1: applyLongMatchLineup(unwrapRelation<any>(match.couple1), match.couple1_id, lineups.get(match.id)),
      couple2: applyLongMatchLineup(unwrapRelation<any>(match.couple2), match.couple2_id, lineups.get(match.id)),
      // Include club data
      club_id: match.club_id,
      club: unwrapRelation<any>(match.club)
      }]
    })

    return {
      success: true,
      data: {
        couples,
        timeSlots,
        availability,
        existingMatches,
        estimatedMatchDurationMinutes: fecha.estimated_match_duration_minutes || 90
      }
    }

  } catch (error) {
    console.error('Error getting match scheduling data:', error)
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// Custom schedule interface
export interface CustomSchedule {
  date: string
  startTime: string
  endTime: string
  court: string
  notes?: string
}

// 2. Create Match with Custom Schedule (timeSlotId is now optional)
export async function createMatch(
  fechaId: string,
  couple1Id: string,
  couple2Id: string,
  timeSlotId?: string,
  customSchedule?: CustomSchedule,
  clubId?: string
): Promise<ActionResult> {
  try {
    if (!couple1Id || !couple2Id || couple1Id === couple2Id) {
      return { success: false, error: 'Seleccioná dos parejas diferentes' }
    }
    const supabase = await createClient()
    
    // Verify user authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      }
    }

    // Get tournament ID from fecha
    const { data: fecha } = await supabase
      .from('tournament_fechas')
      .select('tournament_id, round_type')
      .eq('id', fechaId)
      .single()

    if (!fecha || fecha.round_type !== 'ZONE') {
      return {
        success: false,
        error: 'Fecha de zonas no encontrada'
      }
    }

    // Verify user has permissions to create matches in this tournament
    const permissionResult = await checkTournamentPermissions(user.id, fecha.tournament_id)
    if (!permissionResult.hasPermission) {
      return {
        success: false,
        error: permissionResult.reason || 'No tienes permisos para crear partidos en este torneo'
      }
    }

    const { data: registeredCouples, error: registrationError } = await supabase
      .from('inscriptions')
      .select('couple_id')
      .eq('tournament_id', fecha.tournament_id)
      .in('couple_id', [couple1Id, couple2Id])

    if (registrationError) throw registrationError
    if (new Set((registeredCouples || []).map(row => row.couple_id)).size !== 2) {
      return { success: false, error: 'Ambas parejas deben estar inscriptas en este torneo' }
    }

    // Check if these two couples have already played against each other in this tournament
    const havePlayedTogether = await haveCouplesPlayedTogether(
      couple1Id,
      couple2Id,
      fecha.tournament_id,
      supabase
    )

    if (havePlayedTogether) {
      return {
        success: false,
        error: 'Estas dos parejas ya se enfrentaron o tienen un cruce reservado en este torneo.'
      }
    }

    // Get time slot data for scheduling information (if timeSlotId provided)
    let timeSlot = null
    let warningMessage = ''

    if (timeSlotId) {
      const { data: timeSlotData } = await supabase
        .from('tournament_time_slots')
        .select('start_time, end_time, court_name, max_matches, date, slot_type')
        .eq('id', timeSlotId)
        .eq('fecha_id', fechaId)
        .single()

      if (!timeSlotData) {
        return {
          success: false,
          error: 'Horario no encontrado'
        }
      }

      if (timeSlotData.slot_type === 'FREE_DATE') {
        return { success: false, error: 'La fecha libre no es un horario jugable' }
      }

      timeSlot = timeSlotData

      // Count existing matches in this time slot (for warning only)
      const { data: matchesInSlot } = await supabase
        .from('fecha_matches')
        .select('id')
        .eq('scheduled_time_slot_id', timeSlotId)

      const matchCount = matchesInSlot?.length || 0
      const maxMatches = timeSlot.max_matches || 1

      if (matchCount >= maxMatches) {
        warningMessage = ` (Advertencia: Este horario ya tiene ${matchCount} partidos, máximo recomendado: ${maxMatches})`
      }
    }

    // Determine schedule details - use custom if provided, otherwise time slot defaults, otherwise null
    const scheduleDate = customSchedule?.date || timeSlot?.date || null
    const scheduleStartTime = customSchedule?.startTime || timeSlot?.start_time || null
    const scheduleEndTime = customSchedule?.endTime || timeSlot?.end_time || null
    const scheduleCourt = customSchedule?.court || timeSlot?.court_name || null
    const scheduleNotes = customSchedule?.notes || null

    // Get tournament info to check type, draft mode, and assign zone if needed
    let zoneId = null
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, type, enable_draft_matches')
      .eq('id', fecha.tournament_id)
      .single()

    if (tournamentError) {
      throw tournamentError
    }

    // For LONG tournaments, get the zone_id to assign to match
    if (tournament.type === 'LONG') {
      const { data: zone, error: zoneError } = await supabase
        .from('zones')
        .select('id')
        .eq('tournament_id', fecha.tournament_id)
        .single()

      if (!zoneError && zone) {
        zoneId = zone.id
      }
    }

    // Determine initial status based on tournament configuration
    // If draft mode is enabled, create match as DRAFT, otherwise PENDING
    const initialStatus = tournament.enable_draft_matches ? 'DRAFT' : 'PENDING'

    // Create the match with appropriate initial status
    const { data: newMatch, error: insertMatchError } = await supabase
      .from('matches')
      .insert({
        couple1_id: couple1Id,
        couple2_id: couple2Id,
        tournament_id: fecha.tournament_id,
        zone_id: zoneId, // Assign zone_id for LONG tournaments
        club_id: clubId || null, // Assign club_id if provided
        status: initialStatus, // DRAFT or PENDING based on tournament config
        round: 'ZONE' // Assuming zone matches for long tournament
      })
      .select('id')
      .single()

    if (insertMatchError) {
      throw insertMatchError
    }

    // Link match to fecha with specific scheduling data
    const { error: linkError } = await supabase
      .from('fecha_matches')
      .insert({
        fecha_id: fechaId,
        match_id: newMatch.id,
        scheduled_time_slot_id: timeSlotId || null, // Optional timeSlotId
        // Use custom or default scheduling information
        scheduled_date: scheduleDate,
        scheduled_start_time: scheduleStartTime,
        scheduled_end_time: scheduleEndTime,
        court_assignment: scheduleCourt,
        notes: scheduleNotes
      })

    if (linkError) {
      throw linkError
    }

    // Sets will be created only when loading match results
    try {
      await sendTournamentMessage({
        type: "LONG_MATCH_CONFIRMED_PLAYER",
        supabase,
        matchId: newMatch.id,
      })
    } catch (emailError) {
      console.error('[match-scheduling] Error enviando email de partido programado:', emailError)
    }

    revalidatePath(`/tournaments/${fecha.tournament_id}/match-scheduling`)

    // Build message based on status and scheduling
    let finalMessage = ''
    const statusText = initialStatus === 'DRAFT' ? ' (BORRADOR - no visible para jugadores)' : ''

    if (customSchedule) {
      finalMessage = `Partido programado para ${scheduleDate} de ${scheduleStartTime} a ${scheduleEndTime}${scheduleCourt ? ` en ${scheduleCourt}` : ''}${statusText}${warningMessage}`
    } else if (timeSlotId && timeSlot) {
      finalMessage = `Partido creado y asignado a horario específico${statusText}${warningMessage}`
    } else {
      finalMessage = `Partido creado sin horario específico${statusText}. Podrás asignar fecha y hora más tarde.`
    }

    return {
      success: true,
      message: finalMessage,
      data: {
        matchId: newMatch.id,
        status: initialStatus,
        couple1Id: couple1Id,
        couple2Id: couple2Id,
        scheduledDate: scheduleDate,
        scheduledStartTime: scheduleStartTime,
        scheduledEndTime: scheduleEndTime,
        courtAssignment: scheduleCourt,
        timeSlotId: timeSlotId || null
      }
    }

  } catch (error) {
    console.error('Error creating match:', error)
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// Interface for set results
export interface SetResult {
  set_number: number
  couple1_games: number
  couple2_games: number
}

export interface MatchResultData {
  matchId: string
  sets: SetResult[]
  winnerId: string
  result_couple1: string // e.g., "2" for 2-0 or "1" for 1-2
  result_couple2: string // e.g., "0" for 2-0 or "2" for 1-2
}

// 3. Update Match Result (creates sets dynamically)
export async function updateMatchResult(
  matchResultData: MatchResultData
): Promise<ActionResult> {
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

    const { matchId, sets, winnerId, result_couple1, result_couple2 } = matchResultData

    // Validate match exists and get tournament info (including tournament type and zone)
    const { data: existingMatchFull, error: matchFetchError } = await supabase
      .from('matches')
      .select(`
        id,
        status,
        couple1_id,
        couple2_id,
        tournament_id,
        zone_id,
        round,
        tournaments!inner (
          id,
          type,
          name,
          status
        )
      `)
      .eq('id', matchId)
      .single()

    if (matchFetchError || !existingMatchFull) {
      return {
        success: false,
        error: 'Partido no encontrado'
      }
    }

    // 🔒 CRITICAL: Only allow result loading for ZONE matches in match-scheduling
    if (existingMatchFull.round !== 'ZONE') {
      return {
        success: false,
        error: `Este partido es de ${existingMatchFull.round || 'eliminación'}. Usa la vista de Llave para cargar el resultado, no Match Scheduling.`
      }
    }

    // Verify user has permissions to update match results in this tournament
    const permissionResult = await checkTournamentPermissions(user.id, existingMatchFull.tournament_id)
    if (!permissionResult.hasPermission) {
      return {
        success: false,
        error: permissionResult.reason || 'No tienes permisos para actualizar resultados en este torneo'
      }
    }

    if (existingMatchFull.status === 'COMPLETED' || existingMatchFull.status === 'FINISHED') {
      return {
        success: false,
        error: 'Este partido ya tiene un resultado cargado'
      }
    }

    // Use existingMatchFull as existingMatch for rest of function
    const existingMatch = existingMatchFull

    // Validate winner is one of the couples in the match
    if (winnerId !== existingMatch.couple1_id && winnerId !== existingMatch.couple2_id) {
      return {
        success: false,
        error: 'El ganador debe ser una de las parejas del partido'
      }
    }

    // Validate sets results logic
    if (sets.length < 2 || sets.length > 3) {
      return {
        success: false,
        error: 'Un partido debe tener entre 2 y 3 sets'
      }
    }

    // Update match with results and winner
    const { error: updateMatchError } = await supabase
      .from('matches')
      .update({
        status: 'FINISHED',
        winner_id: winnerId,
        result_couple1: result_couple1,
        result_couple2: result_couple2
      })
      .eq('id', matchId)

    if (updateMatchError) {
      throw updateMatchError
    }

    // Create sets based on actual results
    const setsToInsert = sets.map(set => {
      // Determine set winner based on games
      let setWinnerId: string
      if (set.couple1_games > set.couple2_games) {
        setWinnerId = existingMatch.couple1_id
      } else {
        setWinnerId = existingMatch.couple2_id
      }

      return {
        match_id: matchId,
        set_number: set.set_number,
        couple1_games: set.couple1_games,
        couple2_games: set.couple2_games,
        winner_couple_id: setWinnerId,
        status: 'COMPLETED'
      }
    })

    const { error: setsError } = await supabase
      .from('set_matches')
      .insert(setsToInsert)

    if (setsError) {
      throw setsError
    }

    // 🚀 NEW: Automatically recalculate zone positions
    try {
      console.log(`🔄 Recalculating zone positions after match result update`)
      const tournamentInfo = unwrapRelation<any>(existingMatch.tournaments)
      console.log(`   Tournament: ${tournamentInfo?.name || 'N/A'} (${tournamentInfo?.type || 'N/A'})`)
      console.log(`   Match: ${matchId}`)
      console.log(`   Result: ${result_couple1}-${result_couple2}`)
      
      const zoneUpdateResult = await updateZonePositionsForTournament(
        existingMatch.tournament_id,
        existingMatch.zone_id
      )
      
      if (zoneUpdateResult.success) {
        console.log(`✅ Zone positions updated successfully`)
        console.log(`   System used: ${zoneUpdateResult.systemUsed}`)
        console.log(`   Updated couples: ${zoneUpdateResult.updatedCouples}`)
        console.log(`   Applied criteria: ${zoneUpdateResult.appliedCriteria.join(', ')}`)
        
        if (zoneUpdateResult.hasUnresolvedTies) {
          console.warn(`⚠️  Unresolved ties detected in zone positions`)
        }
        
        if (zoneUpdateResult.fallbackUsed) {
          console.warn(`⚠️  Fallback system was used: ${zoneUpdateResult.error}`)
        }
        
        let placeholderResolution: { resolved: number; definitive: number } | null = null
        if (tournamentInfo?.status === 'BRACKET_PHASE' && existingMatch.zone_id) {
          try {
            const incrementalUpdater = new IncrementalPlaceholderUpdater()
            placeholderResolution = await incrementalUpdater.analyzeZoneAndResolveDefinitives(
              existingMatch.tournament_id,
              existingMatch.zone_id
            )
          } catch (placeholderError) {
            console.error('Error resolving placeholders after match result update:', placeholderError)
          }
        }

        // Enhanced success message with ranking info
        const rankingInfo = zoneUpdateResult.systemUsed === 'configurable' 
          ? ` Posiciones actualizadas usando sistema configurable.`
          : ` Posiciones actualizadas.`
        
        const tieWarning = zoneUpdateResult.hasUnresolvedTies 
          ? ` ⚠️ Hay empates sin resolver.` 
          : ''
          
        revalidatePath(`/tournaments`)
        
        return {
          success: true,
          message: `Resultado cargado exitosamente: ${result_couple1}-${result_couple2} en sets.${rankingInfo}${tieWarning}`,
          data: {
            matchResult: { result_couple1, result_couple2, winnerId },
            zoneUpdate: {
              systemUsed: zoneUpdateResult.systemUsed,
              updatedCouples: zoneUpdateResult.updatedCouples,
              appliedCriteria: zoneUpdateResult.appliedCriteria,
              hasUnresolvedTies: zoneUpdateResult.hasUnresolvedTies,
              fallbackUsed: zoneUpdateResult.fallbackUsed,
              calculationTime: zoneUpdateResult.calculationTime
            },
            placeholderResolution
          }
        }
        
      } else {
        // Zone position update failed, but match result was saved
        console.error(`❌ Zone position update failed: ${zoneUpdateResult.error}`)
        
        revalidatePath(`/tournaments`)
        
        return {
          success: true,
          message: `Resultado cargado: ${result_couple1}-${result_couple2}. ⚠️ Error actualizando posiciones: ${zoneUpdateResult.error}`,
          data: {
            matchResult: { result_couple1, result_couple2, winnerId },
            zoneUpdate: {
              error: zoneUpdateResult.error,
              systemUsed: zoneUpdateResult.systemUsed
            }
          }
        }
      }
      
    } catch (rankingError) {
      // Zone position update failed completely, but match result was saved
      console.error(`❌ Critical error in zone position update:`, rankingError)
      
      revalidatePath(`/tournaments`)
      
      return {
        success: true,
        message: `Resultado cargado: ${result_couple1}-${result_couple2}. ⚠️ Error crítico actualizando posiciones. Contacta al administrador.`,
        data: {
          matchResult: { result_couple1, result_couple2, winnerId },
          zoneUpdate: {
            error: rankingError instanceof Error ? rankingError.message : 'Error crítico desconocido'
          }
        }
      }
    }

  } catch (error) {
    console.error('Error updating match result:', error)
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// 4. Revert Match Statistics (for result modifications)
export async function revertMatchStatistics(
  matchId: string
): Promise<ActionResult> {
  try {
    let zoneRecalculated = false
    const supabase = await createClient()
    
    // Verify user authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      }
    }

    // Get match info and verify it has results to revert
    const existingMatch = await getMatchWithTournamentInfo(matchId, supabase)
    
    if (!existingMatch) {
      return {
        success: false,
        error: 'Partido no encontrado'
      }
    }

    if (existingMatch.status !== 'FINISHED' && existingMatch.status !== 'COMPLETED') {
      return {
        success: false,
        error: 'Este partido no tiene resultados para revertir'
      }
    }

    // Verify user has permissions
    const permissionResult = await checkTournamentPermissions(user.id, existingMatch.tournament_id)
    if (!permissionResult.hasPermission) {
      return {
        success: false,
        error: permissionResult.reason || 'No tienes permisos para modificar resultados en este torneo'
      }
    }

    // Get existing sets to calculate inverse statistics
    const { data: existingSets, error: setsError } = await supabase
      .from('set_matches')
      .select('set_number, couple1_games, couple2_games, winner_couple_id')
      .eq('match_id', matchId)
      .order('set_number', { ascending: true })

    if (setsError) {
      throw setsError
    }

    if (!existingSets || existingSets.length === 0) {
      return {
        success: false,
        error: 'No se encontraron sets para revertir'
      }
    }

    // Delete existing sets
    const { error: deleteSetsError } = await supabase
      .from('set_matches')
      .delete()
      .eq('match_id', matchId)

    if (deleteSetsError) {
      throw deleteSetsError
    }

    // Reset match status and results
    const { error: resetMatchError } = await supabase
      .from('matches')
      .update({
        status: 'PENDING',
        winner_id: null,
        result_couple1: null,
        result_couple2: null
      })
      .eq('id', matchId)

    if (resetMatchError) {
      throw resetMatchError
    }

    // Recalculate zone positions after reverting statistics
    try {
      const zoneUpdateResult = await updateZonePositionsForTournament(
        existingMatch.tournament_id,
        existingMatch.zone_id
      )
      
      if (zoneUpdateResult.success) {
        zoneRecalculated = true
        console.log(`✅ Zone positions recalculated after reverting match ${matchId}`)
      } else {
        console.warn(`⚠️ Zone position recalculation failed: ${zoneUpdateResult.error}`)
      }
    } catch (rankingError) {
      console.error('Error recalculating zone positions after revert:', rankingError)
      // Don't fail the revert operation if ranking fails
    }

    revalidatePath(`/tournaments/${existingMatch.tournament_id}/match-scheduling`)

    return {
      success: true,
      message: 'Estadísticas del partido revertidas exitosamente',
      data: {
        matchId,
        revertedSets: existingSets.length,
        zoneRecalculated
      }
    }

  } catch (error) {
    console.error('Error reverting match statistics:', error)
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// 5. Modify Match Result (combines revert + new result)
export async function modifyMatchResult(
  matchResultData: MatchResultData
): Promise<ActionResult> {
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

    const { matchId } = matchResultData

    // Get match info and verify it has existing results
    const existingMatch = await getMatchWithTournamentInfo(matchId, supabase)
    
    if (!existingMatch) {
      return {
        success: false,
        error: 'Partido no encontrado'
      }
    }

    if (existingMatch.status !== 'FINISHED' && existingMatch.status !== 'COMPLETED') {
      return {
        success: false,
        error: 'Este partido no tiene resultados previos para modificar'
      }
    }

    // Verify user has permissions
    const permissionResult = await checkTournamentPermissions(user.id, existingMatch.tournament_id)
    if (!permissionResult.hasPermission) {
      return {
        success: false,
        error: permissionResult.reason || 'No tienes permisos para modificar resultados en este torneo'
      }
    }

    // Step 1: Revert existing statistics
    const revertResult = await revertMatchStatistics(matchId)
    if (!revertResult.success) {
      return {
        success: false,
        error: `Error revirtiendo estadísticas: ${revertResult.error}`
      }
    }

    // Step 2: Apply new result using existing updateMatchResult function
    const updateResult = await updateMatchResult(matchResultData)
    
    if (updateResult.success) {
      revalidatePath(`/tournaments/${existingMatch.tournament_id}/match-scheduling`)

      const zoneUpdateError = updateResult.data?.zoneUpdate?.error
      
      return {
        success: true,
        message: zoneUpdateError
          ? `Resultado modificado, pero no se pudieron actualizar las posiciones: ${zoneUpdateError}`
          : `Resultado modificado exitosamente: ${matchResultData.result_couple1}-${matchResultData.result_couple2} sets`,
        data: {
          operation: 'modify',
          matchId,
          newResult: {
            couple1Sets: matchResultData.result_couple1,
            couple2Sets: matchResultData.result_couple2,
            winnerId: matchResultData.winnerId
          },
          ...updateResult.data
        }
      }
    } else {
      return {
        success: false,
        error: `Error aplicando nuevo resultado: ${updateResult.error}`
      }
    }

  } catch (error) {
    console.error('Error modifying match result:', error)
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// Interface for schedule modification
export interface ModifyScheduleData {
  matchId: string
  fechaId?: string
  date: string | null
  startTime: string | null
  endTime: string | null
  court: string | null
  notes?: string
  clubId?: string
}

interface SchedulingMatch {
  tournament_id: string
  type: string
  round: string | null
  bracket_key: 'MAIN' | 'GOLD' | 'SILVER' | null
  club_id: string | null
}

interface BracketFecha {
  id: string
  name: string
  fecha_number: number
  start_date: string | null
  end_date: string | null
}

export interface BracketMatchFechaOptions {
  fechas: BracketFecha[]
  currentFechaId: string | null
  currentClubId: string | null
}

type ScheduleClient = Awaited<ReturnType<typeof createClient>>

const getAuthorizedSchedulingMatch = async (supabase: ScheduleClient, matchId: string): Promise<SchedulingMatch> => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Usuario no autenticado')

  const { data: match, error } = await supabase.from('matches')
    .select('type, bracket_key, round, tournament_id, club_id').eq('id', matchId).single()
  if (error || !match) throw new Error('Partido no encontrado')

  const permission = await checkTournamentPermissions(user.id, match.tournament_id)
  if (!permission.hasPermission) throw new Error(permission.reason || 'No tenés permisos para modificar horarios en este torneo.')
  return match
}

const getBracketFechaCandidates = async (supabase: ScheduleClient, match: SchedulingMatch): Promise<BracketFecha[]> => {
  if (match.type !== 'ELIMINATION' || !match.round) return []
  const { data, error } = await supabase.from('tournament_fechas')
    .select('id, name, fecha_number, start_date, end_date')
    .eq('tournament_id', match.tournament_id)
    .eq('round_type', match.round)
    .eq('bracket_key', match.bracket_key || 'MAIN')
    .order('fecha_number')
    .order('id')
  if (error) throw error
  return data ?? []
}

const getLinkedSchedulingFecha = async (supabase: ScheduleClient, matchId: string): Promise<string | null> => {
  const { data, error } = await supabase.from('fecha_matches').select('fecha_id').eq('match_id', matchId).maybeSingle()
  if (error) throw error
  return data?.fecha_id ?? null
}

export const getBracketMatchFechaOptions = async (matchId: string): Promise<ActionResult<BracketMatchFechaOptions>> => {
  try {
    const supabase = await createClient()
    const match = await getAuthorizedSchedulingMatch(supabase, matchId)
    const [fechas, currentFechaId] = await Promise.all([
      getBracketFechaCandidates(supabase, match),
      getLinkedSchedulingFecha(supabase, matchId),
    ])
    return { success: true, data: { fechas, currentFechaId, currentClubId: match.club_id } }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) }
  }
}

// 6. Modify Match Schedule
export async function modifyMatchSchedule(
  scheduleData: ModifyScheduleData
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const { matchId, fechaId: requestedFechaId, date, startTime, endTime, court, notes, clubId } = scheduleData
    const match = await getAuthorizedSchedulingMatch(supabase, matchId)
    const previousFechaId = await getLinkedSchedulingFecha(supabase, matchId)
    let fechaId = previousFechaId

    if (match.type === 'ELIMINATION') {
      const candidates = await getBracketFechaCandidates(supabase, match)
      const targetId = requestedFechaId ?? previousFechaId
      const target = targetId ? candidates.find(candidate => candidate.id === targetId)
        : candidates.length === 1 ? candidates[0] : undefined
      if (!target) {
        if (targetId) return { success: false, error: 'Elegí una fecha del mismo torneo, ronda y copa que el partido.' }
        if (candidates.length > 1) return { success: false, error: 'Elegí en la llave en cuál de las fechas se juega este partido.' }
        return { success: false, error: `Creá una fecha para esta ronda de ${getFechaBracketLabel(match.bracket_key || 'MAIN')} en Fechas y Horarios.` }
      }
      if (date && target.id !== previousFechaId &&
        ((target.start_date && date < target.start_date) || (target.end_date && date > target.end_date))) {
        return { success: false, error: 'El día del partido debe quedar dentro del período de la fecha elegida.' }
      }
      fechaId = target.id
    } else if (requestedFechaId !== undefined) {
      return { success: false, error: 'Elegí la fecha de un partido de zonas desde su programación.' }
    }

    const { error: upsertFechaError } = await supabase
      .from('fecha_matches')
      .upsert({
        fecha_id: fechaId,
        ...(fechaId !== previousFechaId ? { scheduled_time_slot_id: null } : {}),
        match_id: matchId,
        scheduled_date: date,
        scheduled_start_time: startTime,
        scheduled_end_time: endTime,
        court_assignment: court,
        notes: notes || null
      }, {
        onConflict: 'match_id',
        ignoreDuplicates: false
      })

    if (upsertFechaError) {
      throw upsertFechaError
    }

    // Update club_id in matches table if provided
    if (clubId !== undefined) {
      const { error: updateMatchError } = await supabase
        .from('matches')
        .update({
          club_id: clubId || null
        })
        .eq('id', matchId)

      if (updateMatchError) {
        throw updateMatchError
      }
    }

    revalidatePath(`/tournaments/${match.tournament_id}/match-scheduling`)
    revalidatePath(`/tournaments/${match.tournament_id}/bracket`)

    return {
      success: true,
      message: `Horario actualizado: ${date} de ${startTime} a ${endTime}${court ? ` en ${court}` : ''}${!fechaId ? ' (sin fecha asignada)' : ''}`,
      data: {
        matchId,
        fechaId,
        newSchedule: {
          date,
          startTime,
          endTime,
          court,
          notes
        }
      }
    }

  } catch (error) {
    console.error('Error modifying match schedule:', error)
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// Interface for draft matches
export interface DraftMatch {
  id: string
  couple1_id: string | null
  couple2_id: string | null
  status: string
  club_id: string | null
  scheduled_date: string | null
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  court_assignment: string | null
  couple1?: {
    player1: { first_name: string; last_name: string }
    player2: { first_name: string; last_name: string }
    substitute_slot?: 1 | 2
  } | null
  couple2?: {
    player1: { first_name: string; last_name: string }
    player2: { first_name: string; last_name: string }
    substitute_slot?: 1 | 2
  } | null
}

const compareNullableScheduleValue = (
  first: string | null,
  second: string | null
) => {
  if (first && second) return first.localeCompare(second)
  if (first) return -1
  if (second) return 1
  return 0
}

const compareDraftMatchesBySchedule = (first: DraftMatch, second: DraftMatch) => {
  const dateComparison = compareNullableScheduleValue(first.scheduled_date, second.scheduled_date)
  if (dateComparison !== 0) return dateComparison

  const startTimeComparison = compareNullableScheduleValue(first.scheduled_start_time, second.scheduled_start_time)
  if (startTimeComparison !== 0) return startTimeComparison

  const endTimeComparison = compareNullableScheduleValue(first.scheduled_end_time, second.scheduled_end_time)
  if (endTimeComparison !== 0) return endTimeComparison

  const courtComparison = compareNullableScheduleValue(first.court_assignment, second.court_assignment)
  if (courtComparison !== 0) return courtComparison

  return first.id.localeCompare(second.id)
}

// 7. Get Draft Matches for a Fecha
export async function getDraftMatches(
  fechaId: string
): Promise<ActionResult<DraftMatch[]>> {
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

    // Get tournament ID from fecha
    const { data: fecha, error: fechaError } = await supabase
      .from('tournament_fechas')
      .select('tournament_id')
      .eq('id', fechaId)
      .single()

    if (fechaError || !fecha) {
      return {
        success: false,
        error: 'Fecha no encontrada'
      }
    }

    // Verify user has permissions to view draft matches
    const permissionResult = await checkTournamentPermissions(user.id, fecha.tournament_id)
    if (!permissionResult.hasPermission) {
      return {
        success: false,
        error: permissionResult.reason || 'No tienes permisos para ver partidos en borrador'
      }
    }

    // Get DRAFT matches for this fecha with all details
    const { data: draftMatchesData, error: matchesError } = await supabase
      .from('fecha_matches')
      .select(`
        match_id,
        scheduled_date,
        scheduled_start_time,
        scheduled_end_time,
        court_assignment,
        matches!inner (
          id,
          couple1_id,
          couple2_id,
          status,
          club_id,
          couple1:couples!couple1_id (
            player1:players!couples_player1_id_fkey (first_name, last_name),
            player2:players!couples_player2_id_fkey (first_name, last_name)
          ),
          couple2:couples!couple2_id (
            player1:players!couples_player1_id_fkey (first_name, last_name),
            player2:players!couples_player2_id_fkey (first_name, last_name)
          )
        )
      `)
      .eq('fecha_id', fechaId)
      .eq('matches.status', 'DRAFT')
      .eq('matches.round', 'ZONE')
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .order('scheduled_start_time', { ascending: true, nullsFirst: false })

    if (matchesError) {
      throw matchesError
    }

    // Transform data
    const lineups = await getLongMatchLineupChanges(supabase, (draftMatchesData || []).map(item => item.match_id))
    const draftMatches: DraftMatch[] = (draftMatchesData || []).flatMap(item => {
      const match = unwrapRelation<any>(item.matches)
      if (!match) return []
      return [{
      id: match.id,
      couple1_id: match.couple1_id,
      couple2_id: match.couple2_id,
      status: match.status,
      club_id: match.club_id,
      scheduled_date: item.scheduled_date,
      scheduled_start_time: item.scheduled_start_time,
      scheduled_end_time: item.scheduled_end_time,
      court_assignment: item.court_assignment,
      couple1: applyLongMatchLineup(unwrapRelation<any>(match.couple1), match.couple1_id, lineups.get(match.id)),
      couple2: applyLongMatchLineup(unwrapRelation<any>(match.couple2), match.couple2_id, lineups.get(match.id))
      }]
    }).sort(compareDraftMatchesBySchedule)

    return {
      success: true,
      data: draftMatches
    }

  } catch (error) {
    console.error('Error getting draft matches:', error)
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// 10. Update Couple Availability as Organizer
export async function updateOrganizerCoupleAvailability(
  data: OrganizerAvailabilityData
): Promise<ActionResult<AvailabilityItem>> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      }
    }

    const { data: timeSlot, error: timeSlotError } = await supabase
      .from('tournament_time_slots')
      .select(`
        id,
        slot_type,
        is_system,
        fecha_id,
        tournament_fechas!inner(tournament_id)
      `)
      .eq('id', data.timeSlotId)
      .single()

    if (timeSlotError || !timeSlot) {
      return {
        success: false,
        error: 'Horario no encontrado'
      }
    }

    if (timeSlot.slot_type !== 'TIME_RANGE' || timeSlot.is_system) {
      return {
        success: false,
        error: 'Este horario no permite disponibilidad manual'
      }
    }

    const fechaInfo = unwrapRelation<any>(timeSlot.tournament_fechas)
    const tournamentId = fechaInfo?.tournament_id
    if (!tournamentId) {
      return {
        success: false,
        error: 'No se pudo resolver el torneo del horario'
      }
    }

    const permissionResult = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionResult.hasPermission) {
      return {
        success: false,
        error: permissionResult.reason || 'No tienes permisos para modificar disponibilidades'
      }
    }

    const { data: couple, error: coupleError } = await supabase
      .from('couples')
      .select('id, inscriptions!inner(tournament_id)')
      .eq('id', data.coupleId)
      .eq('inscriptions.tournament_id', tournamentId)
      .maybeSingle()

    if (coupleError) {
      throw coupleError
    }

    if (!couple) {
      return {
        success: false,
        error: 'La pareja no pertenece a este torneo'
      }
    }

    if (data.isAvailable) {
      const { error: upsertError } = await supabase
        .from('couple_time_availability')
        .upsert({
          couple_id: data.coupleId,
          time_slot_id: data.timeSlotId,
          is_available: true,
          notes: data.notes?.trim() || null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'couple_id,time_slot_id'
        })

      if (upsertError) {
        throw upsertError
      }
    } else {
      const { error: deleteError } = await supabase
        .from('couple_time_availability')
        .delete()
        .eq('couple_id', data.coupleId)
        .eq('time_slot_id', data.timeSlotId)

      if (deleteError) {
        throw deleteError
      }
    }

    revalidatePath(`/tournaments/${tournamentId}/bracket`)
    revalidatePath(`/tournaments/${tournamentId}/schedules`)
    revalidatePath(`/tournaments/${tournamentId}/match-scheduling`)

    return {
      success: true,
      message: data.isAvailable ? 'Disponibilidad cargada manualmente' : 'Disponibilidad manual removida',
      data: {
        couple_id: data.coupleId,
        time_slot_id: data.timeSlotId,
        is_available: data.isAvailable,
        notes: data.isAvailable ? data.notes?.trim() || null : null
      }
    }
  } catch (error) {
    console.error('Error updating organizer availability:', error)
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// 8. Publish Matches (DRAFT → PENDING)
export async function publishMatches(
  matchIds: string[],
  tournamentId: string
): Promise<ActionResult> {
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

    // Verify user has permissions
    const permissionResult = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionResult.hasPermission) {
      return {
        success: false,
        error: permissionResult.reason || 'No tienes permisos para publicar partidos en este torneo'
      }
    }

    if (!matchIds || matchIds.length === 0) {
      return {
        success: false,
        error: 'No se especificaron partidos para publicar'
      }
    }

    // Update all matches from DRAFT to PENDING
    const { error: updateError, count } = await supabase
      .from('matches')
      .update({ status: 'PENDING' })
      .eq('tournament_id', tournamentId)
      .eq('status', 'DRAFT')
      .in('id', matchIds)

    if (updateError) {
      throw updateError
    }

    await Promise.allSettled(
      matchIds.map((matchId) =>
        sendTournamentMessage({
          type: "LONG_MATCH_CONFIRMED_PLAYER",
          supabase,
          matchId,
        }),
      ),
    )

    revalidatePath(`/tournaments/${tournamentId}/match-scheduling`)
    revalidatePath(`/tournaments/${tournamentId}/zone-matches`)

    return {
      success: true,
      message: `${count || matchIds.length} partido(s) publicado(s) exitosamente. Ahora son visibles para los jugadores.`,
      data: {
        publishedCount: count || matchIds.length,
        matchIds
      }
    }

  } catch (error) {
    console.error('Error publishing matches:', error)
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}

// 9. Delete Matches (DRAFT only - hard delete)
export async function deleteMatches(
  matchIds: string[],
  tournamentId: string
): Promise<ActionResult> {
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

    // Verify user has permissions
    const permissionResult = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionResult.hasPermission) {
      return {
        success: false,
        error: permissionResult.reason || 'No tienes permisos para eliminar partidos en este torneo'
      }
    }

    if (!matchIds || matchIds.length === 0) {
      return {
        success: false,
        error: 'No se especificaron partidos para eliminar'
      }
    }

    // Verify all matches are DRAFT status before deleting
    const { data: matchesToDelete, error: verifyError } = await supabase
      .from('matches')
      .select('id, status')
      .eq('tournament_id', tournamentId)
      .eq('bracket_is_active', true)
      .in('id', matchIds)

    if (verifyError) {
      throw verifyError
    }

    // Check if any match is not DRAFT
    const nonDraftMatches = matchesToDelete?.filter(m => m.status !== 'DRAFT') || []
    if (nonDraftMatches.length > 0) {
      return {
        success: false,
        error: 'Solo se pueden eliminar partidos en estado BORRADOR. Algunos partidos seleccionados ya fueron publicados.'
      }
    }

    if (!matchesToDelete || matchesToDelete.length === 0) {
      return {
        success: false,
        error: 'No se encontraron partidos para eliminar'
      }
    }

    // Delete in cascade order: set_matches → fecha_matches → matches

    // 1. Delete sets
    const { error: setsError } = await supabase
      .from('set_matches')
      .delete()
      .in('match_id', matchIds)

    if (setsError) {
      console.error('Error deleting sets:', setsError)
      // Continue even if no sets exist
    }

    // 2. Delete fecha_matches
    const { error: fechaError } = await supabase
      .from('fecha_matches')
      .delete()
      .in('match_id', matchIds)

    if (fechaError) {
      throw fechaError
    }

    // 3. Delete matches
    const { error: matchesError, count } = await supabase
      .from('matches')
      .delete()
      .eq('tournament_id', tournamentId)
      .in('id', matchIds)

    if (matchesError) {
      throw matchesError
    }

    revalidatePath(`/tournaments/${tournamentId}/match-scheduling`)
    revalidatePath(`/tournaments/${tournamentId}/zone-matches`)

    return {
      success: true,
      message: `${count || matchIds.length} partido(s) eliminado(s) exitosamente.`,
      data: {
        deletedCount: count || matchIds.length,
        matchIds
      }
    }

  } catch (error) {
    console.error('Error deleting matches:', error)
    return {
      success: false,
      error: getErrorMessage(error)
    }
  }
}
