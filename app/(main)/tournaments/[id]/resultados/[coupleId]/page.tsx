import { notFound } from "next/navigation"

import PublicCoupleResults from "../components/PublicCoupleResults"
import { getPublicLongCoupleResults } from "@/lib/services/public-long-results.service"

interface CoupleResultsPageProps {
  params: Promise<{ id: string; coupleId: string }>
}

export default async function CoupleResultsPage({ params }: CoupleResultsPageProps) {
  const { id: tournamentId, coupleId } = await params
  const results = await getPublicLongCoupleResults(tournamentId, coupleId)

  if (!results) notFound()

  return (
    <PublicCoupleResults
      tournamentId={tournamentId}
      tournamentName={results.tournament.name}
      couple={results.couple}
      couples={results.couples}
      matches={results.matches}
    />
  )
}
