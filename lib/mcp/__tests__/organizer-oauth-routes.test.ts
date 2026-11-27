import { createHash } from 'node:crypto'
import { createClient } from '@/utils/supabase/server'
import { GET as authorizeGet, POST as authorizePost } from '@/app/api/mcp/oauth/authorize/route'
import { POST as tokenPost } from '@/app/api/mcp/oauth/token/route'
import { GET as connectionsGet, POST as connectionsPost } from '@/app/api/mcp/oauth/connections/route'
import { GET as metadataGet } from '@/app/.well-known/oauth-authorization-server/route'
import { GET as resourceGet } from '@/app/.well-known/oauth-protected-resource/api/mcp/route'
import {
  exchangeOrganizerCode, getOrganizerOAuth, issueOrganizerCode, organizerClientId, organizerScope,
  revokeOrganizerAccess, type OrganizerOAuth,
} from '../organizer-auth'

jest.mock('server-only', () => ({}))
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))
jest.mock('../organizer-auth', () => ({
  ...jest.requireActual('../organizer-auth'),
  getOrganizerOAuth: jest.fn(), issueOrganizerCode: jest.fn(),
  exchangeOrganizerCode: jest.fn(), revokeOrganizerAccess: jest.fn(),
}))

const config: OrganizerOAuth = {
  issuer: 'https://www.padelfv.com', resource: 'https://www.padelfv.com/api/mcp',
  redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect', clientSecret: 'x'.repeat(43),
  cimdEnabled: false,
}
const userId = '11111111-1111-4111-8111-111111111111'
const authorizationParams = () => new URLSearchParams({
  client_id: organizerClientId, response_type: 'code', redirect_uri: config.redirectUri,
  resource: config.resource, scope: organizerScope, state: 'original-state',
  code_challenge: createHash('sha256').update('a'.repeat(43)).digest('base64url'),
  code_challenge_method: 'S256',
})
const authorizeUrl = () => `${config.issuer}/api/mcp/oauth/authorize?${authorizationParams()}`
const withSession = (role: string | null, sessionUserId: string | null = userId) => {
  const query = {
    select: () => query, eq: () => query,
    maybeSingle: async () => ({ data: role ? { role } : null, error: null }),
  }
  jest.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: sessionUserId ? { id: sessionUserId } : null } }) },
    from: () => query,
  } as unknown as Awaited<ReturnType<typeof createClient>>)
}
const formRequest = (url: string, body: URLSearchParams, origin = config.issuer) => new Request(url, {
  method: 'POST', headers: { Origin: origin }, body,
})
const tokenParams = () => new URLSearchParams({
  grant_type: 'authorization_code', client_id: organizerClientId, client_secret: config.clientSecret,
  redirect_uri: config.redirectUri, resource: config.resource, code: 'c'.repeat(43), code_verifier: 'a'.repeat(43),
})

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(getOrganizerOAuth).mockReturnValue(config)
  withSession('ORGANIZADOR')
})

it('discovers OAuth endpoints and the precise MCP resource without exposing a client secret', async () => {
  const metadata = await metadataGet().json()
  expect(metadata).toMatchObject({
    authorization_endpoint: `${config.issuer}/api/mcp/oauth/authorize`,
    token_endpoint: `${config.issuer}/api/mcp/oauth/token`,
    code_challenge_methods_supported: ['S256'], grant_types_supported: ['authorization_code'],
  })
  expect(JSON.stringify(metadata)).not.toContain(config.clientSecret)
  expect(await resourceGet().json()).toMatchObject({ resource: config.resource, scopes_supported: [organizerScope] })
})

it('redirects anonymous consent to FV login preserving the complete OAuth request', async () => {
  withSession(null, null)
  const response = await authorizeGet(new Request(authorizeUrl()))
  const destination = new URL(response.headers.get('Location')!)
  expect(response.status).toBe(303)
  expect(destination.origin + destination.pathname).toBe(`${config.issuer}/login`)
  expect(destination.searchParams.get('redirectTo')).toBe(new URL(authorizeUrl()).pathname + new URL(authorizeUrl()).search)
  expect(issueOrganizerCode).not.toHaveBeenCalled()
})

