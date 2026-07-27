"use client"

import React from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Users,
  ListChecks,
  Trophy,
  GitFork,
  Settings,
  ChevronLeft,
  ChevronRight,
  Trophy as TrophyIcon,
  EyeOff
} from 'lucide-react'

interface TournamentAmericanSidebarProps {
  tournament: {
    id: string
    name: string
    category?: string
    status?: string
    enable_public_inscriptions?: boolean | null
    registration_locked?: boolean | null
    is_draft?: boolean
  }
  userRole?: string
  playerInscription?: {
    is_eliminated: boolean
    eliminated_at: string | null
    eliminated_in_round: string | null
  } | null
  collapsed?: boolean
  onToggle?: () => void
  mobile?: boolean
  onNavigate?: () => void
  hasManagePermission?: boolean
}

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  requiresActive?: boolean
  ownerOnly?: boolean
  requiresParticipantVisibility?: boolean
}

export const getAmericanNavigationItems = (
  userRole?: string,
  tournamentStatus?: string,
  canViewParticipantPages: boolean = true,
  canAccessInscriptions: boolean = canViewParticipantPages
): NavItem[] => {
  const isPlayer = userRole === 'PLAYER'
  const isTournamentActive = tournamentStatus !== 'NOT_STARTED' && tournamentStatus !== 'CANCELED'

  const baseItems: NavItem[] = [
    {
      title: 'Inscripciones',
      href: '/inscriptions',
      icon: Users,
      description: 'Gestión de parejas y jugadores',
      requiresActive: false,
      requiresParticipantVisibility: true
    },
    {
      title: 'Zonas',
      href: '/zones',
      icon: ListChecks,
      description: 'Armado y distribución de zonas',
      requiresActive: true
    },
    {
      title: 'Partidos de zona',
      href: '/matches',
      icon: Trophy,
      description: 'Resultados de partidos de zona',
      requiresActive: true
    },
    {
      title: 'Llave',
      href: '/bracket',
      icon: GitFork,
      description: 'Brackets y fase eliminatoria',
      requiresActive: true
    }
  ]

  const filteredItems = baseItems.filter(item =>
    (!item.requiresActive || isTournamentActive) &&
    (item.href !== '/inscriptions' || canAccessInscriptions) &&
    (canViewParticipantPages || !item.requiresParticipantVisibility)
  )

  if (userRole && !isPlayer) {
    filteredItems.push({
      title: 'Configuración',
      href: '/settings',
      icon: Settings,
      description: 'Configuración del torneo',
      requiresActive: false,
      ownerOnly: true
    })
  }

  return filteredItems
}

export default function TournamentAmericanSidebar({
  tournament,
  userRole,
  playerInscription,
  collapsed = false,
  onToggle,
  mobile = false,
  onNavigate,
  hasManagePermission = false
}: TournamentAmericanSidebarProps) {
  const pathname = usePathname()

  const hasActivePlayerInscription = Boolean(playerInscription && !playerInscription.is_eliminated)
  const canViewParticipantPages =
    Boolean(tournament.enable_public_inscriptions) ||
    hasManagePermission ||
    hasActivePlayerInscription
  const canAccessInscriptions =
    hasManagePermission ||
    hasActivePlayerInscription ||
    (Boolean(tournament.enable_public_inscriptions) && !tournament.registration_locked)

  const navigationItems = getAmericanNavigationItems(
    userRole,
    tournament.status,
    canViewParticipantPages,
    canAccessInscriptions
  )

  if (navigationItems.length === 0) {
    return null
  }

  const getIsActive = (href: string) => {
    return pathname.includes(href)
  }

  const handleLinkClick = () => {
    if (mobile && onNavigate) {
      onNavigate()
    }
  }

  return (
    <div className={cn(
      "flex flex-col border-r border-border/70 bg-card/95 transition-all duration-300",
      mobile ? "w-full" : collapsed ? "w-16" : "w-64",
      !mobile && "flex-shrink-0 h-full"
    )}>
      <div className={cn(
        "border-b border-border/70 transition-all duration-300",
        collapsed && !mobile ? "p-3" : "p-4 space-y-4"
      )}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 rounded-lg border border-border bg-muted/60 p-2 text-primary">
            <TrophyIcon className={cn(
              "transition-all duration-300",
              collapsed && !mobile ? "h-5 w-5" : "h-5 w-5"
            )} />
          </div>
          {(!collapsed || mobile) && (
            <div className="flex-1 min-w-0 space-y-1">
              <h2 className="text-base font-semibold text-foreground truncate leading-tight">
                {tournament.name}
              </h2>
              {tournament.category && (
                <p className="text-xs text-muted-foreground font-medium">
                  {tournament.category}
                </p>
              )}
              <Badge
                variant="secondary"
                className="mt-2 border border-border/60 bg-muted/80 text-xs text-foreground"
              >
                Torneo Americano
              </Badge>
              {tournament.is_draft && userRole && userRole !== 'PLAYER' && (
                <Badge className="text-xs mt-1 bg-amber-500/90 text-white border-0 flex items-center gap-1 w-fit">
                  <EyeOff className="h-3 w-3" />
                  Borrador
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      <nav className={cn(
        "flex-1 transition-all duration-300",
        collapsed && !mobile ? "px-2 py-3" : "px-3 py-3"
      )}>
        <ul className="space-y-1">
          {navigationItems.map((item) => {
            const isActive = getIsActive(item.href)
            const Icon = item.icon

            return (
              <li key={item.href}>
                <TooltipProvider delayDuration={collapsed && !mobile ? 300 : 999999}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={`/tournaments/${tournament.id}${item.href}`}
                        onClick={handleLinkClick}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                          "active:scale-[0.98]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          isActive && [
                            "border border-primary/20 bg-primary/10 text-primary font-medium"
                          ],
                          !isActive && "border border-transparent text-muted-foreground hover:border-border hover:bg-muted/70 hover:text-foreground",
                          collapsed && !mobile && "justify-center px-2"
                        )}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <Icon className={cn(
                          "h-4 w-4 flex-shrink-0 transition-colors",
                          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                        )} />

                        {(!collapsed || mobile) && (
                          <span className="truncate">
                            {item.title}
                          </span>
                        )}
                      </Link>
                    </TooltipTrigger>
                    {collapsed && !mobile && (
                      <TooltipContent side="right" className="font-medium">
                        {item.title}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </li>
            )
          })}
        </ul>
      </nav>

      {!mobile && onToggle && (
        <div className="border-t border-border/70 px-3 py-3">
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onToggle}
                  className={cn(
                    "w-full justify-center transition-all duration-200",
                    "text-muted-foreground hover:bg-muted hover:text-foreground",
                    collapsed && "px-2"
                  )}
                  aria-label={collapsed ? "Expandir sidebar de navegación" : "Comprimir sidebar de navegación"}
                >
                  {collapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronLeft className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">
                {collapsed ? "Expandir menu" : "Comprimir menu"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  )
}
