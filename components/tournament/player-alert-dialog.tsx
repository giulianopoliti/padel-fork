'use client'

import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type PlayerAlert = { player_id: string; message: string }

const alertUrl = (tournamentId: string) => `/api/tournaments/${tournamentId}/inscriptions/player-alerts`

export const usePlayerAlerts = (tournamentId: string | undefined) =>
  useSWR(tournamentId ? alertUrl(tournamentId) : null, async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error('No se pudieron cargar las alertas.')
    const { data }: { data: PlayerAlert[] } = await response.json()
    return data
  })

interface PlayerAlertDialogProps {
  tournamentId: string
  coupleId: string
  playerId: string
  playerName: string
  currentMessage?: string
  onClose: () => void
  onSaved: () => void
}

export const PlayerAlertDialog = ({ tournamentId, coupleId, playerId, playerName, currentMessage, onClose, onSaved }: PlayerAlertDialogProps) => {
  const [message, setMessage] = useState(currentMessage ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const handleSave = async (nextMessage: string | null) => {
    setSaving(true)
    setError(undefined)
    try {
      const response = await fetch(alertUrl(tournamentId), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coupleId, playerId, message: nextMessage }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || 'No se pudo guardar la alerta.')
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la alerta.')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (message.trim() && !saving) void handleSave(message.trim())
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{currentMessage ? 'Editar alerta' : 'Agregar alerta'}</DialogTitle>
          <DialogDescription>Nota sobre {playerName}, visible para quienes gestionan este torneo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="player-alert-message">Alerta</Label>
            <Textarea id="player-alert-message" rows={4} maxLength={500} value={message} disabled={saving}
              onChange={event => setMessage(event.target.value)} />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            {currentMessage && <Button type="button" variant="ghost" disabled={saving} onClick={() => void handleSave(null)}>Quitar alerta</Button>}
            <Button type="submit" disabled={saving || !message.trim() || message.trim() === currentMessage}>{saving ? 'Guardando…' : 'Guardar alerta'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
