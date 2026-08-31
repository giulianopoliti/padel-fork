"use client"

import React from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getTenantBranding } from '@/config/tenant'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Calendar,
  Trophy,
  Clock,
  Users,
  Trophy as TrophyIcon,
  Settings,
  Zap,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Home,
  BarChart3,
  Table2
} from 'lucide-react'

interface TournamentLongSidebarProps {
  tournament: {
    id: string
    name: string
    category?: string
    enable_public_inscriptions?: boolean | null
    registration_locked?: boolean | null
    is_draft?: boolean
    status?: string
  }
  userRole?: string
  playerInscription?: {
    is_eliminated: boolean
    is_pending?: boolean
    eliminated_at: string | null
    eliminated_in_round: string | null
  } | null
  collapsed?: boolean
  onToggle?: () => void
  mobile?: boolean
  onNavigate?: () => void
  hasManagePermission?: boolean
}

interface NavigationItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  showForEliminated: boolean
  requiresParticipantVisibility?: boolean
}

export const getLongNavigationItems = (
  userRole?: string,
  isEliminated?: boolean,
  canViewParticipantPages: boolean = true,
  isPending: boolean = false,
  tournamentStatus?: string,
  canAccessInscriptions: boolean = canViewParticipantPages
) => {
  const isPlayer = userRole === 'PLAYER'
  const isTournamentActive = tournamentStatus !== 'NOT_STARTED' && tournamentStatus !== 'CANCELED'
  const shouldShowResults = getTenantBranding().key === 'padel-fv'

  if (userRole === 'PUBLIC') {
    const publicItems: NavigationItem[] = [
      {
        title: 'Inicio',
        href: '',
        icon: Home,
        description: 'Resumen del torneo',
        showForEliminated: true
      },
      {
        title: 'Tablas de posiciones',
        href: '/qually',
        icon: BarChart3,
        description: 'Posiciones del torneo',
        showForEliminated: true,
        requiresParticipantVisibility: !shouldShowResults
      },
      ...(shouldShowResults ? [{
        title: 'Resultados',
        href: '/resultados',
        icon: Table2,
        description: 'Matriz de resultados por zona',
        showForEliminated: true
      }] : []),
      {
        title: 'Llave',
        href: '/bracket',
        icon: Zap,
        description: 'Llave eliminatoria',
        showForEliminated: true
      }
    ]

    return publicItems.filter(item =>
      (isTournamentActive || item.href === '') &&
      (item.href !== '/inscriptions' || canAccessInscriptions) &&
      (canViewParticipantPages || !item.requiresParticipantVisibility)
    )
  }

  if (isPlayer) {
    const playerItems: NavigationItem[] = [
      {
        title: 'Inicio',
        href: '',
        icon: Home,
        description: 'Resumen del torneo',
        showForEliminated: true
      },
      {
        title: 'Cargar disponibilidad',
        href: '/schedules',
        icon: Calendar,
        description: 'Informar dias y horarios',
        showForEliminated: false
      },
      {
        title: 'Tablas de posiciones',
        href: '/qually',
        icon: BarChart3,
        description: 'Posiciones del torneo',
        showForEliminated: true,
        requiresParticipantVisibility: !shouldShowResults
      },
      ...(shouldShowResults ? [{
        title: 'Resultados',
        href: '/resultados',
        icon: Table2,
        description: 'Matriz de resultados por zona',
        showForEliminated: true
      }] : []),
      {
        title: 'Llave',
        href: '/bracket',
        icon: Zap,
        description: 'Llave eliminatoria',
        showForEliminated: true
      }
    ]

    return playerItems.filter(item =>
      (isTournamentActive || item.href === '') &&
      (item.href !== '/inscriptions' || canAccessInscriptions) &&
      (!isEliminated || item.showForEliminated) &&
      (!isPending || item.href !== '/schedules') &&
      (canViewParticipantPages || !item.requiresParticipantVisibility)
    )
  }

  const baseItems: NavigationItem[] = [
    {
      title: 'Inicio',
      href: '',
      icon: Home,
      description: 'Resumen del torneo',
      showForEliminated: true
    },
    {
      title: 'Fechas y Horarios',
      href: '/schedules',
      icon: Calendar,
      description: 'Gestión de fechas y horarios',
      showForEliminated: false
    },
    {
      title: 'Encuentros de qually',
      href: isPlayer ? '/zone-matches' : '/match-scheduling',
      icon: Clock,
      description: isPlayer ? 'Ver partidos de zona' : 'Programación de encuentros',
      showForEliminated: true
    },
    {
      title: 'Tablas de posiciones',
      href: '/qually',
      icon: BarChart3,
      description: 'Resultados y posiciones',
      showForEliminated: true,
      requiresParticipantVisibility: !shouldShowResults
    },
    ...(shouldShowResults ? [{
      title: 'Resultados',
      href: '/resultados',
      icon: Table2,
      description: 'Matriz de resultados por zona',
      showForEliminated: true
    }] : []),
    {
      title: 'Llave',
      href: '/bracket',
      icon: Zap,
      description: 'Llave eliminatoria',
      showForEliminated: true
    },
    {
      title: 'Inscripciones',
      href: '/inscriptions',
      icon: Users,
      description: 'Gestión de inscripciones',
      showForEliminated: true,
      requiresParticipantVisibility: true
    }
  ]

  const visibleItems = baseItems.filter(item =>
    (isTournamentActive || item.href === '' || item.href === '/schedules') &&
    (item.href !== '/inscriptions' || canAccessInscriptions) &&
    (canViewParticipantPages || !item.requiresParticipantVisibility)
  )

  if (isPlayer && isEliminated) {
    return visibleItems.filter(item => item.showForEliminated)
  }

  if (userRole && !isPlayer) {
    visibleItems.push({
      title: 'Configuración',
      href: '/settings',
      icon: Settings,
      description: 'Configuración del torneo',
      showForEliminated: false
    })
  }

  return visibleItems
}

