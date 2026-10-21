'use client'

import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Ban } from 'lucide-react'
import type { FreeMatchAction } from '@/types/americano-libre-sports'
import { Clock, Edit3, Eye, EyeOff, Save, Users, X } from 'lucide-react'
import { AmericanFreeZonesPanel } from './american-free-zones-panel'
import { formatFreeZoneReference } from '@/lib/services/americano-libre-zone-reference'
import { presentFreeBracket } from '@/lib/services/americano-libre-presentation'
import { ImprovedBracketRenderer } from './bracket-v2/components/ImprovedBracketRenderer'
import { GranularMatchCard } from './bracket-v2/components/GranularMatchCard'
import { DraggableCoupleSlot } from './bracket-v2/components/DraggableCoupleSlot'
import { BracketDragDropProvider } from './bracket-v2/context/bracket-drag-context'
import type { BracketMatchV2 } from './bracket-v2/types/bracket-types'
import type { FreeBracketSnapshot } from '@/types/americano-libre'
import type { FreeEditorData, FreeSlot, FreeSource } from '@/types/americano-libre-editor'
import { freeLayout, freeSlotKey, getFreeSlot, moveFreeEntry, removeFreeEntry, toggleFreeBye } from '@/lib/services/americano-libre-editor'

const ROUND_LABELS: Record<string, string> = { '32VOS': 'Treintaidosavos', '16VOS': 'Dieciseisavos', '8VOS': 'Octavos', '4TOS': 'Cuartos', SEMIFINAL: 'Semifinal', FINAL: 'Final' }
const EMPTY_EDITOR: FreeEditorData = { couples: [], guards: {} }
type Props = {
  tournamentId: string; snapshot: FreeBracketSnapshot; editor?: FreeEditorData; canManage: boolean
  onMatchAction: (id: string, mode: FreeMatchAction) => void
  onSaved: (snapshot: FreeBracketSnapshot) => Promise<unknown>; onReload: () => Promise<unknown>
  showZoneReferences?: boolean
  onZoneReferencesChange?: (show: boolean) => Promise<void>
}

