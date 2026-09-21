import { INSCRIPTION_PROOF_SIZE_ERROR, validateInscriptionProof } from './inscription-proof'

export type ProofRegistrationResult =
  | { success: true }
  | { success: false; error: string; stage: 'upload' | 'registration' }

const UNCONFIRMED_MESSAGE =
  'No se pudo confirmar la inscripción. Revisá Mis torneos antes de reintentar para evitar enviarla dos veces.'

export const submitInscriptionProof = async (params: {
  tournamentId: string
  player1Id: string
  player2Id: string
  termsAccepted: boolean
  file: File
}): Promise<ProofRegistrationResult> => {
  const validationError = validateInscriptionProof(params.file)
  if (validationError) return { success: false, error: validationError, stage: 'upload' }

  const formData = new FormData()
  formData.append('player1Id', params.player1Id)
  formData.append('player2Id', params.player2Id)
  formData.append('termsAccepted', String(params.termsAccepted))
  formData.append('proof', params.file)

  let status: number | undefined
  try {
    // Never retry this mutation automatically: a lost response may hide a saved inscription.
    const response = await fetch(`/api/tournaments/${params.tournamentId}/inscriptions/couple-with-proof`, {
      method: 'POST',
      body: formData,
    })
    status = response.status
    if (status === 413) {
      console.warn('[inscription-proof]', { stage: 'upload', status, size: params.file.size, type: params.file.type })
      return { success: false, error: INSCRIPTION_PROOF_SIZE_ERROR, stage: 'upload' }
    }

    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object') throw new Error('Invalid response')
    const result = payload as { success?: unknown; message?: unknown; stage?: unknown }
    if (response.ok && result.success === true) return { success: true }

    const stage = result.stage === 'upload' ? 'upload' : 'registration'
    console.warn('[inscription-proof]', { stage, status, size: params.file.size, type: params.file.type })
    return {
      success: false,
      stage,
      error: typeof result.message === 'string' && result.message
        ? result.message
        : UNCONFIRMED_MESSAGE,
    }
  } catch {
    console.error('[inscription-proof]', { stage: 'upload-response', status, size: params.file.size, type: params.file.type })
    return { success: false, error: UNCONFIRMED_MESSAGE, stage: 'upload' }
  }
}
