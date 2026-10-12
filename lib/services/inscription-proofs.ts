import { randomUUID } from 'crypto'
import { after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const INSCRIPTION_PROOFS_BUCKET = 'inscription-proofs'

function sanitizeFileName(fileName: string): string {
  const normalized = fileName
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || `proof-${randomUUID()}`
}

export function buildInscriptionProofPath(
  tournamentId: string,
  inscriptionId: string,
  fileName: string
): string {
  const safeFileName = sanitizeFileName(fileName)
  return `tournament/${tournamentId}/inscription/${inscriptionId}/${randomUUID()}-${safeFileName}`
}

export async function uploadInscriptionProof(params: {
  tournamentId: string
  inscriptionId: string
  fileName: string
  fileBytes: ArrayBuffer
  contentType: string
}): Promise<{ success: true; filePath: string } | { success: false; error: string; cause?: unknown }> {
  const { tournamentId, inscriptionId, fileName, fileBytes, contentType } = params
  const filePath = buildInscriptionProofPath(tournamentId, inscriptionId, fileName)

  // Persist the orphan ticket first, including uncertain/failed Storage responses.
  const { error: ticketError } = await supabaseAdmin.from('inscription_proof_cleanup').insert({
    path: filePath, available_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  })
  if (ticketError) return { success: false as const, error: 'No se pudo preparar la subida.', cause: ticketError }

  const { error } = await supabaseAdmin.storage
    .from(INSCRIPTION_PROOFS_BUCKET)
    .upload(filePath, Buffer.from(fileBytes), {
      contentType,
      upsert: false,
    })

  if (error) {
    return {
      success: false as const,
      error: error.message,
      cause: error,
    }
  }

  return {
    success: true as const,
    filePath,
  }
}

export async function deleteInscriptionProof(filePath: string | null | undefined) {
  if (!filePath) {
    return { success: true as const }
  }

  // Never remove a live reference. Detached paths have a durable DB trigger ticket.
  const { count, error: readError } = await supabaseAdmin.from('inscriptions')
    .select('id', { head: true, count: 'exact' }).eq('payment_proof_path', filePath)
  if (readError || count !== 0) return { success: false as const, error: 'El archivo sigue asociado o no se pudo verificar.', cause: readError }

  const { error } = await supabaseAdmin.storage
    .from(INSCRIPTION_PROOFS_BUCKET)
    .remove([filePath])

  if (error) {
    return {
      success: false as const,
      error: error.message,
      cause: error,
    }
  }

  return { success: true as const }
}

export const processInscriptionProofCleanup = async (limit = 20): Promise<{ removed: number; deferred: number }> => {
  const { data, error } = await supabaseAdmin.rpc('claim_inscription_proof_cleanup', { p_limit: limit })
  if (error) throw new Error('No se pudo consultar la cola de comprobantes.')
  let removed = 0
  let deferred = 0
  for (const job of (data || []) as Array<{ path: string; claimed_at: string; attempts: number }>) {
    const result = await deleteInscriptionProof(job.path)
    // Compare the claim so an expired worker cannot remove another worker's ticket.
    const query = supabaseAdmin.from('inscription_proof_cleanup')
    const completion = result.success
      ? query.delete().eq('path', job.path).eq('claimed_at', job.claimed_at)
      : query.update({ claimed_at: null, available_at: new Date(Date.now() + Math.min(job.attempts, 24) * 5 * 60 * 1000).toISOString() })
        .eq('path', job.path).eq('claimed_at', job.claimed_at)
    const { error: completionError } = await completion
    if (result.success && !completionError) removed += 1
    else deferred += 1
  }
  return { removed, deferred }
}

export const scheduleInscriptionProofCleanup = (): void => {
  try {
    after(async () => {
      try { await processInscriptionProofCleanup() }
      catch { console.warn('[registration]', { step: 'proof-cleanup', code: 'cleanup_deferred' }) }
    })
  } catch {
    // CLI/SQL callers have no Next request scope. The durable scheduled retry still runs.
  }
}

export async function createInscriptionProofSignedUrl(filePath: string, expiresInSeconds = 60 * 10) {
  const { data, error } = await supabaseAdmin.storage
    .from(INSCRIPTION_PROOFS_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds)

  if (error || !data?.signedUrl) {
    return {
      success: false as const,
      error: error?.message || 'No se pudo generar la URL firmada',
      cause: error,
    }
  }

  return {
    success: true as const,
    signedUrl: data.signedUrl,
  }
}
