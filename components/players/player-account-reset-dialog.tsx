"use client"

import { useState, useTransition } from "react"
import { Loader2, ShieldAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { resetPlayerUserAccount } from "@/app/api/panel/player-account-reset/actions"

interface PlayerData {
  id: string
  first_name: string
  last_name: string
  dni: string | null
  phone: string | null
  user_id?: string | null
  email?: string | null
  users?: { email: string | null } | Array<{ email: string | null }> | null
}

interface PlayerAccountResetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  player: PlayerData
  onPlayerAccountReset: (playerId: string) => void
}

const getEmail = (player: PlayerData) => {
  const userEmail = Array.isArray(player.users) ? player.users[0]?.email : player.users?.email
  return userEmail || player.email || null
}

export default function PlayerAccountResetDialog({
  open,
  onOpenChange,
  player,
  onPlayerAccountReset,
}: PlayerAccountResetDialogProps) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [reason, setReason] = useState("Blanqueo de cuenta solicitado por duplicado o acceso mal vinculado")
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState<string | null>(null)

  const email = getEmail(player)
  const canSubmit =
    Boolean(player.user_id) &&
    confirmation === "BLANQUEAR" &&
    reason.trim().length >= 5 &&
    !isPending

  const handleOpenChange = (nextOpen: boolean) => {
    if (isPending) return
    if (!nextOpen) {
      setConfirmation("")
      setError(null)
      setReason("Blanqueo de cuenta solicitado por duplicado o acceso mal vinculado")
    }
    onOpenChange(nextOpen)
  }

  const handleSubmit = () => {
    if (!player.user_id) return

    startTransition(async () => {
      setError(null)
      const result = await resetPlayerUserAccount({
        operationId: crypto.randomUUID(),
        playerId: player.id,
        expectedUserId: player.user_id,
        confirmation,
        reason,
      })

      if (!result.success) {
        setError(result.error || "No se pudo blanquear la cuenta")
        return
      }

      toast({
        title: "Cuenta blanqueada",
        description: `${player.first_name} ${player.last_name} quedo sin cuenta de acceso vinculada.`,
      })
      onPlayerAccountReset(player.id)
      handleOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Blanquear cuenta de acceso</DialogTitle>
          <DialogDescription>
            Esta accion elimina el usuario de acceso y mantiene intacto el jugador, sus inscripciones y su historial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>No se borra el jugador</AlertTitle>
            <AlertDescription>
              Se desvincula el jugador y se borra la cuenta Auth/public users. Luego el jugador puede volver a registrarse o vincularse correctamente.
            </AlertDescription>
          </Alert>

          <div className="rounded-surface border p-4 text-sm">
            <div className="font-semibold">
              {player.first_name} {player.last_name}
            </div>
            <div className="mt-1 text-muted-foreground">DNI: {player.dni || "Sin DNI"}</div>
            <div className="text-muted-foreground">Email: {email || "Sin email"}</div>
            <div className="text-muted-foreground">User ID: {player.user_id || "Sin cuenta vinculada"}</div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-reset-reason">Motivo</Label>
            <Textarea
              id="account-reset-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={isPending}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-reset-confirmation">Escribi BLANQUEAR para confirmar</Label>
            <Input
              id="account-reset-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value.toUpperCase())}
              disabled={isPending}
              autoComplete="off"
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>No se pudo blanquear la cuenta</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={handleSubmit} disabled={!canSubmit}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Blanquear cuenta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
