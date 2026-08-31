import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { TournamentPageById } from "@/app/(main)/tournaments/[id]/page"
import { getPublicTournamentBySlug } from "@/lib/services/public-tournament.service"

interface TournamentSlugPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: TournamentSlugPageProps): Promise<Metadata> {
  const { slug } = await params
  const tournament = await getPublicTournamentBySlug(slug)

  if (!tournament) return {}
  return { alternates: { canonical: `/torneos/${tournament.seo_slug}` } }
}

export default async function TournamentSlugPage({ params }: TournamentSlugPageProps) {
  const { slug } = await params
  const tournament = await getPublicTournamentBySlug(slug)

  if (!tournament) notFound()
  if (tournament.isAlias && tournament.seo_slug) {
    permanentRedirect(`/torneos/${tournament.seo_slug}`)
  }

  return <TournamentPageById tournamentId={tournament.id} />
}
