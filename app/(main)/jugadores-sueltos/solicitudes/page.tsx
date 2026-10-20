import { notFound, redirect } from "next/navigation"
import { isSoloPlayersEnabled } from "@/config/solo-players"

export const metadata = { title: "Solicitudes de pareja", robots: { index: false, follow: false } }
const SoloRequestsPage = async ({ searchParams }: { searchParams: Promise<{ solicitud?: string }> }) => {
  if (!isSoloPlayersEnabled()) notFound()
  const { solicitud } = await searchParams
  redirect(`/jugadores-sueltos?vista=solicitudes${solicitud ? `&solicitud=${encodeURIComponent(solicitud)}` : ""}`)
}
export default SoloRequestsPage
