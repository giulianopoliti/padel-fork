import { createHash } from 'node:crypto'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { GET as authorizeGet, POST as authorizePost } from '@/app/api/mcp/oauth/authorize/route'
import { POST as tokenPost } from '@/app/api/mcp/oauth/token/route'
import { organizerCimdClientId } from '../organizer-cimd'
import {
  exchangeOrganizerCode, getOrganizerActor, issueOrganizerCode, organizerClientId,
  organizerScope, organizerTable, parseOrganizerAuthorization, resolveOrganizerOAuthClient,
  revokeOrganizerAccess, type OrganizerOAuth,
} from '../organizer-auth'

jest.mock('server-only', () => ({}))
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))

const config: OrganizerOAuth = {
  issuer: 'https://www.padelfv.com',
  resource: 'https://www.padelfv.com/api/mcp',
  redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
  clientSecret: 'test-secret-only'.repeat(3),
  cimdEnabled: false,
}
const userId = '11111111-1111-4111-8111-111111111111'
const otherUserId = '22222222-2222-4222-8222-222222222222'
const roles = new Map<string, string>()
const verifier = 'a'.repeat(43)
const challenge = createHash('sha256').update(verifier).digest('base64url')

const setupGrantStore = () => {
  roles.clear()
  roles.set(userId, 'ORGANIZADOR')
  roles.set(otherUserId, 'CLUB')
  const rows: Record<string, string | null>[] = []
  const from = jest.fn((table: string) => {
    if (table === 'users') {
      let id = ''
      const profileQuery = {
        select: () => profileQuery,
        eq: (_column: string, value: string) => { id = value; return profileQuery },
        maybeSingle: async () => ({ data: roles.has(id) ? { role: roles.get(id) } : null, error: null }),
      }
      return profileQuery
    }
    expect(table).toBe(organizerTable)
    const predicates: Array<(row: Record<string, string | null>) => boolean> = []
    let update: Record<string, string | null> | undefined
    let deleting = false
    const query = {
      delete: () => { deleting = true; return query },
      insert: async (values: Record<string, string>) => {
        rows.push({ ...values, access_hash: null })
        return { error: null }
      },
      update: (values: Record<string, string>) => {
        update = values
        return query
      },
      select: () => query,
      eq: (column: string, value: string) => {
        predicates.push(row => row[column] === value)
        return query
      },
      is: (column: string, value: null) => {
        predicates.push(row => row[column] === value)
        return query
      },
      gt: (column: string, value: string) => {
        predicates.push(row => (row[column] ?? '') > value)
        return query
      },
      or: (filter: string) => {
        const now = filter.match(/access_expires_at\.lt\.([^,)]+)/)?.[1]
        if (!now) throw new Error('Unsupported expiry filter')
        predicates.push(row => row.access_hash === null
          ? (row.code_expires_at ?? '') < now
          : Boolean(row.access_expires_at && row.access_expires_at < now))
        return query
      },
      then: (resolve: (value: { error: null }) => unknown) => {
        if (!deleting) throw new Error('Only deletion queries are awaitable')
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          if (predicates.every(matches => matches(rows[index]))) rows.splice(index, 1)
        }
        return Promise.resolve(resolve({ error: null }))
      },
      maybeSingle: async () => {
        const row = rows.find(candidate => predicates.every(matches => matches(candidate)))
        if (row && update) Object.assign(row, update)
        return { data: row ?? null, error: null }
      },
    }
    return query
  })
  jest.mocked(createClientServiceRole).mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof createClientServiceRole>>)
  return rows
}

it('authorizes only the configured client, resource, callback and PKCE method', () => {
  const params = new URLSearchParams({
    client_id: organizerClientId, response_type: 'code', resource: config.resource, redirect_uri: config.redirectUri,
    scope: organizerScope, state: 'nonce', code_challenge: challenge, code_challenge_method: 'S256',
  })
  expect(parseOrganizerAuthorization(params, config)).toEqual({ state: 'nonce', challenge })
  params.set('redirect_uri', 'https://example.com/callback')
  expect(parseOrganizerAuthorization(params, config)).toBeNull()
})

