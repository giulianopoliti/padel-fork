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
  const [isFvHeroVisible, setIsFvHeroVisible] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const branding = getTenantBranding()
  const isElite = branding.key === "padel-elite"
  const isFvHome = !isElite && pathname === "/"

  useEffect(() => {
    if (!isFvHome) {
      setIsFvHeroVisible(false)
      return
    }

    const hero = document.querySelector("[data-padel-fv-hero]")
    if (!hero) return

    const observer = new IntersectionObserver(
      ([entry]) => setIsFvHeroVisible(entry.isIntersecting),
      { threshold: 0.12 },
    )

    observer.observe(hero)
    return () => observer.disconnect()
  }, [isFvHome])

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

  const isTournamentDetailPage = (pathname?.startsWith("/tournaments/") && pathname !== "/tournaments") || pathname?.startsWith("/torneos/")
  const contextualLoginHref = isTournamentDetailPage ? `/login?redirectTo=${encodeURIComponent(pathname)}` : "/login"
  const contextualRegisterHref = isTournamentDetailPage ? `/register?redirectTo=${encodeURIComponent(pathname)}` : "/register"
  const isFvHomeOverHero = isFvHome && isFvHeroVisible
  const isFvDarkNavbar = !isElite
  const headerClassName = isElite
    ? "sticky top-0 z-50 bg-gray-950/95 shadow-md backdrop-blur"
    : isFvHomeOverHero
      ? "sticky top-0 z-50 border-b border-white/10 bg-[#0b1933]/95 shadow-[0_8px_24px_rgba(8,16,31,0.18)] backdrop-blur lg:bg-[#0b1933]/78 transition-colors duration-200"
      : "sticky top-0 z-50 border-b border-white/10 bg-[#0b1933] shadow-[0_8px_24px_rgba(8,16,31,0.18)]"
  const activeDesktopClassName = isElite
    ? "bg-blue-600 text-white font-medium"
    : "relative h-full px-1 text-sm font-semibold text-white after:absolute after:bottom-0 after:left-1/2 after:h-[3px] after:w-7 after:-translate-x-1/2 after:rounded-full after:bg-court-500"
  const inactiveDesktopClassName = isElite
    ? "text-gray-300 hover:bg-gray-800 hover:text-white"
    : "h-full px-1 text-sm font-medium text-slate-300 hover:text-white"
  const activeMobileClassName = isElite ? "bg-blue-600 text-white" : "border-l-2 border-court-500 bg-white/5 text-white"
  const inactiveMobileClassName = isElite
    ? "text-gray-300 hover:bg-gray-800 hover:text-white"
    : "border-l-2 border-transparent text-slate-300 hover:bg-white/5 hover:text-white"
  const mobilePanelClassName = isElite
    ? "border-t border-gray-800 py-4 lg:hidden"
    : "border-t border-white/10 bg-[#101d3a] px-4 py-3 shadow-[0_16px_28px_rgba(8,16,31,0.24)] lg:hidden"
  const mobilePanelDividerClassName = isElite
    ? "mt-4 border-t border-gray-800 pt-4"
    : "mt-3 border-t border-white/10 pt-3"
  const loginButtonClassName = isElite
    ? `px-4 py-2 text-base transition-all duration-200 ${inactiveDesktopClassName}`
    : "px-2 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-transparent hover:text-white"

  return (
    <header ref={headerRef} className={headerClassName}>
      <div className={isElite ? "container mx-auto px-6" : "container mx-auto px-4 sm:px-6"}>
        <div className={isElite ? "flex h-20 items-center justify-between" : "relative flex h-16 items-center lg:h-[72px]"}>
          <Link href="/" className="flex items-center space-x-3">
            <BrandLogo
              variant="navbar"
              surface={isFvDarkNavbar ? "dark" : "light"}
              emphasized={isFvDarkNavbar}
            />
          </Link>

          <nav className={isElite ? "hidden lg:flex items-center space-x-2" : "absolute left-1/2 hidden h-full -translate-x-1/2 items-center gap-7 lg:flex"} aria-label="Navegación principal">
            {mainLinks.map((link) => {
              const IconComponent = getIconComponent(link.icon)
              const isActive = link.path === "/" ? pathname === "/" : pathname === link.path || pathname?.startsWith(`${link.path}/`)

              return (
                <Link
                  key={link.path}
                  href={link.path}
                  className={isElite ? `flex items-center space-x-2 px-5 py-2.5 rounded-full text-base transition-all duration-200 ${
                    isActive ? activeDesktopClassName : inactiveDesktopClassName
                  }` : `flex items-center gap-2 transition-colors ${isActive ? activeDesktopClassName : inactiveDesktopClassName}`}
                >
                  <IconComponent className={isElite ? "h-5 w-5" : "h-4 w-4"} />
                  <span>{link.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className={isElite ? "hidden items-center space-x-3 lg:flex" : "ml-auto hidden items-center space-x-3 lg:flex"}>
            {user ? (
              <div className="transition-all duration-300 ease-in-out">
                <NavbarUserProfile profileLinks={profileLinks} />
              </div>
            ) : (
              <div className="flex items-center space-x-3 transition-all duration-300 ease-in-out">
                <Button variant="ghost" size="sm" className={loginButtonClassName} asChild>
                  <Link href={contextualLoginHref}>Iniciar sesión</Link>
                </Button>
                <Button size="sm" className={isElite ? "bg-blue-600 px-4 py-2 text-base text-white transition-all duration-200 hover:bg-blue-700" : "h-10 rounded-control bg-court-500 px-5 text-sm font-bold text-brand-900 transition-colors hover:bg-court-400"} asChild>
                  <Link href={contextualRegisterHref}>Crear cuenta</Link>
                </Button>
              </div>
            )}
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={isElite ? `lg:hidden rounded-full p-2 ${inactiveMobileClassName}` : "ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/15 lg:hidden"}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Cerrar menu" : "Abrir menu"}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className={mobilePanelClassName}>
              <nav className={isElite ? "space-y-2" : "space-y-1"} aria-label="Navegación móvil">
                {mainLinks.map((link) => {
                  const IconComponent = getIconComponent(link.icon)
                  const isActive = link.path === "/" ? pathname === "/" : pathname === link.path || pathname?.startsWith(`${link.path}/`)

                  return (
                    <Link
                      key={link.path}
                      href={link.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={isElite ? `flex items-center space-x-3 px-4 py-3 rounded-elevated text-base transition-all duration-200 ${
                        isActive ? activeMobileClassName : inactiveMobileClassName
                      }` : `flex min-h-14 items-center gap-3 px-4 text-base font-semibold transition-colors ${isActive ? activeMobileClassName : inactiveMobileClassName}`}
                    >
                      <IconComponent className="h-5 w-5" />
                      <span>{link.label}</span>
                    </Link>
                  )
                })}
              </nav>

              <div className={mobilePanelDividerClassName}>
                {user ? (
                  <div className="px-4 transition-all duration-300 ease-in-out">
                    <NavbarUserProfile profileLinks={profileLinks} />
                  </div>
                ) : (
                  <div className={isElite ? "space-y-2 px-4 transition-all duration-300 ease-in-out" : "space-y-2 transition-all duration-300 ease-in-out"}>
                    <Button variant="ghost" className={isElite ? `w-full justify-start text-base transition-all duration-200 ${inactiveMobileClassName}` : "w-full justify-center text-base font-semibold text-slate-100 hover:bg-transparent hover:text-white"} asChild>
                      <Link href={contextualLoginHref}>Iniciar sesión</Link>
                    </Button>
                    <Button className={isElite ? "w-full bg-blue-600 text-base text-white transition-all duration-200 hover:bg-blue-700" : "h-11 w-full rounded-control bg-court-500 text-base font-bold text-brand-900 transition-colors hover:bg-court-400"} asChild>
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
