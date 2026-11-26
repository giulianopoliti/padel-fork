import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { GET as metadataGet } from '@/app/.well-known/oauth-authorization-server/route'
import { GET as resourceGet } from '@/app/.well-known/oauth-protected-resource/api/mcp/route'
import { GET as authorizeGet } from '@/app/api/mcp/oauth/authorize/route'
import { POST as tokenPost } from '@/app/api/mcp/oauth/token/route'
import { GET as connectionsGet } from '@/app/api/mcp/oauth/connections/route'
import { getOrganizerOAuth } from '../organizer-auth'

jest.mock('server-only', () => ({}))
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))

const envKeys = ['NEXT_PUBLIC_TENANT_KEY', 'PADEL_FV_MCP_CLIENT_SECRET', 'PADEL_FV_MCP_ALLOWED_USER_ID', 'PADEL_FV_MCP_REDIRECT_URI'] as const
const previousValues = new Map(envKeys.map(key => [key, process.env[key]]))
const allowedUserId = 'abcdefab-1234-4abc-8def-1234567890ab'

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_TENANT_KEY = 'padel-fv'
  process.env.PADEL_FV_MCP_CLIENT_SECRET = 'test-secret-only'.repeat(3)
  process.env.PADEL_FV_MCP_ALLOWED_USER_ID = allowedUserId
  delete process.env.PADEL_FV_MCP_REDIRECT_URI
})

afterEach(() => {
  for (const key of envKeys) {
    const original = previousValues.get(key)
    if (original === undefined) delete process.env[key]
    else process.env[key] = original
  }
})

it('pins the configured UUID and the canonical FV resource without exposing account configuration in metadata', async () => {
  process.env.PADEL_FV_MCP_ALLOWED_USER_ID = ` ${allowedUserId.toUpperCase()} `
  expect(getOrganizerOAuth()).toMatchObject({
    allowedUserId, issuer: 'https://www.padelfv.com', resource: 'https://www.padelfv.com/api/mcp',
  })
  for (const response of [metadataGet(), resourceGet()]) {
    const body = await response.json()
    expect(JSON.stringify(body)).not.toContain(allowedUserId)
    expect(body).not.toHaveProperty('clientSecret')
    expect(body).not.toHaveProperty('allowedUserId')
  }
})

it.each(['', 'not-a-uuid', 'eventosdeportivosfv@gmail.com'])('disables private OAuth for invalid allowed-user configuration: %s', value => {
  process.env.PADEL_FV_MCP_ALLOWED_USER_ID = value
  expect(getOrganizerOAuth()).toBeNull()
  expect(metadataGet().status).toBe(404)
})

it('disables private OAuth when the allowed UUID is absent', () => {
  delete process.env.PADEL_FV_MCP_ALLOWED_USER_ID
  expect(getOrganizerOAuth()).toBeNull()
  expect(resourceGet().status).toBe(404)
})

it('requires a separate OAuth client secret', () => {
  delete process.env.PADEL_FV_MCP_CLIENT_SECRET
  expect(getOrganizerOAuth()).toBeNull()
  process.env.PADEL_FV_MCP_CLIENT_SECRET = 'too-short'
  expect(getOrganizerOAuth()).toBeNull()
})

it('rejects Elite OAuth and metadata before opening either database client, even with all pilot variables configured', async () => {
  process.env.NEXT_PUBLIC_TENANT_KEY = 'padel-elite'
  expect(getOrganizerOAuth()).toBeNull()
  const responses = [
    metadataGet(), resourceGet(),
    await authorizeGet(new Request('https://www.tpepadel.com/api/mcp/oauth/authorize')),
    await tokenPost(new Request('https://www.tpepadel.com/api/mcp/oauth/token', { method: 'POST' })),
    await connectionsGet(new Request('https://www.tpepadel.com/api/mcp/oauth/connections')),
  ]
  expect(responses.every(response => response.status === 404)).toBe(true)
  expect(createClient).not.toHaveBeenCalled()
  expect(createClientServiceRole).not.toHaveBeenCalled()
})
