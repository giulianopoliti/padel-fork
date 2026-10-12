import { NextRequest } from "next/server"

import { updatePlayerPhone } from "@/app/api/players/actions"
import { createRegistrationTrace } from '@/lib/tournaments/registration-log'

interface UpdatePhoneBody {
  playerId?: string
  phone?: string
}

export async function POST(request: NextRequest) {
  const trace = createRegistrationTrace(request.headers, 'update-phone')
  try {
    trace.step('read-form')
    const body = (await request.json()) as UpdatePhoneBody

    if (!body.playerId) {
      return trace.reply(
        {
          success: false,
          error: "Falta el jugador a actualizar.",
        },
        400, 'player_missing',
      )
    }

    trace.step('update-phone')
    const result = await updatePlayerPhone(body.playerId, body.phone || "")

    return trace.reply(result, result.success ? 200 : 400, result.success ? 'complete' : 'phone_update_failed')
  } catch (error) {
    return trace.reply(
      {
        success: false,
        error: "No se pudo actualizar el teléfono.",
      },
      500, 'unexpected_failure', error,
    )
  }
}
