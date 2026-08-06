"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"

interface PlayerHistoryTarget {
  id: string
  name: string
}

interface PlayerHistoryMarkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tournamentId: string
  targets: PlayerHistoryTarget[]
  defaultScope?: string
}

export default function PlayerHistoryMarkDialog({
  open,
  onOpenChange,
  tournamentId,
  targets,
  defaultScope = "all",
}: PlayerHistoryMarkDialogProps) {
  const [scope, setScope] = useState(defaultScope)
  const [note, setNote] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      setScope(defaultScope)
    }
  }, [defaultScope, open])

  const validTargets = useMemo(
    () => targets.filter((target) => target.id && target.name),
    [targets]
  )

  const selectedPlayerIds = scope === "all"
    ? validTargets.map((target) => target.id)
    : validTargets.filter((target) => target.id === scope).map((target) => target.id)

  const handleSubmit = async () => {
    const cleanNote = note.trim()

    if (selectedPlayerIds.length === 0) {
      toast({
        title: "Selecciona un jugador",
        description: "No encontramos jugadores validos para marcar.",
        variant: "destructive",
      })
      return
    }

    if (!cleanNote) {
      toast({
        title: "Agrega una nota",
        description: "La marca necesita un motivo breve para quedar en historial.",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/player-history-marks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerIds: selectedPlayerIds,
          note: cleanNote,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || "No se pudo guardar la marca")
      }

      toast({
        title: "Marca guardada",
        description: selectedPlayerIds.length > 1
          ? "La pareja quedo registrada con una mancha amarilla."
          : "El jugador quedo registrado con una mancha amarilla.",
      })

      setNote("")
      setScope(defaultScope)
      onOpenChange(false)
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo guardar la marca",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Marcar historial
          </DialogTitle>
          <DialogDescription>
            Guarda una mancha amarilla interna. No bloquea inscripciones ni cambia permisos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {validTargets.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="history-scope">Aplicar a</Label>
              <select
                id="history-scope"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="all">Pareja completa</option>
                {validTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="history-note">Nota</Label>
            <Textarea
              id="history-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              placeholder="Motivo breve, por ejemplo: aviso por conducta en inscripcion o incumplimiento menor."
              className="min-h-28"
            />
            <p className="text-xs text-muted-foreground">{note.length}/500</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Guardar marca
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
