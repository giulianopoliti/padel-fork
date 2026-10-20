import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getUserDetails } from '@/utils/db/getUserDetails'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { registerCoupleForTournament } from '@/app/api/tournaments/actions'
import { uploadInscriptionProof, scheduleInscriptionProofCleanup } from '@/lib/services/inscription-proofs'
import { createRegistrationTrace } from '@/lib/tournaments/registration-log'
import { MAX_INSCRIPTION_PROOF_BYTES, validateInscriptionProof } from '@/lib/tournaments/inscription-proof'
import { reconcileCompleteInscriptions } from '@/lib/services/registration/reconcile-complete-inscriptions'
import type { ProofApprovalArgs } from '@/lib/tournaments/payment-types'

type RouteContext = { params: Promise<{ id: string }> }
class PaymentContextError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
const columns = 'id, couple_id, player_id, payment_method, payment_proof_path, payment_proof_status, payment_proof_uploaded_at, payment_alias_snapshot, payment_amount_snapshot, payment_reviewed_at, payment_reviewed_by, is_pending, payment_revision'
const loadContext = async (request: NextRequest, context: RouteContext, trace: ReturnType<typeof createRegistrationTrace>) => {
  const { id: tournamentId } = await context.params
  trace.tournament(tournamentId)
  trace.step('authentication')
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) { trace.log('session_unavailable', 'warn', error); throw new PaymentContextError('Debes iniciar sesión para continuar.', 401) }
  const profile = await getUserDetails()
  if (!profile) throw new PaymentContextError('No se pudo cargar tu perfil.', 403)
  const { data: tournament, error: tournamentError } = await supabase.from('tournaments')
    .select('id, name, type, allow_cash_payment, enable_transfer_proof, transfer_alias, transfer_amount, validate_inscriptions')
    .eq('id', tournamentId).single()
  if (tournamentError || !tournament) { trace.log('tournament_unavailable', 'error', tournamentError); throw new PaymentContextError('No se pudo cargar el torneo.', 404) }
  const manager = profile.role !== 'PLAYER' && (await checkTournamentPermissions(user.id, tournamentId)).hasPermission
  const ownCouples = profile.player_id ? await supabaseAdmin.from('couples').select('id, player1_id, player2_id')
    .or(`player1_id.eq.${profile.player_id},player2_id.eq.${profile.player_id}`) : { data: [], error: null }
  if (ownCouples.error) throw new Error('No se pudo consultar tu inscripción.')
  const findInscription = async (inscriptionId?: string | null, coupleOnly = false) => {
    let query = supabaseAdmin.from('inscriptions').select(columns).eq('tournament_id', tournamentId)
    if (inscriptionId) query = query.eq('id', inscriptionId)
    else if (profile.player_id) query = query.or(`and(couple_id.is.null,player_id.eq.${profile.player_id})${ownCouples.data?.length ? `,couple_id.in.(${ownCouples.data.map(c => c.id).join(',')})` : ''}`)
    else return null
    if (coupleOnly) query = query.not('couple_id', 'is', null)
    const { data, error: queryError } = await query.maybeSingle()
    if (queryError) throw new Error('No se pudo consultar la inscripción.')
    const owns = data && (data.couple_id ? (ownCouples.data || []).some(c => c.id === data.couple_id) : data.player_id === profile.player_id)
    if (data && !manager && !owns) throw new PaymentContextError('No tenés permiso para esta inscripción.', 403)
    return data
  }
  return { trace, tournamentId, tournament, profile, manager, userId: user.id, ownCouples: ownCouples.data || [], findInscription }
}

const present = (inscription: Record<string, any> | null, enableTransferProof = true) => inscription ? {
  id: inscription.id, method: inscription.payment_method, hasProof: !!inscription.payment_proof_path,
  proofStatus: inscription.payment_proof_status, isPending: inscription.is_pending,
  alias: inscription.payment_alias_snapshot, amount: inscription.payment_amount_snapshot,
  revision: inscription.payment_revision, uploadedAt: inscription.payment_proof_uploaded_at,
  reviewedAt: inscription.payment_reviewed_at,
  individual: !inscription.couple_id,
  proofRequired: enableTransferProof && inscription.payment_method === 'TRANSFER',
} : null