it('requires an organizer role and explicit consent before issuing a grant', async () => {
  withSession('PLAYER')
  expect((await authorizeGet(new Request(authorizeUrl()))).status).toBe(403)
  withSession('ORGANIZADOR')
  const response = await authorizeGet(new Request(authorizeUrl()))
  expect(response.status).toBe(200)
  expect(await response.text()).toContain('Autorizar lectura')
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(issueOrganizerCode).not.toHaveBeenCalled()
})

it('preserves the Origin of same-origin form submissions without leaking OAuth URLs to other sites', async () => {
  const responses = [
    await authorizeGet(new Request(authorizeUrl())),
    await connectionsGet(new Request(`${config.issuer}/api/mcp/oauth/connections`)),
  ]
  for (const response of responses) {
    expect(response.status).toBe(200)
    // no-referrer makes browsers send Origin: null on HTML form POSTs.
    expect(response.headers.get('Referrer-Policy')).toBe('same-origin')
    expect(response.headers.get('Content-Security-Policy')).toContain("form-action 'self'")
  }
})

it.each([
  'https://chatgpt.com/connector_platform_oauth_redirect',
  'https://chatgpt.com/connector/oauth/callback-id',
])('allows the configured callback through the consent form CSP: %s', async redirectUri => {
  jest.mocked(getOrganizerOAuth).mockReturnValue({ ...config, redirectUri })
  const params = authorizationParams()
  params.set('redirect_uri', redirectUri)
  const response = await authorizeGet(new Request(`${config.issuer}/api/mcp/oauth/authorize?${params}`))
  expect(response.status).toBe(200)
  const formAction = response.headers.get('Content-Security-Policy')?.split(';')
    .map(directive => directive.trim()).find(directive => directive.startsWith('form-action '))
  expect(formAction?.split(/\s+/).slice(1)).toEqual(["'self'", redirectUri])
})

it.each(['null', 'https://attacker.example', undefined])('rejects consent and revocation with an untrusted Origin: %s', async origin => {
  const headers: HeadersInit = origin === undefined ? {} : { Origin: origin }
  const consent = await authorizePost(new Request(authorizeUrl(), {
    method: 'POST', headers, body: new URLSearchParams({ decision: 'approve' }),
  }))
  const revocation = await connectionsPost(new Request(`${config.issuer}/api/mcp/oauth/connections`, {
    method: 'POST', headers, body: new URLSearchParams({ decision: 'revoke' }),
  }))
  expect(consent.status).toBe(403)
  expect(revocation.status).toBe(403)
  expect(createClient).not.toHaveBeenCalled()
  expect(issueOrganizerCode).not.toHaveBeenCalled()
  expect(revokeOrganizerAccess).not.toHaveBeenCalled()
})

it('rejects an external callback and cross-origin consent', async () => {
  const params = authorizationParams()
  params.set('redirect_uri', 'https://attacker.example/callback')
  expect((await authorizeGet(new Request(`${config.issuer}/api/mcp/oauth/authorize?${params}`))).status).toBe(400)
  const response = await authorizePost(formRequest(authorizeUrl(), new URLSearchParams({ decision: 'approve' }), 'https://attacker.example'))
  expect(response.status).toBe(403)
  expect(issueOrganizerCode).not.toHaveBeenCalled()
})

it('issues a code for the signed-in user and returns the original state and issuer', async () => {
  jest.mocked(issueOrganizerCode).mockResolvedValue('issued-code')
  const response = await authorizePost(formRequest(authorizeUrl(), new URLSearchParams({ decision: 'approve', user_id: 'another-user' })))
  const callback = new URL(response.headers.get('Location')!)
  expect(response.status).toBe(303)
  expect(callback.origin + callback.pathname).toBe(config.redirectUri)
  expect(callback.searchParams.get('state')).toBe('original-state')
  expect(callback.searchParams.get('iss')).toBe(config.issuer)
  expect(callback.searchParams.get('code')).toBe('issued-code')
  expect(issueOrganizerCode).toHaveBeenCalledWith(userId, authorizationParams().get('code_challenge'), config,
    { clientId: organizerClientId, redirectUri: config.redirectUri })
})

