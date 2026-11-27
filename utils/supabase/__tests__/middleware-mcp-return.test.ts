import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

jest.mock('@supabase/ssr', () => ({ createServerClient: jest.fn() }))
jest.mock('@/config/permissions', () => ({ checkRoutePermission: () => true, getRedirectPath: () => '/login' }))
jest.mock('@/lib/seo/legacy-tournament-redirect', () => ({ getLegacyTournamentRedirectPath: async () => null }))

let updateSession: typeof import('../middleware').updateSession
let clearAllCache: typeof import('../middleware').clearAllCache

beforeAll(async () => {
  jest.useFakeTimers()
  ;({ updateSession, clearAllCache } = await import('../middleware'))
})

afterAll(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

beforeEach(() => {
  jest.clearAllMocks()
  clearAllCache()
})

const withSession = (role: string | null) => {
  jest.mocked(createServerClient).mockReturnValue({
    auth: { getUser: async () => ({ data: { user: role ? { id: 'organizer-id' } : null }, error: null }) },
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: table === 'clubes' ? { is_active: true } : { role }, error: null }),
      }
      return query
    },
  } as unknown as ReturnType<typeof createServerClient>)
}

const returnPath = '/api/mcp/oauth/authorize?client_id=padelfv-chatgpt&state=original-state&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector_platform_oauth_redirect'
const loginRequest = (redirectTo = returnPath) => new NextRequest(`https://www.padelfv.com/login?${new URLSearchParams({ redirectTo })}`)

it.each(['ORGANIZADOR', 'CLUB', 'ADMIN'])('resumes pending MCP consent for a logged-in %s instead of sending them to the panel', async role => {
  withSession(role)
  const response = await updateSession(loginRequest())
  expect(response.headers.get('Location')).toBe(`https://www.padelfv.com${returnPath}`)
})

it('keeps anonymous users on login before resuming consent', async () => {
  withSession(null)
  const response = await updateSession(loginRequest())
  expect(response.headers.get('Location')).toBeNull()
  expect(response.headers.get('x-middleware-next')).toBe('1')
})

it.each(['https://attacker.example/api/mcp/oauth/authorize', '//attacker.example/api/mcp/oauth/authorize'])('does not trust an external MCP-looking return path: %s', async path => {
  withSession('ORGANIZADOR')
  const response = await updateSession(loginRequest(path))
  const destination = new URL(response.headers.get('Location')!)
  expect(destination.origin).toBe('https://www.padelfv.com')
  expect(destination.pathname).toBe('/panel')
})

it('preserves the ordinary authenticated login redirect', async () => {
  withSession('ORGANIZADOR')
  const response = await updateSession(new NextRequest('https://www.padelfv.com/login'))
  expect(response.headers.get('Location')).toBe('https://www.padelfv.com/panel')
})
