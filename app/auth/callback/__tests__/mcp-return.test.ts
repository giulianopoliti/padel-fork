import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { GET } from '../route'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))

const returnPath = '/api/mcp/oauth/authorize?client_id=padelfv-chatgpt&state=original%2Bstate%26keep%3D1&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector_platform_oauth_redirect'

beforeEach(() => {
  jest.resetAllMocks()
  const query = {
    select: () => query, eq: () => query,
    maybeSingle: async () => ({ data: { id: 'organizer-id' }, error: null }),
  }
  jest.mocked(createClient).mockResolvedValue({
    auth: { exchangeCodeForSession: async () => ({ data: { user: { id: 'organizer-id' } }, error: null }) },
    from: () => query,
  } as unknown as Awaited<ReturnType<typeof createClient>>)
})

it('resumes pending MCP consent after Google login using the stored return path', async () => {
  const response = await GET(new NextRequest('https://www.padelfv.com/auth/callback?code=google-code', {
    headers: { cookie: `google_oauth_next=${encodeURIComponent(returnPath)}` },
  }))
  expect(response.headers.get('Location')).toBe(`https://www.padelfv.com${returnPath}`)
  expect(response.cookies.get('google_oauth_next')?.value).toBe('')
})

it('resumes pending MCP consent from an explicit Google callback next parameter', async () => {
  const params = new URLSearchParams({ code: 'google-code', next: returnPath })
  const response = await GET(new NextRequest(`https://www.padelfv.com/auth/callback?${params}`))
  expect(response.headers.get('Location')).toBe(`https://www.padelfv.com${returnPath}`)
})
