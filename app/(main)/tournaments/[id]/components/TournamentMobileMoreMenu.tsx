"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import type { TournamentMobileNavItem } from "./TournamentMobileBottomNav"

interface TournamentMobileMoreMenuProps {
  items: TournamentMobileNavItem[]
  onNavigate?: () => void
}

export default function TournamentMobileMoreMenu({
  items,
  onNavigate,
}: TournamentMobileMoreMenuProps) {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="border-b border-border/70 px-5 py-4">
        <p className="text-sm font-semibold text-foreground">Mas opciones</p>
        <p className="mt-1 text-xs text-muted-foreground">Navegacion del torneo</p>
      </div>

      <nav className="flex-1 px-3 py-3" aria-label="Mas opciones del torneo">
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-surface border px-3 py-3 text-sm font-medium transition-colors",
                    active
                      ? "border-primary/20 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/70 hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
