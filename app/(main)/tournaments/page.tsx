import { permanentRedirect } from "next/navigation"
import { getPublicTournamentListRedirect, type PublicTournamentListSearchParams } from "@/lib/seo/legacy-public-route"

export const dynamic = "force-dynamic"

interface LegacyTournamentsPageProps {
  searchParams: Promise<PublicTournamentListSearchParams>
}

export default async function LegacyTournamentsPage({ searchParams }: LegacyTournamentsPageProps) {
  permanentRedirect(getPublicTournamentListRedirect("/tournaments", await searchParams))
}
