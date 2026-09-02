"use client"

import { useState } from "react"
import { ArrowRight, Loader2, Search, UserRoundCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useToast } from "@/components/ui/use-toast"
import {
  findIdentitySourceByEmail,
  searchOrganizationIdentityTargets,
  transferPlayerIdentity,
} from "@/app/api/panel/player-identity/actions"
import type { PlayerIdentityCandidate } from "@/lib/player-identity-transfer"

type PlayerIdentityTransferDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onTransferred: () => void
}

const PlayerSummary = ({ player }: { player: PlayerIdentityCandidate }) => (
  <div className="space-y-1 text-sm">
    <p className="font-semibold">{player.firstName} {player.lastName}</p>
    <p className="text-muted-foreground">DNI: {player.dni || "Sin DNI"}</p>
    <p className="text-muted-foreground">Email: {player.email || "Sin cuenta vinculada"}</p>
    {player.tournaments.length > 0 && (
      <p className="text-xs text-muted-foreground">
        Torneos: {player.tournaments.map((tournament) => tournament.name).join(", ")}
      </p>
    )}
  </div>
)

export const PlayerIdentityTransferDialog = ({
  open,
  onOpenChange,
  onTransferred,
}: PlayerIdentityTransferDialogProps) => {
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [targetSearch, setTargetSearch] = useState("")
  const [source, setSource] = useState<PlayerIdentityCandidate | null>(null)
  const [targets, setTargets] = useState<PlayerIdentityCandidate[]>([])
  const [target, setTarget] = useState<PlayerIdentityCandidate | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [reason, setReason] = useState("Jugador duplicado creado durante la inscripcion")
  const [confirmation, setConfirmation] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setEmail("")
    setTargetSearch("")
    setSource(null)
    setTargets([])
    setTarget(null)
    setBlocked(false)
    setReason("Jugador duplicado creado durante la inscripcion")
    setConfirmation("")
    setError(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isLoading) reset()
    onOpenChange(nextOpen)
  }

  const handleFindSource = async () => {
    setIsLoading(true)
    setError(null)
    setSource(null)
    setTarget(null)
    try {
      const result = await findIdentitySourceByEmail(email)
      if (!result.success || !result.player) {
        setError(result.error || "No se encontro la cuenta")
        return
      }
      setSource(result.player)
      setBlocked(Boolean(result.blockedByExternalHistory))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearchTargets = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await searchOrganizationIdentityTargets(targetSearch)
      if (!result.success) {
        setError(result.error || "No se pudieron buscar jugadores")
        return
      }
      setTargets(result.players.filter((player) => player.id !== source?.id))
    } finally {
      setIsLoading(false)
    }
  }

  const handleTransfer = async () => {
    if (!source?.userId || !target) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await transferPlayerIdentity({
        operationId: crypto.randomUUID(),
        sourcePlayerId: source.id,
        targetPlayerId: target.id,
        expectedUserId: source.userId,
        confirmation,
        reason,
      })
      if (!result.success) {
        setError(result.error || "No se pudo transferir la cuenta")
        return
      }

      toast({ title: "Cuenta transferida", description: `La cuenta ahora esta vinculada a ${target.firstName} ${target.lastName}.` })
      handleOpenChange(false)
      onTransferred()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resolver jugador duplicado</DialogTitle>
          <DialogDescription>
            Busca la cuenta por email y transferila al jugador que conserva las inscripciones de tu organizacion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3" aria-labelledby="identity-source-heading">
            <Label id="identity-source-heading" htmlFor="identity-source-email">1. Cuenta que se debe mover</Label>
            <div className="flex gap-2">
              <Input
                id="identity-source-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="jugador@email.com"
                disabled={isLoading}
              />
              <Button type="button" variant="outline" onClick={handleFindSource} disabled={isLoading || !email.includes("@")}>
                <Search className="mr-2 h-4 w-4" /> Buscar
              </Button>
            </div>
            {source && <Card><CardContent className="pt-4"><PlayerSummary player={source} /></CardContent></Card>}
          </section>

          {source && (
            <section className="space-y-3" aria-labelledby="identity-target-heading">
              <Label id="identity-target-heading" htmlFor="identity-target-search">2. Jugador que conserva las inscripciones</Label>
              <div className="flex gap-2">
                <Input
                  id="identity-target-search"
                  value={targetSearch}
                  onChange={(event) => setTargetSearch(event.target.value)}
                  placeholder="DNI, nombre o apellido"
                  disabled={isLoading || blocked}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void handleSearchTargets()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={handleSearchTargets} disabled={isLoading || blocked || targetSearch.trim().length < 2}>
                  <Search className="mr-2 h-4 w-4" /> Buscar
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {targets.map((player) => (
                  <button
                    type="button"
                    key={player.id}
                    onClick={() => setTarget(player)}
                    className={`rounded-surface border p-4 text-left transition-colors ${target?.id === player.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <PlayerSummary player={player} />
                  </button>
                ))}
              </div>
            </section>
          )}

          {source && target && !blocked && (
            <section className="space-y-4 rounded-surface border p-4" aria-labelledby="identity-confirm-heading">
              <h3 id="identity-confirm-heading" className="font-semibold">3. Confirmar transferencia</h3>
              <div className="flex items-center gap-3 text-sm">
                <span>{source.firstName} {source.lastName}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                <span className="font-semibold">{target.firstName} {target.lastName}</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="identity-transfer-reason">Motivo</Label>
                <Textarea id="identity-transfer-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="identity-transfer-confirmation">Escribi TRANSFERIR para confirmar</Label>
                <Input id="identity-transfer-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())} autoComplete="off" />
              </div>
            </section>
          )}

          {blocked && (
            <Alert variant="destructive">
              <AlertTitle>Requiere revision administrativa</AlertTitle>
              <AlertDescription>La cuenta tiene historial en torneos ajenos a tu organizacion y no puede transferirse desde el panel.</AlertDescription>
            </Alert>
          )}
          {error && <Alert variant="destructive"><AlertTitle>No se pudo continuar</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>Cancelar</Button>
          <Button
            type="button"
            onClick={handleTransfer}
            disabled={isLoading || blocked || !source || !target || confirmation !== "TRANSFERIR" || reason.trim().length < 5}
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserRoundCheck className="mr-2 h-4 w-4" />}
            Transferir cuenta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
