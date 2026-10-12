import { NextRequest } from "next/server"

import { createPlayerForCoupleService } from "@/lib/services/players/create-player-for-couple"
import { createClient } from "@/utils/supabase/server"
import { createRegistrationTrace } from '@/lib/tournaments/registration-log'

interface CreatePlayerForCoupleBody {
  tournamentId?: string
  playerData?: {
    first_name?: string
    last_name?: string
    gender?: string
    dni?: string | null
    phone?: string | null
    forceCreateNew?: boolean
  }
}

export async function POST(request: NextRequest) {
  const trace = createRegistrationTrace(request.headers, 'create-player')
  try {
    const supabase = await createClient()
    const body = (await request.json()) as CreatePlayerForCoupleBody
    trace.tournament(body.tournamentId)
    trace.step('validate-form')

    if (!body.tournamentId || !body.playerData?.first_name || !body.playerData?.last_name || !body.playerData?.gender) {
      return trace.reply(
        {
          success: false,
          message: "Faltan datos obligatorios para crear el jugador.",
        },
        400, 'player_data_missing',
      )
    }

    trace.step('create-player')
    const result = await createPlayerForCoupleService(supabase, {
      tournamentId: body.tournamentId,
      playerData: {
        first_name: body.playerData.first_name,
        last_name: body.playerData.last_name,
        gender: body.playerData.gender,
        dni: body.playerData.dni ?? null,
        phone: body.playerData.phone ?? null,
        forceCreateNew: body.playerData.forceCreateNew ?? false,
      },
    })

    return trace.reply(result, result.success ? 200 : 400, result.success ? 'complete' : 'player_creation_rejected')
  } catch (error) {
    return trace.reply(
      {
        success: false,
        message: "No se pudo crear el jugador.",
      },
      500, 'unexpected_failure', error,
    )
  }
}
