'use client'

import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import type { FreeBracketSnapshot } from '@/types/americano-libre'
import type { FreeEditorData, FreeSlot, FreeSource } from '@/types/americano-libre-editor'
import { freeLayout, freeSlotKey, getFreeSlot, moveFreeEntry, removeFreeEntry } from '@/lib/services/americano-libre-editor'
import { BRACKET_ROUNDS } from '@/lib/services/bracket-structure'

const ROUND_LABELS: Record<string, string> = { '32VOS': 'Treintaidosavos', '16VOS': 'Dieciseisavos', '8VOS': 'Octavos', '4TOS': 'Cuartos', SEMIFINAL: 'Semifinal', FINAL: 'Final' }
const EMPTY_EDITOR: FreeEditorData = { couples: [], guards: {} }
type Props = {
  tournamentId: string; snapshot: FreeBracketSnapshot; editor?: FreeEditorData; canManage: boolean
  onSaved: (snapshot: FreeBracketSnapshot) => Promise<unknown>; onReload: () => Promise<unknown>
}

export const AmericanFreeBracketEditor = ({ tournamentId, snapshot, editor, canManage, onSaved, onReload }: Props) => {
  const [session, setSession] = useState<{ baseline: FreeBracketSnapshot; draft: FreeBracketSnapshot; editor: FreeEditorData } | null>(null)
  const [selected, setSelected] = useState<FreeSource | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const dragSource = useRef<FreeSource | null>(null)
  const current = canManage ? session?.draft ?? snapshot : snapshot
  const reference = canManage ? session?.editor ?? editor ?? EMPTY_EDITOR : editor ?? EMPTY_EDITOR
  const stale = conflict || Boolean(session && session.baseline.revision !== snapshot.revision)
  const isEditing = canManage && Boolean(session) && !saving && !stale
  const label = (slot: FreeSlot): string => {
    const match = current.matches.find((item) => item.id === slot.matchId)
    return `${match ? ROUND_LABELS[match.round] : 'Partido'} ${match?.order_in_round} · lugar ${slot.slot}`
  }
  const coupleName = (id: string | null): string => reference.couples.find((couple) => couple.coupleId === id)?.name ?? 'Pareja sin información de zona'
  const selectedName = selected ? coupleName(selected.kind === 'ZONE' ? selected.coupleId : getFreeSlot(current.matches.find((match) => match.id === selected.matchId)!, selected.slot).coupleId) : null
  const assigned = new Set(current.matches.flatMap((match) => ([1, 2] as const).flatMap((slot) => {
    const value = getFreeSlot(match, slot)
    return match.bracket_is_active && value.origin === 'ENTRY' && value.coupleId ? [value.coupleId] : []
  })))
  const changes = session ? freeLayout(current).reduce((total, match, index) => {
    const before = freeLayout(session.baseline)[index]
    return total + Number(match.couple1_id !== before.couple1_id || match.slot1_origin !== before.slot1_origin) + Number(match.couple2_id !== before.couple2_id || match.slot2_origin !== before.slot2_origin)
  }, 0) : 0
  const targets = useMemo(() => {
    const result = new Map<string, { allowed: boolean; reason?: string }>()
    if (!session || !selected) return result
    for (const match of session.draft.matches) for (const slot of [1, 2] as const) {
      const target = { matchId: match.id, slot }
      try {
        moveFreeEntry(session.baseline, session.draft, session.editor, selected, target)
        result.set(freeSlotKey(target), { allowed: true })
      } catch (error) { result.set(freeSlotKey(target), { allowed: false, reason: error instanceof Error ? error.message : 'Destino no disponible.' }) }
    }
    return result
  }, [session, selected])

  const handleStart = (): void => {
    if (!editor || !canManage) return
    setSession({ baseline: structuredClone(snapshot), draft: structuredClone(snapshot), editor: structuredClone(editor) })
    setSelected(null); setFailure(null); setMessage(null); setConflict(false)
  }
  const handleCancel = (): void => { setSession(null); setSelected(null); setFailure(null); setConflict(false); setMessage('Cambios descartados. Se muestra la distribución guardada.'); dragSource.current = null }
  const handleMove = (target: FreeSlot, source = selected): void => {
    if (!session || !source || !isEditing) return
    try {
      const draft = moveFreeEntry(session.baseline, session.draft, session.editor, source, target)
      setSession({ ...session, draft }); setSelected(null); setFailure(null)
      setMessage(`Cambio en borrador: ${label(target)}. Guardá para confirmarlo.`)
    } catch (error) { setFailure(error instanceof Error ? error.message : 'No se pudo preparar el movimiento.') }
  }
  const handleRemove = (source: FreeSlot): void => {
    if (!session || !isEditing) return
    try {
      setSession({ ...session, draft: removeFreeEntry(session.baseline, session.draft, session.editor, source) })
      setSelected(null); setFailure(null); setMessage('Entrada retirada del borrador. Guardá para confirmarlo.')
    } catch (error) { setFailure(error instanceof Error ? error.message : 'No se pudo retirar la entrada.') }
  }
  const handleSelect = (source: FreeSource): void => { if (isEditing) { setSelected(source); setFailure(null); setMessage('Elegí un destino resaltado o arrastrá la pareja hasta ese lugar.') } }
  const handleDragStart = (event: DragEvent<HTMLElement>, source: FreeSource): void => {
    if (!isEditing) { event.preventDefault(); return }
    dragSource.current = source
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', source.kind === 'ZONE' ? source.coupleId : freeSlotKey(source))
    handleSelect(source)
  }
  const handleSave = async (): Promise<void> => {
    if (!canManage || !session || !changes || savingRef.current || stale) return
    savingRef.current = true; setSaving(true); setFailure(null)
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/american-free-bracket`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: session.baseline.revision, layout: freeLayout(session.draft) }),
      })
      const result: { success: boolean; message?: string; snapshot?: FreeBracketSnapshot } = await response.json()
      if (!response.ok || !result.success || !result.snapshot) {
        if (response.status === 409) setConflict(true)
        throw new Error(result.message || 'No se pudo guardar. El borrador se conserva para revisarlo.')
      }
      await onSaved(result.snapshot)
      setSession(null); setSelected(null); setMessage('Distribución guardada.'); setConflict(false)
    } catch (error) { setMessage(null); setFailure(error instanceof Error ? error.message : 'No se pudo guardar. Recargá para comprobar el estado.') }
    finally { savingRef.current = false; setSaving(false) }
  }
  const handleReload = async (): Promise<void> => {
    if (savingRef.current) return
    try { await onReload(); handleCancel(); setMessage('Se cargó la distribución vigente. Volvé a Reorganizar para editar.') }
    catch (error) { setFailure(error instanceof Error ? error.message : 'No se pudo recargar la distribución.') }
  }

  const geometry = useMemo(() => {
    const rounds = BRACKET_ROUNDS.filter((round) => current.matches.some((match) => match.round === round))
    const positions = new Map<string, { x: number; y: number }>()
    const center = (id: string): number => {
      const cached = positions.get(id)
      if (cached) return cached.y + 110
      const match = current.matches.find((item) => item.id === id)!
      const children = current.hierarchy.filter((edge) => edge.parent_match_id === id)
      const cy = children.length ? children.reduce((sum, edge) => sum + center(edge.child_match_id), 0) / children.length : 150 + (match.order_in_round - 1) * 252
      positions.set(id, { x: 20 + rounds.indexOf(match.round as typeof BRACKET_ROUNDS[number]) * 310, y: cy - 110 })
      return cy
    }
    current.matches.forEach((match) => center(match.id))
    return { rounds, positions, width: rounds.length * 310, height: 60 + current.matches.filter((match) => match.round === rounds[0]).length * 252 }
  }, [current])

  return <div className="space-y-4">
    <dl className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-4">
      {[
        ['Cantidad solicitada', current.requested_count], ['Cuadro base', current.base_size],
        ['Capacidad efectiva', current.effective_capacity], ['Parejas ubicadas', current.assigned_count],
      ].map(([name, value]) => <div key={name}><dt className="text-sm text-muted-foreground">{name}</dt><dd className="text-2xl font-semibold tabular-nums">{value}</dd></div>)}
    </dl>
    {canManage && <div className="flex flex-wrap items-center gap-2">
      {!session ? <Button variant="outline" onClick={handleStart} disabled={!editor}>Reorganizar parejas</Button> : <>
        <Button onClick={() => void handleSave()} disabled={saving || stale || !changes}>{saving ? 'Guardando...' : `Guardar ${changes} cambio(s)`}</Button>
        <Button variant="outline" onClick={handleCancel} disabled={saving}>Cancelar</Button>
        <span className="text-sm text-muted-foreground">Revisión {session.baseline.revision} · borrador sin guardar</span>
      </>}
    </div>}
    {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
    <p role="status" className="min-h-6 text-sm text-muted-foreground">{message ?? '\u00a0'}</p>
    {canManage && session && (conflict || session.baseline.revision !== snapshot.revision) && <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p>La llave cambió. El borrador no se aplica automáticamente al estado nuevo.</p>
      <Button variant="outline" onClick={() => void handleReload()} disabled={saving}>Recargar y descartar borrador</Button>
    </div>}
    {canManage && session && <div className="flex min-h-16 flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
      <p>{selected ? `Seleccionada: ${selectedName}${selected.kind === 'SLOT' ? ` · ${label(selected)}` : ''}` : 'Seleccioná una pareja de zona o una entrada manual. Podés usar arrastre o botones.'}</p>
      {selected && <Button size="sm" variant="outline" onClick={() => setSelected(null)} disabled={saving}>Quitar selección</Button>}
    </div>}
    <p className="text-sm text-muted-foreground">Las conexiones continuas alimentan ganadores. Las ramas inactivas se conservan con líneas discontinuas. Una entrada pendiente no es un pase libre.</p>
    <div className={`grid min-w-0 gap-5 ${canManage ? 'lg:grid-cols-[minmax(0,1fr)_22rem]' : ''}`}>
      <div role="region" aria-label="Rondas de la llave" tabIndex={0} className="max-h-[75vh] min-w-0 overflow-auto rounded-lg border bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <svg width={geometry.width} height={geometry.height} role="group" aria-label="Árbol de partidos y conexiones persistidas" className="block">
          {geometry.rounds.map((round, index) => <text key={round} x={20 + index * 310} y={24} className="fill-current text-sm font-semibold">{ROUND_LABELS[round]}</text>)}
          {current.hierarchy.map((edge) => {
            const child = geometry.positions.get(edge.child_match_id)!, parent = geometry.positions.get(edge.parent_match_id)!
            const match = current.matches.find((item) => item.id === edge.parent_match_id)!
            const active = match.bracket_is_active && getFreeSlot(match, edge.parent_slot).origin === 'WINNER'
            const x1 = child.x + 270, y1 = child.y + 110, x2 = parent.x, y2 = parent.y + (edge.parent_slot === 1 ? 80 : 160)
            return <path key={`${edge.parent_match_id}:${edge.parent_slot}`} d={`M${x1},${y1} H${x1 + 20} V${y2} H${x2}`} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray={active ? undefined : '5 5'} className={active ? 'text-slate-400' : 'text-slate-200'}><title>{`${label({ matchId: edge.child_match_id, slot: 1 }).split(' · ')[0]} → ${label({ matchId: edge.parent_match_id, slot: edge.parent_slot })}${active ? '' : ' · conexión inactiva'}`}</title></path>
          })}
          {current.matches.map((match) => {
            const point = geometry.positions.get(match.id)!
            const locked = ['IN_PROGRESS', 'FINISHED'].includes(match.status) || Boolean(match.winner_id || match.bye_processed || reference.guards[match.id]?.sports)
            return <foreignObject key={match.id} x={point.x} y={point.y} width={270} height={220}>
              <div id={`free-match-${match.id}`} role="group" aria-label={`${ROUND_LABELS[match.round]} ${match.order_in_round}${match.bracket_is_active ? '' : ' · rama inactiva'}`} className={`h-full overflow-auto rounded-lg border p-3 ${match.bracket_is_active ? 'bg-background' : 'border-dashed bg-slate-100 text-slate-500'}`}>
                <p className="mb-2 flex justify-between text-xs text-muted-foreground"><span>Partido {match.order_in_round}</span><span>{!match.bracket_is_active ? 'Rama inactiva' : locked ? 'Actividad deportiva' : ''}</span></p>
                {match.winner_id && <p className="text-xs font-medium">{match.bye_processed ? 'BYE procesado' : `${match.score1 ?? ''} – ${match.score2 ?? ''}`} · Ganó {coupleName(match.winner_id)}</p>}
                {([1, 2] as const).map((slot) => {
                  const place = { matchId: match.id, slot }, value = getFreeSlot(match, slot)
                  const source: FreeSource = { kind: 'SLOT', ...place }
                  const incoming = current.hierarchy.find((edge) => edge.parent_match_id === match.id && edge.parent_slot === slot)
                  const child = current.matches.find((item) => item.id === incoming?.child_match_id)
                  const canSelect = isEditing && match.bracket_is_active && !locked && value.origin === 'ENTRY' && Boolean(value.coupleId)
                  const target = targets.get(freeSlotKey(place))
                  const canDrop = isEditing && Boolean(selected) && Boolean(target?.allowed)
                  const state = value.origin === 'BYE' ? 'Pase libre previsto' : value.origin === 'WINNER' ? child ? `Ganador de ${ROUND_LABELS[child.round]} ${child.order_in_round}` : 'Conexión no disponible' : value.coupleId ? current.original_slots[match.id]?.[slot - 1] === 'WINNER' ? 'Entrada directa' : 'Entrada manual' : 'Entrada pendiente'
                  const text = value.coupleId ? coupleName(value.coupleId) : state
                  return <div key={slot} className="border-t py-1">
                    <button type="button" draggable={canSelect} disabled={!canDrop && !canSelect}
                      aria-label={`${canDrop ? value.coupleId ? 'Intercambiar en' : 'Ubicar en' : canSelect ? 'Seleccionar' : ''} ${label(place)}: ${text}`.trim()}
                      aria-pressed={selected?.kind === 'SLOT' && freeSlotKey(selected) === freeSlotKey(place)}
                      title={selected ? target?.reason ?? 'Destino disponible' : state}
                      onClick={() => canDrop ? handleMove(place) : canSelect ? handleSelect(source) : undefined}
                      onDragStart={(event) => handleDragStart(event, source)} onDragEnd={() => { dragSource.current = null }}
                      onDragOver={(event) => { if (canDrop) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
                      onDrop={(event) => { event.preventDefault(); handleMove(place, dragSource.current ?? selected); dragSource.current = null }}
                      className={`min-h-14 w-full rounded-md px-2 py-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-100 ${canDrop ? 'bg-emerald-50 ring-1 ring-emerald-400' : value.origin === 'BYE' ? 'text-amber-700' : canSelect ? 'hover:bg-muted' : ''} ${selected?.kind === 'SLOT' && freeSlotKey(selected) === freeSlotKey(place) ? 'bg-blue-50 ring-2 ring-blue-500' : ''}`}>
                      <span className="block break-words font-medium">{text}</span>
                      {value.coupleId && <span className="block text-xs text-muted-foreground">{state}</span>}
                    </button>
                    {canSelect && <button type="button" onClick={() => handleRemove(place)} className="px-2 text-xs text-destructive underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Quitar entrada de ${label(place)}`}>Quitar entrada</button>}
                    {isEditing && selected && target?.reason && !canSelect && <p className="px-2 text-xs text-muted-foreground">{target.reason}</p>}
                  </div>
                })}
              </div>
            </foreignObject>
          })}
        </svg>
      </div>
      {canManage && <aside aria-label="Parejas por zona" className="order-first min-w-0 space-y-4 rounded-lg border p-4 lg:order-last lg:max-h-[75vh] lg:overflow-y-auto">
        <h3 className="font-semibold">Parejas por zona</h3>
        <p className="text-xs text-muted-foreground">Posiciones de referencia. Seleccioná o arrastrá una pareja durante Reorganizar.</p>
        {!reference.couples.length && <p className="text-sm text-muted-foreground">No hay parejas en zonas para mostrar.</p>}
        {[...new Set(reference.couples.map((couple) => couple.zoneId))].map((zoneId) => {
          const couples = reference.couples.filter((couple) => couple.zoneId === zoneId).sort((a, b) => a.position - b.position)
          return <section key={zoneId} className="space-y-2"><h4 className="text-sm font-semibold">{couples[0].zoneName}</h4>
            <table className="w-full text-left text-xs"><thead><tr><th scope="col">Pos. / Pareja</th><th scope="col" className="px-1">PG</th><th scope="col" className="px-1">PP</th><th scope="col" className="px-1">DG</th></tr></thead><tbody>
              {couples.map((couple) => {
                const disabled = !isEditing || !couple.eligible || assigned.has(couple.coupleId)
                const source: FreeSource = { kind: 'ZONE', zoneId, coupleId: couple.coupleId }
                return <tr key={couple.coupleId} className="border-t align-top"><td className="py-2">
                  <button type="button" disabled={disabled} draggable={!disabled} onClick={() => handleSelect(source)}
                    onDragStart={(event) => handleDragStart(event, source)} onDragEnd={() => { dragSource.current = null }}
                    aria-label={`Seleccionar ${couple.name} de ${couple.zoneName}`} aria-pressed={selected?.kind === 'ZONE' && selected.coupleId === couple.coupleId}
                    className="w-full rounded p-1 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-70">
                    <span className="mr-1 text-xs text-muted-foreground">{couple.position}.</span>{couple.name}
                  </button>
                  {(couple.reason || assigned.has(couple.coupleId)) && <p className="px-1 text-xs text-muted-foreground">{assigned.has(couple.coupleId) ? 'Ubicada en la llave' : couple.reason}</p>}
                </td><td className="px-1 py-3 tabular-nums">{couple.wins}</td><td className="px-1 py-3 tabular-nums">{couple.losses}</td><td className="px-1 py-3 tabular-nums">{couple.gamesDifference}</td></tr>
              })}
            </tbody></table>
          </section>
        })}
      </aside>}
    </div>
  </div>
}