it('hashes credentials, restricts the grant to its resource, and rejects wrong and repeated exchanges', async () => {
  const rows = setupGrantStore()
  const code = await issueOrganizerCode(userId, challenge, config)
  expect(rows[0].code_hash).not.toBe(code)
  expect(await exchangeOrganizerCode(code, 'b'.repeat(43), config)).toBeNull()
  expect(await exchangeOrganizerCode(code, verifier, { ...config, resource: 'https://example.com/api/mcp' })).toBeNull()

  const token = await exchangeOrganizerCode(code, verifier, config)
  expect(token?.scope).toBe(organizerScope)
  expect(rows[0].access_hash).not.toBe(token?.access_token)
  expect(await exchangeOrganizerCode(code, verifier, config)).toBeNull()

  const request = new Request(config.resource, { headers: { Authorization: `Bearer ${token?.access_token}` } })
  expect(await getOrganizerActor(request, config)).toMatchObject({ userId })
  rows[0].access_expires_at = new Date(0).toISOString()
  expect(await getOrganizerActor(request, config)).toBeNull()
})

it('revokes only the signed-in organizer and invalidates issued tokens immediately', async () => {
  setupGrantStore()
  const code = await issueOrganizerCode(userId, challenge, config)
  const token = await exchangeOrganizerCode(code, verifier, config)
  const request = new Request(config.resource, { headers: { Authorization: `Bearer ${token!.access_token}` } })
  await revokeOrganizerAccess('someone-else', config)
  expect(await getOrganizerActor(request, config)).toMatchObject({ userId })
  await revokeOrganizerAccess(userId, config)
  expect(await getOrganizerActor(request, config)).toBeNull()
})

it('cleans expired codes and tokens while retaining active grants whose codes already expired', async () => {
  const rows = setupGrantStore()
  const expired = new Date(0).toISOString()
  const active = new Date(Date.now() + 60_000).toISOString()
  rows.push(
    { resource: config.resource, code_hash: 'unused-expired', access_hash: null, code_expires_at: expired },
    { resource: config.resource, code_hash: 'used-expired', access_hash: 'hash', access_expires_at: expired, code_expires_at: expired },
    { resource: config.resource, code_hash: 'live-token', access_hash: 'live', access_expires_at: active, code_expires_at: expired },
  )
  await issueOrganizerCode(userId, challenge, config)
  expect(rows.map(row => row.code_hash)).toEqual(['live-token', expect.any(String)])
})

it('rejects expired authorization codes and limits new tokens to eight hours without a refresh token', async () => {
  const rows = setupGrantStore()
  const expiredCode = await issueOrganizerCode(userId, challenge, config)
  rows[0].code_expires_at = new Date(0).toISOString()
  expect(await exchangeOrganizerCode(expiredCode, verifier, config)).toBeNull()
  const code = await issueOrganizerCode(userId, challenge, config)
  const token = await exchangeOrganizerCode(code, verifier, config)
  expect(token?.expires_in).toBe(28_800)
  expect(token).not.toHaveProperty('refresh_token')
})

it('rejects code issuance for players and missing profiles', async () => {
  setupGrantStore()
  roles.set(otherUserId, 'PLAYER')
  await expect(issueOrganizerCode(otherUserId, challenge, config)).rejects.toThrow('no organizer permissions')
  await expect(issueOrganizerCode('missing', challenge, config)).rejects.toThrow('no organizer permissions')
})

it('keeps two organizers tokens and revocations independent', async () => {
  const rows = setupGrantStore()
  const firstCode = await issueOrganizerCode(userId, challenge, config)
  const secondCode = await issueOrganizerCode(otherUserId, challenge, config)
  const firstToken = await exchangeOrganizerCode(firstCode, verifier, config)
  const secondToken = await exchangeOrganizerCode(secondCode, verifier, config)
  const firstRequest = new Request(config.resource, { headers: { Authorization: `Bearer ${firstToken!.access_token}` } })
  const secondRequest = new Request(config.resource, { headers: { Authorization: `Bearer ${secondToken!.access_token}` } })
  expect(await getOrganizerActor(firstRequest, config)).toMatchObject({ userId })
  expect(await getOrganizerActor(secondRequest, config)).toMatchObject({ userId: otherUserId })
  expect(rows[0].user_id).toBe(userId)
  expect(rows[1].user_id).toBe(otherUserId)
  await revokeOrganizerAccess(userId, config)
  expect(await getOrganizerActor(firstRequest, config)).toBeNull()
  expect(await getOrganizerActor(secondRequest, config)).toMatchObject({ userId: otherUserId })
})

