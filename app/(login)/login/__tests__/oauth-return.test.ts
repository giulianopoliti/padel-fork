import { login } from '../actions'
import { createClient } from '@/utils/supabase/server'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))

const returnPath = '/api/mcp/oauth/authorize?response_type=code&client_id=padelfv-chatgpt&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector_platform_oauth_redirect&scope=padelfv.organizer.read&code_challenge=challenge&code_challenge_method=S256&resource=https%3A%2F%2Fwww.padelfv.com%2Fapi%2Fmcp&state=original-state'

const withRole = (role: string) => {
  const query = {
    select: () => query, eq: () => query,
    single: async () => ({ data: { role }, error: null }),
  }
  jest.mocked(createClient).mockResolvedValue({
    auth: { signInWithPassword: async () => ({ data: { user: { id: 'organizer-id' } }, error: null }) },
    from: () => query,
  } as unknown as Awaited<ReturnType<typeof createClient>>)
}

const loginForm = (redirectTo?: string) => {
  const form = new FormData()
  form.set('email', 'organizer@example.com')
  form.set('password', 'test-password')
  if (redirectTo !== undefined) form.set('redirectTo', redirectTo)
  return form
}

beforeEach(() => jest.resetAllMocks())

it.each(['ORGANIZADOR', 'CLUB', 'ADMIN'])('resumes the complete MCP authorization after password login for %s', async role => {
  withRole(role)
  expect(await login(loginForm(returnPath))).toMatchObject({ success: true, redirectUrl: returnPath })
})

it.each(['ORGANIZADOR', 'CLUB', 'ADMIN'])('resumes MCP access management after password login for %s', async role => {
  withRole(role)
  expect(await login(loginForm('/api/mcp/oauth/connections')))
    .toMatchObject({ success: true, redirectUrl: '/api/mcp/oauth/connections' })
})

it.each([
  ['ORGANIZADOR', '/panel'], ['CLUB', '/panel'], ['ADMIN', '/admin'], ['PLAYER', '/panel'],
])('keeps the default dashboard for %s without an OAuth return path', async (role, redirectUrl) => {
  withRole(role)
  expect(await login(loginForm())).toMatchObject({ success: true, redirectUrl })
})

it('still preserves an ordinary tournament return path for players', async () => {
  withRole('PLAYER')
  expect(await login(loginForm('/tournaments/test?intent=couple')))
    .toMatchObject({ success: true, redirectUrl: '/tournaments/test?intent=couple' })
})

it.each(['https://attacker.example/api/mcp/oauth/authorize', '//attacker.example/api/mcp/oauth/authorize'])('does not redirect an organizer to an external URL: %s', async redirectTo => {
  withRole('ORGANIZADOR')
  expect(await login(loginForm(redirectTo))).toMatchObject({ success: true, redirectUrl: '/panel' })
})
