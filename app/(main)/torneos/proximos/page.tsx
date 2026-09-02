import type { Metadata } from "next"
import { permanentRedirect } from "next/navigation"
import PublicTournamentsPage, { type PublicTournamentsPageProps } from "@/app/(main)/tournaments/components/public-tournaments-page"
import { getTenantBranding } from "@/config/tenant"
import { appendPublicTournamentListSearchParams } from "@/lib/seo/legacy-public-route"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  alternates: {
    canonical: "/torneos/proximos",
  },
}

export default async function UpcomingPublicTournamentsPage(props: PublicTournamentsPageProps) {
  if (getTenantBranding().key === "padel-elite") {
    permanentRedirect(appendPublicTournamentListSearchParams("/torneos", await props.searchParams))
  }

  return <PublicTournamentsPage {...props} status="upcoming" />
}
