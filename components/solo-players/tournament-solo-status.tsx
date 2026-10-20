"use client"

import Link from "next/link"
import { useSoloDirectory } from "./use-solo-directory"
import { getSoloPostLabel } from "@/lib/solo-players/presentation"
import type { SoloDirectoryData } from "@/types/solo-player-ui"

export const getTournamentSoloState = (data: SoloDirectoryData | undefined, tournamentId: string): "searching" | "paused" | null => {
  if (!data || data.pairs.some(pair => pair.tournament_id === tournamentId)) return null
  const posts = data.ownPosts.filter(post => post.tournament_id === tournamentId)
  if (posts.some(post => getSoloPostLabel(post) === "Buscando pareja") || data.soloTournamentIds?.includes(tournamentId)) return "searching"
  return posts.some(post => getSoloPostLabel(post) === "Pausada") ? "paused" : null
}

export const TournamentSoloStatus = ({ tournamentId, tone = "light" }: { tournamentId: string; tone?: "light" | "dark" }) => {
  const { data } = useSoloDirectory()
  const state = getTournamentSoloState(data, tournamentId)
  if (!state) return null
  return <div className={`space-y-1 rounded-lg border p-3 text-sm ${tone === "dark" ? "border-white/25 bg-white/5 text-white" : "border-primary/20 bg-primary/5 text-primary"}`} role="status">
    <p className="font-semibold">{state === "paused" ? "Tu búsqueda de pareja está pausada." : "Estás anotado sin pareja. Te estamos buscando pareja."}</p>
    <p className="text-xs">El cupo se confirma al formar pareja y completar la inscripción.</p>
    <Link href={`/jugadores-sueltos?torneo=${tournamentId}`} className="inline-block font-medium underline">Gestionar mi búsqueda</Link>
  </div>
}

export const PlayerSoloTournaments = ({ tone = "light" }: { tone?: "light" | "dark" }) => {
  const { data } = useSoloDirectory()
  if (!data) return null
  const ids = [...new Set([...data.ownPosts.flatMap(post => post.tournament_id ? [post.tournament_id] : []), ...data.soloTournamentIds || []])]
    .filter(id => getTournamentSoloState(data, id))
  if (!ids.length) return null
  return <section className="space-y-4 rounded-xl border border-current/20 p-5">
    <h2 className="text-xl font-semibold">Mis torneos sin pareja</h2>
    <div className="grid gap-4 sm:grid-cols-2">{ids.map(id => <article key={id} className="space-y-3">
      <Link href={`/tournaments/${id}`} className="font-semibold underline">{data.tournaments.find(tournament => tournament.id === id)?.name || "Ver torneo"}</Link>
      <TournamentSoloStatus tournamentId={id} tone={tone} />
    </article>)}</div>
  </section>
}
