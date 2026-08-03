"use client"

import React, { useState } from 'react'
import { useParams, usePathname } from 'next/navigation'
import useSWR from 'swr'
import { createClient } from '@/utils/supabase/client'
import { useUser } from '@/contexts/user-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import TournamentLongSidebar, { getLongNavigationItems } from './TournamentLongSidebar'
import TournamentAmericanSidebar, { getAmericanNavigationItems } from './TournamentAmericanSidebar'
import TournamentMobileBottomNav, { type TournamentMobileNavItem } from './TournamentMobileBottomNav'
import TournamentMobileMoreMenu from './TournamentMobileMoreMenu'
import { TENANT_CONFIG } from '@/config/tenant'
import { cn } from '@/lib/utils'
import {
  BarChart3,
  CalendarCheck2,
  Clock3,
  GitFork,
  Home,
  ListChecks,
  Settings,
  Trophy,
  Users,
} from 'lucide-react'

interface TournamentLongLayoutProps {
  children: React.ReactNode
}

const EXCLUDED_PAGES = [
  '/tournaments/[id]/recategorize-players'
]

const MAX_MOBILE_PRIMARY_ITEMS = 4

const getMobileNavIcon = (href: string) => {
  if (href === '') return Home
  if (href === '/inscriptions') return Users
  if (href === '/zones') return ListChecks
  if (href === '/matches') return Trophy
  if (href === '/bracket') return GitFork
  if (href === '/settings') return Settings
  if (href === '/schedules') return CalendarCheck2
  if (href === '/match-scheduling' || href === '/zone-matches') return Clock3
  if (href === '/qually') return BarChart3
  return Trophy
}

const getMobileNavLabel = (title: string) => {
  switch (title) {
    case 'Tablas de posiciones':
      return 'Tablas'
    case 'Fechas y Horarios':
      return 'Horarios'
    case 'Encuentros de qually':
    case 'Partidos de zona':
      return 'Partidos'
    case 'Configuración':
      return 'Ajustes'
    default:
      return title
  }
}

const buildMobileNavItems = (
  tournamentId: string,
  navigationItems: Array<{ title: string; href: string }>
): TournamentMobileNavItem[] => {
  const itemsWithHome = navigationItems.some((item) => item.href === '')
    ? navigationItems
    : [{ title: 'Inicio', href: '' }, ...navigationItems]

  return itemsWithHome.map((item) => ({
    label: getMobileNavLabel(item.title),
    href: `/tournaments/${tournamentId}${item.href}`,
    icon: getMobileNavIcon(item.href),
  }))
}

const splitMobileNavItems = (items: TournamentMobileNavItem[]) => {
  if (items.length <= MAX_MOBILE_PRIMARY_ITEMS) {
    return { primaryItems: items, overflowItems: [] }
  }

  const settingsItem = items.find((item) => item.href.endsWith('/settings'))
  const nonSettingsItems = items.filter((item) => item !== settingsItem)
  const primaryItems = nonSettingsItems.slice(0, MAX_MOBILE_PRIMARY_ITEMS)
  const overflowItems = [
    ...nonSettingsItems.slice(MAX_MOBILE_PRIMARY_ITEMS),
    ...(settingsItem ? [settingsItem] : []),
  ]

  return { primaryItems, overflowItems }
}

const fetcher = async (tournamentId: string) => {
  console.log('[FETCHER] Starting fetch for tournamentId:', tournamentId)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tournaments')
    .select(`
      id,
      name,
      category_name,
      type,
      club_id,
      status,
      is_draft,
      enable_public_inscriptions,
      registration_locked,
      organization_id,
      organizaciones:organization_id(name, logo_url, slug),
      clubes:club_id(name, logo_url)
    `)
    .eq('id', tournamentId)
    .single()

  console.log('[FETCHER] Response data:', data)
  console.log('[FETCHER] Response error:', error)

  if (error) {
    console.error('[FETCHER] Error occurred:', error)
    throw error
  }

  return data
}

