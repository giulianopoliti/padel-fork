"use client"

import { type AuthState, useUser } from "@/contexts/user-context"
import { Suspense, useMemo, useEffect, useState } from "react"
import { getLinksForRole } from "@/config/permissions"

type Role = "PLAYER" | "CLUB" | "COACH" | "ADMIN" | "ORGANIZADOR"

import NavbarClient from "./navbar-client"
import SkeletonNavbar from "./skeleton-navbar"
import { getTenantBranding } from "@/config/tenant"

const publicLinks = [
  {
    path: "/",
    label: "Inicio",
    icon: "Home" as const,
  },
  {
    path: "/torneos",
    label: "Torneos",
    icon: "Trophy" as const,
  },
  {
    path: "/clubes",
    label: "Clubes",
    icon: "MapPin" as const,
  },
]

const profileLinkPaths = ["/edit-profile", "/panel"]

const useNavbarLinks = (userRole: Role | null, authState: AuthState) => {
  return useMemo(() => {
    if (authState === "session-only" || authState === "error") {
      return { mainLinks: [], profileLinks: [] }
    }

    if (authState === "guest") {
      return { mainLinks: publicLinks, profileLinks: [] }
    }

    const branding = getTenantBranding()
    const allAuthLinks = userRole
      ? getLinksForRole(userRole).filter((link) => branding.features.showRankingInNav || link.path !== "/ranking")
      : []

    const mainLinks = allAuthLinks.filter((link) => !profileLinkPaths.includes(link.path))
    const profileLinks = allAuthLinks.filter((link) => profileLinkPaths.includes(link.path))

    return { mainLinks, profileLinks }
  }, [authState, userRole])
}

export default function Navbar() {
  const { user, userDetails, authState, loading, authLoading, error } = useUser()
  const [forceShowNavbar, setForceShowNavbar] = useState(false)

  useEffect(() => {
    const maxWaitTime = 15000
    const timer = setTimeout(() => {
      if ((authLoading || loading) && !forceShowNavbar) {
        setForceShowNavbar(true)
      }
    }, maxWaitTime)

    if (!authLoading && !loading) {
      setForceShowNavbar(false)
    }

    return () => clearTimeout(timer)
  }, [authLoading, loading, forceShowNavbar])

  const showSkeleton = useMemo(() => {
    if (error || forceShowNavbar) {
      return false
    }

    return authLoading || authState === "session-only" || (!!user && loading)
  }, [authLoading, authState, user, loading, error, forceShowNavbar])

  const userRole = authState === "ready" ? (userDetails?.role as Role | null) : null
  const { mainLinks, profileLinks } = useNavbarLinks(userRole, authState)

  return (
    <Suspense fallback={<SkeletonNavbar />}>
      {showSkeleton ? <SkeletonNavbar /> : <NavbarClient mainLinks={mainLinks} profileLinks={profileLinks} user={user} />}
    </Suspense>
  )
}
