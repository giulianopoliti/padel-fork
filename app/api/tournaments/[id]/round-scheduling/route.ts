import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentAccess, hasAnyPermission } from '@/utils/tournament-permissions'

type RoundType = 'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL'
type BracketKey = 'MAIN' | 'GOLD' | 'SILVER'

const VALID_ROUNDS: RoundType[] = ['ZONE', '32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']
const VALID_BRACKET_KEYS: BracketKey[] = ['MAIN', 'GOLD', 'SILVER']

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: tournamentId } = await params

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no autenticado' },
        { status: 401 }
      )
    }

    const access = await checkTournamentAccess(user.id, tournamentId)
    const canRead = hasAnyPermission(access, [
      'manage_schedules',
      'view_own_schedule',
      'view_public'
    ])

    if (!canRead) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para ver horarios de esta ronda' },
        { status: 403 }
      )
    }

    const url = new URL(request.url)
    const rawRoundType = url.searchParams.get('round_type')
    const rawBracketKey = url.searchParams.get('bracket_key')

    if (!rawRoundType || !VALID_ROUNDS.includes(rawRoundType as RoundType)) {
      return NextResponse.json(
        { success: false, error: 'round_type inválido o faltante' },
        { status: 400 }
      )
    }

    if (rawBracketKey && !VALID_BRACKET_KEYS.includes(rawBracketKey as BracketKey)) {
      return NextResponse.json(
        { success: false, error: 'bracket_key inválido' },
        { status: 400 }
      )
    }

    const roundType = rawRoundType as RoundType
    const bracketKey = roundType === 'ZONE' ? undefined : (rawBracketKey as BracketKey | null)

    let fechasQuery = supabase
      .from('tournament_fechas')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('round_type', roundType)
      .order('fecha_number', { ascending: true })

    if (bracketKey) {
      fechasQuery = fechasQuery.eq('bracket_key', bracketKey)
    }

    const { data: fechas, error: fechasError } = await fechasQuery
    if (fechasError) {
      throw fechasError
    }

    if (!fechas || fechas.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          fechas: [],
          timeSlots: [],
          availability: []
        }
      })
    }

    const fechaIds = fechas.map(fecha => fecha.id)

    const { data: timeSlots, error: timeSlotsError } = await supabase
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
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })

    if (timeSlotsError) {
      throw timeSlotsError
    }

    const normalizedTimeSlots = (timeSlots || []).map(slot => ({
      id: slot.id,
      fecha_id: slot.fecha_id,
      slot_type: slot.slot_type,
      is_system: slot.is_system,
      date: slot.date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      court_name: slot.court_name,
      max_matches: slot.max_matches,
      fecha: slot.fecha
    }))

    const timeSlotIds = normalizedTimeSlots.map(slot => slot.id)
    let availability: any[] = []

    if (timeSlotIds.length > 0) {
      const { data: availabilityData, error: availabilityError } = await supabase
        .from('couple_time_availability')
        .select('*')
        .in('time_slot_id', timeSlotIds)

      if (availabilityError) {
        throw availabilityError
      }

      availability = availabilityData || []
    }

    return NextResponse.json({
      success: true,
      data: {
        fechas: fechas || [],
        timeSlots: normalizedTimeSlots,
        availability
      }
    })
  } catch (error) {
    console.error('[round-scheduling] Error loading round scheduling data:', error)
    return NextResponse.json(
      { success: false, error: 'Error al cargar datos de la ronda' },
      { status: 500 }
    )
  }
}
