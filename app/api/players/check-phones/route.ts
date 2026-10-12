import { NextRequest } from "next/server"

import { checkPlayersPhones } from "@/app/api/players/actions"
import { createRegistrationTrace } from '@/lib/tournaments/registration-log'

interface CheckPhonesBody {
  player1Id?: string
  player2Id?: string
}

export async function POST(request: NextRequest) {
  const trace = createRegistrationTrace(request.headers, 'check-phones')
  try {
    trace.step('read-form')
    const body = (await request.json()) as CheckPhonesBody

    if (!body.player1Id || !body.player2Id) {
      return trace.reply(
        {
          success: false,
          error: "Se requieren ambos jugadores para verificar teléfonos.",
        },
        400, 'players_missing',
      )
    }

    trace.step('check-phones')
    const result = await checkPlayersPhones(body.player1Id, body.player2Id)
    return trace.reply(result, result.success ? 200 : 400, result.success ? 'complete' : result.code || 'phone_check_failed')
  } catch (error) {
    return trace.reply(
      {
        success: false,
        error: "No se pudieron verificar los teléfonos.",
      },
      500, 'unexpected_failure', error,
    )
  }
}
