import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import OrganizadorDashboard from "./components/organizador-dashboard"
import { getCategories } from "@/lib/services/players/players.service"
import { getTenantBranding } from "@/config/tenant"
import { getTpeRestrictionPlayers } from "@/lib/services/tpe-registration-restrictions"
import TpeRegistrationRestrictionsPanel from "@/app/(main)/panel/@organizador/components/tpe-registration-restrictions-panel"
import { searchPlayersGlobally } from "@/lib/services/player-search-service"
import { getOrganizerPanelTournamentPage } from "@/lib/services/organizer-panel.service"
import type { PanelTournamentWithMetrics } from "@/lib/services/organizer-panel-metrics"

import { getActiveTournamentClubs, validateTournamentClub } from '@/lib/services/tournament-club-filter.service'
import { normalizeListPage, getOrganizerPanelHref } from '@/lib/tournaments/tournament-list-filters'
import { getTournamentSortSettings } from '@/lib/services/tournament-sort-settings.service'

export const dynamic = 'force-dynamic'

interface PlayerData {
  id: string
  first_name: string
  last_name: string
  dni: string | null
  phone: string | null
  score: number | null
  profile_image_url: string | null
  category_name: string | null
  user_id?: string | null
  email?: string | null
  users?: { email: string | null } | null
}

export default async function OrganizadorDashboardPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  const params = searchParams ? await searchParams : {}
  const page = normalizeListPage(params.page)

  // 1. Autenticación
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect("/login")
  }

  // Verificar que el usuario sea ORGANIZADOR antes de ejecutar queries
  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()

  if (userData?.role !== "ORGANIZADOR") {
    return null
  }

  // 2. Obtener organization_id del usuario
  const { data: orgMember, error: orgError } = await supabase
    .from("organization_members")
    .select("organizacion_id, member_role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single()

  if (orgError || !orgMember) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-2xl font-bold mb-4">No tienes organización asignada</h2>
          <p className="text-muted-foreground">
            Contacta con el administrador para que te asigne a una organización.
          </p>
        </div>
      </div>
    )
  }

  const organizationId = orgMember.organizacion_id

  let clubs: Awaited<ReturnType<typeof getActiveTournamentClubs>>
  let clubId: string | undefined
  try {
    clubs = await getActiveTournamentClubs(supabase, { column: 'organization_id', id: organizationId })
    clubId = validateTournamentClub(params.club, clubs)
  } catch (error) {
    console.error('[OrganizerPanel] Could not load club filter:', error)
    return <div className="container mx-auto px-4 py-8" role="alert"><p>No pudimos aplicar el filtro. El club no está disponible o no pudimos cargar los clubes activos.</p><a href="/panel" className="mt-3 inline-block underline">Volver a todos los clubes</a></div>
  }
  const tenant = getTenantBranding().key
  // Start independent sections together; one failed section must not hide the others.
  const sortSettingsPromise = getTournamentSortSettings(supabase, 'panel')
  const tournamentsPromise = sortSettingsPromise.then((settings) => getOrganizerPanelTournamentPage(supabase, organizationId, tenant, page, clubId, settings.configured ? settings.rules : undefined))
  const playersPromise = searchPlayersGlobally({ page: 1, pageSize: 10 })
  const [tournamentsResult, playersResult, categoriesResult, restrictionsResult, sortSettingsResult] = await Promise.allSettled([
    tournamentsPromise,
    playersPromise,
    getCategories(),
    tenant === "padel-elite" ? getTpeRestrictionPlayers() : Promise.resolve([]),
    sortSettingsPromise,
  ])
  const tournamentsWithMetrics: PanelTournamentWithMetrics[] = tournamentsResult.status === 'fulfilled' ? tournamentsResult.value.tournaments : []
  if (tournamentsResult.status === 'fulfilled' && tournamentsResult.value.redirectPage !== null) redirect(getOrganizerPanelHref(tournamentsResult.value.redirectPage, clubId))
  const tournamentsError = tournamentsResult.status === 'rejected'
  if (tournamentsError) console.error('[OrganizadorDashboardPage] Error loading tournaments:', tournamentsResult.reason)

  // 5. Directorio completo de jugadores del tenant.
  let players: PlayerData[] = []
  let totalPlayers = 0
  const playersError = playersResult.status === 'rejected' || categoriesResult.status === 'rejected'
  if (playersResult.status === 'fulfilled') {
    players = playersResult.value.players as PlayerData[]
    totalPlayers = playersResult.value.total
  } else {
    console.error("[OrganizadorDashboardPage] Error loading organization players:", playersResult.reason)
  }

  // 7. Fetch categorías para la edición de jugadores
  const categories = categoriesResult.status === 'fulfilled' ? categoriesResult.value : []
  const tpeRestrictionPlayers = restrictionsResult.status === 'fulfilled' ? restrictionsResult.value : []
  if (categoriesResult.status === 'rejected') console.error('[OrganizadorDashboardPage] Error loading categories:', categoriesResult.reason)
  if (restrictionsResult.status === 'rejected') console.error('[OrganizadorDashboardPage] Error loading restrictions:', restrictionsResult.reason)

  const normalizedPlayers: PlayerData[] = players.map((player) => ({
    ...player,
    users: Array.isArray(player.users) ? player.users[0] : player.users
  }))

  return (
    <>
      <OrganizadorDashboard
        tournaments={tournamentsWithMetrics}
        players={normalizedPlayers}
        categories={categories}
        totalPlayers={totalPlayers}
        organizationId={organizationId}
        canResolvePlayerIdentity={['owner', 'admin'].includes(orgMember.member_role)}
        tournamentsError={tournamentsError}
        playersError={playersError}
        prioritizesUpcoming={tenant === "padel-elite"}
        sortSettings={sortSettingsResult.status === 'fulfilled' ? sortSettingsResult.value : undefined}
        tenantName={getTenantBranding().shortName}
        clubs={clubs}
        clubId={clubId}
        tournamentPage={page}
        tournamentPages={tournamentsResult.status === 'fulfilled' ? tournamentsResult.value.pages : 1}
        totalTournaments={tournamentsResult.status === 'fulfilled' ? tournamentsResult.value.total : 0}
      />
      {tenant === "padel-elite" && restrictionsResult.status === 'fulfilled' && (
        <div className="container mx-auto px-4 pb-8 sm:px-6 lg:px-8">
          <TpeRegistrationRestrictionsPanel players={tpeRestrictionPlayers} />
        </div>
      )}
      {tenant === "padel-elite" && restrictionsResult.status === 'rejected' && (
        <p role="alert" className="container mx-auto px-4 pb-8 text-sm text-destructive">No pudimos cargar las restricciones de inscripción. Recargá la página para consultarlas.</p>
      )}
    </>
  )
}
