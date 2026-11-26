import { createHash } from 'node:crypto'
import { createClientServiceRole } from '@/utils/supabase/server'
import {
  exchangeOrganizerCode, getOrganizerActor, issueOrganizerCode, organizerClientId,
  organizerScope, organizerTable, parseOrganizerAuthorization, revokeOrganizerAccess, type OrganizerOAuth,
} from '../organizer-auth'

jest.mock('server-only', () => ({}))
jest.mock('@/utils/supabase/server', () => ({ createClientServiceRole: jest.fn() }))

const config: OrganizerOAuth = {
  issuer: 'https://www.padelfv.com',
  resource: 'https://www.padelfv.com/api/mcp',
  redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
  clientSecret: 'test-secret-only'.repeat(3),
  allowedUserId: '11111111-1111-4111-8111-111111111111',
}
const userId = config.allowedUserId
const verifier = 'a'.repeat(43)
const challenge = createHash('sha256').update(verifier).digest('base64url')

const setupGrantStore = () => {
  const rows: Record<string, string | null>[] = []
  const from = jest.fn((table: string) => {
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

it('rejects code issuance for any other account before opening a service-role client', async () => {
  setupGrantStore()
  jest.mocked(createClientServiceRole).mockClear()
  await expect(issueOrganizerCode('22222222-2222-4222-8222-222222222222', challenge, config)).rejects.toThrow('not enabled')
  expect(createClientServiceRole).not.toHaveBeenCalled()
})

it('rejects pending codes and live tokens as soon as the configured pilot account changes', async () => {
  setupGrantStore()
  const code = await issueOrganizerCode(userId, challenge, config)
  const changedConfig = { ...config, allowedUserId: '22222222-2222-4222-8222-222222222222' }
  expect(await exchangeOrganizerCode(code, verifier, changedConfig)).toBeNull()
  const token = await exchangeOrganizerCode(code, verifier, config)
  const request = new Request(config.resource, { headers: { Authorization: `Bearer ${token!.access_token}` } })
  expect(await getOrganizerActor(request, config)).toMatchObject({ userId })
  expect(await getOrganizerActor(request, changedConfig)).toBeNull()
})
