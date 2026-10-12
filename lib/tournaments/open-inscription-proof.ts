import { createRegistrationAttemptId, registrationErrorMessage, reportRegistrationClientError } from './registration-diagnostics'

export const openInscriptionProof = async (tournamentId: string, inscriptionId: string): Promise<void> => {
  const attemptId = createRegistrationAttemptId()
  // Open during the click, before the network await, to preserve user activation.
  const tab = window.open('about:blank', '_blank')
  if (!tab) throw new Error('El navegador bloqueó la pestaña. Permití las ventanas emergentes para ver el comprobante.')
  tab.opener = null
  let status: number | undefined
  try {
    const response = await fetch(`/api/tournaments/${tournamentId}/inscriptions/${inscriptionId}/proof`, {
      headers: { 'x-registration-attempt': attemptId },
    })
    status = response.status
    const result = await response.json()
    if (!response.ok || result?.success !== true || typeof result.url !== 'string') {
      throw new Error('No se pudo abrir el comprobante. Volvé a intentar.')
    }
    const url = new URL(result.url)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      throw new Error('No se pudo abrir el comprobante.')
    }
    if (!tab.closed) tab.location.replace(url.href)
  } catch {
    tab.close()
    reportRegistrationClientError({ attemptId, tournamentId, stage: 'view-proof',
      code: status === undefined ? 'request_failed' : status >= 400 ? 'request_rejected' : 'response_unreadable', status })
    throw new Error(registrationErrorMessage('No se pudo abrir el comprobante. Volvé a intentar.', attemptId))
  }
}