it('returns access_denied without issuing a code when consent is declined', async () => {
  const response = await authorizePost(formRequest(authorizeUrl(), new URLSearchParams({ decision: 'deny' })))
  expect(new URL(response.headers.get('Location')!).searchParams.get('error')).toBe('access_denied')
  expect(issueOrganizerCode).not.toHaveBeenCalled()
})

it('rejects incorrect client credentials before exchanging any authorization code', async () => {
  const params = tokenParams()
  params.set('client_secret', 'wrong-secret')
  const response = await tokenPost(formRequest(`${config.issuer}/api/mcp/oauth/token`, params))
  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({ error: 'invalid_client' })
  expect(exchangeOrganizerCode).not.toHaveBeenCalled()
})

it('accepts a confidential client using HTTP Basic and prevents refresh-token renewal', async () => {
  const params = tokenParams()
  params.delete('client_secret')
  const request = formRequest(`${config.issuer}/api/mcp/oauth/token`, params)
  request.headers.set('Authorization', `Basic ${Buffer.from(`${organizerClientId}:${config.clientSecret}`).toString('base64')}`)
  jest.mocked(exchangeOrganizerCode).mockResolvedValue({ access_token: 'token', token_type: 'Bearer', expires_in: 28_800, scope: organizerScope })
  expect(await (await tokenPost(request)).json()).toMatchObject({ expires_in: 28_800 })
  expect(exchangeOrganizerCode).toHaveBeenCalledWith('c'.repeat(43), 'a'.repeat(43), config,
    { clientId: organizerClientId, redirectUri: config.redirectUri })
  params.set('client_secret', config.clientSecret)
  params.set('grant_type', 'refresh_token')
  expect(await (await tokenPost(formRequest(`${config.issuer}/api/mcp/oauth/token`, params))).json())
    .toEqual({ error: 'unsupported_grant_type' })
})

it('rejects exchange of a code for a different MCP resource', async () => {
  const params = tokenParams()
  params.set('resource', 'https://other.example/mcp')
  expect(await (await tokenPost(formRequest(`${config.issuer}/api/mcp/oauth/token`, params))).json())
    .toEqual({ error: 'invalid_grant' })
  expect(exchangeOrganizerCode).not.toHaveBeenCalled()
})

it('requires the FV session and same-origin POST to revoke; ignores submitted user IDs', async () => {
  const url = `${config.issuer}/api/mcp/oauth/connections`
  const body = new URLSearchParams({ decision: 'revoke', user_id: 'another-user' })
  withSession(null, null)
  expect((await connectionsGet(new Request(url))).status).toBe(303)
  withSession('PLAYER') // Even a former organizer must be able to revoke their grants.
  expect((await connectionsPost(formRequest(url, body, 'https://attacker.example'))).status).toBe(403)
  expect(revokeOrganizerAccess).not.toHaveBeenCalled()
  const response = await connectionsPost(formRequest(url, body))
  expect(response.status).toBe(200)
  expect(revokeOrganizerAccess).toHaveBeenCalledWith(userId, config)
})

it.each(['ORGANIZADOR', 'ADMIN', 'CLUB'])('allows another authenticated %s using its actual session identity', async role => {
  const secondUserId = '22222222-2222-4222-8222-222222222222'
  withSession(role, secondUserId)
  expect((await authorizeGet(new Request(authorizeUrl()))).status).toBe(200)
  jest.mocked(issueOrganizerCode).mockResolvedValue('second-code')
  const body = new URLSearchParams({ decision: 'approve', user_id: userId })
  const response = await authorizePost(formRequest(authorizeUrl(), body))
  expect(response.status).toBe(303)
  expect(issueOrganizerCode).toHaveBeenCalledWith(secondUserId, authorizationParams().get('code_challenge'), config,
    { clientId: organizerClientId, redirectUri: config.redirectUri })
})