const playerInscriptionFetcher = async ([, tournamentId, playerId]: [string, string, string]) => {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('inscriptions')
    .select(`
      is_eliminated,
      is_pending,
      eliminated_at,
      eliminated_in_round,
      player_id,
      couples:couple_id(
        player1_id,
        player2_id
      )
    `)
    .eq('tournament_id', tournamentId)

  if (error) {
    return null
  }

  const inscription = (data || []).find((row: any) => {
    if (row.player_id === playerId) return true
    const couple = Array.isArray(row.couples) ? row.couples[0] : row.couples
    if (!couple) return false
    return couple.player1_id === playerId || couple.player2_id === playerId
  })

  if (!inscription) {
    return null
  }

  return {
    is_eliminated: inscription.is_eliminated,
    is_pending: inscription.is_pending,
    eliminated_at: inscription.eliminated_at,
    eliminated_in_round: inscription.eliminated_in_round
  }
}

const organizerAccessFetcher = async ([, organizationId, userId]: [string, string, string]) => {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organizacion_id', organizationId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    return false
  }

  return Boolean(data)
}

function TournamentLongLayout({ children }: TournamentLongLayoutProps) {
  const params = useParams()
  const pathname = usePathname()
  const tournamentId = params?.id as string
  const { userDetails } = useUser()
  const isMobile = useIsMobile()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const shouldShowSidebar = !EXCLUDED_PAGES.some(excludedPath => {
    const normalizedPath = pathname.replace(`/tournaments/${tournamentId}`, '/tournaments/[id]')
    return normalizedPath === excludedPath
  })

  console.log('[TournamentLongLayout] pathname:', pathname)
  console.log('[TournamentLongLayout] tournamentId:', tournamentId)
  console.log('[TournamentLongLayout] normalizedPath:', pathname.replace(`/tournaments/${tournamentId}`, '/tournaments/[id]'))
  console.log('[TournamentLongLayout] shouldShowSidebar:', shouldShowSidebar)
  console.log('[TournamentLongLayout] isMobile:', isMobile)
  console.log('[TournamentLongLayout] window.innerWidth:', typeof window !== 'undefined' ? window.innerWidth : 'server')

  const { data: tournament, isLoading, error } = useSWR(
    shouldShowSidebar && tournamentId ? `tournament-sidebar-${tournamentId}` : null,
    () => fetcher(tournamentId)
  )

  const { data: playerInscription } = useSWR(
    shouldShowSidebar && tournamentId && userDetails?.role === 'PLAYER' && userDetails?.player_id
      ? ['player-inscription', tournamentId, userDetails.player_id]
      : null,
    playerInscriptionFetcher
  )

  const { data: hasOrganizerManagementPermission = false } = useSWR(
    shouldShowSidebar &&
    tournament?.organization_id &&
    userDetails?.role === 'ORGANIZADOR' &&
    userDetails?.id
      ? ['organization-access', tournament.organization_id, userDetails.id]
      : null,
    organizerAccessFetcher
  )

  console.log('[TournamentLongLayout] tournament:', tournament)
  console.log('[TournamentLongLayout] isLoading:', isLoading)
  console.log('[TournamentLongLayout] error:', error)

  if (!shouldShowSidebar) {
    return <>{children}</>
  }

  if (isLoading || !tournament) {
    return <>{children}</>
  }

  if (tournament.type !== 'LONG' && tournament.type !== 'AMERICAN') {
    return <>{children}</>
  }

  console.log('[TournamentLongLayout] RENDERING SIDEBAR! ðŸŽ‰', 'Type:', tournament.type)

  const hasManagePermission =
    (userDetails?.role as string | undefined) === 'ADMIN' ||
    (userDetails?.role === 'CLUB' &&
      Boolean(userDetails.club_id && tournament.club_id && userDetails.club_id === tournament.club_id)) ||
    (userDetails?.role === 'ORGANIZADOR' && hasOrganizerManagementPermission)

  const isLongTournament = tournament.type === 'LONG'
  const hasActivePlayerInscription = Boolean(
    playerInscription && !playerInscription.is_eliminated && !playerInscription.is_pending
  )
  const isEliminated = playerInscription?.is_eliminated || false
  const isPending = playerInscription?.is_pending || false
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
    (Boolean(tournament.enable_public_inscriptions) && !tournament.registration_locked)
  const sidebarNavigationItems = isLongTournament
    ? getLongNavigationItems(
        shouldUsePublicNavigation ? 'PUBLIC' : userDetails?.role,
        isEliminated,
        canViewParticipantPages,
        isPending,
        tournament.status,
        canAccessInscriptions
      )
    : getAmericanNavigationItems(
        userDetails?.role,
        tournament.status,
        canViewParticipantPages,
        canAccessInscriptions
      )
  const hasSidebarNavigation = isLongTournament
    ? sidebarNavigationItems.some((item) => item.href !== '')
    : sidebarNavigationItems.length > 0
  const tournamentThemeClass = isLongTournament
    ? TENANT_CONFIG.tournaments.theme.className
    : undefined
  const SidebarComponent = isLongTournament
    ? TournamentLongSidebar
    : TournamentAmericanSidebar
  const mobileNavItems = buildMobileNavItems(tournament.id, sidebarNavigationItems)
  const { primaryItems: mobilePrimaryItems, overflowItems: mobileOverflowItems } =
    splitMobileNavItems(mobileNavItems)
  const hasMobileNavigation = mobilePrimaryItems.length > 0
  const hasMobileOverflow = mobileOverflowItems.length > 0

  const sidebarProps = {
    tournament: {
      id: tournament.id,
      name: tournament.name,
      category: tournament.category_name,
      status: tournament.status,
      enable_public_inscriptions: tournament.enable_public_inscriptions,
      registration_locked: tournament.registration_locked,
      is_draft: tournament.is_draft ?? false,
    },
    userRole: userDetails?.role,
    playerInscription,
    collapsed: sidebarCollapsed,
    onToggle: () => setSidebarCollapsed(!sidebarCollapsed),
    hasManagePermission
  }

  if (!hasSidebarNavigation) {
    return (
      <div className={cn("min-h-screen bg-background", tournamentThemeClass, isLongTournament && "tournament-long-shell")}>
        <main className="min-w-0 bg-background">
          {children}
        </main>
      </div>
    )
  }

  if (isMobile) {
    console.log('[TournamentLongLayout] Rendering MOBILE layout with tournament:', sidebarProps.tournament.name)
    return (
      <div className={cn("min-h-screen bg-background", tournamentThemeClass, isLongTournament && "tournament-long-shell")}>
        {hasMobileOverflow ? (
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="w-80 p-0">
              <SheetTitle className="sr-only">Menu del torneo</SheetTitle>
              <TournamentMobileMoreMenu
                items={mobileOverflowItems}
                onNavigate={() => setSidebarOpen(false)}
              />
            </SheetContent>
          </Sheet>
        ) : null}

        <main className={cn(hasMobileNavigation && "pb-20")}>
          {children}
        </main>

        {hasMobileNavigation ? (
          <TournamentMobileBottomNav
            tournamentId={tournament.id}
            items={mobilePrimaryItems}
            hasMoreItems={hasMobileOverflow}
            onMore={hasMobileOverflow ? () => setSidebarOpen(true) : undefined}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className={cn("flex min-h-screen bg-background", tournamentThemeClass, isLongTournament && "tournament-long-shell")}>
      <div className="flex-shrink-0 sticky top-20 h-[calc(100vh-5rem)] overflow-y-auto">
        <SidebarComponent {...sidebarProps} />
      </div>
      <main className="min-w-0 flex-1 overflow-x-hidden bg-background/80">
        {children}
      </main>
    </div>
  )
}

export default TournamentLongLayout