it('rechecks current roles on code exchange and every token use', async () => {
  setupGrantStore()
  const firstCode = await issueOrganizerCode(userId, challenge, config)
  roles.set(userId, 'PLAYER')
  expect(await exchangeOrganizerCode(firstCode, verifier, config)).toBeNull()
  roles.set(userId, 'ORGANIZADOR')
  const secondCode = await issueOrganizerCode(userId, challenge, config)
  const token = await exchangeOrganizerCode(secondCode, verifier, config)
  const request = new Request(config.resource, { headers: { Authorization: `Bearer ${token!.access_token}` } })
  expect(await getOrganizerActor(request, config)).toMatchObject({ userId })
  roles.set(userId, 'PLAYER')
  expect(await getOrganizerActor(request, config)).toBeNull()
})

it('binds new grants to their exact client and callback without consuming a mismatched exchange', async () => {
  const rows = setupGrantStore()
  const cimdClient = { clientId: organizerCimdClientId, redirectUri: config.redirectUri }
  const legacyCode = await issueOrganizerCode(userId, challenge, config)
  const cimdCode = await issueOrganizerCode(userId, challenge, config, cimdClient)
  expect(rows.map(row => row.client_id)).toEqual([organizerClientId, organizerCimdClientId])
  expect(await exchangeOrganizerCode(legacyCode, verifier, config, cimdClient)).toBeNull()
  expect(await exchangeOrganizerCode(cimdCode, verifier, config)).toBeNull()
  expect(await exchangeOrganizerCode(cimdCode, verifier, config, { ...cimdClient, redirectUri: 'https://attacker.example/callback' })).toBeNull()
  expect(rows.every(row => row.access_hash === null)).toBe(true)
  expect(await exchangeOrganizerCode(legacyCode, verifier, config)).not.toBeNull()
  expect(await exchangeOrganizerCode(cimdCode, verifier, config, cimdClient)).not.toBeNull()
})

it('lets two connections for the same FV user coexist and consumes each code once under concurrent exchange', async () => {
  setupGrantStore()
  const client = { clientId: organizerCimdClientId, redirectUri: config.redirectUri }
  const codeOne = await issueOrganizerCode(userId, challenge, config, client)
  const codeTwo = await issueOrganizerCode(userId, challenge, config, client)
  const attempts = await Promise.all([
    exchangeOrganizerCode(codeOne, verifier, config, client),
    exchangeOrganizerCode(codeOne, verifier, config, client),
  ])
  expect(attempts.filter(Boolean)).toHaveLength(1)
  const tokenOne = attempts.find(Boolean)!
  const tokenTwo = (await exchangeOrganizerCode(codeTwo, verifier, config, client))!
  expect(tokenOne.access_token).not.toBe(tokenTwo.access_token)
  for (const token of [tokenOne, tokenTwo]) {
    const request = new Request(config.resource, { headers: { Authorization: `Bearer ${token.access_token}` } })
    expect(await getOrganizerActor(request, config)).toMatchObject({ userId })
  }
})

