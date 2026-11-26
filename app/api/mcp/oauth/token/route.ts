import {
  exchangeOrganizerCode, getOrganizerOAuth, oauthNoStore, organizerClientId, validOrganizerClientSecret,
} from '@/lib/mcp/organizer-auth'

const oauthError = (error: string, status = 400) => Response.json({ error }, { status, headers: oauthNoStore })

const readClientCredentials = (request: Request, params: URLSearchParams) => {
  const authorization = request.headers.get('authorization')
  if (!authorization) return { id: params.get('client_id'), secret: params.get('client_secret') }
  const encoded = authorization.match(/^Basic ([A-Za-z0-9+/=]+)$/i)?.[1]
  if (!encoded || params.has('client_secret')) return null
  try {
    const credentials = Buffer.from(encoded, 'base64').toString('utf8')
    const separator = credentials.indexOf(':')
    if (separator < 0) return null
    const decode = (value: string) => decodeURIComponent(value.replace(/\+/g, ' '))
    const id = decode(credentials.slice(0, separator))
    if (params.has('client_id') && params.get('client_id') !== id) return null
    return { id, secret: decode(credentials.slice(separator + 1)) }
  } catch {
    return null
  }
}

export const POST = async (request: Request) => {
  const config = getOrganizerOAuth()
  if (!config) return new Response(null, { status: 404, headers: oauthNoStore })
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') {
    return oauthError('invalid_request')
  }

  const body = await request.text()
  if (body.length > 8192) return oauthError('invalid_request')
  const params = new URLSearchParams(body)
  const credentials = readClientCredentials(request, params)
  if (credentials?.id !== organizerClientId || !validOrganizerClientSecret(credentials.secret, config)) {
    return oauthError('invalid_client', 401)
  }
  if (params.get('grant_type') !== 'authorization_code') return oauthError('unsupported_grant_type')
  if (params.get('redirect_uri') !== config.redirectUri || params.get('resource') !== config.resource) {
    return oauthError('invalid_grant')
  }

  try {
    const token = await exchangeOrganizerCode(params.get('code') ?? '', params.get('code_verifier') ?? '', config)
    return token ? Response.json(token, { headers: oauthNoStore }) : oauthError('invalid_grant')
  } catch (error) {
    console.error('[mcp/oauth] Code exchange failed', error)
    return oauthError('server_error', 500)
  }
}