export const GET = async (request: NextRequest, context: RouteContext) => {
  const trace = createRegistrationTrace(request.headers, 'inscription-payment-read')
  try {
    const ctx = await loadContext(request, context, trace)
    if (request.nextUrl.searchParams.has('list')) {
      if (!ctx.manager) return trace.reply({ success: false, message: 'Sin permisos' }, 403, 'permission_denied')
      const { data, error } = await supabaseAdmin.from('inscriptions').select(columns).eq('tournament_id', ctx.tournamentId)
      if (error) return trace.reply({ success: false }, 500, 'payments_query_failed', error)
      return trace.reply({ success: true, inscription: null, inscriptions: (data || []).map(row => present(row, ctx.tournament.enable_transfer_proof)),
        incompleteCount: ctx.tournament.enable_transfer_proof ? (data || []).filter(row => row.couple_id && row.payment_method === 'TRANSFER' && !row.payment_proof_path).length : 0,
        manager: ctx.manager, tournamentName: ctx.tournament.name,
        settings: { cash: ctx.tournament.allow_cash_payment, transfer: ctx.tournament.enable_transfer_proof,
          alias: ctx.tournament.transfer_alias, amount: ctx.tournament.transfer_amount } }, 200, 'complete')
    }
    if (request.nextUrl.searchParams.has('incomplete')) {
      if (!ctx.manager) return ctx.trace.reply({ success: false, message: 'Sin permisos' }, 403, 'permission_denied')
      if (!ctx.tournament.enable_transfer_proof) return ctx.trace.reply({ success: true, incompleteCount: 0 }, 200, 'complete')
      const { count, error } = await supabaseAdmin.from('inscriptions').select('id', { head: true, count: 'exact' })
        .eq('tournament_id', ctx.tournamentId).not('couple_id', 'is', null).eq('payment_method', 'TRANSFER').is('payment_proof_path', null)
      if (error) return ctx.trace.reply({ success: false }, 500, 'incomplete_query_failed', error)
      return ctx.trace.reply({ success: true, incompleteCount: count || 0 }, 200, 'complete')
    }
    const inscription = await ctx.findInscription(request.nextUrl.searchParams.get('inscriptionId'))
    return ctx.trace.reply({ success: true, inscription: present(inscription, ctx.tournament.enable_transfer_proof), manager: ctx.manager, tournamentName: ctx.tournament.name, settings: {
      cash: ctx.tournament.allow_cash_payment, transfer: ctx.tournament.enable_transfer_proof,
      alias: ctx.tournament.transfer_alias, amount: ctx.tournament.transfer_amount,
    } }, 200, 'complete')
  } catch (error) {
    return trace.reply({ success: false, message: error instanceof PaymentContextError ? error.message : 'No se pudo consultar la inscripción.' }, error instanceof PaymentContextError ? error.status : 500, 'read_failed', error)
  }
}

