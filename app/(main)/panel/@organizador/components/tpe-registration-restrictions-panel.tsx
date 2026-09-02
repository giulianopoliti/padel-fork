"use client"

import { useMemo, useState, useTransition } from "react"
import { Ban, CheckCircle2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import type { TpeRestrictionPlayer } from "@/lib/services/tpe-registration-restrictions"
import { updateTpePlayerBlock } from "../tpe-restrictions-actions"

export default function TpeRegistrationRestrictionsPanel({ players }: { players: TpeRestrictionPlayer[] }) {
  const [query, setQuery] = useState("")
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const visiblePlayers = useMemo(() => players.filter((player) => `${player.first_name} ${player.last_name}`.toLowerCase().includes(query.toLowerCase())), [players, query])

  const handleBlockChange = (player: TpeRestrictionPlayer) => {
    const blocked = !player.activeBlockId
    if (!window.confirm(blocked ? `¿Bloquear a ${player.first_name} ${player.last_name} en todos los torneos TPE?` : `¿Quitar el bloqueo de ${player.first_name} ${player.last_name}?`)) return
    startTransition(async () => {
      const result = await updateTpePlayerBlock(player.id, blocked)
      toast({ title: result.success ? "Restricción actualizada" : "No se pudo actualizar", description: result.error, variant: result.success ? "default" : "destructive" })
      if (result.success) window.location.reload()
    })
  }

  return (
    <section aria-labelledby="tpe-restrictions-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="tpe-restrictions-heading" className="text-2xl font-bold">Restricciones de inscripción</h2>
          <p className="text-sm text-muted-foreground">Historial de bajas tardías y bloqueos globales de TPE Padel.</p>
        </div>
        <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar jugador" /></div>
      </div>
      <div className="overflow-hidden rounded-elevated border bg-white">
        {visiblePlayers.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No hay bajas tardías ni jugadores bloqueados.</p> : visiblePlayers.map((player) => (
          <div key={player.id} className="flex flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold">{player.first_name} {player.last_name}</p><p className="text-sm text-muted-foreground">{player.lateWithdrawalCount} baja{player.lateWithdrawalCount === 1 ? "" : "s"} tardía{player.lateWithdrawalCount === 1 ? "" : "s"}</p></div>
            <div className="flex items-center gap-3"><Badge variant={player.activeBlockId ? "destructive" : "secondary"}>{player.activeBlockId ? "Bloqueado" : "Sin bloqueo"}</Badge><Button size="sm" variant={player.activeBlockId ? "outline" : "destructive"} disabled={isPending} onClick={() => handleBlockChange(player)}>{player.activeBlockId ? <><CheckCircle2 className="mr-2 h-4 w-4" />Desbloquear</> : <><Ban className="mr-2 h-4 w-4" />Bloquear</>}</Button></div>
          </div>
        ))}
      </div>
    </section>
  )
}
