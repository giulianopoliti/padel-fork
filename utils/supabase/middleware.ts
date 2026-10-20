import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"
import { checkRoutePermission, getRedirectPath } from "@/config/permissions"
import { getLegacyTournamentRedirectPath } from '@/lib/seo/legacy-tournament-redirect'

// Define user roles (ensure this matches config/permissions.ts and your user data)
type Role = "PLAYER" | "CLUB" | "COACH" | "ADMIN" | "ORGANIZADOR"

// 🚀 OPTIMIZACIÓN FASE 2: Cache optimizado con mayor duración
const sessionCache = new Map<string, { user: any; role: Role | null; isActive: boolean; timestamp: number }>()
const CACHE_DURATION = process.env.NODE_ENV === 'development' 
  ? 1000 // 1 segundo en desarrollo
  : 5 * 60 * 1000 // 5 minutos en producción

// Function to clear cache for a specific user (for logout)
export function clearUserCache(userId: string) {
  if (sessionCache.has(userId)) {
    sessionCache.delete(userId)
    //console.log(`[Middleware] Cleared cache for user: ${userId}`)
  }
}

// Function to clear all cache (for complete cleanup)
export function clearAllCache() {
  sessionCache.clear()
  //console.log("[Middleware] Cleared all cache")
}

// 🚀 OPTIMIZACIÓN FASE 2: Cleanup automático del cache
function cleanupExpiredCache() {
  const now = Date.now()
  for (const [key, value] of sessionCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      sessionCache.delete(key)
    }
  }
}

// Cleanup cada 10 minutos
setInterval(cleanupExpiredCache, 10 * 60 * 1000)

// Protected routes that require authentication
const DASHBOARD_PATH = "/panel"
const ADMIN_DASHBOARD_PATH = "/admin"
const ADMIN_LOGIN_PATH = "/admin-login"
const ONBOARDING_PATH = "/complete-google-profile"
const AUTH_CALLBACK_PATH = "/auth/callback"
const AUTH_PAGE_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"]
const AUTH_REDIRECT_PATHS = ["/login", "/register", "/forgot-password"]
const PROTECTED_ROUTES = [DASHBOARD_PATH, "/panel-cpa", "/edit-profile", "/profile"]
const ADMIN_ROUTES = [ADMIN_DASHBOARD_PATH] // Routes that require ADMIN role

