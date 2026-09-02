import type { Metadata } from "next"
import PublicTournamentsPage, { type PublicTournamentsPageProps } from "@/app/(main)/tournaments/components/public-tournaments-page"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  alternates: {
    canonical: "/torneos/finalizados",
  },
}

export default async function FinishedPublicTournamentsPage(props: PublicTournamentsPageProps) {
  return <PublicTournamentsPage {...props} status="past" />
}