export const POST = async (request: NextRequest, context: RouteContext) => {
  const trace = createRegistrationTrace(request.headers, 'inscription-payment-write')
  try {
    const ctx = await loadContext(request, context, trace)
    const { tournamentId, tournament, profile } = ctx
    trace.step('read-form')
    const form = await request.formData()
    const operation = String(form.get('operation') || 'attach')
    if (operation === 'approve-proof' && !form.get('inscriptionId')) {
      return trace.reply({ success: false, message: 'Elegí la inscripción antes de aprobar.' }, 400, 'inscription_id_missing')
    }
    let inscription = await ctx.findInscription(String(form.get('inscriptionId') || '') || null, operation === 'reserve')
    if (operation === 'reserve') {
      if (profile.role !== 'PLAYER' || !profile.player_id) return trace.reply({ success: false, message: 'Necesitás un perfil de jugador.' }, 403, 'player_required')
      const companionId = String(form.get('player2Id') || '')
      const method = form.get('method')
      if (method !== 'CASH' && method !== 'TRANSFER' && method !== 'NONE') return trace.reply({ success: false, message: 'Elegí una forma de pago válida.' }, 400, 'method_invalid')
      if (method === 'CASH' && !tournament.allow_cash_payment) return trace.reply({ success: false, message: 'Este torneo no permite efectivo.' }, 400, 'cash_disabled')
      if (method === 'TRANSFER' && !tournament.enable_transfer_proof) return trace.reply({ success: false, message: 'Este torneo no acepta transferencias.' }, 400, 'transfer_disabled')
      if (inscription) {
        const couple = ctx.ownCouples.find(c => c.id === inscription?.couple_id)
        if (!couple || ![couple.player1_id, couple.player2_id].includes(companionId)) {
          return trace.reply({ success: false, message: 'Ya tenés otra pareja inscrita. Revisá Mis torneos.' }, 409, 'different_couple_exists')
        }
      } else {
        trace.step('save-inscription')
        const result = await registerCoupleForTournament(tournamentId, profile.player_id, companionId, false,
          form.get('termsAccepted') === 'true', false, trace.attemptId, method === 'CASH' ? 'CASH' : tournament.enable_transfer_proof ? 'TRANSFER' : undefined)
        // Another concurrent request may have won. Reload rather than insert twice.
        const refreshed = await loadContext(request, context, trace)
        inscription = await refreshed.findInscription(undefined, true)
        const couple = inscription && refreshed.ownCouples.find(c => c.id === inscription?.couple_id)
        if (!inscription || !couple || ![couple.player1_id, couple.player2_id].includes(companionId)) {
          return trace.reply({ success: false, message: result.error || 'No se pudo guardar la inscripción.' }, 400, 'registration_rejected')
        }
      }
    } else if (!inscription) {
      return trace.reply({ success: false, message: 'La inscripción ya no existe. Revisá el torneo.' }, 404, 'inscription_missing')
    } else if (operation === 'approve-proof') {
      if (!ctx.manager) return trace.reply({ success: false, message: 'Sólo el organizador puede aprobar el comprobante.' }, 403, 'permission_denied')
      const revisionText = form.get('revision')
      const revision = Number(revisionText)
      if (!form.get('inscriptionId') || typeof revisionText !== 'string' || !/^\d+$/.test(revisionText) || !Number.isSafeInteger(revision)) {
        return trace.reply({ success: false, message: 'Actualizá el pago antes de aprobar.' }, 400, 'revision_missing')
      }
      if (!inscription.payment_proof_path || !['PENDING_REVIEW', 'APPROVED'].includes(inscription.payment_proof_status)) {
        return trace.reply({ success: false, message: 'No hay un comprobante pendiente de revisión.' }, 400, 'proof_not_pending')
      }
      const path = inscription.payment_proof_path
      trace.step('approve-proof')
      const { data, error } = await supabaseAdmin.rpc('approve_inscription_proof', {
        p_id: inscription.id, p_tournament_id: tournamentId, p_revision: revision,
        p_path: path, p_reviewer: ctx.userId,
      } satisfies ProofApprovalArgs)
      if (error || !data?.[0]) {
        const saved = await ctx.findInscription(inscription.id)
        if (saved && saved.payment_revision === revision + 1 && saved.payment_proof_path === path &&
          saved.payment_proof_status === 'APPROVED' && saved.payment_reviewed_at) inscription = saved
        else return trace.reply({ success: false, message: 'El comprobante cambió o no se pudo confirmar. Consultá el estado antes de aprobar.' },
          error?.code === '42501' ? 403 : error?.code === 'P0002' ? 404 : error?.code === '22023' ? 400 : 409, 'proof_approval_unconfirmed', error)
      } else inscription = data[0]
    } else if (['cash', 'transfer', 'attach', 'replace', 'remove'].includes(operation)) {
      // Attaching never replaces a partner's file, including retries from older tabs.
      if (operation === 'attach' && inscription.payment_proof_path) {
        return trace.reply({ success: false, code: 'proof_already_attached', inscription: present(inscription, tournament.enable_transfer_proof),
          message: 'Tu compañero ya adjuntó un comprobante' }, 409, 'already_attached')
      }
      if (operation !== 'attach' && !form.has('revision')) return trace.reply({ success: false, message: 'Actualizá el pago antes de guardar.' }, 400, 'revision_missing')
      const revision = form.has('revision') ? Number(form.get('revision')) : inscription.payment_revision
      if (!Number.isInteger(revision) || revision < 0) return trace.reply({ success: false, message: 'Actualizá el pago antes de guardar.' }, 400, 'revision_missing')
      if (!ctx.manager && inscription.payment_proof_status === 'APPROVED') {
        return trace.reply({ success: false, message: 'El comprobante aprobado sólo puede modificarlo el organizador.' }, 403, 'proof_approved')
      }
      if (revision !== inscription.payment_revision) return trace.reply({ success: false, message: 'El pago cambió. Actualizá antes de guardar.' }, 409, 'payment_conflict')
      if (operation === 'cash' && !tournament.allow_cash_payment) return trace.reply({ success: false, message: 'Este torneo no permite efectivo.' }, 400, 'cash_disabled')
      if (operation === 'transfer' && !tournament.enable_transfer_proof) return trace.reply({ success: false, message: 'Este torneo no acepta transferencias.' }, 400, 'transfer_disabled')
      let filePath: string | null = null
      if (operation === 'attach' || operation === 'replace') {
        if (inscription.payment_method !== 'TRANSFER' && !(inscription.payment_method === null && inscription.payment_proof_path)) return trace.reply({ success: false, message: 'Elegí transferencia antes de subir el comprobante.' }, 400, 'proof_not_required')
        const file = form.get('proof')
        if (!(file instanceof File)) return trace.reply({ success: false, message: 'Elegí un comprobante.' }, 400, 'file_missing')
        const validation = validateInscriptionProof(file)
        if (validation) return trace.reply({ success: false, message: validation }, file.size > MAX_INSCRIPTION_PROOF_BYTES ? 413 : 400, 'file_rejected')
        trace.step('storage-upload')
        const upload = await uploadInscriptionProof({ tournamentId, inscriptionId: inscription.id, fileName: file.name,
          fileBytes: await file.arrayBuffer(), contentType: file.type })
        if (!upload.success) return trace.reply({ success: false, message: 'Tu inscripción sigue guardada. No se pudo subir el archivo; podés intentar de nuevo.' }, 500, 'storage_upload_failed', upload.cause)
        filePath = upload.filePath
      }
      trace.step('save-payment')
      const { data, error } = await supabaseAdmin.rpc('change_inscription_payment', {
        p_id: inscription.id, p_tournament_id: tournamentId, p_revision: revision,
        p_operation: operation, p_path: filePath, p_manager: ctx.manager,
      })
      if (error || !data?.[0]) {
        // A lost response can follow a committed write. Never repeat blindly or delete a live file.
        const saved = await ctx.findInscription(inscription.id)
        const confirmed = saved && saved.payment_revision === revision + 1 && (
          filePath ? saved.payment_proof_path === filePath : operation === 'remove' ? !saved.payment_proof_path :
            saved.payment_method === (operation === 'cash' ? 'CASH' : 'TRANSFER') && !saved.payment_proof_path)
        if (confirmed) inscription = saved
        else if (operation === 'attach' && saved?.payment_proof_path) {
          scheduleInscriptionProofCleanup()
          return trace.reply({ success: false, code: 'proof_already_attached', inscription: present(saved, tournament.enable_transfer_proof),
            message: 'Tu compañero ya adjuntó un comprobante' }, 409, 'already_attached', error)
        } else return trace.reply({ success: false, message: 'El pago cambió o no se pudo confirmar. Consultá el estado antes de repetir.' },
          error?.code === '42501' ? 403 : 409, 'payment_unconfirmed', error)
      } else inscription = data[0]
      scheduleInscriptionProofCleanup()
    } else return trace.reply({ success: false, message: 'Acción inválida.' }, 400, 'operation_invalid')

    let assignmentPending = false
    if (operation !== 'approve-proof') {
      try { assignmentPending = (await reconcileCompleteInscriptions(tournamentId)) === 'WAITING_PROOF' }
      catch (error) { assignmentPending = true; trace.log('zone_reconciliation_deferred', 'error', error) }
    }
    if ((operation === 'attach' || operation === 'cash') && inscription) {
      try {
        const { sendTournamentMessage } = await import('@/lib/services/messages')
        const result = await sendTournamentMessage({ type: 'INSCRIPTION_APPROVED_PLAYER', supabase: supabaseAdmin, inscriptionId: inscription.id })
        if (result.some(message => !message.success)) trace.log('confirmation_message_failed', 'warn')
      } catch (error) { trace.log('confirmation_message_failed', 'warn', error) }
    }
    try {
      revalidatePath(`/tournaments/${tournamentId}`)
      revalidatePath(`/tournaments/${tournamentId}/inscriptions`)
      revalidatePath('/my-tournaments')
      revalidatePath('/panel')
      revalidatePath('/torneos', 'layout')
      revalidatePath('/tournaments', 'layout')
    } catch (error) { trace.log('refresh_failed_after_save', 'error', error) }
    return trace.reply({ success: true, inscription: present(inscription, tournament.enable_transfer_proof),
      message: assignmentPending ? 'Cambios guardados. Pendiente de asignación; completá los comprobantes faltantes o reintentá la asignación.' : undefined }, 200, 'complete')
  } catch (error) {
    return trace.reply({ success: false, message: error instanceof PaymentContextError ? error.message : 'No se pudo confirmar el resultado. Tu inscripción no se cancela por una falla del archivo. Actualizá antes de repetir.' }, error instanceof PaymentContextError ? error.status : 500, 'result_unknown', error)
  }
}
