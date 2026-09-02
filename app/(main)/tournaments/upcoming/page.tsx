import { permanentRedirect } from "next/navigation"
import { getPublicTournamentListRedirect, type PublicTournamentListSearchParams } from "@/lib/seo/legacy-public-route"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams: Promise<PublicTournamentListSearchParams>
}

export default async function LegacyUpcomingTournamentsPage({ searchParams }: PageProps) {
  permanentRedirect(getPublicTournamentListRedirect("/tournaments/upcoming", await searchParams))
}
