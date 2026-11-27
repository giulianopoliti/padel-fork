import { createClient } from '@/utils/supabase/server'
import {
  getOrganizerOAuth, issueOrganizerCode, oauthConnectionsPath, oauthNoStore, organizerReadRoles, parseOrganizerAuthorization,
} from '@/lib/mcp/organizer-auth'

const responseHeaders = {
  ...oauthNoStore,
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
}

const consentHtml = `<!doctype html>
<html lang="es-AR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Padel FV — Organizadores</title>
<main>
  <h1>Conectar Padel FV — Organizadores con ChatGPT</h1>
  <p>Autorizá a ChatGPT a leer los horarios, las disponibilidades, las notas y el historial de las ligas que administrás.</p>
  <p>El acceso dura ocho horas y es de solo lectura.</p>
  <p>Después de ese plazo tendrás que volver a autorizar. Podés <a href="${oauthConnectionsPath}">revocar el acceso</a> antes.</p>
  <form method="post">
    <button type="submit" name="decision" value="approve">Autorizar lectura</button>
    <button type="submit" name="decision" value="deny">Cancelar</button>
  </form>
</main>
</html>`

const authorize = async (request: Request) => {
  const config = getOrganizerOAuth()
  if (!config) return new Response(null, { status: 404, headers: responseHeaders })
  const url = new URL(request.url)
  const authorization = parseOrganizerAuthorization(url.searchParams, config)
  if (!authorization) return new Response('Solicitud de autorización inválida.', { status: 400, headers: responseHeaders })
  if (request.method === 'POST' && request.headers.get('origin') !== config.issuer) {
    return new Response('Origen inválido.', { status: 403, headers: responseHeaders })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const login = new URL('/login', config.issuer)
    login.searchParams.set('redirectTo', url.pathname + url.search)
    return new Response(null, { status: 303, headers: { ...responseHeaders, Location: login.href } })
  }

  const { data: profile, error } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (error || !profile?.role || !organizerReadRoles.includes(profile.role)) {
    return new Response('Esta cuenta no tiene permisos de organización.', { status: 403, headers: responseHeaders })
  }
  if (request.method === 'GET') {
    return new Response(consentHtml, { headers: { ...responseHeaders, 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const decision = (await request.formData().catch(() => null))?.get('decision')
  if (decision !== 'approve' && decision !== 'deny') {
    return new Response('Elegí si querés autorizar el acceso.', { status: 400, headers: responseHeaders })
  }

  const callback = new URL(config.redirectUri)
  callback.searchParams.set('state', authorization.state)
  callback.searchParams.set('iss', config.issuer)
  if (decision === 'deny') {
    callback.searchParams.set('error', 'access_denied')
  } else {
    try {
      callback.searchParams.set('code', await issueOrganizerCode(user.id, authorization.challenge, config))
    } catch (error) {
      console.error('[mcp/oauth] Code issuance failed', error)
      callback.searchParams.set('error', 'server_error')
    }
  }
  return new Response(null, { status: 303, headers: { ...responseHeaders, Location: callback.href } })
}

export { authorize as GET, authorize as POST }