export default function TournamentLongSidebar({
  tournament,
  userRole,
  playerInscription,
  collapsed = false,
  onToggle,
  mobile = false,
  onNavigate,
  hasManagePermission = false
}: TournamentLongSidebarProps) {
  const pathname = usePathname()

  const isEliminated = playerInscription?.is_eliminated || false
  const isPending = playerInscription?.is_pending || false
  const hasActivePlayerInscription = Boolean(playerInscription && !playerInscription.is_eliminated && !playerInscription.is_pending)
  const shouldUsePublicNavigation =
    !hasManagePermission &&
    !hasActivePlayerInscription &&
    !isEliminated &&
    !isPending
  const canViewParticipantPages =
    Boolean(tournament.enable_public_inscriptions) ||
    hasManagePermission ||
    hasActivePlayerInscription
  const canAccessInscriptions =
    hasManagePermission ||
    hasActivePlayerInscription ||
    (Boolean(tournament.enable_public_inscriptions) && !tournament.registration_locked)

  const navigationItems = getLongNavigationItems(
    shouldUsePublicNavigation ? 'PUBLIC' : userRole,
    isEliminated,
    canViewParticipantPages,
    isPending,
    tournament.status,
    canAccessInscriptions
  )

  if (navigationItems.length === 0 || navigationItems.every((item) => item.href === '')) {
    return null
  }

  const getIsActive = (href: string) => {
    const tournamentHome = `/tournaments/${tournament.id}`
    return href === '' ? pathname === tournamentHome : pathname.includes(href)
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
          <div className={cn(
            "flex-shrink-0 rounded-lg border p-2 transition-all duration-300",
            isEliminated
              ? "border-red-200 bg-red-50 text-red-600"
              : "border-border bg-muted/60 text-primary"
          )}>
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
              {isEliminated && (
                <Badge
                  variant="destructive"
                  className="mt-2 text-xs"
                >
                  Eliminado - {playerInscription?.eliminated_in_round || 'Ronda no especificada'}
                </Badge>
              )}
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
