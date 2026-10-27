'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/use-toast'
import type { PointsReview } from '@/lib/services/points/types/points-review.types'

interface Props {
  tournamentId: string
  isOpen: boolean
  onClose: () => void
  onApplied?: () => void
}

const cupNames = { MAIN: 'Torneo', GOLD: 'Oro', SILVER: 'Plata' }
const signed = (points: number): string => `${points > 0 ? '+' : ''}${points}`

export const PointsReviewDialog = ({ tournamentId, isOpen, onClose, onApplied }: Props) => {
  const [review, setReview] = useState<PointsReview | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [changes, setChanges] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState(false)
  const [basisAccepted, setBasisAccepted] = useState(false)
  const submitting = useRef(false)
  const requestNumber = useRef(0)
  const { toast } = useToast()
  const readOnly = review !== null && review.state !== 'PREVIEW'
  const needsBasisAcceptance = review?.scoreBasis === 'CURRENT' || review?.scoreBasis === 'MIXED'
  const changeCount = review?.playerScores.filter(player => changes[player.playerId] && changes[player.playerId] !== player.categoryBefore).length ?? 0

  const handleLoad = useCallback(async (): Promise<void> => {
    const request = ++requestNumber.current
    setLoading(true); setError(null); setReview(null); setNeedsRefresh(false)
    setChanges({}); setConfirmed(false); setBasisAccepted(false)
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/points`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar la revisión de puntos.')
      if (request === requestNumber.current) setReview(data as PointsReview)
    } catch (failure) {
      if (request === requestNumber.current) setError(failure instanceof Error ? failure.message : 'No se pudo cargar la revisión de puntos.')
    } finally { if (request === requestNumber.current) setLoading(false) }
  }, [tournamentId])

  useEffect(() => {
    if (isOpen) void handleLoad()
    return () => { requestNumber.current++ }
  }, [isOpen, handleLoad])

  const handleConfirm = async (): Promise<void> => {
    if (!review || readOnly || !confirmed || submitting.current || needsRefresh || (needsBasisAcceptance && !basisAccepted)) return
    submitting.current = true; setApplying(true); setError(null)
    try {
      const categoryChanges = review.playerScores.filter(player => changes[player.playerId] && changes[player.playerId] !== player.categoryBefore)
        .map(player => ({ playerId: player.playerId, newCategory: changes[player.playerId] }))
      const response = await fetch(`/api/tournaments/${tournamentId}/points`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: review.fingerprint, categoryChanges, acceptCurrentScoreBasis: basisAccepted }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        if (response.status === 409) { setNeedsRefresh(true); setConfirmed(false) }
        throw new Error(data.error || 'No se pudo confirmar la acreditación. Actualizá la revisión antes de reintentar.')
      }
      setReview(data.review); setChanges({}); setConfirmed(false)
      toast({ title: data.alreadyApplied ? 'Este cierre ya estaba acreditado' : 'Puntos y decisiones guardados', description: 'El resumen queda disponible para consultar cuando lo necesites.' })
      onApplied?.()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo confirmar la acreditación. Actualizá la revisión para comprobar el estado.')
    } finally { submitting.current = false; setApplying(false) }
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open && !applying) onClose() }}>
      <DialogContent className="max-h-[94dvh] max-w-6xl gap-4 overflow-y-auto p-4 sm:p-6" onEscapeKeyDown={event => { if (applying) event.preventDefault() }} onPointerDownOutside={event => { if (applying) event.preventDefault() }}>
        <DialogHeader>
          <DialogTitle>{readOnly ? 'Resumen de puntos del torneo' : 'Revisar puntos y ascensos'}</DialogTitle>
          <DialogDescription>{readOnly ? 'Estos son los movimientos guardados al acreditar el torneo.' : 'Revisá el desglose por jugador. Los ascensos y descensos se deciden manualmente y conservan los puntos ganados.'}</DialogDescription>
        </DialogHeader>
        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div className="space-y-2"><p>{error}</p><Button variant="outline" size="sm" disabled={loading || applying} onClick={() => void handleLoad()}><RefreshCw className="mr-2 h-4 w-4" />{needsRefresh ? 'Actualizar revisión y decisiones' : 'Revisar estado y reintentar'}</Button></div></div>}
        {loading && <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Preparando el desglose de puntos…</div>}
        {!loading && review && <>
          {readOnly && <div role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 className="h-5 w-5" />Puntos acreditados{review.appliedAt ? ` · ${new Date(review.appliedAt).toLocaleString('es-AR')}` : ''}</div>}
          {review.state === 'LEGACY' && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Este cierre es anterior al desglose por copa y categoría. Se muestran los movimientos históricos disponibles; no se recalculan.</p>}
          {!readOnly && needsBasisAcceptance && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium">{review.scoreBasis === 'CURRENT' ? 'Este torneo no tiene una captura inicial de puntajes.' : 'Algunos jugadores no tienen una captura inicial de puntajes.'}</p>
            <p>Para esos jugadores, el cálculo usa el puntaje actual, que puede incluir torneos posteriores. Revisá esta base antes de acreditar.</p>
            <label className="flex cursor-pointer items-start gap-2"><Checkbox checked={basisAccepted} disabled={applying} onCheckedChange={checked => setBasisAccepted(checked === true)} /><span>Acepto usar los puntajes actuales donde falta la captura inicial.</span></label>
          </div>}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground"><p><strong className="text-foreground">{review.playerScores.length}</strong> jugadores</p>{review.state !== 'LEGACY' && <p><strong className="text-foreground">{review.totalMatches}</strong> partidos con puntos</p>}{!readOnly && <p><strong className="text-foreground">{changeCount}</strong> cambios manuales de categoría</p>}</div>
          <div role="list" aria-label="Puntos por jugador" className="divide-y rounded-lg border border-slate-200">
            {review.playerScores.map(player => <article role="listitem" key={player.playerId} className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 lg:grid-cols-[minmax(160px,1.3fr)_90px_80px_minmax(100px,1fr)_90px_minmax(180px,1.2fr)] lg:items-center">
              <div className="col-span-2 lg:col-span-1"><p className="font-medium">{player.playerName}</p><p className="text-xs text-muted-foreground">{readOnly ? `${player.categoryBefore ?? 'Categoría histórica no registrada'}${player.categoryAfter && player.categoryAfter !== player.categoryBefore ? ` → ${player.categoryAfter}` : ''}` : `Categoría oficial: ${player.categoryBefore ?? 'Sin asignar'}`}</p></div>
              <div><p className="text-xs text-muted-foreground">Antes</p><p className="tabular-nums">{player.pointsBefore}</p></div>
              <div><p className="text-xs text-muted-foreground">Partidos</p><p className="tabular-nums">{player.matchPoints === null ? '—' : signed(player.matchPoints)}</p></div>
              <div><p className="text-xs text-muted-foreground">Bonus</p><p className="tabular-nums">{player.bonus === null ? '—' : signed(player.bonus)}</p>{player.bonusAwards.map(award => <p key={`${award.cup}-${award.position}`} className="text-xs text-muted-foreground">{cupNames[award.cup]} · {award.position === 'champion' ? 'Campeón' : 'Subcampeón'}</p>)}</div>
              <div><p className="text-xs text-muted-foreground">Después</p><p className="font-semibold tabular-nums">{player.pointsAfter} <span className={`text-xs font-normal ${player.pointsEarned >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>({signed(player.pointsEarned)})</span></p></div>
              {!readOnly && <div className="col-span-2 lg:col-span-1"><label htmlFor={`category-${player.playerId}`} className="mb-1 block text-xs text-muted-foreground">Decisión de categoría</label>
                <select id={`category-${player.playerId}`} value={changes[player.playerId] ?? player.categoryBefore ?? ''} disabled={applying || needsRefresh || !player.categoryBefore}
                  className="h-10 w-full rounded-control border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  onChange={event => { setChanges(previous => ({ ...previous, [player.playerId]: event.target.value })); setConfirmed(false) }}>
                  {!player.categoryBefore && <option value="">Asignar primero desde la ficha</option>}
                  {review.categories.map(category => <option key={category.name} value={category.name}>{category.name === player.categoryBefore ? `Mantener ${category.name}` : `Cambiar a ${category.name}`}</option>)}
                </select>
              </div>}
            </article>)}
          </div>
          {Object.keys(review.bonuses).length > 0 && <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">{Object.entries(review.bonuses).map(([key, bonus]) => <p key={key}>{cupNames[key as keyof typeof cupNames]}: {bonus?.enabled ? `campeón +${bonus.champion} · subcampeón +${bonus.finalist} por jugador` : 'sin bonus'}</p>)}</div>}
          {!readOnly && <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm"><Checkbox checked={confirmed} disabled={applying || needsRefresh} onCheckedChange={checked => setConfirmed(checked === true)} /><span>Revisé los puntos y los {changeCount} cambios manuales. Los jugadores sin cambios conservarán su categoría, aunque superen su rango de puntos.</span></label>}
        </>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={applying}>{readOnly ? 'Cerrar resumen' : 'Volver sin acreditar'}</Button>
          {review && !readOnly && <Button onClick={() => void handleConfirm()} disabled={loading || applying || needsRefresh || !confirmed || (needsBasisAcceptance && !basisAccepted)}>{applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{applying ? 'Guardando cierre…' : 'Confirmar puntos y categorías'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
