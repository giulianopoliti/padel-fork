import 'server-only'

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { getTenantBranding, getTenantCanonicalSiteUrl } from '@/config/tenant'
import { createClientServiceRole } from '@/utils/supabase/server'

export const organizerScope = 'padelfv.organizer.read'
export const organizerClientId = 'padelfv-chatgpt'
export const organizerReadRoles = ['ADMIN', 'CLUB', 'ORGANIZADOR']
export const oauthAuthorizationPath = '/api/mcp/oauth/authorize'
export const oauthTokenPath = '/api/mcp/oauth/token'
export const oauthConnectionsPath = '/api/mcp/oauth/connections'
export const resourceMetadataPath = '/.well-known/oauth-protected-resource/api/mcp'
export const oauthMetadataPath = '/.well-known/oauth-authorization-server'
export const organizerTable = 'padel_fv_mcp_grants'
const defaultCallback = 'https://chatgpt.com/connector_platform_oauth_redirect'
const expiresIn = 8 * 60 * 60
const codeExpiresIn = 5 * 60
const opaqueTokenPattern = /^[A-Za-z0-9_-]{43}$/
const verifierPattern = /^[A-Za-z0-9_.~-]{43,128}$/
export const oauthNoStore = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }

export const getOrganizerOAuth = () => {
  const clientSecret = process.env.PADEL_FV_MCP_CLIENT_SECRET
  const allowedUser = z.string().uuid().safeParse(process.env.PADEL_FV_MCP_ALLOWED_USER_ID?.trim())
  if (getTenantBranding().key !== 'padel-fv' || !clientSecret || clientSecret.length < 32 || !allowedUser.success) return null
  const issuer = getTenantCanonicalSiteUrl()
  const redirectUri = process.env.PADEL_FV_MCP_REDIRECT_URI || defaultCallback
  if (redirectUri !== defaultCallback && !/^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(redirectUri)) {
    return null
  }
  return { issuer, resource: `${issuer}/api/mcp`, redirectUri, clientSecret, allowedUserId: allowedUser.data.toLowerCase() }
}

export type OrganizerOAuth = NonNullable<ReturnType<typeof getOrganizerOAuth>>

export const isAllowedOrganizer = (userId: string, config: OrganizerOAuth): boolean =>
  userId.toLowerCase() === config.allowedUserId

const hash = (secret: string) => createHash('sha256').update(secret).digest('hex')
const createSecret = () => randomBytes(32).toString('base64url')
const expiry = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString()

export const organizerAuthChallenge = (config: OrganizerOAuth) =>
  `Bearer resource_metadata="${config.issuer}${resourceMetadataPath}", scope="${organizerScope}", error="invalid_token", error_description="Inicia sesion con Padel FV para leer la organizacion del torneo"`

export const parseOrganizerAuthorization = (params: URLSearchParams, config: OrganizerOAuth) => {
  const state = params.get('state')
  const challenge = params.get('code_challenge')
  const scope = params.get('scope')
  if (
    params.get('client_id') !== organizerClientId || params.get('response_type') !== 'code' ||
    params.get('redirect_uri') !== config.redirectUri || params.get('resource') !== config.resource ||
    (scope !== null && scope !== organizerScope) ||
    !state || state.length > 1024 || !challenge || !opaqueTokenPattern.test(challenge) ||
    params.get('code_challenge_method') !== 'S256'
  ) return null

  return { state, challenge }
}

export const issueOrganizerCode = async (actorId: string, challenge: string, config: OrganizerOAuth) => {
  if (!isAllowedOrganizer(actorId, config)) throw new Error('Account is not enabled for the Padel FV MCP pilot')
  const supabase = await createClientServiceRole()
  // An expired authorization code may still belong to a live eight-hour grant.
  const now = new Date().toISOString()
  const { error: cleanupError } = await supabase.from(organizerTable).delete()
    .eq('resource', config.resource)
    .or(`and(access_hash.is.null,code_expires_at.lt.${now}),access_expires_at.lt.${now}`)
  if (cleanupError) throw cleanupError
  const code = createSecret()
  const { error } = await supabase.from(organizerTable).insert({
    code_hash: hash(code),
    user_id: actorId,
    code_challenge: challenge,
    resource: config.resource,
    redirect_uri: config.redirectUri,
    code_expires_at: expiry(codeExpiresIn),
  })
  if (error) throw error
  return code
}

export const revokeOrganizerAccess = async (actorId: string, config: OrganizerOAuth) => {
  const supabase = await createClientServiceRole()
  const { error } = await supabase.from(organizerTable).delete()
    .eq('user_id', actorId).eq('resource', config.resource)
  if (error) throw error
}

export const validOrganizerClientSecret = (submitted: string | null, config: OrganizerOAuth) =>
  submitted !== null && timingSafeEqual(Buffer.from(hash(submitted), 'hex'), Buffer.from(hash(config.clientSecret), 'hex'))

export const exchangeOrganizerCode = async (code: string, verifier: string, config: OrganizerOAuth) => {
  if (!opaqueTokenPattern.test(code) || !verifierPattern.test(verifier)) return null
  const supabase = await createClientServiceRole()
  const accessToken = createSecret()
  const { data, error } = await supabase.from(organizerTable)
    .update({ access_hash: hash(accessToken), access_expires_at: expiry(expiresIn) })
    .eq('user_id', config.allowedUserId)
    .eq('code_hash', hash(code))
    .eq('code_challenge', createHash('sha256').update(verifier).digest('base64url'))
    .eq('resource', config.resource)
    .eq('redirect_uri', config.redirectUri)
    .gt('code_expires_at', new Date().toISOString())
    .is('access_hash', null)
    .select('code_hash')
    .maybeSingle()
  if (error) throw error
  return data ? { access_token: accessToken, token_type: 'Bearer', expires_in: expiresIn, scope: organizerScope } : null
}

export const getOrganizerActor = async (request: Request, config: OrganizerOAuth) => {
  const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/i)?.[1]
  if (!token) return null
  const supabase = await createClientServiceRole()
  const { data, error } = await supabase.from(organizerTable)
    .select('user_id')
    .eq('user_id', config.allowedUserId)
    .eq('access_hash', hash(token))
    .eq('resource', config.resource)
    .gt('access_expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw error
  return data ? { userId: data.user_id as string, supabase } : null
}
