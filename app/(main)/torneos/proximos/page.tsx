import type { Metadata } from "next"
import PublicTournamentsPage, { type PublicTournamentsPageProps } from "@/app/(main)/tournaments/components/public-tournaments-page"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  alternates: {
    canonical: "/torneos/proximos",
  },
}

export default async function UpcomingPublicTournamentsPage(props: PublicTournamentsPageProps) {
  return <PublicTournamentsPage {...props} status="upcoming" />
}
