const localOrigin = 'https://login.invalid'
const allowedPaths = new Set(['/api/mcp/oauth/authorize', '/api/mcp/oauth/connections'])

// Resume only local MCP pages; their handlers still check the session and role.
export const getMcpOAuthReturnPath = (value: string | null): string | null => {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return null

  try {
    const url = new URL(value, localOrigin)
    if (url.origin !== localOrigin || !allowedPaths.has(url.pathname)) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}