export const AmericanFreeBracketEditor = ({ tournamentId, snapshot, editor, canManage, onMatchAction, onSaved, onReload, showZoneReferences = true, onZoneReferencesChange }: Props) => {
  const [session, setSession] = useState<{ baseline: FreeBracketSnapshot; draft: FreeBracketSnapshot; editor: FreeEditorData } | null>(null)
  const [selected, setSelected] = useState<FreeSource | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingReferences, setSavingReferences] = useState(false)
  const [referenceError, setReferenceError] = useState<string | null>(null)
  const savingReferencesRef = useRef(false)
  const savingRef = useRef(false)
  const [processingBye, setProcessingBye] = useState<string | null>(null)
  const processingByeRef = useRef(false)
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
  const handleCancel = (): void => { setSession(null); setSelected(null); setFailure(null); setConflict(false); setMessage(changes ? 'Cambios descartados. Se muestra la distribución guardada.' : 'Edición finalizada.'); dragSource.current = null }
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
  const handleToggleBye = (target: FreeSlot): void => {
    if (!session || !isEditing) return
    try {
      const wasBye = getFreeSlot(matchesById.get(target.matchId)!, target.slot).origin === 'BYE'
      setSession({ ...session, draft: toggleFreeBye(session.baseline, session.draft, session.editor, target) })
      setSelected(null); setFailure(null)
      setMessage(wasBye ? 'BYE quitado del borrador. Podés ubicar una pareja en ese lugar.' : 'BYE asignado en el borrador. Guardá para confirmarlo.')
    } catch (error) { setFailure(error instanceof Error ? error.message : 'No se pudo modificar el BYE.') }
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
  const handleProcessBye = async (matchId: string): Promise<void> => {
    if (!canManage || session || processingByeRef.current) return
    processingByeRef.current = true; setProcessingBye(matchId); setFailure(null); setMessage(null)
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/american-free-bracket/sports`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: snapshot.revision, operations: [{ kind: 'ASSIGN_AND_PROCESS_BYE', matchId }] }),
      })
      const result: { success: boolean; message?: string; snapshot?: FreeBracketSnapshot } = await response.json()
      if (!response.ok || !result.success || !result.snapshot) throw new Error(result.message || 'No se pudo procesar el BYE.')
      await onSaved(result.snapshot)
      setMessage('BYE procesado. La pareja avanzó a la siguiente ronda.')
    } catch (error) { setFailure(error instanceof Error ? error.message : 'No se pudo procesar el BYE. Recargá para comprobar el estado.') }
    finally { processingByeRef.current = false; setProcessingBye(null) }
  }

  const showZones = canManage && Boolean(session)
  const presentation = useMemo(() => presentFreeBracket(current, reference, showZones), [current, reference, showZones])
  const matchesById = useMemo(() => new Map(current.matches.map((match) => [match.id, match])), [current.matches])
  const zones = useMemo(() => [...new Set(reference.couples.map(couple => couple.zoneId))].map(zoneId => ({
    id: zoneId,
    couples: reference.couples.filter(couple => couple.zoneId === zoneId).sort((a, b) => a.position - b.position),
  })).sort((a, b) => a.couples[0].zoneName.localeCompare(b.couples[0].zoneName, 'es', { numeric: true })), [reference.couples])
  const zoneReferences = useMemo(() => new Map((editor ?? reference).couples.map(couple => [couple.coupleId, couple])), [editor, reference])
  const handleToggleReferences = async (): Promise<void> => {
    if (!onZoneReferencesChange || savingReferencesRef.current) return
    savingReferencesRef.current = true; setSavingReferences(true); setReferenceError(null)
    try { await onZoneReferencesChange(!showZoneReferences) }
    catch (error) { setReferenceError(error instanceof Error ? error.message : 'No se pudo guardar la preferencia.') }
    finally { savingReferencesRef.current = false; setSavingReferences(false) }
  }

  const renderParticipant = (match: BracketMatchV2, slot: 1 | 2) => {
    const raw = matchesById.get(match.id)!
    const place = { matchId: match.id, slot }
    const value = getFreeSlot(raw, slot)
    const source: FreeSource = { kind: 'SLOT', ...place }
    const participant = slot === 1 ? match.participants.slot1 : match.participants.slot2
    const locked = ['IN_PROGRESS', 'FINISHED'].includes(raw.status) || Boolean(raw.winner_id || raw.bye_processed || reference.guards[raw.id]?.sports)
    const canSelect = isEditing && raw.bracket_is_active && !locked && value.origin === 'ENTRY' && Boolean(value.coupleId)
    const canToggleBye = isEditing && raw.bracket_is_active && !locked && !value.coupleId && value.origin === 'BYE'
      && current.original_slots[raw.id]?.[slot - 1] !== 'WINNER'
      && (value.origin === 'BYE' || getFreeSlot(raw, slot === 1 ? 2 : 1).origin !== 'BYE')
    const target = targets.get(freeSlotKey(place))
    const canDrop = isEditing && Boolean(selected) && Boolean(target?.allowed)
    const selectedSlot = selected?.kind === 'SLOT' && freeSlotKey(selected) === freeSlotKey(place)
    const state = value.origin === 'BYE' ? raw.bye_processed ? 'Pase libre procesado' : 'Pase libre previsto'
      : value.origin === 'WINNER' ? participant.placeholder?.display ?? 'Ganador de la ronda anterior' : value.coupleId ? 'Entrada manual' : 'Entrada pendiente'
    const text = value.coupleId ? coupleName(value.coupleId) : state
    const zoneCouple = value.coupleId ? zoneReferences.get(value.coupleId) : null
    const zoneReference = showZoneReferences && zoneCouple ? formatFreeZoneReference(zoneCouple.position, zoneCouple.zoneName) : null
    const players = participant.couple?.player1_details && participant.couple.player2_details ? <DraggableCoupleSlot
      couple={participant.couple} match={match} slotPosition={slot === 1 ? 'slot1' : 'slot2'}
      canDrag={false} isEditMode={false} isDragging={false} canReceiveDrop={false} isDragHover={false}
      onDragStart={() => undefined} onDragEnd={() => undefined} onDragEnter={() => undefined} onDragLeave={() => undefined} onDrop={() => undefined}
      compact className="min-h-[2.5rem] p-1.5"
    /> : <div className="flex min-h-[2.5rem] items-center gap-2 rounded-surface border-2 border-dashed border-gray-300 bg-gray-50 p-1.5 text-xs text-slate-500">
      {value.origin === 'WINNER' ? <Clock className="h-3.5 w-3.5 shrink-0" /> : <Users className="h-3.5 w-3.5 shrink-0" />}
      <span>{text}</span>
    </div>
    const content = <div className="flex items-start gap-1.5">
      {zoneReference && <span aria-label={`Posición actual: ${zoneCouple!.position} en ${zoneCouple!.zoneName}`} className="mt-1 inline-flex shrink-0 rounded border border-blue-200 bg-blue-50 px-1 text-[10px] font-semibold leading-5 text-blue-800">{zoneReference}</span>}
      <div className="min-w-0 flex-1">{players}</div>
    </div>
    if (!showZones) return content
    return <div className="space-y-1">
      <div role="button" tabIndex={canSelect || canDrop ? 0 : -1} aria-disabled={!canSelect && !canDrop}
        aria-label={`${canDrop ? 'Ubicar en' : canSelect ? 'Seleccionar' : ''} ${label(place)}: ${text}`.trim()}
        aria-pressed={selectedSlot} title={selected ? target?.reason ?? 'Destino disponible' : state}
        draggable={canSelect} onDragStart={(event) => handleDragStart(event, source)} onDragEnd={() => { dragSource.current = null }}
        onClick={() => canDrop ? handleMove(place) : canSelect ? handleSelect(source) : undefined}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && (canSelect || canDrop)) {
            event.preventDefault()
            if (canDrop) handleMove(place); else handleSelect(source)
          }
        }}
        onDragOver={(event) => { if (canDrop) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
        onDrop={(event) => { event.preventDefault(); handleMove(place, dragSource.current ?? selected); dragSource.current = null }}
        className={`rounded-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${canSelect ? 'cursor-grab' : ''} ${canDrop ? 'bg-emerald-50 ring-2 ring-emerald-400' : ''} ${selectedSlot ? 'bg-blue-50 ring-2 ring-blue-500' : ''}`}>
        <div className="pointer-events-none">{content}</div>
      </div>
      {canSelect && <button type="button" onClick={() => handleRemove(place)} className="text-[10px] text-destructive underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Quitar entrada de ${label(place)}`}>Quitar entrada</button>}
      {canToggleBye && <button type="button" onClick={() => handleToggleBye(place)} className="text-[10px] text-blue-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Quitar BYE en ${label(place)}`}>Quitar BYE y habilitar pareja</button>}
    </div>
  }

  const renderMatch = (match: BracketMatchV2) => {
    const raw = matchesById.get(match.id)!
    const bothDefined = Boolean(raw.couple1_id && raw.couple2_id)
    const emptySlot = raw.couple1_id ? 2 : 1
    const emptyOrigin = emptySlot === 1 ? raw.slot1_origin : raw.slot2_origin
    const byeReady = Boolean(raw.couple1_id) !== Boolean(raw.couple2_id) && !raw.winner_id && ['PENDING', 'WAITING_OPONENT', 'WAITING_OPPONENT'].includes(raw.status)
      && ['ENTRY', 'BYE'].includes(emptyOrigin) && current.original_slots[raw.id]?.[emptySlot - 1] !== 'WINNER'
    const menu = bothDefined && !raw.winner_id ? <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Más acciones del partido"><MoreHorizontal className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end"><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onMatchAction(match.id, 'disqualify')}><Ban className="mr-2 h-4 w-4" />Descalificar pareja</DropdownMenuItem></DropdownMenuContent>
    </DropdownMenu> : null
    return <GranularMatchCard match={match} tournamentId={tournamentId} tournamentType="AMERICAN"
      isOwner={canManage && raw.bracket_is_active} isEditMode={showZones} inactive={!raw.bracket_is_active}
      renderParticipant={(slot) => renderParticipant(match, slot === 'slot1' ? 1 : 2)}
      onRequestStartMatch={() => onMatchAction(match.id, 'start')}
      onRequestLoadResult={() => onMatchAction(match.id, 'result')}
      onRequestModifyResult={() => onMatchAction(match.id, 'result')}
      managedActions={{ menu, onManage: () => onMatchAction(match.id, 'start'), onClearResult: () => onMatchAction(match.id, 'clear-result'),
        additionalActions: <div className="flex flex-wrap gap-1">
          {byeReady && <Button size="sm" className="h-7 text-xs" disabled={Boolean(processingBye)} onClick={() => void handleProcessBye(match.id)}>{processingBye === match.id ? 'Procesando...' : 'Procesar BYE'}</Button>}
          {raw.bye_processed && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onMatchAction(match.id, 'undo-bye')}>Revertir BYE</Button>}
        </div> }}
      className={`w-full border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-lg ${!raw.bracket_is_active ? 'border-dashed opacity-60' : ''}`}
    />
  }

  const controls = canManage ? <div className="flex flex-wrap items-center gap-2">
    {!session ? <Button variant="outline" size="sm" className="border-blue-300 text-blue-700 hover:bg-blue-50" onClick={handleStart} disabled={!editor || Boolean(processingBye)}><Edit3 className="mr-2 h-4 w-4" />Reorganizar parejas</Button> : <>
      <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={() => void handleSave()} disabled={saving || stale || !changes}><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando...' : `Guardar ${changes} cambio(s)`}</Button>
      <Button size="sm" variant="outline" onClick={handleCancel} disabled={saving}><X className="mr-2 h-4 w-4" />{changes ? 'Cancelar' : 'Terminar edición'}</Button>
    </>}
  </div> : undefined

  return <BracketDragDropProvider><div className="space-y-4">
    {onZoneReferencesChange && <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" size="sm" disabled={savingReferences} aria-pressed={!showZoneReferences} onClick={() => void handleToggleReferences()}>
        {showZoneReferences ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
        {savingReferences ? 'Guardando preferencia...' : showZoneReferences ? 'Ocultar referencia de zona' : 'Mostrar referencia de zona'}
      </Button>
      {referenceError && <p role="alert" className="text-sm text-destructive">{referenceError}</p>}
    </div>}
    {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    {canManage && session && (conflict || session.baseline.revision !== snapshot.revision) && <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p>La llave cambió. El borrador no se aplica automáticamente al estado nuevo.</p>
      <Button variant="outline" onClick={() => void handleReload()} disabled={saving}>Recargar y descartar borrador</Button>
    </div>}
    {canManage && session && <div className="flex min-h-16 flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
      <p>{selected ? `Seleccionada: ${selectedName}${selected.kind === 'SLOT' ? ` · ${label(selected)}` : ''}` : 'Seleccioná una pareja de zona o una entrada manual. Podés usar arrastre o botones.'}</p>
      {selected && <Button size="sm" variant="outline" onClick={() => setSelected(null)} disabled={saving}>Quitar selección</Button>}
    </div>}
    {session && <p className="text-sm text-muted-foreground">Podés quitar un BYE para colocar una pareja. Para dar un pase libre a una pareja sin rival, terminá la edición y usá Procesar BYE desde su partido. Las ramas discontinuas quedan inactivas al ubicar una entrada directa.</p>}
    <div className={`grid min-w-0 items-start gap-5 ${showZones ? 'lg:grid-cols-[minmax(0,1fr)_25rem]' : ''}`}>
      <ImprovedBracketRenderer bracketData={presentation.data} tournamentId={tournamentId} isOwner={canManage}
        controls={controls} renderMatch={renderMatch} relations={presentation.relations} allowRoundNavigation cardExtraHeight={showZones ? 12 : 0} />
      {showZones && <AmericanFreeZonesPanel zones={zones} assigned={assigned} selected={selected} isEditing={isEditing}
        targetMatchesPerCouple={reference.zoneMatchTarget}
        onSelect={handleSelect} onDragStart={handleDragStart} onDragEnd={() => { dragSource.current = null }} />}
    </div>
  </div></BracketDragDropProvider>
}
