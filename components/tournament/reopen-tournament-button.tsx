'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { AlertCircle, Loader2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import type { TournamentReopenPreview } from '@/lib/services/points/types/tournament-reopen.types'

interface Props { tournamentId: string; onReopened?: () => void }

export const ReopenTournamentButton = ({ tournamentId, onReopened }: Props) => {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<TournamentReopenPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const requestNumber = useRef(0)
  const submitting = useRef(false)
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { toast } = useToast()
  const url = `/api/tournaments/${tournamentId}/points/reopen`

  const handleLoad = useCallback(async (): Promise<void> => {
    const current = ++requestNumber.current
    setLoading(true); setPreview(null); setError(null); setConfirmed(false); setNeedsRefresh(false)
    try {
      const response = await fetch(url, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo revisar la reapertura.')
      if (current === requestNumber.current) setPreview(data)
    } catch (failure) {
      if (current === requestNumber.current) setError(failure instanceof Error ? failure.message : 'No se pudo revisar la reapertura.')
    } finally { if (current === requestNumber.current) setLoading(false) }
  }, [url])

  useEffect(() => {
    if (open) void handleLoad()
    return () => { requestNumber.current += 1 }
  }, [open, handleLoad])

  const handleConfirm = async (): Promise<void> => {
    if (!preview?.canReopen || !confirmed || needsRefresh || submitting.current) return
    submitting.current = true; setApplying(true); setError(null)
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: preview.fingerprint }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo reabrir el torneo.')
      setOpen(false)
      toast({ title: 'Torneo reabierto', description: 'Se revirtió el cierre. Podés corregir resultados y volver a revisar los puntos.' })
      onReopened?.()
      router.refresh()
      void mutate(`/api/tournaments/${tournamentId}/finalization-status`)
      void mutate(`tournament-sidebar-${tournamentId}`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo reabrir el torneo.')
      setNeedsRefresh(true); setConfirmed(false)
    } finally { submitting.current = false; setApplying(false) }
  }

  return <>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Undo2 className="mr-2 h-4 w-4" />Reabrir torneo</Button>
    <Dialog open={open} onOpenChange={value => { if (!submitting.current) setOpen(value) }}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reabrir torneo y deshacer el cierre</DialogTitle>
          <DialogDescription>Revisá el impacto antes de confirmar. Los partidos y sus resultados se conservan.</DialogDescription>
        </DialogHeader>
        {loading && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Revisando puntos y categorías…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {preview && <div className="space-y-4">
          <p className="text-sm"><strong>{preview.tournamentName}</strong> volverá a <strong>{preview.statusAfter === 'ZONE_PHASE' ? 'fase de zonas' : 'fase de llaves'}</strong>.</p>
          <p className="text-sm text-muted-foreground">{!preview.canReopen ? 'Este cierre requiere revisar los movimientos indicados abajo antes de poder reabrirse.' : preview.hadPoints
            ? `Se anulará la acreditación de ${preview.matchPointsToRemove} partidos, ${preview.titlesToRemove} títulos de jugadores y ${preview.promotionsToRemove} ascensos. También se desharán los cambios manuales de categoría de esa acreditación.`
            : 'Los puntos todavía no se acreditaron. Se deshará el cierre para permitir corregir los resultados.'}</p>
          {preview.estimatedPreviousState && <p className="text-xs text-muted-foreground">Este cierre es anterior a la captura de la fase previa. Se recuperará la fase según el formato; la fecha de fin actual se conservará.</p>}
          {preview.playerChanges.length > 0 && <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <caption className="p-3 text-left text-xs text-muted-foreground">La acreditación anulada incluye puntos guardados en la categoría del torneo. El saldo muestra los puntos activos en la categoría oficial.</caption>
              <thead className="bg-muted/50"><tr><th scope="col" className="p-3">Jugador</th><th scope="col" className="p-3">Puntos a anular</th><th scope="col" className="p-3">Saldo activo</th><th scope="col" className="p-3">Categoría</th></tr></thead>
              <tbody>{preview.playerChanges.map(player => <tr key={player.playerId} className="border-t">
                <td className="p-3 font-medium">{player.playerName}{player.titleRemoved && <span className="block text-xs font-normal text-muted-foreground">Se retira el título del ranking hasta volver a acreditar</span>}</td>
                <td className="p-3">{player.creditedPoints}{player.extraBonusToRemove > 0 && <span className="block text-xs text-muted-foreground">+ {player.extraBonusToRemove} por anulación del ascenso</span>}</td>
                <td className="whitespace-nowrap p-3">{player.pointsBefore} → {player.pointsAfter}</td>
                <td className="whitespace-nowrap p-3">{player.categoryBefore ?? 'Sin categoría'} → {player.categoryAfter ?? 'Sin categoría'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          {preview.blockers.length > 0 && <div role="alert" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="flex items-center gap-2 font-semibold"><AlertCircle className="h-4 w-4" />Hay movimientos que impiden deshacer este cierre</p>
            <ul className="list-disc space-y-1 pl-5">{preview.blockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul>
          </div>}
          {preview.canReopen && <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
            <Checkbox checked={confirmed} disabled={applying || needsRefresh} onCheckedChange={checked => setConfirmed(checked === true)} aria-label="Confirmar reapertura y reversión del cierre" />
            <span>Confirmo que quiero reabrir el torneo{preview.hadPoints ? ' y revertir los puntos, títulos y cambios de categoría detallados' : ''}. Después podré volver a cerrarlo y acreditar los puntos revisados.</span>
          </label>}
        </div>}
        <DialogFooter>
          <Button variant="outline" disabled={applying} onClick={() => setOpen(false)}>Cancelar</Button>
          {(needsRefresh || (!preview && !loading)) && <Button variant="outline" onClick={() => void handleLoad()} disabled={applying}>Actualizar vista previa</Button>}
          <Button variant="destructive" disabled={loading || applying || !preview?.canReopen || !confirmed || needsRefresh} onClick={() => void handleConfirm()}>
            {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar reapertura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
