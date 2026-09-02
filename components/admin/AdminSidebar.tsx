"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Users,
  UserCircle,
  Building2,
  Trophy,
  Swords,
  ReceiptText,
  Shield,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUser } from "@/contexts/user-context"

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard
  },
  {
    label: "Usuarios",
    href: "/admin/users",
    icon: Users
  },
  {
    label: "Jugadores",
    href: "/admin/players",
    icon: UserCircle
  },
  {
    label: "Clubes",
    href: "/admin/clubs",
    icon: Building2
  },
  {
    label: "Organizadores",
    href: "/admin/organizations",
    icon: Shield
  },
  {
    label: "Torneos",
    href: "/admin/tournaments",
    icon: Trophy
  },
  {
    label: "Partidos",
    href: "/admin/matches",
    icon: Swords
  },
  {
    label: "Cobros",
    href: "/admin/cobros",
    icon: ReceiptText
  }
]

export const AdminSidebar = () => {
  const pathname = usePathname()
  const { logout } = useUser()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  // Cargar estado de colapso desde localStorage
  useEffect(() => {
    const saved = localStorage.getItem("adminSidebarCollapsed")
    if (saved !== null) {
      setIsCollapsed(JSON.parse(saved))
    }
  }, [])

  // Guardar estado de colapso
  const handleToggleCollapse = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem("adminSidebarCollapsed", JSON.stringify(newState))
  }

  const handleLogout = async () => {
    await logout()
    window.location.href = "/admin-login"
  }

  const handleMobileNavClick = () => {
    setIsMobileOpen(false)
  }

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed top-4 left-4 z-50 md:hidden flex items-center justify-center w-10 h-10 bg-red-700 text-white rounded-surface shadow-lg"
        aria-label="Abrir menú"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "flex h-full flex-col border-r bg-slate-50 transition-all duration-300",
          // Mobile
          "fixed inset-y-0 left-0 z-50 md:relative",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          // Desktop
          isCollapsed ? "md:w-16" : "md:w-64",
          "w-64" // Mobile siempre ancho completo
        )}
      >
        {/* Header */}
        <div className="border-b bg-gradient-to-r from-red-700 to-red-900 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-surface bg-white/20 shrink-0">
                <Shield className="h-6 w-6 text-white" />
              </div>
              {!isCollapsed && (
                <div className="md:block">
                  <h1 className="text-lg font-bold text-white">Panel Admin</h1>
                  <p className="text-xs text-red-100">Gestión del sistema</p>
                </div>
              )}
            </div>
            {/* Close button for mobile */}
            <button
              onClick={() => setIsMobileOpen(false)}
              className="md:hidden text-white"
              aria-label="Cerrar menú"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleMobileNavClick}
                className={cn(
                  "flex items-center rounded-surface px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-red-100 text-red-900"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                  isCollapsed ? "justify-center md:space-x-0" : "space-x-3"
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon className={cn("h-5 w-5 shrink-0", isActive ? "text-red-700" : "text-slate-500")} />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t p-4 space-y-2">
          {/* Collapse Toggle (Desktop only) */}
          <Button
            variant="ghost"
            className={cn(
              "hidden md:flex w-full text-slate-700 hover:bg-slate-100",
              isCollapsed ? "justify-center px-0" : "justify-start"
            )}
            onClick={handleToggleCollapse}
            title={isCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <>
                <ChevronLeft className="mr-2 h-5 w-5" />
                <span>Colapsar</span>
              </>
            )}
          </Button>

          {/* Logout Button */}
          <Button
            variant="ghost"
            className={cn(
              "w-full text-slate-700 hover:bg-red-50 hover:text-red-900",
              isCollapsed ? "justify-center px-0" : "justify-start"
            )}
            onClick={handleLogout}
            title={isCollapsed ? "Cerrar sesión" : undefined}
          >
            <LogOut className={cn("h-5 w-5", isCollapsed ? "" : "mr-2")} />
            {!isCollapsed && <span>Cerrar sesión</span>}
          </Button>
        </div>
      </div>
    </>
  )
}
