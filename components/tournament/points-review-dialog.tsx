'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Trophy } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/use-toast'
import { applyManualCategoryDecisions } from '@/lib/services/points/services/points-review-decisions'
import { groupPointsByTournamentResult } from '@/lib/services/points/services/points-review-results'
import type { PointsReview } from '@/lib/services/points/types/points-review.types'

interface Props {
  tournamentId: string
  isOpen: boolean
  onClose: () => void
  onApplied?: () => void
}

const cupNames = { MAIN: 'Torneo', GOLD: 'Oro', SILVER: 'Plata' }
const awardNames = { champion: 'Campeón', finalist: 'Finalista', '16VOS': '16vos', '8VOS': '8vos', '4TOS': 'Cuartos', SEMIFINAL: 'Semifinal' }
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
  const fixedRanking = review?.rulesVersion === 'fixed-ranking-v1'
  const categoryChanges = useMemo(() => review?.playerScores.filter(player => {
    const proposed = player.automaticPromotion ? player.categoryAfter : player.categoryBefore
    return changes[player.playerId] && changes[player.playerId] !== proposed
  }).map(player => ({ playerId: player.playerId, newCategory: changes[player.playerId] })) ?? [], [review, changes])
  const visibleReview = useMemo(() => review && !readOnly && categoryChanges.length
    ? applyManualCategoryDecisions({ review, matchPoints: [] }, categoryChanges).review : review,
  [review, readOnly, categoryChanges])
  const groups = useMemo(() => groupPointsByTournamentResult(visibleReview?.playerScores ?? []), [visibleReview])
  const promotions = visibleReview?.playerScores.filter(player => player.automaticPromotion).length ?? 0
  const declined = visibleReview?.playerScores.filter(player => player.promotionDeclined).length ?? 0
  const unplayed = visibleReview?.playerScores.filter(player => player.tournamentResult?.stage === 'NO_MATCHES').length ?? 0
  const unresolved = groups.filter(group => group.result?.stage === 'UNRESOLVED').length
  const changeCount = Math.max(0, categoryChanges.length - declined)
  const playerGridClassName = readOnly
    ? 'lg:grid-cols-[minmax(220px,1.6fr)_repeat(4,minmax(0,1fr))]'
    : 'lg:grid-cols-[minmax(180px,1.4fr)_repeat(4,minmax(0,0.8fr))_minmax(200px,1.5fr)]'

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
      <DialogContent className="flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0" onEscapeKeyDown={event => { if (applying) event.preventDefault() }} onPointerDownOutside={event => { if (applying) event.preventDefault() }}>
        <DialogHeader className="shrink-0 space-y-2 border-b border-slate-200 px-4 py-5 pr-12 text-left sm:px-6 sm:pr-12">
          <DialogTitle className="text-lg font-semibold leading-6 text-slate-950 sm:text-xl">{readOnly ? 'Resumen de puntos del torneo' : 'Revisar puntos y ascensos'}</DialogTitle>
          <DialogDescription className="max-w-3xl text-sm leading-6">{readOnly ? 'Estos son los movimientos guardados al acreditar el torneo.' : 'Parejas ordenadas por resultado: campeones, subcampeones y rondas de eliminación. Revisá cada decisión antes de acreditar.'}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div className="space-y-2"><p>{error}</p><Button variant="outline" size="sm" disabled={loading || applying} onClick={() => void handleLoad()}><RefreshCw className="mr-2 h-4 w-4" />{needsRefresh ? 'Actualizar revisión y decisiones' : 'Revisar estado y reintentar'}</Button></div></div>}
        {loading && <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Preparando el desglose de puntos…</div>}
        {!loading && visibleReview && <>
          {readOnly && <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-3 py-2.5 text-sm text-emerald-900"><CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />Puntos acreditados{visibleReview.appliedAt ? ` · ${new Date(visibleReview.appliedAt).toLocaleString('es-AR')}` : ''}</div>}
          {visibleReview.state === 'LEGACY' && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Este cierre es anterior al desglose por copa y categoría. Se muestran los movimientos históricos disponibles; no se recalculan.</p>}
          {visibleReview.hasSubstitutionBaselines && <p className="text-sm text-muted-foreground">Para los suplentes que se incorporaron durante el torneo se usa el puntaje registrado al asignarlos por primera vez.</p>}
          {fixedRanking && <div className="space-y-1 border-l-2 border-slate-200 pl-3 text-sm leading-6 text-slate-600">
            <p><strong>Victorias:</strong> cada partido ganado y jugado suma {visibleReview.tournamentType === 'LONG' ? 12 : 6} puntos por jugador. Las derrotas y los pases sin jugar suman 0.</p>
            <p>Se agrega un único bono por la posición final en la llave principal u Oro. En Plata suman las victorias.</p>
          </div>}
          {(promotions > 0 || declined > 0) && <div className="space-y-1 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">
            <p><strong>{promotions} {readOnly ? promotions === 1 ? 'ascenso acreditado' : 'ascensos acreditados' : promotions === 1 ? 'ascenso propuesto' : 'ascensos propuestos'}</strong>{declined > 0 ? ' · ' + declined + ' sin ascenso por decisión del organizador' : ''}.</p>
            <p>{readOnly ? <Link className="font-medium underline" href="/panel/ascensos">Ver historial de ascensos</Link> : 'Podés mantener o quitar el ascenso de cada campeón. Si permanece en su categoría, conserva sus victorias y recibe +300 de campeón; si asciende, la nueva categoría empieza en 0.'}</p>
          </div>}
          {!readOnly && (unplayed > 0 || unresolved > 0) && <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            {unplayed > 0 && <p>{unplayed} inscriptos sin partidos registrados. Aparecen al final de la revisión.</p>}
            {unresolved > 0 && <p>{unresolved} parejas con recorridos incompletos: hay una victoria sin una posición final registrada. Revisá esos resultados antes de acreditar.</p>}
          </div>}
          {!readOnly && needsBasisAcceptance && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium">{visibleReview.scoreBasis === 'CURRENT' ? 'Este torneo no tiene una captura inicial de puntajes.' : 'Algunos jugadores no tienen una captura inicial de puntajes.'}</p>
            <p>Para esos jugadores, el cálculo usa el puntaje actual, que puede incluir torneos posteriores. Revisá esta base antes de acreditar.</p>
            <label className="flex cursor-pointer items-start gap-2"><Checkbox checked={basisAccepted} disabled={applying} onCheckedChange={checked => setBasisAccepted(checked === true)} /><span>Acepto usar los puntajes actuales donde falta la captura inicial.</span></label>
          </div>}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-slate-200 py-3 text-xs text-slate-500 sm:text-sm"><p><strong className="text-foreground">{visibleReview.playerScores.length}</strong> jugadores</p>{visibleReview.state !== 'LEGACY' && <p><strong className="text-foreground">{visibleReview.totalMatches}</strong> partidos computados</p>}{!readOnly && <p><strong className="text-foreground">{changeCount}</strong> cambios manuales de categoría</p>}</div>
          <div className="space-y-4">
            {groups.map(group => <section key={group.id} aria-label={group.label + ': ' + (group.result?.coupleName ?? group.players[0].playerName)} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className={group.result?.stage === 'champion' ? 'space-y-1 border-b border-amber-200/70 bg-amber-50/70 px-4 py-3 text-amber-950 lg:px-5' : 'space-y-1 border-b border-slate-200 bg-slate-50/80 px-4 py-3 text-slate-900 lg:px-5'}>
                <h3 className="flex items-center gap-2 text-sm font-semibold leading-5">{group.result?.stage === 'champion' && <Trophy aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-700" />}{group.label}</h3>
                {group.result?.stage === 'UNRESOLVED' && <p className="text-xs leading-5 text-slate-500">Última ronda registrada: {group.result.lastRound ?? 'sin dato'}. No se asigna un puesto final.</p>}
              </div>
              <div aria-hidden="true" className={['hidden gap-x-5 border-b border-slate-100 px-5 py-2.5 text-xs font-medium text-slate-500 lg:grid', playerGridClassName].join(' ')}>
                <span>Jugador</span>
                <span>Puntos previos</span>
                <span>{fixedRanking ? 'Por victorias' : 'Por partidos'}</span>
                <span>Bono por posición</span>
                <span>Saldo activo</span>
                {!readOnly && <span>Decisión de categoría</span>}
              </div>
              <div role="list" aria-label={'Puntos de ' + group.label} className="divide-y divide-slate-100">
                {group.players.map(player => {
                  const proposed = review?.playerScores.find(original => original.playerId === player.playerId)
                  const offeredPromotion = proposed?.automaticPromotion === true
                  return <article role="listitem" key={player.playerId} className={['grid grid-cols-2 gap-x-4 gap-y-4 p-4 transition-colors hover:bg-slate-50/60 sm:grid-cols-4 lg:items-start lg:gap-x-5 lg:px-5 lg:py-4', playerGridClassName].join(' ')}>
                    <div className="col-span-2 min-w-0 space-y-1 sm:col-span-4 lg:col-span-1">
                      <p className="break-words text-sm font-semibold leading-5 text-slate-900">{player.playerName}</p>
                      <p className="text-xs leading-5 text-slate-500">Categoría: {player.categoryBefore ?? 'Sin asignar'}</p>
                      {readOnly && player.automaticPromotion && <p className="text-xs font-medium leading-5 text-emerald-800">Ascendió a {player.categoryAfter} con 0 puntos.</p>}
                      {readOnly && player.promotionDeclined && <p className="text-xs leading-5 text-amber-900">Sin ascenso por decisión del organizador.</p>}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs text-slate-500 lg:sr-only">Puntos previos</p>
                      <p className="text-sm leading-5 tabular-nums text-slate-600">{player.pointsBefore}</p>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs text-slate-500 lg:sr-only">{fixedRanking ? 'Por victorias' : 'Por partidos'}</p>
                      <p className="text-sm font-medium leading-5 tabular-nums text-slate-900">{player.matchPoints === null ? '-' : signed(player.matchPoints)}</p>
                      {fixedRanking && player.wins !== undefined && <p className="text-xs leading-5 text-slate-500">{player.wins} {player.wins === 1 ? 'victoria' : 'victorias'} × {visibleReview.tournamentType === 'LONG' ? 12 : 6} pts</p>}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs text-slate-500 lg:sr-only">Bono por posición</p>
                      <p className="text-sm font-medium leading-5 tabular-nums text-slate-900">{player.bonus === null ? '-' : signed(player.bonus)}</p>
                      {player.bonusAwards.map(award => <p key={award.cup + '-' + award.position} className="text-xs leading-5 text-slate-500">{cupNames[award.cup]} · {awardNames[award.position]}</p>)}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs text-slate-500 lg:sr-only">Saldo en {player.categoryAfter ?? 'categoría actual'}</p>
                      <p className="text-base font-semibold leading-5 tabular-nums text-slate-900">{player.pointsAfter}</p>
                      <p aria-hidden="true" className="hidden text-xs leading-5 text-slate-500 lg:block">En {player.categoryAfter ?? 'categoría actual'}</p>
                      {player.automaticPromotion && <p className="text-xs leading-5 text-emerald-800">{player.categoryPointsAfter} pts guardados en {player.categoryBefore}</p>}
                      {fixedRanking && player.rankingCategory !== player.categoryBefore && <p className="text-xs leading-5 text-slate-500">{signed(player.pointsEarned)} en {player.rankingCategory ?? 'la categoría disputada'}</p>}
                    </div>
                    {!readOnly && <div className="col-span-2 min-w-0 space-y-2 border-t border-slate-100 pt-3 sm:col-span-4 lg:col-span-1 lg:border-0 lg:pt-0">
                      <label htmlFor={'category-' + player.playerId} className="block text-xs text-slate-500">{offeredPromotion ? 'Decisión de ascenso' : player.promotionNeedsReview ? 'Revisar categoría del campeón' : 'Decisión de categoría'}</label>
                      <select id={'category-' + player.playerId} value={changes[player.playerId] ?? (offeredPromotion ? proposed?.categoryAfter : player.categoryBefore) ?? ''} disabled={applying || needsRefresh || !player.categoryBefore}
                        className="h-10 w-full min-w-0 rounded-control border border-slate-300 bg-white px-3 text-sm text-slate-900 transition-colors hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                        onChange={event => { setChanges(previous => ({ ...previous, [player.playerId]: event.target.value })); setConfirmed(false) }}>
                        {offeredPromotion ? <>
                          <option value={proposed?.categoryAfter ?? ''}>Ascender a {proposed?.categoryAfter} (automático)</option>
                          <option value={player.categoryBefore ?? ''}>No ascender · mantener {player.categoryBefore}</option>
                        </> : <>
                          {!player.categoryBefore && <option value="">Asignar primero desde la ficha</option>}
                          {visibleReview.categories.map(category => <option key={category.name} value={category.name}>{category.name === player.categoryBefore ? 'Mantener ' + category.name : 'Cambiar a ' + category.name}</option>)}
                        </>}
                      </select>
                      {player.automaticPromotion && <p className="text-xs font-medium leading-5 text-emerald-800">Asciende a {player.categoryAfter} con 0 puntos.</p>}
                      {player.promotionDeclined && <p className="text-xs leading-5 text-amber-900">Conserva {player.categoryBefore} y recibe +300 de campeón.</p>}
                    </div>}
                  </article>
                })}
              </div>
            </section>)}
          </div>
          {Object.keys(visibleReview.bonuses).length > 0 && <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">{Object.entries(visibleReview.bonuses).map(([key, bonus]) => <p key={key}>{cupNames[key as keyof typeof cupNames]}: {bonus?.enabled ? `campeón +${bonus.champion} · subcampeón +${bonus.finalist} por jugador` : 'sin bonus'}</p>)}</div>}
          {!readOnly && <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6"><Checkbox checked={confirmed} disabled={applying || needsRefresh} onCheckedChange={checked => setConfirmed(checked === true)} /><span>Revisé los puntos, los {promotions} ascensos, los {declined} campeones sin ascenso y los {changeCount} cambios manuales de categoría.</span></label>}
        </>}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-6">
          <Button variant="outline" onClick={onClose} disabled={applying}>{readOnly ? 'Cerrar resumen' : 'Volver sin acreditar'}</Button>
          {review && !readOnly && <Button onClick={() => void handleConfirm()} disabled={loading || applying || needsRefresh || !confirmed || (needsBasisAcceptance && !basisAccepted)}>{applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{applying ? 'Guardando cierre…' : 'Confirmar puntos y categorías'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
