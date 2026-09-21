import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getUserDetails } from '@/utils/db/getUserDetails'
import { registerCoupleForTournament, removeCoupleFromTournament } from '@/app/api/tournaments/actions'
import { uploadInscriptionProof, deleteInscriptionProof } from '@/lib/services/inscription-proofs'
import { MAX_INSCRIPTION_PROOF_BYTES, validateInscriptionProof } from '@/lib/tournaments/inscription-proof'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let uploadedProofPath: string | null = null
  let stage: 'upload' | 'registration' = 'upload'
  let proofMetadata: { size: number; type: string } | undefined

  try {
    const { id: tournamentId } = await params
    const supabase = await createClient()

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

    const formData = await request.formData()
    const player1Id = String(formData.get('player1Id') || '')
    const player2Id = String(formData.get('player2Id') || '')
    const termsAccepted = formData.get('termsAccepted') === 'true'
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

    proofMetadata = { size: proofFile.size, type: proofFile.type }
    const proofError = validateInscriptionProof(proofFile)
    if (proofError) {
      const status = proofFile.size > MAX_INSCRIPTION_PROOF_BYTES ? 413 : 400
      console.warn('[couple-with-proof]', { stage, status, ...proofMetadata })
      return NextResponse.json(
        { success: false, message: proofError, stage },
        { status }
      )
    }

    stage = 'registration'
    console.info('[couple-with-proof]', { stage: 'received', ...proofMetadata })
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, name, enable_transfer_proof, transfer_alias, transfer_amount')
      .eq('id', tournamentId)
      .single()

    if (tournamentError || !tournament) {
      return NextResponse.json(
        { success: false, message: 'Torneo no encontrado' },
        { status: 404 }
      )
    }

    if (!tournament.enable_transfer_proof) {
      return NextResponse.json(
        { success: false, message: 'Este torneo no acepta comprobantes de transferencia' },
        { status: 400 }
      )
    }

    if (!tournament.transfer_alias || !tournament.transfer_amount) {
      return NextResponse.json(
        { success: false, message: 'El torneo no tiene alias y monto configurados' },
        { status: 400 }
      )
    }

    const registrationResult = await registerCoupleForTournament(tournamentId, player1Id, player2Id, false, termsAccepted)

    if (!registrationResult.success || !registrationResult.inscription?.id || !registrationResult.inscription?.coupleId) {
      console.warn('[couple-with-proof]', { stage, status: 400, ...proofMetadata })
      return NextResponse.json(
        { success: false, message: registrationResult.error || 'No se pudo registrar la pareja' },
        { status: 400 }
      )
    }

    const inscriptionId = registrationResult.inscription.id as string
    const coupleId = registrationResult.inscription.coupleId as string

    stage = 'upload'
    const uploadResult = await uploadInscriptionProof({
      tournamentId,
      inscriptionId,
      fileName: proofFile.name,
      fileBytes: await proofFile.arrayBuffer(),
      contentType: proofFile.type || 'application/octet-stream',
    })

    if (!uploadResult.success) {
      console.warn('[couple-with-proof]', { stage, status: 500, ...proofMetadata })
      await removeCoupleFromTournament(tournamentId, coupleId)

      return NextResponse.json(
        { success: false, message: 'No se pudo guardar el comprobante. Intentá con otro archivo.', stage },
        { status: 500 }
      )
    }

    uploadedProofPath = uploadResult.filePath
    stage = 'registration'

    const { error: updateError } = await supabase
      .from('inscriptions')
      .update({
        payment_proof_status: 'PENDING_REVIEW',
        payment_proof_path: uploadResult.filePath,
        payment_proof_uploaded_at: new Date().toISOString(),
        payment_alias_snapshot: tournament.transfer_alias,
        payment_amount_snapshot: tournament.transfer_amount,
      })
      .eq('id', inscriptionId)

    if (updateError) {
      console.warn('[couple-with-proof]', { stage, status: 500, ...proofMetadata })
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

    console.info('[couple-with-proof]', { stage: 'complete', status: 200, ...proofMetadata })
    return NextResponse.json({
      success: true,
      message: 'La inscripción quedó registrada y pendiente de revisión',
      data: {
        inscriptionId,
        coupleId,
        paymentProofStatus: 'PENDING_REVIEW',
      },
    })
  } catch (error) {
    console.error('[couple-with-proof]', { stage, status: 500, ...proofMetadata })

    if (uploadedProofPath) {
      await deleteInscriptionProof(uploadedProofPath)
    }

    return NextResponse.json(
      { success: false, message: 'No se pudo confirmar la inscripción. Revisá Mis torneos antes de reintentar.', stage },
      { status: 500 }
    )
  }
}
