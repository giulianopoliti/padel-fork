import {
  getOrganizerOAuth, organizerScope, oauthAuthorizationPath, oauthTokenPath, oauthNoStore,
} from '@/lib/mcp/organizer-auth'

export const GET = () => {
  const config = getOrganizerOAuth()
  if (!config) return new Response(null, { status: 404, headers: oauthNoStore })
  return Response.json({
    issuer: config.issuer,
    authorization_endpoint: config.issuer + oauthAuthorizationPath,
    token_endpoint: config.issuer + oauthTokenPath,
    authorization_response_iss_parameter_supported: true,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [organizerScope],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
  }, { headers: oauthNoStore })
}
