import { PlayersClient } from "./players-client"
import { searchPlayersAdvanced } from "@/app/api/admin/players/actions"

export const dynamic = "force-dynamic"

export default async function AdminPlayersPage() {
  // Fetch initial 50 players (page 1) usando búsqueda avanzada
  const result = await searchPlayersAdvanced({}, 1, 50)

  return (
    <PlayersClient
      initialPlayers={result.data}
      initialTotalCount={result.totalCount}
      initialTotalPages={result.totalPages}
      initialPage={result.currentPage}
    />
  )
}