export async function updateSession(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set("x-current-path", request.nextUrl.pathname)

  try {
    // Create an unmodified response
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            )
            response = NextResponse.next({
              request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const currentPath = request.nextUrl.pathname

    // Use getUser() instead of getSession() for authentic user data
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError) {
      //console.error("[Middleware] User auth error:", userError.message)
    }
    const userId = user?.id

    const tournamentRedirectPath = await getLegacyTournamentRedirectPath(supabase, currentPath)
    if (tournamentRedirectPath) {
      const url = request.nextUrl.clone()
      url.pathname = tournamentRedirectPath
      const redirectResponse = NextResponse.redirect(url, 308)
      response.cookies.getAll().forEach(cookie => redirectResponse.cookies.set(cookie))
      return redirectResponse
    }

    // If no session/user, clear any cached data for this user
    if (!user && userId) {
      clearUserCache(userId)
    }

    // ========================================
    // ✅ FIX: EARLY RETURNS para auth pages y root
    // Previene race conditions y queries innecesarias
    // ========================================

    // ========================================
    // ✅ ADMIN ROUTES HANDLING
    // ========================================

    // Admin-login is public - allow access
    if (currentPath === ADMIN_LOGIN_PATH) {
      // If already authenticated, we'll check role later and redirect if needed
      if (!user) {
        // Not authenticated, allow access to admin-login page
        return response
      }
      // If authenticated, continue to check role below
    }

    // If accessing admin routes without authentication, redirect to admin login
    if (!user && ADMIN_ROUTES.some(route => currentPath.startsWith(route))) {
      const url = request.nextUrl.clone()
      url.pathname = ADMIN_LOGIN_PATH
      console.log(`[Middleware] Redirecting unauthenticated user to admin login`)
      return NextResponse.redirect(url, { headers })
    }

    // Early return for public routes when no user
    if (!user && !PROTECTED_ROUTES.some(route => currentPath.startsWith(route))) {
      return response
    }

    // If no user and trying to access protected route, redirect to login
    if (!user && PROTECTED_ROUTES.some(route => currentPath.startsWith(route))) {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      return NextResponse.redirect(url, { headers })
    }

    // If user exists, check cache first for role and active status
    let userRole: Role | null = null
    let isActiveClub: boolean = true // Default to true for non-club users
    let userRecordMissing = false
    const cacheKey = userId || ""
    const now = Date.now()
    
    if (userId && sessionCache.has(cacheKey)) {
      const cached = sessionCache.get(cacheKey)!
      if (now - cached.timestamp < CACHE_DURATION) {
        userRole = cached.role
        isActiveClub = cached.isActive
        //console.log(`[Middleware] Using cached role for user ${userId}: ${userRole}, isActive: ${isActiveClub}`)
      } else {
        sessionCache.delete(cacheKey)
        //console.log(`[Middleware] Cache expired for user ${userId}, fetching fresh data`)
      }
    }

    // If not in cache or cache expired, fetch role and club status
    if (userId && userRole === null) {
      try {
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("role")
          .eq("id", userId)
          .maybeSingle()

        if (!userError && userData) {
          userRole = userData.role as Role
          isActiveClub = true // Default to true for non-club users
          
          // If user is a club, check if they are active
          if (userRole === "CLUB") {
            const { data: clubData, error: clubError } = await supabase
              .from("clubes")
              .select("is_active")
              .eq("user_id", userId)
              .maybeSingle()

            if (!clubError && clubData) {
              isActiveClub = clubData.is_active
              //  console.log(`[Middleware] Club active status for user ${userId}: ${isActiveClub}`)
            } else if (clubError) {
              console.error("[Middleware] Error fetching club active status:", clubError.message)
              isActiveClub = false // Default to false if error
            }
          }
          
          // Cache the result
          sessionCache.set(cacheKey, {
            user,
            role: userRole,
            isActive: isActiveClub,
            timestamp: now
          })
          // console.log(`[Middleware] Cached role for user ${userId}: ${userRole}, isActive: ${isActiveClub}`)
        } else if (userError) {
          console.error("[Middleware] Error fetching user role:", userError.message)
        } else {
          userRecordMissing = true
        }
      } catch (dbError) {
          console.error("[Middleware] Database error fetching role:", dbError)
      }
    }

    const isOnboardingPath = currentPath === ONBOARDING_PATH || currentPath.startsWith(`${ONBOARDING_PATH}/`)
    const isAuthCallbackPath = currentPath === AUTH_CALLBACK_PATH || currentPath.startsWith(`${AUTH_CALLBACK_PATH}/`)
    const isAuthPage = AUTH_PAGE_PATHS.some((path) => currentPath === path || currentPath.startsWith(`${path}/`))
    const shouldRedirectAuthenticatedAuthPage = AUTH_REDIRECT_PATHS.some(
      (path) => currentPath === path || currentPath.startsWith(`${path}/`),
    )

    if (user && userRecordMissing && !isOnboardingPath && !isAuthCallbackPath) {
      const url = request.nextUrl.clone()
      url.pathname = ONBOARDING_PATH

      if (!isAuthPage && currentPath !== "/") {
        url.searchParams.set("next", `${currentPath}${request.nextUrl.search}`)
      } else {
        url.searchParams.delete("next")
      }

      return NextResponse.redirect(url, { headers })
    }

    // Redirect authenticated users with a completed profile away from auth pages
    if (user && userRole && shouldRedirectAuthenticatedAuthPage) {
      const url = request.nextUrl.clone()
      url.pathname = DASHBOARD_PATH
      return NextResponse.redirect(url, { headers })
    }

    // Redirect authenticated users with a completed profile landing on root to dashboard
    if (user && userRole && currentPath === "/") {
      const url = request.nextUrl.clone()
      url.pathname = DASHBOARD_PATH
      return NextResponse.redirect(url, { headers })
    }

    // ========================================
    // ✅ ADMIN ROLE CHECKS AFTER FETCHING ROLE
    // ========================================

    // If user is on admin-login and is already ADMIN, redirect to admin panel
    if (currentPath === ADMIN_LOGIN_PATH && userRole === "ADMIN") {
      const url = request.nextUrl.clone()
      url.pathname = ADMIN_DASHBOARD_PATH
      console.log(`[Middleware] ADMIN already logged in, redirecting to admin panel`)
      return NextResponse.redirect(url, { headers })
    }

    // If user is trying to access admin routes but is NOT ADMIN, deny access
    if (ADMIN_ROUTES.some(route => currentPath.startsWith(route)) && userRole !== "ADMIN") {
      const url = request.nextUrl.clone()
      url.pathname = "/"
      console.log(`[Middleware] Non-ADMIN user attempted to access admin panel, redirecting to home`)
      return NextResponse.redirect(url, { headers })
    }

    // Check if club is inactive and redirect to pending approval page
    if (userRole === "CLUB" && !isActiveClub && currentPath !== "/pending-approval") {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = "/pending-approval"
      // console.log(`[Middleware] Redirecting inactive club to pending approval page`)
      return NextResponse.redirect(redirectUrl, { headers })
    }

    // Check route permission using existing function
    const hasPermission = checkRoutePermission(currentPath, userRole)
    const isAuthenticated = !!user

    console.log(`[Middleware] Path: ${currentPath}, User: ${userId || 'None'}, Role: ${userRole || 'None'}, IsActiveClub: ${isActiveClub}, HasPermission: ${hasPermission}`)

    // Redirect if user lacks permission or isn't authenticated for a protected route
    if (!hasPermission) {
      const redirectPath = getRedirectPath(currentPath, isAuthenticated, hasPermission)
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = redirectPath
      //console.log(`[Middleware] Redirecting to: ${redirectUrl.pathname}`)
      return NextResponse.redirect(redirectUrl, { headers })
    }

    // ✅ Auth page redirects ya se manejan al inicio (línea ~95)

    return response
  } catch (error) {
    console.error("[Middleware] Critical error:", error)
    // On error, allow the request to continue rather than breaking the app
    return NextResponse.next({
      request: {
        headers,
      },
    })
  }
}
