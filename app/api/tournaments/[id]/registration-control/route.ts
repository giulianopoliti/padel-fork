import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import {
  buildTournamentCapacitySummary,
  getTournamentCoupleCount,
} from '@/lib/services/tournament-capacity.service'

interface RegistrationControlRequest {
  registration_locked: boolean
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { registration_locked }: RegistrationControlRequest = await request.json()
    const resolvedParams = await params
    const tournamentId = resolvedParams.id

    // Get current tournament data to validate operation
    const { data: tournament, error: fetchError } = await supabase
      .from('tournaments')
      .select('id, status, bracket_status, registration_locked, registration_locked_by_capacity, max_participants')
      .eq('id', tournamentId)
      .single()

    if (fetchError || !tournament) {
      return NextResponse.json(
        { success: false, message: 'Tournament not found' },
        { status: 404 }
      )
    }

    // Validate that registration control is allowed
    const allowedStatuses = ['NOT_STARTED', 'ZONE_PHASE', 'ZONE_REGISTRATION']
    if (!allowedStatuses.includes(tournament.status)) {
      return NextResponse.json(
        {
          success: false,
          message: `No se pueden modificar las inscripciones en la fase ${tournament.status}.`
        },
        { status: 400 }
      )
    }

    // Don't allow opening registrations if bracket is already generated
    if (
      !registration_locked && // Trying to open registrations
      (tournament.bracket_status === 'BRACKET_GENERATED' || tournament.bracket_status === 'BRACKET_ACTIVE')
    ) {
      return NextResponse.json(
        {
          success: false,
          message: 'No se pueden abrir las inscripciones porque la llave ya está generada.'
        },
        { status: 400 }
      )
    }

    const currentParticipants = await getTournamentCoupleCount(supabase, tournamentId)
    const capacity = buildTournamentCapacitySummary(tournament.max_participants, currentParticipants)

    if (!registration_locked && capacity.isFull) {
      return NextResponse.json(
        {
          success: false,
          message: `El cupo está completo: hay ${currentParticipants} parejas inscriptas y el máximo es ${capacity.maxParticipants}. Aumentá el cupo en la configuración general o eliminá una inscripción para reabrirlas.`
        },
        { status: 400 }
      )
    }

    // Update the registration_locked field
    const { error: updateError } = await supabase
      .from('tournaments')
      .update({
        registration_locked,
        registration_locked_by_capacity: false,
      })
      .eq('id', tournamentId)

    if (updateError) {
      console.error('Error updating registration lock:', updateError)
      return NextResponse.json(
        { success: false, message: 'Failed to update registration status' },
        { status: 500 }
      )
    }

    revalidatePath('/')
    revalidatePath('/panel')
    revalidatePath('/tournaments')
    revalidatePath('/tournaments/upcoming')
    revalidatePath(`/tournaments/${tournamentId}`)

    return NextResponse.json({
      success: true,
      message: registration_locked
        ? 'Registrations have been locked successfully'
        : 'Registrations have been opened successfully',
      data: {
        registration_locked,
        registration_locked_by_capacity: false,
        tournament_id: tournamentId
      }
    })

  } catch (error) {
    console.error('Error in registration control endpoint:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
