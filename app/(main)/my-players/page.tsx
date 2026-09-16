import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { getCategories } from "@/lib/services/players/players.service"
import { searchPlayersByOrganization } from "@/lib/services/player-search-service"
import PlayersManagementClient from "./components/players-management-client"

export const dynamic = 'force-dynamic'

export default async function MyPlayersPage() {
  const supabase = await createClient()

  // 1. Autenticación
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect("/login")
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

  // 3. Fetch initial data de participantes históricos de la organización.
  const playersResult = await searchPlayersByOrganization({
    organizationId,
    page: 1,
    pageSize: 20,
  })

  // 4. Fetch categorías para filtros y edición
  const categories = await getCategories()

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PlayersManagementClient
        initialPlayers={playersResult.players}
        initialCategories={categories}
        initialTotal={playersResult.total}
        initialPage={1}
        organizationId={organizationId}
        canResolvePlayerIdentity={['owner', 'admin'].includes(orgMember.member_role)}
      />
    </div>
  )
}
