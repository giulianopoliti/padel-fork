// Shared, fixed vocabulary. Never send error messages, files or player data here.
export const REGISTRATION_CLIENT_STAGES = [
  'search', 'create-player', 'check-phones', 'update-phone', 'prepare-proof',
  'submit-proof', 'registration', 'view-proof',
] as const
export type RegistrationClientStage = typeof REGISTRATION_CLIENT_STAGES[number]
export const REGISTRATION_CLIENT_CODES = [
  'preparation_failed', 'request_failed', 'response_unreadable', 'request_rejected',
] as const
export type RegistrationClientCode = typeof REGISTRATION_CLIENT_CODES[number]
export const isAttemptId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)

export const createRegistrationAttemptId = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Older embedded browsers expose getRandomValues but not randomUUID.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const registrationErrorMessage = (message: string, attemptId: string): string =>
  `${message} Código: ${attemptId}`

// A timeout does not mean the server rolled back. Callers must consult saved state.
export const fetchRegistrationJson = async (url: string, init?: RequestInit, timeoutMs = 45000) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (response.status === 413) throw new Error('El comprobante debe pesar hasta 4 MB.')
    const data = await response.json()
    return { response, data }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('La conexión demoró demasiado. Vamos a consultar si quedó guardado.')
    throw error
  } finally { clearTimeout(timeout) }
}

export const reportRegistrationClientError = (event: {
  attemptId: string
  tournamentId: string
  stage: RegistrationClientStage
  code: RegistrationClientCode
  status?: number
}): void => {
  // Best effort only: diagnostics must never delay or retry a registration.
  if (typeof window === 'undefined') return
  try {
    void fetch('/api/inscriptions/diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(event),
    }).catch(() => {})
  } catch { /* Browser shutting down or offline. */ }
}
