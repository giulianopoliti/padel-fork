import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import OrganizadorDashboard from "./components/organizador-dashboard"
import { getCategories } from "@/lib/services/players/players.service"
import { getTenantBranding } from "@/config/tenant"
import { getTpeRestrictionPlayers } from "@/lib/services/tpe-registration-restrictions"
import TpeRegistrationRestrictionsPanel from "@/app/(main)/panel/@organizador/components/tpe-registration-restrictions-panel"
import { searchPlayersByOrganization } from "@/lib/services/player-search-service"

export const dynamic = 'force-dynamic'

interface TournamentWithMetrics {
  id: string
  name: string
  status: string
  pre_tournament_image_url: string | null
  start_date: string
  end_date: string | null
  category_name: string
  gender: string
  type: string
  price: number | string | null
  clubes?: {
    id: string
    name: string
  } | null
  inscriptions: number
  matchesFinished: number
  matchesPending: number
  totalMatches: number
}

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

export default async function OrganizadorDashboardPage() {
  const supabase = await createClient()

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

  // 3. Fetch torneos con métricas usando edge function
  const { data: result, error: tournamentsError } = await supabase.functions.invoke(
    'get-organization-tournaments',
    {
      body: {
        organizationId,
        limit: 3
      }
    }
  )

  const tournamentsWithMetrics: TournamentWithMetrics[] = result?.tournaments || []

  // 5. Jugadores que participaron en torneos de la organización.
  let players: PlayerData[] = []
  let totalPlayers = 0
  let playersError: unknown = null

  try {
    const playerSearch = await searchPlayersByOrganization({
      organizationId,
      page: 1,
      pageSize: 10,
    })
    players = playerSearch.players as PlayerData[]
    totalPlayers = playerSearch.total
  } catch (error) {
    playersError = error
    console.error("[OrganizadorDashboardPage] Error loading organization players:", error)
  }

  // 7. Fetch categorías para la edición de jugadores
  const categories = await getCategories()
  const tpeRestrictionPlayers = getTenantBranding().key === "padel-elite"
    ? await getTpeRestrictionPlayers()
    : []

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
        hasError={!!tournamentsError || !!playersError}
      />
      {getTenantBranding().key === "padel-elite" && (
        <div className="container mx-auto px-4 pb-8 sm:px-6 lg:px-8">
          <TpeRegistrationRestrictionsPanel players={tpeRestrictionPlayers} />
        </div>
      )}
    </>
  )
}
