'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { freeSportsViewSchema, type FreeSportOperation, type FreeSportsView } from '@/types/americano-libre-sports'
import type { FreeEditorData } from '@/types/americano-libre-editor'

type Props = { tournamentId: string; editor?: FreeEditorData; onSaved: () => Promise<unknown> }

export const AmericanFreeSports = ({ tournamentId, editor, onSaved }: Props) => {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<FreeSportsView | null>(null)
  const [selected, setSelected] = useState('')
  const [score1, setScore1] = useState('')
  const [score2, setScore2] = useState('')
  const [court, setCourt] = useState('')
  const [fecha, setFecha] = useState('')
  const [slot, setSlot] = useState('')
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
    setSelected(id); setScore1(value?.result_couple1 ?? ''); setScore2(value?.result_couple2 ?? '')
    setCourt(value?.court ?? ''); setFecha(''); setSlot(''); setLoser(''); setReason('')
  }
  const handleLoad = async (): Promise<void> => {
    if (pending.current) return
    pending.current = true; setBusy(true); setFailure(null)
    try {
      const response = await fetch(url, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'No se pudo cargar')
      const data = freeSportsViewSchema.parse(result)
      setView(data); setConflict(false); handleSelect(data.matches[0]?.id ?? '', data)
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
  const scoreValid = score1 !== '' && score2 !== '' && [Number(score1), Number(score2)].every((score) => Number.isInteger(score) && score >= 0 && score <= 99) && Number(score1) !== Number(score2)
  const readyByes = view?.matches.filter((item) => !item.winner_id && item.status !== 'IN_PROGRESS' && ((item.free_slot1_origin === 'BYE' && item.couple2_id) || (item.free_slot2_origin === 'BYE' && item.couple1_id))) ?? []
  return <>
    <Button variant="outline" onClick={() => { setOpen(true); setView(null); void handleLoad() }}>Resultados, BYEs y canchas</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!pending.current) setOpen(value) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Gestionar partidos</DialogTitle><DialogDescription>Partidos activos de llave y zona. Las entradas pendientes esperan su participante.</DialogDescription></DialogHeader>
        {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
        {conflict && <p className="text-sm">La llave cambió. Recargá y revisá el partido antes de guardar otra vez.</p>}
        {(!view || conflict) && <Button variant="outline" disabled={busy} onClick={() => void handleLoad()}>Recargar partidos</Button>}
        {view && <fieldset disabled={busy || conflict} className="space-y-4">
          <Label htmlFor="free-sport-match">Partido</Label>
          <select id="free-sport-match" value={selected} onChange={(event) => handleSelect(event.target.value)} className="w-full rounded-md border bg-background p-2 text-sm">
            {view.matches.map((item) => <option key={item.id} value={item.id}>{item.zone_id ? 'Zona' : item.round} {item.order_in_round ?? ''} · {item.free_slot1_origin === 'BYE' ? 'Pase libre previsto' : name(item.couple1_id)} / {item.free_slot2_origin === 'BYE' ? 'Pase libre previsto' : name(item.couple2_id)}</option>)}
          </select>
          {match && <>
            <p className="text-sm">{match.status}{match.winner_id ? ` · Ganador: ${name(match.winner_id)}` : ''}{match.free_bye_processed ? ' · BYE procesado' : ''}</p>
            {canResult && <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Resultado del set</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="free-score1">{name(match.couple1_id)}</Label><Input id="free-score1" type="number" min={0} max={99} value={score1} onChange={(event) => setScore1(event.target.value)} /></div>
                <div><Label htmlFor="free-score2">{name(match.couple2_id)}</Label><Input id="free-score2" type="number" min={0} max={99} value={score2} onChange={(event) => setScore2(event.target.value)} /></div>
              </div>
              <Button disabled={!scoreValid} onClick={() => void handleMutate([{ kind: 'RESULT', matchId: match.id, score1: Number(score1), score2: Number(score2) }])}>{match.winner_id ? 'Modificar resultado' : 'Guardar resultado'}</Button>
            </div>}
            <div className="flex flex-wrap gap-2">
              {byeReady && <Button onClick={() => void handleMutate([{ kind: 'PROCESS_BYE', matchId: match.id }])}>Procesar BYE</Button>}
              {match.free_bye_processed && <Button variant="outline" onClick={() => void handleMutate([{ kind: 'UNDO_BYE', matchId: match.id }])}>Desprocesar BYE</Button>}
              {match.winner_id && !match.free_bye_processed && <Button variant="outline" onClick={() => void handleMutate([{ kind: 'CLEAR_RESULT', matchId: match.id }])}>Revertir resultado</Button>}
            </div>
            {!match.winner_id && <>
              <div className="space-y-2 rounded-md border p-3">
                <Label htmlFor="free-court">Cancha</Label><Input id="free-court" value={court} maxLength={100} onChange={(event) => setCourt(event.target.value)} />
                <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void handleMutate([{ kind: 'COURT', matchId: match.id, court, start: false }])}>Guardar cancha</Button>
                  <Button disabled={!canResult} onClick={() => void handleMutate([{ kind: 'COURT', matchId: match.id, court, start: true }])}>Iniciar partido</Button></div>
              </div>
              <div className="space-y-2 rounded-md border p-3">
                <Label htmlFor="free-date">Fecha y horario</Label>
                <select id="free-date" value={fecha} onChange={(event) => { setFecha(event.target.value); setSlot('') }} className="w-full rounded-md border bg-background p-2 text-sm"><option value="">Elegir fecha</option>{view.dates.filter((date) => date.round_type === match.round).map((date) => <option key={date.id} value={date.id}>Fecha {date.fecha_number}</option>)}</select>
                <select aria-label="Horario del partido" value={slot} onChange={(event) => setSlot(event.target.value)} className="w-full rounded-md border bg-background p-2 text-sm"><option value="">Sin horario</option>{view.slots.filter((item) => item.fecha_id === fecha).map((item) => <option key={item.id} value={item.id}>{item.date} {item.start_time}</option>)}</select>
                <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!fecha} onClick={() => void handleMutate([{ kind: 'SCHEDULE', matchId: match.id, fechaId: fecha, timeSlotId: slot || null, order: null }])}>Guardar horario</Button>
                  <Button variant="outline" onClick={() => void handleMutate([{ kind: 'SCHEDULE', matchId: match.id, fechaId: null, timeSlotId: null, order: null }])}>Quitar de agenda</Button></div>
              </div>
              {!match.zone_id && canResult && <details className="rounded-md border p-3 text-sm"><summary>Descalificar una pareja</summary><div className="mt-3 space-y-2">
                <select aria-label="Pareja descalificada" value={loser} onChange={(event) => setLoser(event.target.value)} className="w-full rounded-md border bg-background p-2"><option value="">Elegir pareja</option>{[match.couple1_id!, match.couple2_id!].map((id) => <option key={id} value={id}>{name(id)}</option>)}</select>
                <Label htmlFor="free-dq-reason">Motivo</Label><Input id="free-dq-reason" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
                <Button variant="destructive" disabled={!loser || !reason.trim()} onClick={() => void handleMutate([{ kind: 'DISQUALIFY', matchId: match.id, coupleId: loser, reason }])}>Confirmar descalificación</Button>
              </div></details>}
            </>}
          </>}
          {readyByes.length > 1 && <Button variant="outline" onClick={() => void handleMutate(readyByes.map((item) => ({ kind: 'PROCESS_BYE', matchId: item.id })))}>Procesar {readyByes.length} BYEs previstos habilitados</Button>}
        </fieldset>}
      </DialogContent>
    </Dialog>
  </>
}
