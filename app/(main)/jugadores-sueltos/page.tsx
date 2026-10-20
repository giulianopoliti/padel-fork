import { notFound } from "next/navigation"
import { isSoloPlayersEnabled } from "@/config/solo-players"
import { SoloDirectory } from "@/components/solo-players/solo-directory"
import { SoloRequestInbox } from "@/components/solo-players/request-inbox"
import { SoloManagerDirectory } from "@/components/solo-players/manager-directory"
import { isSoloManager } from "@/lib/solo-players/management"
import { createClient } from "@/utils/supabase/server"
import { getTenantBranding } from "@/config/tenant"

export const metadata = { title: "Jugadores sueltos", robots: { index: false, follow: false } }

const SoloPlayersPage = async ({ searchParams }: { searchParams: Promise<{ torneo?: string; vista?: string; solicitud?: string }> }) => {
  if (!isSoloPlayersEnabled()) notFound()
  const { torneo, vista, solicitud } = await searchParams
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  const manager = !!user && await isSoloManager(client, user.id)
  return <main className={`${getTenantBranding().tournaments.theme.className} mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12`}>
    {manager ? <SoloManagerDirectory initialView={vista} requestId={solicitud} /> : vista === "solicitudes" || solicitud ? <SoloRequestInbox requestId={solicitud} /> : <SoloDirectory tournamentId={torneo} />}
  </main>
}

export default SoloPlayersPage
