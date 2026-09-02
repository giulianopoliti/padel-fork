import { Suspense } from "react"
import { notFound } from "next/navigation"
import { getClubPlayersForRanking, getClubById } from "@/app/api/users"
import ClubPlayersClient from "../club-players-client"
import { Skeleton } from "@/components/ui/skeleton"

// Loading component
function ClubPlayersLoading() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="bg-white rounded-elevated border border-gray-200 p-8">
        <div className="flex justify-between items-center">
          <div className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-12 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-white rounded-elevated border border-gray-200 p-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function ClubOwnersPlayersPage({ params }: { params: { id: string } }) {
  // Fetch club data and players in parallel
  const [clubData, playersData] = await Promise.all([
    getClubById(params.id),
    getClubPlayersForRanking(params.id)
  ])

  if (!clubData) {
    notFound()
  }

  // Calculate total score for the club
  const totalScore = playersData.reduce((sum, player) => sum + (player.score || 0), 0)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-8">
        <Suspense fallback={<ClubPlayersLoading />}>
          <ClubPlayersClient 
            club={clubData}
            players={playersData}
            totalScore={totalScore}
            isOwner={true}
          />
        </Suspense>
      </div>
    </div>
  )
} 