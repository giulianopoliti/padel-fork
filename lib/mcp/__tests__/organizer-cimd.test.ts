export {}

jest.mock('server-only', () => ({}))

const clientId = 'https://chatgpt.com/oauth/client.json'
const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect'
const document = {
  client_id: clientId, redirect_uris: [redirectUri],
  token_endpoint_auth_method: 'private_key_jwt',
  token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
  grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
}
const metadataResponse = (value: unknown = document, headers: HeadersInit = {}) =>
  Response.json(value, { headers })
const originalFetch = global.fetch
let isClient: typeof import('../organizer-cimd').isOrganizerCimdClient

beforeEach(async () => {
  jest.resetModules()
  global.fetch = jest.fn().mockImplementation(async () => metadataResponse())
  ;({ isOrganizerCimdClient: isClient } = await import('../organizer-cimd'))
})

afterEach(() => {
  global.fetch = originalFetch
  jest.useRealTimers()
})

it('selects none from the published method intersection even when the singular preference is private_key_jwt', async () => {
  expect(await isClient(clientId, redirectUri)).toBe(true)
  expect(fetch).toHaveBeenCalledWith(clientId, expect.objectContaining({
    redirect: 'manual', cache: 'no-store', headers: { Accept: 'application/json' }, signal: expect.any(AbortSignal),
  }))
})

it.each([
  'http://chatgpt.com/oauth/client.json', 'https://chatgpt.com.evil.example/oauth/client.json',
  'https://chatgpt.com@evil.example/oauth/client.json', 'https://127.0.0.1/oauth/client.json',
  'https://chatgpt.com/oauth/client.json?extra=1', 'https://chatgpt.com/oauth/client.json#fragment',
  'https://chatgpt.com/oauth/another/client.json', 'padelfv-chatgpt',
])('rejects an unapproved client identifier without any network request: %s', async value => {
  expect(await isClient(value, redirectUri)).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
})

it.each(['https://attacker.example/callback', `${redirectUri}/other`, `${redirectUri}?extra=1`])('rejects a different callback without fetching metadata: %s', async callback => {
  expect(await isClient(clientId, callback)).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
})

it.each([
  null, [], {}, { ...document, client_id: 'https://attacker.example/client.json' },
  { ...document, redirect_uris: ['https://attacker.example/callback'] },
  { ...document, redirect_uris: [redirectUri, 'https://attacker.example/callback'] },
  { ...document, redirect_uris: [] }, { ...document, redirect_uris: redirectUri },
  { ...document, token_endpoint_auth_methods_supported: ['private_key_jwt'] },
  { ...document, token_endpoint_auth_methods_supported: 'none' },
  { ...document, token_endpoint_auth_methods_supported: null, token_endpoint_auth_method: 'none' },
  { ...document, grant_types: ['client_credentials'] }, { ...document, response_types: ['token'] },
])('fails closed for incompatible metadata %#', async value => {
  jest.mocked(fetch).mockResolvedValue(metadataResponse(value))
  expect(await isClient(clientId, redirectUri)).toBe(false)
})

it('supports the singular method when no plural field was published', async () => {
  jest.mocked(fetch).mockResolvedValue(metadataResponse({
    client_id: clientId, redirect_uris: [redirectUri], token_endpoint_auth_method: 'none',
  }))
  expect(await isClient(clientId, redirectUri)).toBe(true)
})

it('never follows redirects, including a redirect to an internal address', async () => {
  jest.mocked(fetch).mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }))
  expect(await isClient(clientId, redirectUri)).toBe(false)
  expect(fetch).toHaveBeenCalledTimes(1)
})

it.each([
  () => new Response('not-json', { headers: { 'Content-Type': 'application/json' } }),
  () => new Response(JSON.stringify(document), { headers: { 'Content-Type': 'text/html' } }),
  () => new Response(null, { status: 503 }),
  () => metadataResponse(document, { 'Content-Length': '999999' }),
  () => new Response(' '.repeat(17 * 1024), { headers: { 'Content-Type': 'application/json' } }),
])('rejects failed, invalid or oversized metadata %#', async createResponse => {
  jest.mocked(fetch).mockResolvedValue(createResponse())
  expect(await isClient(clientId, redirectUri)).toBe(false)
})

it('recovers from an outage without caching the failure', async () => {
  jest.mocked(fetch).mockRejectedValueOnce(new Error('timeout'))
  expect(await isClient(clientId, redirectUri)).toBe(false)
  expect(await isClient(clientId, redirectUri)).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('shares in-flight discovery and expires the cache within five minutes', async () => {
  jest.useFakeTimers()
  const now = Date.now()
  expect(await Promise.all([isClient(clientId, redirectUri), isClient(clientId, redirectUri)])).toEqual([true, true])
  expect(fetch).toHaveBeenCalledTimes(1)
  jest.setSystemTime(now + 4 * 60 * 1000)
  expect(await isClient(clientId, redirectUri)).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(1)
  jest.setSystemTime(now + 6 * 60 * 1000)
  jest.mocked(fetch).mockRejectedValue(new Error('unavailable'))
  expect(await isClient(clientId, redirectUri)).toBe(false)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it.each(['no-store', 'no-cache', 'max-age=0'])('respects non-cacheable metadata: %s', async cacheControl => {
  jest.mocked(fetch).mockImplementation(async () => metadataResponse(document, { 'Cache-Control': cacheControl }))
  expect(await isClient(clientId, redirectUri)).toBe(true)
  expect(await isClient(clientId, redirectUri)).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('honors a shorter max-age than the local cache bound', async () => {
  jest.useFakeTimers()
  const now = Date.now()
  jest.mocked(fetch).mockImplementation(async () => metadataResponse(document, { 'Cache-Control': 'public, max-age=30' }))
  expect(await isClient(clientId, redirectUri)).toBe(true)
  jest.setSystemTime(now + 31_000)
  expect(await isClient(clientId, redirectUri)).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(2)
})
