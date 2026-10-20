import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"
import { Trophy, Users, CheckCircle2, XCircle } from "lucide-react"
import { getTenantBranding } from "@/config/tenant"
import { loadPublicPlayerProfile } from "@/lib/solo-players/player-profile"
import { soloSportsLabel } from "@/lib/solo-players/presentation"

export const metadata = { title: "Perfil deportivo", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

const PlayerProfilePage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) notFound()
  const player = await loadPublicPlayerProfile(id)
  if (!player) notFound()
  return <main className={`${getTenantBranding().tournaments.theme.className} mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6`}>
    <Link href="/jugadores-sueltos" className="text-sm text-primary underline underline-offset-4">Volver a Jugadores sueltos</Link>
    <header className="flex items-center gap-5 rounded-2xl bg-primary p-6 text-primary-foreground sm:p-9">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"><Users aria-hidden="true" className="h-7 w-7" /></div>
      <div><p className="text-xs font-semibold uppercase tracking-widest text-accent">Perfil deportivo</p><h1 className="mt-2 text-3xl font-semibold">{[player.first_name, player.last_name].filter(Boolean).join(" ") || "Jugador"}</h1><p className="mt-2 text-sm">{soloSportsLabel(player.preferred_side, player.preferred_hand)}</p></div>
    </header>
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">{[
      { label: "Torneos jugados", value: player.tournaments, Icon: Trophy },
      { label: "Partidos ganados", value: player.wins, Icon: CheckCircle2 },
      { label: "Partidos perdidos", value: player.losses, Icon: XCircle },
    ].map(({ label, value, Icon }) => <div key={label} className="rounded-xl border border-primary/15 bg-primary/5 p-6"><dt className="flex items-center gap-2 text-sm text-primary"><Icon className="h-4 w-4" aria-hidden="true" />{label}</dt><dd className="mt-3 text-4xl font-semibold text-primary">{value}</dd></div>)}</dl>
    <p className="text-sm text-muted-foreground">Se cuentan los torneos con partidos finalizados y resultado registrado. Los pases libres y los partidos de prueba no se incluyen.</p>
  </main>
}
export default PlayerProfilePage
