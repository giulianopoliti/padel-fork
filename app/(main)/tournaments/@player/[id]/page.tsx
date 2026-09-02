import { Suspense } from "react"
import { notFound } from "next/navigation"
import PlayerTournamentClient from "@/components/tournament/player/player-tournament-client"
import { Skeleton } from "@/components/ui/skeleton"
import { getTournamentById } from "@/app/api/tournaments"
import { getCategories } from "@/app/api/users"
import { getClubById } from "@/app/api/users"
import { getCouplesByTournamentId } from "@/app/api/couples/actions"
import {  getTournamentSnapshot } from "@/app/api/tournaments/actions"
import { getRankedPlayers } from "@/app/api/users"
import { Gender } from "@/types"

function TournamentLoading() {
  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-6 py-12">
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <Skeleton className="h-10 w-3/4 mx-auto" />
            <Skeleton className="h-6 w-1/2 mx-auto" />
          </div>
          <div className="bg-white rounded-surface shadow-sm border border-gray-200 p-6 space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default async function PlayerTournamentPage({ params }: { params: { id: string } }) {
  // Await params before using its properties
  const { id: tournamentId } = await params
  
  // Obtener datos del torneo desde Supabase
  const tournamentData = await getTournamentById(tournamentId)
  if (!tournamentData) {
    notFound()
  }

  // Obtener datos relacionados en paralelo
  const [categoryData, clubData, rawCouplesData, allPlayers, snapshotScores] = await Promise.all([
    // Obtener categoría por nombre
    tournamentData.category ? 
      getCategories().then(categories => categories.find(cat => cat.name === tournamentData.category) || null) : 
      Promise.resolve(null),
    // Obtener club si existe
    tournamentData.club?.id ? getClubById(tournamentData.club.id) : Promise.resolve(null),
    // Obtener parejas del torneo
    getCouplesByTournamentId(tournamentId),
    // Obtener todos los jugadores para el buscador
    getRankedPlayers({ pageSize: 1000 }), // Obtener una cantidad grande de jugadores
    // Obtener snapshot de puntajes
    getTournamentSnapshot(tournamentId)
  ])

  // Los jugadores ya están incluidos en las parejas, así que los extraemos de ahí
  const playersData: any[] = []

  // Transformar Player a PlayerDTO para el componente
  const playersDTO = allPlayers.players.map((player: any) => ({
    id: player.id,
    first_name: player.firstName,
    last_name: player.lastName,
    dni: player.dni ?? null,
    score: player.score
  }))

  // Actualizar los puntajes de los jugadores con los del snapshot
  const playersWithSnapshotScores = playersData.map(player => ({
    ...player,
    score: snapshotScores.get(player.id) ?? player.score
  }))

  // Actualizar los puntajes de las parejas con los del snapshot
  const couplesWithSnapshotScores = rawCouplesData.map(couple => ({
    ...couple,
    player_1_info: couple.player_1_info ? {
      ...couple.player_1_info,
      score: snapshotScores.get(couple.player_1_info.id) ?? couple.player_1_info.score
    } : null,
    player_2_info: couple.player_2_info ? {
      ...couple.player_2_info,
      score: snapshotScores.get(couple.player_2_info.id) ?? couple.player_2_info.score
    } : null
  }))

  return (
    <div>
      <div>No hay torneos JASD</div>
      <div className="min-h-screen bg-white">
        <div className="container mx-auto px-6 py-12">
          <Suspense fallback={<TournamentLoading />}>
            <PlayerTournamentClient
              tournament={{...tournamentData, gender: tournamentData.gender as Gender}}
              category={categoryData}
              club={clubData}
              players={playersWithSnapshotScores}
              couples={couplesWithSnapshotScores}
              allPlayersForSearch={playersDTO}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