it('does not fetch CIMD metadata when disabled and rejects a legacy client without its configured secret', async () => {
  const originalFetch = global.fetch
  global.fetch = jest.fn()
  try {
    expect(await resolveOrganizerOAuthClient(organizerCimdClientId, config.redirectUri, config)).toBeNull()
    expect(await resolveOrganizerOAuthClient(organizerClientId, config.redirectUri, { ...config, clientSecret: '', cimdEnabled: true })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    global.fetch = originalFetch
  }
})

it('completes real CIMD route handlers with FV login, explicit consent and a secret-free PKCE token exchange', async () => {
  const keys = ['NEXT_PUBLIC_TENANT_KEY', 'PADEL_FV_MCP_CIMD_ENABLED', 'PADEL_FV_MCP_CLIENT_SECRET', 'PADEL_FV_MCP_REDIRECT_URI'] as const
  const originalEnv = new Map(keys.map(key => [key, process.env[key]]))
  const originalFetch = global.fetch
  try {
    process.env.NEXT_PUBLIC_TENANT_KEY = 'padel-fv'
    process.env.PADEL_FV_MCP_CIMD_ENABLED = 'true'
    // Keep a legacy secret configured to verify that the public-client flow
    // cannot downgrade a confidential client or exchange its codes.
    process.env.PADEL_FV_MCP_CLIENT_SECRET = config.clientSecret
    process.env.PADEL_FV_MCP_REDIRECT_URI = 'https://chatgpt.com/connector/oauth/legacy-callback'
    global.fetch = jest.fn().mockImplementation(async () => Response.json({
      client_id: organizerCimdClientId, redirect_uris: [config.redirectUri],
      token_endpoint_auth_method: 'private_key_jwt', token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
    }))
    const rows = setupGrantStore()
    const serviceClient = await createClientServiceRole()
    let signedIn = false
    jest.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: signedIn ? { id: userId } : null } }) },
      from: serviceClient.from,
    } as unknown as Awaited<ReturnType<typeof createClient>>)
    const params = new URLSearchParams({
      response_type: 'code', client_id: organizerCimdClientId, redirect_uri: config.redirectUri,
      resource: config.resource, scope: organizerScope, state: 'original+state',
      code_challenge: challenge, code_challenge_method: 'S256',
    })
    const url = `${config.issuer}/api/mcp/oauth/authorize?${params}`
    const login = await authorizeGet(new Request(url))
    expect(login.status).toBe(303)
    const destination = new URL(login.headers.get('Location')!)
    expect(destination.pathname).toBe('/login')
    expect(destination.searchParams.get('redirectTo')).toBe(new URL(url).pathname + new URL(url).search)
    signedIn = true
    const consent = await authorizeGet(new Request(url))
    expect(consent.status).toBe(200)
    expect(await consent.text()).toContain('Autorizar lectura')
    expect(consent.headers.get('Content-Security-Policy')).toContain(`form-action 'self' ${config.redirectUri};`)
    const approved = await authorizePost(new Request(url, {
      method: 'POST', headers: { Origin: config.issuer }, body: new URLSearchParams({ decision: 'approve' }),
    }))
    const callback = new URL(approved.headers.get('Location')!)
    expect(approved.status).toBe(303)
    expect(callback.origin + callback.pathname).toBe(config.redirectUri)
    expect(callback.searchParams.get('state')).toBe('original+state')
    expect(callback.searchParams.get('iss')).toBe(config.issuer)
    const code = callback.searchParams.get('code')!
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(rows[0].client_id).toBe(organizerCimdClientId)
    const exchangeParams = new URLSearchParams({
      grant_type: 'authorization_code', client_id: organizerCimdClientId, code,
      code_verifier: verifier, redirect_uri: config.redirectUri, resource: config.resource,
    })
    const exchange = (body: URLSearchParams, headers: HeadersInit = {}) => tokenPost(new Request(`${config.issuer}/api/mcp/oauth/token`, {
      method: 'POST', body, headers,
    }))
    const legacy = new URLSearchParams(exchangeParams)
    legacy.set('client_id', organizerClientId)
    expect((await exchange(legacy)).status).toBe(401)
    legacy.set('client_secret', config.clientSecret)
    legacy.set('redirect_uri', process.env.PADEL_FV_MCP_REDIRECT_URI!)
    expect(await (await exchange(legacy)).json()).toEqual({ error: 'invalid_grant' })
    const suppliedSecret = new URLSearchParams(exchangeParams)
    suppliedSecret.set('client_secret', config.clientSecret)
    expect((await exchange(suppliedSecret)).status).toBe(401)
    expect((await exchange(exchangeParams, { Authorization: `Basic ${Buffer.from(`${organizerCimdClientId}:secret`).toString('base64')}` })).status).toBe(401)
    const badVerifier = new URLSearchParams(exchangeParams)
    badVerifier.set('code_verifier', 'b'.repeat(43))
    expect(await (await exchange(badVerifier)).json()).toEqual({ error: 'invalid_grant' })
    const duplicated = new URLSearchParams(exchangeParams)
    duplicated.append('client_id', organizerClientId)
    expect(await (await exchange(duplicated)).json()).toEqual({ error: 'invalid_request' })
    const response = await exchange(exchangeParams)
    expect(response.status).toBe(200)
    const token = await response.json()
    expect(token).toMatchObject({ token_type: 'Bearer', expires_in: 28_800, scope: organizerScope })
    expect(token).not.toHaveProperty('refresh_token')
    expect(await (await exchange(exchangeParams)).json()).toEqual({ error: 'invalid_grant' })
    expect(await getOrganizerActor(new Request(config.resource, { headers: { Authorization: `Bearer ${token.access_token}` } }), config)).toMatchObject({ userId })
    const denied = await authorizePost(new Request(url, {
      method: 'POST', headers: { Origin: config.issuer }, body: new URLSearchParams({ decision: 'deny' }),
    }))
    expect(new URL(denied.headers.get('Location')!).searchParams.get('error')).toBe('access_denied')
    expect(rows).toHaveLength(1)
  } finally {
    global.fetch = originalFetch
    for (const key of keys) {
      const original = originalEnv.get(key)
      if (original === undefined) delete process.env[key]
      else process.env[key] = original
    }
  }
})
