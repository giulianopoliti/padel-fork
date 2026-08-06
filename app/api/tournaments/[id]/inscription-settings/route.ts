import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'

interface InscriptionSettingsPayload {
  validate_inscriptions: boolean
  enable_public_inscriptions: boolean
  show_few_slots_alert: boolean
  enable_payment_checkboxes: boolean
  enable_transfer_proof: boolean
  enable_trust_based_payment_policy: boolean
  trust_policy_min_played_tournaments: number
  messages_enabled: boolean
  transfer_alias: string | null
  transfer_amount: number | null
  transfer_amount_per_player: number | null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params
    const payload = (await request.json()) as Partial<InscriptionSettingsPayload>
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: 'No autorizado' },
        { status: 401 }
      )
    }

    const permissionCheck = await checkTournamentPermissions(user.id, tournamentId)
    if (!permissionCheck.hasPermission) {
      return NextResponse.json(
        { success: false, message: permissionCheck.reason || 'Sin permisos' },
        { status: 403 }
      )
    }

    const { data: currentTournament, error: currentTournamentError } = await supabase
      .from('tournaments')
      .select(`
        validate_inscriptions,
        enable_public_inscriptions,
        show_few_slots_alert,
        enable_payment_checkboxes,
        enable_transfer_proof,
        enable_trust_based_payment_policy,
        trust_policy_min_played_tournaments,
        messages_enabled,
        transfer_alias,
        transfer_amount,
        transfer_amount_per_player
      `)
      .eq('id', tournamentId)
      .single()

    if (currentTournamentError || !currentTournament) {
      return NextResponse.json(
        { success: false, message: 'No se encontro la configuracion actual del torneo' },
        { status: 404 }
      )
    }

    const validateInscriptions =
      payload.validate_inscriptions ?? currentTournament.validate_inscriptions ?? false
    const enablePublicInscriptions =
      payload.enable_public_inscriptions ?? currentTournament.enable_public_inscriptions ?? true
    const showFewSlotsAlert =
      payload.show_few_slots_alert ?? currentTournament.show_few_slots_alert ?? true
    const enablePaymentCheckboxes =
      payload.enable_payment_checkboxes ?? currentTournament.enable_payment_checkboxes ?? false
    const enableTransferProof =
      payload.enable_transfer_proof ?? currentTournament.enable_transfer_proof ?? false
    const enableTrustBasedPaymentPolicy =
      payload.enable_trust_based_payment_policy ??
      currentTournament.enable_trust_based_payment_policy ??
      false
    const trustPolicyMinPlayedTournaments = Number(
      payload.trust_policy_min_played_tournaments ??
      currentTournament.trust_policy_min_played_tournaments ??
      2
    )
    const messagesEnabled =
      payload.messages_enabled ?? currentTournament.messages_enabled ?? true
    const transferAlias =
      payload.transfer_alias !== undefined
        ? payload.transfer_alias?.trim() || null
        : currentTournament.transfer_alias ?? null
    const rawAmount =
      payload.transfer_amount !== undefined
        ? payload.transfer_amount
        : currentTournament.transfer_amount
    const transferAmount =
      rawAmount === null || rawAmount === undefined || Number.isNaN(Number(rawAmount))
        ? null
        : Number(rawAmount)
    const rawAmountPerPlayer =
      payload.transfer_amount_per_player !== undefined
        ? payload.transfer_amount_per_player
        : currentTournament.transfer_amount_per_player
    const transferAmountPerPlayer =
      rawAmountPerPlayer === null || rawAmountPerPlayer === undefined || Number.isNaN(Number(rawAmountPerPlayer))
        ? null
        : Number(rawAmountPerPlayer)
    const touchesTrustPaymentPolicy =
      payload.enable_trust_based_payment_policy !== undefined ||
      payload.trust_policy_min_played_tournaments !== undefined ||
      payload.transfer_alias !== undefined ||
      payload.transfer_amount_per_player !== undefined

    if (enableTransferProof) {
      if (!transferAlias) {
        return NextResponse.json(
          { success: false, message: 'El alias es obligatorio cuando la transferencia está activa' },
          { status: 400 }
        )
      }

      if (transferAmount === null || transferAmount <= 0) {
        return NextResponse.json(
          { success: false, message: 'El importe a transferir por pareja debe ser mayor a 0 cuando la transferencia esta activa' },
          { status: 400 }
        )
      }
    }

    if (enableTrustBasedPaymentPolicy && touchesTrustPaymentPolicy) {
      if (!transferAlias) {
        return NextResponse.json(
          { success: false, message: 'El alias es obligatorio cuando la politica de pago esta activa' },
          { status: 400 }
        )
      }

      if (trustPolicyMinPlayedTournaments < 0) {
        return NextResponse.json(
          { success: false, message: 'La cantidad minima de torneos no puede ser negativa' },
          { status: 400 }
        )
      }

      if (transferAmountPerPlayer === null || transferAmountPerPlayer <= 0) {
        return NextResponse.json(
          { success: false, message: 'La seña por jugador debe ser mayor a 0 cuando la politica de pago esta activa' },
          { status: 400 }
        )
      }
    }

    const updatePayload: Record<string, unknown> = {
      validate_inscriptions: validateInscriptions,
      enable_public_inscriptions: enablePublicInscriptions,
      show_few_slots_alert: showFewSlotsAlert,
      enable_payment_checkboxes: enablePaymentCheckboxes,
      enable_transfer_proof: enableTransferProof,
      enable_trust_based_payment_policy: enableTrustBasedPaymentPolicy,
      trust_policy_min_played_tournaments: trustPolicyMinPlayedTournaments,
      messages_enabled: messagesEnabled,
      transfer_alias: transferAlias,
      transfer_amount: transferAmount,
      transfer_amount_per_player: transferAmountPerPlayer,
    }

    const shouldApprovePendingInscriptions =
      currentTournament.validate_inscriptions === true && validateInscriptions === false

    const { data: pendingInscriptionsToNotify } = shouldApprovePendingInscriptions
      ? await supabase
          .from('inscriptions')
          .select('id')
          .eq('tournament_id', tournamentId)
          .eq('is_pending', true)
      : { data: [] }

    const { error: updateError } = await supabase
      .from('tournaments')
      .update(updatePayload)
      .eq('id', tournamentId)

    if (updateError) {
      return NextResponse.json(
        { success: false, message: updateError.message },
        { status: 500 }
      )
    }

    if (pendingInscriptionsToNotify && pendingInscriptionsToNotify.length > 0) {
      try {
        const { sendTournamentMessage } = await import('@/lib/services/messages')
        await Promise.allSettled(
          pendingInscriptionsToNotify.map((inscription) =>
            sendTournamentMessage({
              type: 'INSCRIPTION_APPROVED_PLAYER',
              supabase,
              inscriptionId: inscription.id,
            })
          )
        )
      } catch (messageError) {
        console.error('[inscription-settings] Error sending approval messages:', messageError)
      }
    }

    revalidatePath(`/tournaments/${tournamentId}`)
    revalidatePath(`/tournaments/${tournamentId}/settings`, 'layout')
    revalidatePath(`/tournaments/${tournamentId}/inscriptions`)
    revalidatePath('/tournaments')
    revalidatePath('/panel')
    revalidatePath('/')

    return NextResponse.json({
      success: true,
      message: 'Configuración de inscripciones actualizada',
      data: updatePayload,
    })
  } catch (error) {
    console.error('[inscription-settings] Unexpected error:', error)
    return NextResponse.json(
      { success: false, message: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
