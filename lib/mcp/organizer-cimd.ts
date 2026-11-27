import 'server-only'

export const organizerCimdClientId = 'https://chatgpt.com/oauth/client.json'
export const organizerCimdRedirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect'
const maxDocumentBytes = 16 * 1024
const maxCacheMs = 5 * 60 * 1000

type ClientMetadata = { redirectUris: string[] }
type MetadataCache = { value: ClientMetadata; expiresAt: number }
let metadataCache: MetadataCache | undefined
let pendingMetadata: Promise<ClientMetadata | null> | undefined

const includesValue = (value: unknown, expected: string): boolean =>
  Array.isArray(value) && value.every(item => typeof item === 'string') && value.includes(expected)

const validateMetadata = (value: unknown): ClientMetadata | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  if (data.client_id !== organizerCimdClientId) return null
  // Use the supported-method intersection, not the legacy singular preference.
  const methods = data.token_endpoint_auth_methods_supported !== undefined
    ? data.token_endpoint_auth_methods_supported : [data.token_endpoint_auth_method]
  if (!includesValue(methods, 'none')) return null
  if (data.grant_types !== undefined && !includesValue(data.grant_types, 'authorization_code')) return null
  if (data.response_types !== undefined && !includesValue(data.response_types, 'code')) return null
  if (!Array.isArray(data.redirect_uris) || data.redirect_uris.length === 0 ||
    data.redirect_uris.some(uri => uri !== organizerCimdRedirectUri)) return null
  return { redirectUris: [...data.redirect_uris] as string[] }
}

const fetchMetadata = async (): Promise<ClientMetadata | null> => {
  try {
    // Only this fixed HTTPS URL is fetched. Never follow a redirect or fetch a
    // document URL supplied by an untrusted OAuth request.
    const response = await fetch(organizerCimdClientId, {
      headers: { Accept: 'application/json' }, redirect: 'manual', cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (response.status !== 200 || response.redirected ||
      response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' ||
      Number(response.headers.get('content-length')) > maxDocumentBytes || !response.body) {
      await response.body?.cancel()
      return null
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxDocumentBytes) {
          await reader.cancel()
          return null
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
    const metadata = validateMetadata(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    if (!metadata) return null
    const control = response.headers.get('cache-control') ?? ''
    const maxAge = control.match(/(?:^|,)\s*max-age=(\d+)/i)?.[1]
    const ttl = /(?:^|,)\s*(?:no-store|no-cache)\b/i.test(control) ? 0
      : Math.min(maxCacheMs, maxAge === undefined ? maxCacheMs : Number(maxAge) * 1000)
    metadataCache = { value: metadata, expiresAt: Date.now() + ttl }
    return metadata
  } catch {
    // A discovery outage must not turn into permission to use unvalidated metadata.
    return null
  }
}

export const isOrganizerCimdClient = async (clientId: string, redirectUri: string): Promise<boolean> => {
  if (clientId !== organizerCimdClientId || redirectUri !== organizerCimdRedirectUri) return false
  if (metadataCache && metadataCache.expiresAt > Date.now()) {
    return metadataCache.value.redirectUris.includes(redirectUri)
  }
  if (!pendingMetadata) pendingMetadata = fetchMetadata().finally(() => { pendingMetadata = undefined })
  const metadata = await pendingMetadata
  return metadata?.redirectUris.includes(redirectUri) ?? false
}
