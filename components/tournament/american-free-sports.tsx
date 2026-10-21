'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { freeSportsViewSchema, type FreeSportOperation, type FreeSportsView, type FreeMatchAction } from '@/types/americano-libre-sports'
import { BracketSingleSetResultDialog } from './bracket-v2/components/BracketSingleSetResultDialog'
import type { Round } from './bracket-v2/types/bracket-types'
import type { FreeEditorData } from '@/types/americano-libre-editor'

type Props = { tournamentId: string; editor?: FreeEditorData; matchId: string; mode: FreeMatchAction; onClose: () => void; onSaved: () => Promise<unknown> }

const ACTION_TITLES: Record<FreeMatchAction, string> = {
  result: 'Cargar resultado', start: 'Iniciar partido', disqualify: 'Descalificar pareja',
  bye: 'Procesar BYE', 'undo-bye': 'Revertir BYE', 'clear-result': 'Revertir resultado',
}

export const AmericanFreeSports = ({ tournamentId, editor, matchId, mode, onClose, onSaved }: Props) => {
  const open = true
  const setOpen = (value: boolean): void => { if (!value) onClose() }
  const [view, setView] = useState<FreeSportsView | null>(null)
  const [selected, setSelected] = useState('')
  const [court, setCourt] = useState('')
  const [loser, setLoser] = useState('')
  const [reason, setReason] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const url = `/api/tournaments/${tournamentId}/american-free-bracket/sports`
  const match = view?.matches.find((item) => item.id === selected)
  const name = (id: string | null): string => editor?.couples.find((couple) => couple.coupleId === id)?.name ?? 'Participante pendiente'
  const handleSelect = (id: string, data = view): void => {
    const value = data?.matches.find((item) => item.id === id)
    setSelected(id)
    setCourt(value?.court ?? ''); setLoser(''); setReason('')
  }
  const handleLoad = async (): Promise<void> => {
    if (pending.current) return
    pending.current = true; setBusy(true); setFailure(null)
    try {
      const response = await fetch(url, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'No se pudo cargar')
      const data = freeSportsViewSchema.parse(result)
      setView(data); setConflict(false); handleSelect(matchId, data)
    } catch (error) { setFailure(error instanceof Error ? error.message : 'No se pudo cargar') }
    finally { pending.current = false; setBusy(false) }
  }
  const handleMutate = async (operations: FreeSportOperation[]): Promise<void> => {
    if (!view || pending.current || conflict) return
    pending.current = true; setBusy(true); setFailure(null)
    let committed = false
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: view.revision, operations }) })
      const result = await response.json()
      if (!response.ok || !result.success) {
        if (response.status === 409) setConflict(true)
        throw new Error(result.message || 'No se pudo guardar. Recargá para comprobar el estado.')
      }
      committed = true
      await onSaved(); setOpen(false); setView(null)
    } catch (error) {
      if (committed) setConflict(true)
      setFailure(committed ? 'La operación se guardó, pero falló la recarga. Recargá para comprobar el estado.' : error instanceof Error ? error.message : 'No se pudo guardar')
    }
    finally { pending.current = false; setBusy(false) }
  }
  const byeReady = Boolean(match && !match.winner_id && match.status !== 'IN_PROGRESS' && ((match.free_slot1_origin === 'BYE' && match.couple2_id) || (match.free_slot2_origin === 'BYE' && match.couple1_id)))
  const canResult = Boolean(match?.couple1_id && match?.couple2_id && !match.free_bye_processed)
  useEffect(() => { void handleLoad() }, [])
  if (mode === 'result' && match && canResult && !conflict) return <BracketSingleSetResultDialog
    open onOpenChange={(value) => { if (!pending.current) setOpen(value) }}
    tournamentId={tournamentId}
    match={{ id: match.id, round: match.round as Round, order_in_round: match.order_in_round ?? 1,
      result: match.result_couple1 !== null && match.result_couple2 !== null ? {
        sets: [{ slot1Score: Number(match.result_couple1), slot2Score: Number(match.result_couple2) }],
        winner: Number(match.result_couple1) > Number(match.result_couple2) ? 'slot1' : 'slot2',
      } : undefined }}
    couple1={{ id: match.couple1_id!, name: name(match.couple1_id) }}
    couple2={{ id: match.couple2_id!, name: name(match.couple2_id) }}
    isModifyMode={Boolean(match.winner_id)} saving={busy || conflict} saveError={failure}
    onSaveResult={(score1, score2) => handleMutate([{ kind: 'RESULT', matchId: match.id, score1, score2 }])}
  />
  return <>
    <Dialog open={open} onOpenChange={(value) => { if (!pending.current) setOpen(value) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{ACTION_TITLES[mode]}</DialogTitle><DialogDescription>{match ? mode === 'bye' || mode === 'undo-bye' ? name(match.couple1_id ?? match.couple2_id) : `${name(match.couple1_id)} vs. ${name(match.couple2_id)}` : 'Cargando partido...'}</DialogDescription></DialogHeader>
        {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
        {conflict && <p className="text-sm">La llave cambió. Recargá y revisá el partido antes de guardar otra vez.</p>}
        {(!view || conflict) && <Button variant="outline" disabled={busy} onClick={() => void handleLoad()}>Recargar partidos</Button>}
        {view && <fieldset disabled={busy || conflict} className="space-y-4">
          {match && <>
            {mode === 'bye' && (byeReady ? <div className="space-y-4"><p className="text-sm">Esta pareja tiene un pase libre. Al confirmarlo, avanzará a la siguiente ronda sin jugar.</p><Button onClick={() => void handleMutate([{ kind: 'PROCESS_BYE', matchId: match.id }])}>Confirmar pase libre</Button></div> : <p className="text-sm">Este partido no tiene un BYE habilitado. Un rival pendiente no es un pase libre.</p>)}
            {mode === 'undo-bye' && match.free_bye_processed && <div className="space-y-4"><p className="text-sm">Se quitará el avance por pase libre. Si la siguiente ronda tiene actividad, primero deberás revertirla.</p><Button variant="destructive" onClick={() => void handleMutate([{ kind: 'UNDO_BYE', matchId: match.id }])}>Confirmar reversión del BYE</Button></div>}
            {mode === 'clear-result' && match.winner_id && !match.free_bye_processed && <div className="space-y-4"><p className="text-sm">Se eliminará el resultado y se revertirá el avance del ganador. Si la siguiente ronda tiene actividad, primero deberás revertirla.</p><Button variant="destructive" onClick={() => void handleMutate([{ kind: 'CLEAR_RESULT', matchId: match.id }])}>Confirmar reversión del resultado</Button></div>}
            {!match.winner_id && <>
              {mode === 'start' && <div className="space-y-2">
                <Label htmlFor="free-court">Cancha</Label><Input id="free-court" value={court} maxLength={100} onChange={(event) => setCourt(event.target.value)} />
                <Button disabled={!canResult} onClick={() => void handleMutate([{ kind: 'COURT', matchId: match.id, court, start: true }])}>Iniciar partido</Button>
              </div>}
              {mode === 'disqualify' && !match.zone_id && canResult && <div className="space-y-3 text-sm">
                <p>La pareja elegida quedará descalificada del torneo y su rival avanzará a la siguiente ronda.</p>
                <select aria-label="Pareja descalificada" value={loser} onChange={(event) => setLoser(event.target.value)} className="w-full rounded-md border bg-background p-2"><option value="">Elegir pareja</option>{[match.couple1_id!, match.couple2_id!].map((id) => <option key={id} value={id}>{name(id)}</option>)}</select>
                <Label htmlFor="free-dq-reason">Motivo</Label><Input id="free-dq-reason" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
                <Button variant="destructive" disabled={!loser || !reason.trim()} onClick={() => void handleMutate([{ kind: 'DISQUALIFY', matchId: match.id, coupleId: loser, reason }])}>Confirmar descalificación</Button>
              </div>}
            </>}
            {mode === 'result' && !canResult && <p className="text-sm">El partido necesita dos parejas para cargar un resultado.</p>}
          </>}
        </fieldset>}
      </DialogContent>
    </Dialog>
  </>
}
