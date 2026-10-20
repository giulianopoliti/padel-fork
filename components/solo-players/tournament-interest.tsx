"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { SoloPostForm } from "./solo-post-form"
import { useSoloDirectory } from "./use-solo-directory"
import { getSoloPostLabel, getSoloPairLabel } from "@/lib/solo-players/presentation"

export const TournamentInterest = ({ tournamentId, onComplete }: { tournamentId: string; onComplete: (success: boolean) => void }) => {
  const { data, loading, error, reload } = useSoloDirectory()
  if (loading && !data) return <p role="status" className="py-6">Cargando tu búsqueda…</p>
  if (error) return <div className="space-y-3"><p role="alert">{error}</p><Button variant="outline" onClick={reload}>Volver a intentar</Button></div>
  if (!data?.profile) return <p>Necesitás completar tu perfil de jugador para publicar.</p>
  const pair = data.pairs.find(item => item.tournament_id === tournamentId)
  const existing = data.ownPosts.find(post => post.tournament_id === tournamentId && ["Buscando pareja", "Pausada"].includes(getSoloPostLabel(post)))
  if (pair || existing) return <div className="space-y-4 rounded-lg border p-5"><p>{pair ? getSoloPairLabel(pair) : existing?.status === "PAUSED" ? "Tu búsqueda de pareja está pausada." : "Estás anotado sin pareja. Te estamos buscando pareja."}</p><Button asChild variant="outline"><Link href={pair ? `/tournaments/${tournamentId}` : `/jugadores-sueltos?torneo=${tournamentId}`} onClick={() => onComplete(false)}>{pair ? "Ver inscripción" : "Gestionar mi búsqueda"}</Link></Button></div>
  if (!data.tournaments.some(t => t.id === tournamentId && t.acceptsInterest)) return <p>Este torneo ya no admite nuevas búsquedas.</p>
  return <SoloPostForm data={data} tournamentId={tournamentId} onSaved={() => onComplete(true)} onCancel={() => onComplete(false)} />
}
