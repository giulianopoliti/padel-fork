import { createClient } from '@/utils/supabase/server'
import {
  getOrganizerOAuth, issueOrganizerCode, oauthConnectionsPath, oauthNoStore, organizerReadRoles, parseOrganizerAuthorization,
} from '@/lib/mcp/organizer-auth'

const createResponseHeaders = (redirectUri?: string): Record<string, string> => ({
  ...oauthNoStore,
  // Preserve Origin on same-origin form POSTs; hide OAuth URLs from other sites.
  'Referrer-Policy': 'same-origin',
  // Chrome checks form-action against the destination of the POST's 303 redirect.
  'Content-Security-Policy': `default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'${redirectUri ? ` ${redirectUri}` : ''}; frame-ancestors 'none'; base-uri 'none'`,
})

// Regenerate the standalone Tailwind stylesheet with npm run styles:mcp after changing classes.
const consentHtml = `<!doctype html>
<html lang="es-AR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Conectar con ChatGPT | Padel FV</title>
  <link rel="icon" href="/tenants/padel-fv/favicon.ico">
  <link rel="stylesheet" href="/mcp-oauth.css?v=1">
</head>
<body class="bg-brand-900 font-sans antialiased">
<main class="grid min-h-screen place-items-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 px-4 py-8 sm:py-12">
  <div class="w-full max-w-lg">
    <section aria-labelledby="consent-title" class="overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div class="h-1.5 bg-court-500" aria-hidden="true"></div>
      <div class="p-6 sm:p-9">
        <div class="mb-8 flex items-center justify-between gap-4">
          <img src="/FV%20-%20LOGO%20SIN%20FONDO%20-%20LETRA%20AZUL.png" alt="Padel FV" width="160" height="64" class="h-14 w-auto max-w-[50%] object-contain">
          <span class="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-500">Organizadores</span>
        </div>
        <h1 id="consent-title" class="text-3xl font-bold tracking-tight text-brand-900">Conectar con ChatGPT</h1>
        <p class="mt-3 text-sm leading-6 text-slate-600">Autorizá a ChatGPT a consultar tus ligas de Padel FV para ayudarte a organizar los partidos.</p>

        <h2 class="mb-4 mt-7 text-xs font-semibold uppercase tracking-widest text-slate-500">Qué vas a compartir</h2>
        <ul class="space-y-4">
          <li class="flex gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/></svg>
            </span>
            <div><p class="text-sm font-semibold text-brand-900">Horarios y disponibilidades</p><p class="mt-0.5 text-sm leading-5 text-slate-500">Franjas, preferencias y notas de los jugadores.</p></div>
          </li>
          <li class="flex gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v3H9zM9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3M8 11h8M8 15h8"/></svg>
            </span>
            <div><p class="text-sm font-semibold text-brand-900">Resultados e historial</p><p class="mt-0.5 text-sm leading-5 text-slate-500">Fechas, partidos y cruces de las ligas que administrás.</p></div>
          </li>
        </ul>

        <div class="mt-6 flex gap-3 rounded-2xl border border-court-200 bg-court-50 p-4">
          <svg class="mt-0.5 shrink-0 text-court-800" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>
          <div><p class="text-sm font-semibold text-brand-900">Solo lectura · 8 horas</p><p class="mt-1 text-sm leading-5 text-court-900">Esta conexión no crea ni modifica partidos. Al vencer, tendrás que volver a autorizar.</p></div>
        </div>

        <form method="post" class="mt-7 flex flex-col gap-3 sm:flex-row-reverse">
          <button type="submit" name="decision" value="approve" class="min-h-12 flex-1 rounded-xl bg-court-500 px-5 py-3 text-sm font-bold text-brand-900 transition-colors hover:bg-court-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:bg-court-600">Autorizar lectura</button>
          <button type="submit" name="decision" value="deny" class="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">Cancelar</button>
        </form>
        <p class="mt-5 text-center text-xs leading-5 text-slate-500">Después de autorizar, volverás a ChatGPT.</p>
      </div>
    </section>
    <p class="mt-5 text-center text-xs leading-5 text-slate-300">Podés <a href="${oauthConnectionsPath}" class="rounded underline underline-offset-4 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-court-500 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900">revocar el acceso</a> cuando quieras.</p>
  </div>
</main>
</body>
</html>`

const authorize = async (request: Request) => {
  const config = getOrganizerOAuth()
  const responseHeaders = createResponseHeaders(config?.redirectUri)
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
