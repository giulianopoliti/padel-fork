import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { createInscriptionProofSignedUrl } from '@/lib/services/inscription-proofs'
import { getUserDetails } from '@/utils/db/getUserDetails'

import { createRegistrationTrace } from '@/lib/tournaments/registration-log'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; inscriptionId: string }> }
) {
  const trace = createRegistrationTrace(request.headers, 'view-proof')
  try {
    const { id: tournamentId, inscriptionId } = await params
    trace.tournament(tournamentId)
    trace.step('authentication')
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return trace.reply(
        { success: false, message: 'No autorizado' },
        401, 'session_unavailable', authError
      )
    }

    trace.step('permission')
    const permissionCheck = await checkTournamentPermissions(user.id, tournamentId)

    trace.step('read-inscription')
    const { data: inscription, error } = await supabase
      .from('inscriptions')
      .select('id, tournament_id, payment_proof_path, couple_id, player_id')
      .eq('id', inscriptionId)
      .eq('tournament_id', tournamentId)
      .single()

    if (error || !inscription?.payment_proof_path) {
      return trace.reply(
        { success: false, message: 'No se encontró comprobante para esta inscripción' },
        404, 'proof_unavailable', error
      )
    }

    if (!permissionCheck.hasPermission) {
      const profile = await getUserDetails()
      const { data: couple } = inscription.couple_id
        ? await supabase.from('couples').select('player1_id, player2_id').eq('id', inscription.couple_id).maybeSingle()
        : { data: null }
      const owns = profile?.player_id && (couple
        ? [couple.player1_id, couple.player2_id].includes(profile.player_id)
        : !inscription.couple_id && inscription.player_id === profile.player_id)
      if (!owns) {
        return trace.reply({ success: false, message: 'Sin permisos' }, 403, 'permission_denied')
      }
    }

    trace.step('sign-proof-url')
    const signedUrlResult = await createInscriptionProofSignedUrl(inscription.payment_proof_path)
    if (!signedUrlResult.success) {
      return trace.reply(
        { success: false, message: 'No se pudo abrir el comprobante' },
        500, 'sign_url_failed', signedUrlResult.cause
      )
    }

    return trace.reply({
      success: true,
      url: signedUrlResult.signedUrl,
    }, 200, 'complete')
  } catch (error) {
    return trace.reply(
      { success: false, message: 'Error interno del servidor' },
      500, 'unexpected_failure', error
    )
  }
}
