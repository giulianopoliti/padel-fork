import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getUserDetails } from '@/utils/db/getUserDetails'
import { registerCoupleForTournament, removeCoupleFromTournament } from '@/app/api/tournaments/actions'
import { uploadInscriptionProof, deleteInscriptionProof } from '@/lib/services/inscription-proofs'

const ALLOWED_PROOF_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let uploadedProofPath: string | null = null

  try {
    const { id: tournamentId } = await params
    const supabase = await createClient()
    const formData = await request.formData()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: 'Debes iniciar sesión para inscribirte' },
        { status: 401 }
      )
    }

    const currentUser = await getUserDetails()

    if (!currentUser) {
      console.error('[couple-with-proof] No se pudieron cargar los detalles del usuario autenticado', {
        userId: user.id,
      })
      return NextResponse.json(
        { success: false, message: 'No se pudieron cargar tus datos de usuario' },
        { status: 404 }
      )
    }

    if (currentUser.role !== 'PLAYER') {
      return NextResponse.json(
        { success: false, message: 'Solo los jugadores pueden subir comprobantes' },
        { status: 403 }
      )
    }

    if (!currentUser.player_id) {
      console.error('[couple-with-proof] Usuario PLAYER sin perfil de jugador vinculado', {
        userId: user.id,
        role: currentUser.role,
      })
      return NextResponse.json(
        { success: false, message: 'Tu cuenta no tiene un perfil de jugador vinculado' },
        { status: 403 }
      )
    }

    const player1Id = String(formData.get('player1Id') || '')
    const player2Id = String(formData.get('player2Id') || '')
    const proofFile = formData.get('proof')

    if (!player1Id || !player2Id) {
      return NextResponse.json(
        { success: false, message: 'Faltan jugadores para completar la inscripción' },
        { status: 400 }
      )
    }

    if (player1Id !== currentUser.player_id) {
      return NextResponse.json(
        { success: false, message: 'El jugador autenticado no coincide con la inscripción' },
        { status: 403 }
      )
    }

    if (!(proofFile instanceof File)) {
      return NextResponse.json(
        { success: false, message: 'Debes adjuntar un comprobante válido' },
        { status: 400 }
      )
    }

    if (!ALLOWED_PROOF_TYPES.has(proofFile.type)) {
      return NextResponse.json(
        { success: false, message: 'Formato de comprobante no permitido' },
        { status: 400 }
      )
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select(`
        id,
        name,
        enable_transfer_proof,
        transfer_alias,
        transfer_amount,
        enable_trust_based_payment_policy,
        trust_policy_min_played_tournaments,
        transfer_amount_per_player
      `)
      .eq('id', tournamentId)
      .single()

    if (tournamentError || !tournament) {
      return NextResponse.json(
        { success: false, message: 'Torneo no encontrado' },
        { status: 404 }
      )
    }

    const trustPolicyEnabled = tournament.enable_trust_based_payment_policy === true

    if (!trustPolicyEnabled && !tournament.enable_transfer_proof) {
      return NextResponse.json(
        { success: false, message: 'Este torneo no acepta comprobantes de transferencia' },
        { status: 400 }
      )
    }

    const amountPerPlayer = Number(tournament.transfer_amount_per_player ?? 0)
    const totalAmount = trustPolicyEnabled
      ? amountPerPlayer * 2
      : Number(tournament.transfer_amount ?? 0)

    if (!tournament.transfer_alias || totalAmount <= 0) {
      return NextResponse.json(
        { success: false, message: 'El torneo no tiene alias y seña total de la pareja configurados' },
        { status: 400 }
      )
    }

    const registrationResult = await registerCoupleForTournament(
      tournamentId,
      player1Id,
      player2Id,
      false,
      trustPolicyEnabled ? 'TRANSFER' : null
    )

    if (!registrationResult.success || !registrationResult.inscription?.id || !registrationResult.inscription?.coupleId) {
      return NextResponse.json(
        { success: false, message: registrationResult.error || 'No se pudo registrar la pareja' },
        { status: 400 }
      )
    }

    const inscriptionId = registrationResult.inscription.id as string
    const coupleId = registrationResult.inscription.coupleId as string

    const uploadResult = await uploadInscriptionProof({
      tournamentId,
      inscriptionId,
      fileName: proofFile.name,
      fileBytes: await proofFile.arrayBuffer(),
      contentType: proofFile.type || 'application/octet-stream',
    })

    if (!uploadResult.success) {
      await removeCoupleFromTournament(tournamentId, coupleId)

      return NextResponse.json(
        { success: false, message: uploadResult.error || 'No se pudo subir el comprobante' },
        { status: 500 }
      )
    }

    uploadedProofPath = uploadResult.filePath

    const { error: updateError } = await supabase
      .from('inscriptions')
      .update({
        payment_method: trustPolicyEnabled ? 'TRANSFER' : null,
        payment_proof_status: trustPolicyEnabled ? 'APPROVED' : 'PENDING_REVIEW',
        payment_proof_path: uploadResult.filePath,
        payment_proof_uploaded_at: new Date().toISOString(),
        payment_alias_snapshot: tournament.transfer_alias,
        payment_amount_snapshot: totalAmount,
        payment_amount_per_player_snapshot: trustPolicyEnabled ? amountPerPlayer : null,
        payment_total_amount_snapshot: totalAmount,
      })
      .eq('id', inscriptionId)

    if (updateError) {
      await deleteInscriptionProof(uploadResult.filePath)
      await removeCoupleFromTournament(tournamentId, coupleId)

      return NextResponse.json(
        { success: false, message: 'No se pudo guardar la metadata del comprobante' },
        { status: 500 }
      )
    }

    revalidatePath(`/tournaments/${tournamentId}`)
    revalidatePath(`/tournaments/${tournamentId}/inscriptions`)
    revalidatePath(`/my-tournaments/${tournamentId}`)

    if (trustPolicyEnabled) {
      try {
        const { sendTournamentMessage } = await import('@/lib/services/messages')
        await sendTournamentMessage({
          type: 'INSCRIPTION_APPROVED_PLAYER',
          supabase,
          inscriptionId,
        })
        await sendTournamentMessage({
          type: 'INSCRIPTION_APPROVED_ADMIN',
          supabase,
          inscriptionId,
        })
      } catch (messageError) {
        console.error('[couple-with-proof] Error sending approval message:', messageError)
      }
    }

    return NextResponse.json({
      success: true,
      message: trustPolicyEnabled
        ? 'La inscripcion quedo confirmada con el comprobante'
        : 'La inscripcion quedo registrada y pendiente de revision',
      data: {
        inscriptionId,
        coupleId,
        paymentProofStatus: trustPolicyEnabled ? 'APPROVED' : 'PENDING_REVIEW',
      },
    })
  } catch (error) {
    console.error('[couple-with-proof] Unexpected error:', error)

    if (uploadedProofPath) {
      await deleteInscriptionProof(uploadedProofPath)
    }

    return NextResponse.json(
      { success: false, message: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
