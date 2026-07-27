"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Trophy, Menu, X, BarChart3, Calendar, MapPin, User, Home, BookOpen } from "lucide-react"
import type { User as AuthUser } from "@supabase/supabase-js"
import NavbarUserProfile from "./navbar-user-profile"
import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { getIcon, IconName } from "@/components/icons"
import BrandLogo from "@/components/ui/brand-logo"
import { getTenantBranding } from "@/config/tenant"

interface NavLink {
  label: string
  icon: string
  path: string
}

interface NavbarClientProps {
  mainLinks: NavLink[]
  profileLinks: NavLink[]
  user: AuthUser | null
}

const getIconComponent = (iconName: string) => {
  const iconMap: Record<string, any> = {
    Home,
    Trophy,
    Calendar,
    BarChart3,
    MapPin,
    User,
    BookOpen,
    BarChart: BarChart3,
  }

  if (iconMap[iconName]) {
    return iconMap[iconName]
  }

  try {
    return getIcon(iconName as IconName)
  } catch {
    return Trophy
  }
}

export default function NavbarClient({ mainLinks, profileLinks, user }: NavbarClientProps) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const branding = getTenantBranding()
  const isElite = branding.key === "padel-elite"

  useEffect(() => {
    if (!mobileMenuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      const isInsideHeader = target instanceof Node && headerRef.current?.contains(target)
      const isInsideNavbarDropdown =
        target instanceof Element && target.closest("[data-navbar-dropdown-content='true']")

      if (!isInsideHeader && !isInsideNavbarDropdown) {
        setMobileMenuOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [mobileMenuOpen])

  const isTournamentDetailPage = pathname?.startsWith("/tournaments/") && pathname !== "/tournaments"
  const contextualLoginHref = isTournamentDetailPage ? `/login?redirectTo=${encodeURIComponent(pathname)}` : "/login"
  const contextualRegisterHref = isTournamentDetailPage ? `/register?redirectTo=${encodeURIComponent(pathname)}` : "/register"
  const headerClassName = isElite
    ? "sticky top-0 z-50 bg-gray-950/95 shadow-md backdrop-blur"
    : "sticky top-0 z-50 border-b border-brand-500/25 bg-brand-900 shadow-[0_12px_28px_rgba(8,16,31,0.28)]"
  const activeDesktopClassName = isElite
    ? "bg-blue-600 text-white font-medium"
    : "bg-court-500 text-brand-900 font-semibold shadow-sm"
  const inactiveDesktopClassName = isElite
    ? "text-gray-300 hover:bg-gray-800 hover:text-white"
    : "text-slate-100/90 hover:bg-white/10 hover:text-white"
  const activeMobileClassName = isElite ? "bg-blue-600 text-white" : "bg-court-500 text-brand-900"
  const inactiveMobileClassName = isElite
    ? "text-gray-300 hover:bg-gray-800 hover:text-white"
    : "text-slate-100/90 hover:bg-white/10 hover:text-white"

  return (
    <header ref={headerRef} className={headerClassName}>
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-20">
          <Link href="/" className="flex items-center space-x-3">
            <BrandLogo variant="navbar" surface="dark" />
          </Link>

          <nav className="hidden lg:flex items-center space-x-2">
            {mainLinks.map((link) => {
              const IconComponent = getIconComponent(link.icon)
              const isActive = link.path === "/" ? pathname === "/" : pathname === link.path || pathname?.startsWith(`${link.path}/`)

              return (
                <Link
                  key={link.path}
                  href={link.path}
                  className={`flex items-center space-x-2 px-5 py-2.5 rounded-full text-base transition-all duration-200 ${
                    isActive ? activeDesktopClassName : inactiveDesktopClassName
                  }`}
                >
                  <IconComponent className="h-5 w-5" />
                  <span>{link.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="hidden lg:flex items-center space-x-3">
            {user ? (
              <div className="transition-all duration-300 ease-in-out">
                <NavbarUserProfile profileLinks={profileLinks} />
              </div>
            ) : (
              <div className="flex items-center space-x-3 transition-all duration-300 ease-in-out">
                <Button variant="ghost" size="sm" className={`px-4 py-2 text-base transition-all duration-200 ${inactiveDesktopClassName}`} asChild>
                  <Link href={contextualLoginHref}>Iniciar sesión</Link>
                </Button>
                <Button size="sm" className={isElite ? "bg-blue-600 px-4 py-2 text-base text-white transition-all duration-200 hover:bg-blue-700" : "bg-court-500 px-4 py-2 text-base text-brand-900 transition-all duration-200 hover:bg-court-400"} asChild>
                  <Link href={contextualRegisterHref}>Crear cuenta</Link>
                </Button>
              </div>
            )}
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`lg:hidden rounded-full p-2 ${inactiveMobileClassName}`}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Cerrar menu" : "Abrir menu"}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className={isElite ? "border-t border-gray-800 py-4 lg:hidden" : "border-t border-white/10 py-4 lg:hidden"}>
              <nav className="space-y-2">
                {mainLinks.map((link) => {
                  const IconComponent = getIconComponent(link.icon)
                  const isActive = link.path === "/" ? pathname === "/" : pathname === link.path || pathname?.startsWith(`${link.path}/`)

                  return (
                    <Link
                      key={link.path}
                      href={link.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-base transition-all duration-200 ${
                        isActive ? activeMobileClassName : inactiveMobileClassName
                      }`}
                    >
                      <IconComponent className="h-5 w-5" />
                      <span>{link.label}</span>
                    </Link>
                  )
                })}
              </nav>

              <div className={isElite ? "mt-4 border-t border-gray-800 pt-4" : "mt-4 border-t border-white/10 pt-4"}>
                {user ? (
                  <div className="px-4 transition-all duration-300 ease-in-out">
                    <NavbarUserProfile profileLinks={profileLinks} />
                  </div>
                ) : (
                  <div className="space-y-2 px-4 transition-all duration-300 ease-in-out">
                    <Button variant="ghost" className={`w-full justify-start text-base transition-all duration-200 ${inactiveMobileClassName}`} asChild>
                      <Link href={contextualLoginHref}>Iniciar sesión</Link>
                    </Button>
                    <Button className={isElite ? "w-full bg-blue-600 text-base text-white transition-all duration-200 hover:bg-blue-700" : "w-full bg-court-500 text-base text-brand-900 transition-all duration-200 hover:bg-court-400"} asChild>
                      <Link href={contextualRegisterHref}>Crear cuenta</Link>
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}
