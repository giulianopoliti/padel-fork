import { getMcpOAuthReturnPath } from '../mcp-return-path'

it('preserves the nested callback, resource, PKCE challenge and state without re-encoding', () => {
  const path = '/api/mcp/oauth/authorize?redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector_platform_oauth_redirect&resource=https%3A%2F%2Fwww.padelfv.com%2Fapi%2Fmcp&code_challenge=abc-def_ghi&state=original%2Bstate'
  expect(getMcpOAuthReturnPath(path)).toBe(path)
})

it('allows returning to the session-protected revocation page', () => {
  expect(getMcpOAuthReturnPath('/api/mcp/oauth/connections')).toBe('/api/mcp/oauth/connections')
})

it.each([
  null, '', '/panel', '/api/mcp/oauth/token', '/api/mcp/oauth/authorize-other',
  'https://attacker.example/api/mcp/oauth/authorize', '//attacker.example/api/mcp/oauth/authorize',
  '/\\attacker.example/api/mcp/oauth/authorize', '/api/mcp/oauth/authorize\r\nLocation: https://attacker.example',
])('rejects external or unrelated return targets: %s', value => {
  expect(getMcpOAuthReturnPath(value)).toBeNull()
})
