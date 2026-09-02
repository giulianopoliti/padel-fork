import { NextResponse, type NextRequest } from 'next/server'
import { getTenantCanonicalSiteUrl } from '@/config/tenant'
import { updateSession } from '@/utils/supabase/middleware'

const tenantDomainPattern = /^(?:www\.)?(?:padelfv\.com|tpepadel\.com)$/i

const getCanonicalHost = () => new URL(getTenantCanonicalSiteUrl()).host

const getCanonicalRedirect = (request: NextRequest) => {
  const requestHost =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host') ||
    request.nextUrl.host
  const canonicalHost = getCanonicalHost()

  if (!tenantDomainPattern.test(requestHost) || requestHost === canonicalHost) {
    return null
  }

  const destination = request.nextUrl.clone()
  destination.protocol = 'https:'
  destination.host = canonicalHost
  destination.port = ''

  return NextResponse.redirect(destination, 308)
}

export async function middleware(request: NextRequest) {
  // Skip middleware for static files and API routes that don't need auth
  const path = request.nextUrl.pathname;
  
  // Skip completely for these patterns
  if (
    path.startsWith('/_next/') ||
    path.startsWith('/api/') ||
    path.startsWith('/auth/') ||
    path.includes('.') ||
    path === '/favicon.ico'
  ) {
    return;
  }

  const canonicalRedirect = getCanonicalRedirect(request)
  if (canonicalRedirect) {
    return canonicalRedirect
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Optimized matcher - only run on paths that actually need auth checking
     * Excludes:
     * - Static files (_next/static, _next/image)
     * - Image optimization files
     * - All file extensions (images, fonts, etc.)
     * - Auth callback routes (handled separately)
     * - Prefetch requests (performance optimization)
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ]
    }
  ],
}
