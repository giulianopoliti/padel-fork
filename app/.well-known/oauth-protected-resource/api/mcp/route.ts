import { getOrganizerOAuth, organizerScope, oauthNoStore } from '@/lib/mcp/organizer-auth'

export const GET = () => {
  const config = getOrganizerOAuth()
  if (!config) return new Response(null, { status: 404, headers: oauthNoStore })
  return Response.json({
    resource: config.resource,
    authorization_servers: [config.issuer],
    scopes_supported: [organizerScope],
    bearer_methods_supported: ['header'],
  }, { headers: oauthNoStore })
}
