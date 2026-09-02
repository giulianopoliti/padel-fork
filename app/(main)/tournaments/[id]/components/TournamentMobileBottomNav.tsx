"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, CalendarCheck2, Clock3, Home, Menu, Trophy } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export interface TournamentMobileNavItem {
  label: string
  href: string
  icon: LucideIcon
}

interface TournamentMobileBottomNavProps {
  tournamentId: string
  items: TournamentMobileNavItem[]
  hasMoreItems?: boolean
  onMore?: () => void
}

export const getMobileTournamentNavigationItems = (
  tournamentId: string,
  role: 'PLAYER' | 'ORGANIZER' | 'PUBLIC',
  showAvailability: boolean
): TournamentMobileNavItem[] => {
  const publicItems = [
    { label: "Inicio", href: `/tournaments/${tournamentId}`, icon: Home },
    { label: "Tablas", href: `/tournaments/${tournamentId}/qually`, icon: BarChart3 },
    { label: "Llave", href: `/tournaments/${tournamentId}/bracket`, icon: Trophy },
  ]
  const playerItems = [
    { label: "Inicio", href: `/tournaments/${tournamentId}`, icon: Home },
    ...(showAvailability
      ? [{ label: "Disponibilidad", href: `/tournaments/${tournamentId}/schedules`, icon: CalendarCheck2 }]
      : []),
    { label: "Tablas", href: `/tournaments/${tournamentId}/qually`, icon: BarChart3 },
    { label: "Llave", href: `/tournaments/${tournamentId}/bracket`, icon: Trophy },
  ]
  const organizerItems = [
    { label: "Inicio", href: `/tournaments/${tournamentId}`, icon: Home },
    { label: "Horarios", href: `/tournaments/${tournamentId}/schedules`, icon: CalendarCheck2 },
    { label: "Partidos", href: `/tournaments/${tournamentId}/match-scheduling`, icon: Clock3 },
    { label: "Llave", href: `/tournaments/${tournamentId}/bracket`, icon: Trophy },
  ]

  if (role === 'PUBLIC') return publicItems
  return role === 'ORGANIZER' ? organizerItems : playerItems
}

const getIsActive = (pathname: string, href: string, tournamentId: string) => {
  const tournamentHome = `/tournaments/${tournamentId}`
  return href === tournamentHome ? pathname === tournamentHome : pathname.startsWith(href)
}

export default function TournamentMobileBottomNav({
  tournamentId,
  items,
  hasMoreItems = false,
  onMore,
}: TournamentMobileBottomNavProps) {
  const pathname = usePathname()
  const columnCount = Math.min(items.length + (hasMoreItems ? 1 : 0), 5)

  if (columnCount === 0) {
    return null
  }

  return (
    <nav
      aria-label="Navegacion principal del torneo"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-card/95 px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 shadow-[0_-8px_30px_rgba(15,23,42,0.12)] backdrop-blur-lg lg:hidden"
    >
      <div
        className={cn(
          "mx-auto grid max-w-lg",
          columnCount === 1 && "grid-cols-1",
          columnCount === 2 && "grid-cols-2",
          columnCount === 3 && "grid-cols-3",
          columnCount === 4 && "grid-cols-4",
          columnCount === 5 && "grid-cols-5"
        )}
      >
        {items.map((item) => {
          const active = getIsActive(pathname, item.href, tournamentId)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-elevated px-1 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/20 hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          )
        })}
        {hasMoreItems && onMore ? (
          <button
            type="button"
            onClick={onMore}
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-elevated px-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Abrir menu completo del torneo"
          >
            <Menu className="h-5 w-5" />
            <span>Mas</span>
          </button>
        ) : null}
      </div>
    </nav>
  )
}
