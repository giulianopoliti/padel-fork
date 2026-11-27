import { createClient } from '@/utils/supabase/server'
import {
  getOrganizerOAuth, oauthConnectionsPath, oauthNoStore, revokeOrganizerAccess,
} from '@/lib/mcp/organizer-auth'

const headers = {
  ...oauthNoStore,
  'Content-Type': 'text/html; charset=utf-8',
  // Preserve Origin on same-origin form POSTs; hide URLs from other sites.
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
}

const connections = async (request: Request) => {
  const config = getOrganizerOAuth()
  if (!config) return new Response(null, { status: 404, headers })
  if (request.method === 'POST' && request.headers.get('origin') !== config.issuer) {
    return new Response('Origen inválido.', { status: 403, headers })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const login = new URL('/login', config.issuer)
    login.searchParams.set('redirectTo', oauthConnectionsPath)
    return new Response(null, { status: 303, headers: { ...headers, Location: login.href } })
  }

  if (request.method === 'POST') {
    const decision = (await request.formData().catch(() => null))?.get('decision')
    if (decision !== 'revoke') return new Response('Solicitud inválida.', { status: 400, headers })
    try {
      await revokeOrganizerAccess(user.id, config)
    } catch (error) {
      console.error('[mcp/oauth] Revocation failed', error)
      return new Response('No se pudo revocar el acceso. Volvé a intentarlo.', { status: 500, headers })
    }
  }

  return new Response(`<!doctype html>
<html lang="es-AR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acceso de ChatGPT a Padel FV</title><main>
<h1>Acceso de ChatGPT a Padel FV</h1>
${request.method === 'POST' ? '<p>Se revocaron todos los accesos de ChatGPT de tu cuenta.</p>' : ''}
<p>Podés revocar todas las autorizaciones de tu cuenta. ChatGPT tendrá que pedir permiso nuevamente para consultar disponibilidades, notas e historial privado.</p>
<p>Los accesos vencen a las ocho horas de su emisión. Revocarlos impide nuevas consultas; no elimina los datos ya compartidos en un chat.</p>
<form method="post"><button type="submit" name="decision" value="revoke">Revocar accesos de ChatGPT</button></form>
<p><a href="/panel">Volver a Padel FV</a></p>
</main></html>`, { headers })
}

export { connections as GET, connections as POST }
