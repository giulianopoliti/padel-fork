import type { Metadata } from "next"
import PublicTournamentsPage, { type PublicTournamentsPageProps } from "@/app/(main)/tournaments/components/public-tournaments-page"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  alternates: {
    canonical: "/torneos/en-curso",
  },
}

export default async function InProgressPublicTournamentsPage(props: PublicTournamentsPageProps) {
  return <PublicTournamentsPage {...props} status="in-progress" />
}
