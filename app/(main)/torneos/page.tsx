import PublicTournamentsPage, { type PublicTournamentsPageProps } from "@/app/(main)/tournaments/components/public-tournaments-page"

export const dynamic = "force-dynamic"

export default async function TorneosPage(props: PublicTournamentsPageProps) {
  return <PublicTournamentsPage {...props} />
}
