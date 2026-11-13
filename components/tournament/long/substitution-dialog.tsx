'use client'

import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import PlayerSelector from '@/components/tournament/couple-registration-advanced/components/PlayerSelector'
import type { ResolveNewPlayer } from '@/components/tournament/couple-registration-advanced/components/NewPlayerForm'
import type { PlayerInfo } from '@/components/tournament/couple-registration-advanced/types'

type Scope = 'ONLY_MATCH' | 'FROM_MATCH' | 'ONLY_FECHA' | 'FROM_FECHA'
type Mode = 'fecha' | 'match'
const isFechaScope = (scope: Scope) => scope === 'ONLY_FECHA' || scope === 'FROM_FECHA'
export const isPermanentSubstitution = (scope: Scope) => scope === 'FROM_MATCH' || scope === 'FROM_FECHA'
type Player = { id: string; name: string }
type Couple = { id: string; player1: Player; player2: Player }
type Rule = { id: string; coupleId: string; slot: 1 | 2; player: Player; scope: Scope; matchId: string | null; fechaId: string | null; label: string; editable: boolean }
type MatchOption = { id: string; coupleIds: (string | null)[]; label: string; fechaNumber?: number | null;
  couple1Name: string; couple2Name: string; scheduledDate?: string | null; scheduledTime?: string | null }
type FechaOption = { id: string; label: string; coupleIds: string[] }
type EditorContext = { couple_id: string; match_rule_id: string | null; fecha_rule_id: string | null; fecha_label: string | null }
type Editor = { couples: Couple[]; substitutions: Rule[]; matches: MatchOption[]; fechas?: FechaOption[]; context?: EditorContext[]; tournamentGender?: string }

export type SubstitutionSummary = { id: string; couple_id: string; slot: 1 | 2; player_name: string; replaced_name: string; scope: Scope; label: string }

const readResponse = async <T,>(response: Response): Promise<T> => {
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar los datos.')
  return payload
}

const getData = async <T,>(url: string) => (await readResponse<{ data: T }>(await fetch(url, { cache: 'no-store' }))).data

export const useSubstitutionSummaries = (tournamentId: string | undefined) =>
  useSWR(tournamentId ? `/api/tournaments/${tournamentId}/substitutions` : null, getData<SubstitutionSummary[]>)

export const substitutionScopeLabel = (scope: Scope, label: string) => {
  if (scope === 'ONLY_MATCH') return `Un partido · ${label}`
  if (scope === 'ONLY_FECHA') return `Solo ${label}`
  return label === 'Primer partido' ? 'Desde el primer partido' : `Desde ${label} en adelante`
}

interface SubstitutionDialogProps {
  tournamentId: string
  coupleId?: string
  playerSlot?: 1 | 2
  matchId?: string
  fechaId?: string
  onClose: () => void
  onSaved?: () => void
}

export const SubstitutionDialog = ({ tournamentId, coupleId, playerSlot, matchId, fechaId, onClose, onSaved }: SubstitutionDialogProps) => {
  const url = `/api/tournaments/${tournamentId}/substitutions`
  const editorParams = new URLSearchParams()
  if (matchId) editorParams.set('matchId', matchId)
  if (fechaId) editorParams.set('fechaId', fechaId)
  if (coupleId) editorParams.set('coupleId', coupleId)
  const editorUrl = `${url}?${editorParams}`
  const { data, error, isLoading } = useSWR(editorUrl, getData<Editor>)
  const { mutate: refreshCache } = useSWRConfig()
  const [selectedCouple, setSelectedCouple] = useState(coupleId ?? '')
  const [selectedSlot, setSelectedSlot] = useState<1 | 2>()
  const initialMode: Mode = matchId ? 'match' : 'fecha'
  const initialScope: Scope = matchId ? 'ONLY_MATCH' : 'ONLY_FECHA'
  const [scope, setScope] = useState<Scope>(initialScope)
  const [anchor, setAnchor] = useState(matchId ?? fechaId ?? '')
  const [editing, setEditing] = useState<Rule | null>(null)
  const [confirmedOrder, setConfirmedOrder] = useState('')
  const [player, setPlayer] = useState<PlayerInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const activeCoupleId = selectedCouple || (data?.couples.length === 1 ? data.couples[0].id : '')
  const couple = data?.couples.find(item => item.id === activeCoupleId)
  const slot = playerSlot ?? selectedSlot
  const playerName = playerSlot === 1 ? couple?.player1.name : playerSlot === 2 ? couple?.player2.name : undefined
  const matches = data?.matches.filter(item => item.coupleIds.includes(activeCoupleId)) ?? []
  const fechas = data?.fechas?.filter(item => item.coupleIds.includes(activeCoupleId)) ?? []
  const mode: Mode = isFechaScope(scope) ? 'fecha' : 'match'
  const fixedAnchor = matchId ?? fechaId
  const context = data?.context?.find(item => item.couple_id === activeCoupleId)
  const coupleRules = data?.substitutions.filter(rule => rule.coupleId === activeCoupleId && (!playerSlot || rule.slot === playerSlot)) ?? []
  const rules = coupleRules.filter(rule => fixedAnchor
    ? rule.id === context?.match_rule_id || rule.id === context?.fecha_rule_id
      || Boolean(matchId && rule.matchId === matchId) || Boolean(fechaId && rule.fechaId === fechaId)
    : isFechaScope(rule.scope) === (mode === 'fecha'))
  const directRule = rules.find(rule => (matchId && rule.scope === 'ONLY_MATCH' && rule.matchId === matchId)
    || (fechaId && rule.scope === 'ONLY_FECHA' && rule.fechaId === fechaId))
  const currentMatch = matches.find(item => item.id === anchor)
  const orderConfirmation = scope === 'FROM_MATCH' && currentMatch?.fechaNumber != null
    && matches.some(item => item.id !== currentMatch.id && item.fechaNumber === currentMatch.fechaNumber)
      ? `${activeCoupleId}:${currentMatch.id}` : ''
  const canSave = Boolean(slot && player && anchor && (!orderConfirmation || orderConfirmation === confirmedOrder))
  const resolveNewPlayer: ResolveNewPlayer = async playerData => {
    setBusy(true)
    setMessage(undefined)
    try {
      return await readResponse<Awaited<ReturnType<ResolveNewPlayer>>>(await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-player', coupleId: activeCoupleId, playerData }),
      }))
    } finally {
      setBusy(false)
    }
  }

  const handleReset = () => {
    setEditing(null)
    setConfirmedOrder('')
    setSelectedSlot(undefined)
    setPlayer(null)
    setScope(fixedAnchor || mode === initialMode ? initialScope : 'ONLY_MATCH')
    setAnchor(fixedAnchor ?? '')
    setMessage(undefined)
  }

  const handleEdit = (rule: Rule) => {
    handleReset()
    setEditing(rule)
    setSelectedSlot(rule.slot)
    setScope(rule.scope)
    setAnchor(rule.fechaId ?? rule.matchId ?? (rule.scope === 'FROM_MATCH' ? 'first' : ''))
    setPlayer({ id: rule.player.id, first_name: rule.player.name })
  }

  const save = async (body: Record<string, string | number | null>, close: boolean) => {
    setBusy(true)
    setMessage(undefined)
    try {
      await readResponse(await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }))
      void refreshCache(key => typeof key === 'string' && (key === url || key.startsWith(`${url}?`)))
      onSaved?.()
      if (close) onClose()
      else handleReset()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar la suplencia.')
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = () => {
    if (busy || !couple || !slot || !player || !canSave) return
    const originalRule = fixedAnchor ? editing : null
    void save({ action: 'save', ruleId: editing?.id ?? null, coupleId: couple.id, slot, playerId: player.id,
      scope, matchId: originalRule ? originalRule.matchId : mode === 'match' && anchor !== 'first' ? anchor : null,
      fechaId: originalRule ? originalRule.fechaId : mode === 'fecha' ? anchor : null }, true)
  }

  const entryMatch = matches.find(item => item.id === matchId)
  const canEditMatch = !matchId || Boolean(entryMatch)
  const fixedFecha = fechas.find(item => item.id === fechaId)
  const canEditFecha = !fechaId || Boolean(fixedFecha)
  const showForm = Boolean(couple) && ((canEditMatch && canEditFecha && !directRule) || Boolean(editing))
  const anchorIndex = matches.findIndex(item => item.id === anchor)
  const affectedMatches = anchor === 'first' ? matches : anchorIndex >= 0 ? matches.slice(anchorIndex) : []
  const matchName = (item: MatchOption) => {
    const opponent = (item.coupleIds[0] === activeCoupleId ? item.couple2Name : item.couple1Name).trim()
    const schedule = item.scheduledDate ? ` · ${item.scheduledDate.split('-').reverse().join('/')}` : ''
    const time = item.scheduledTime ? ` ${item.scheduledTime.slice(0, 5)}` : ''
    return `${item.label} · ${opponent === '/' ? 'Rival a definir' : `vs. ${opponent}`}${schedule}${time}`
  }
  const handleModeChange = (next: Mode) => {
    handleReset()
    setScope(next === 'fecha' ? 'ONLY_FECHA' : 'ONLY_MATCH')
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{fechaId ? 'Suplencia para la fecha' : matchId ? 'Suplencia para el partido' : 'Suplencias'}</DialogTitle>
          <DialogDescription>{playerName ? `Elegí quién reemplaza a ${playerName} y desde cuándo.` : 'Elegí a quién reemplazar y desde cuándo.'}</DialogDescription>
        </DialogHeader>

        {isLoading && <p role="status" className="text-sm text-muted-foreground">Cargando suplencias…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
        {!isLoading && data?.couples.length === 0 && <p className="text-sm text-muted-foreground">No hay una pareja habilitada para esta suplencia.</p>}
        {!coupleId && Boolean(data?.couples.length && data.couples.length > 1) && <div className="space-y-1.5">
          <Label htmlFor="substitution-couple">Pareja</Label>
          <Select value={selectedCouple} onValueChange={value => { handleReset(); setSelectedCouple(value) }} disabled={busy}>
            <SelectTrigger id="substitution-couple"><SelectValue placeholder="Elegí una pareja" /></SelectTrigger>
            <SelectContent>{data?.couples.map(item => <SelectItem key={item.id} value={item.id}>{item.player1.name} / {item.player2.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>}

        {couple && !fixedAnchor && <div role="group" aria-label="Tipo de suplencia" className="grid grid-cols-2 gap-2">
          <Button type="button" variant={mode === 'fecha' ? 'default' : 'outline'} aria-pressed={mode === 'fecha'} disabled={busy} onClick={() => handleModeChange('fecha')}>Fecha y horarios</Button>
          <Button type="button" variant={mode === 'match' ? 'default' : 'outline'} aria-pressed={mode === 'match'} disabled={busy} onClick={() => handleModeChange('match')}>Partidos</Button>
        </div>}
        {couple && <p className="text-sm text-muted-foreground">{(fixedAnchor ? initialMode : mode) === 'fecha'
          ? 'El suplente puede votar horarios y juega los cruces de la fecha que le corresponda. Si cambia la dupla, esa fecha queda pendiente de respuesta.'
          : 'Elegí un cruce ya armado. La suplencia conserva el horario de ese partido.'}</p>}

        {couple && rules.length > 0 && <ul aria-label="Suplencias asignadas" className="divide-y rounded-md border px-3">
          {rules.map(rule => {
            const anchorMatch = matches.find(item => item.id === rule.matchId)
            const appliesToMatch = rule.id === context?.match_rule_id
            const appliesToFecha = rule.id === context?.fecha_rule_id
            const contextLabel = appliesToMatch && appliesToFecha ? 'Juega este partido y vota para la fecha'
              : appliesToMatch ? 'Juega este partido' : appliesToFecha ? 'Vota para la fecha' : null
            const editLabel = isFechaScope(rule.scope) ? 'Editar suplencia de fecha' : isPermanentSubstitution(rule.scope) ? 'Editar suplencia fija' : 'Editar suplencia del partido'
            return <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div><p className="font-medium">{rule.player.name}{!playerSlot && ` · reemplaza a ${rule.slot === 1 ? couple.player1.name : couple.player2.name}`}</p>
                {fixedAnchor && contextLabel && <p className="text-xs font-medium text-primary">{contextLabel}{appliesToFecha && context?.fecha_label ? ` · ${context.fecha_label}` : ''}</p>}
                <p className="text-xs text-muted-foreground">{substitutionScopeLabel(rule.scope, anchorMatch ? matchName(anchorMatch) : rule.label)}</p></div>
              {rule.editable && <div className="flex flex-wrap gap-1">
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => handleEdit(rule)}>{fixedAnchor ? editLabel : 'Editar'}</Button>
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void save({ action: 'remove', ruleId: rule.id, coupleId: rule.coupleId }, false)}>Quitar</Button>
              </div>}
            </li>
          })}
        </ul>}

        {!canEditMatch && couple && <p className="text-sm text-muted-foreground">Este partido ya no admite cambios de alineación.</p>}
        {!canEditFecha && couple && <p className="text-sm text-muted-foreground">Esta fecha no está disponible para la pareja.</p>}
        {showForm && couple && <div className="space-y-4">
          {fixedAnchor && editing && <p className="rounded-md bg-muted px-3 py-2 text-sm">Estás editando la regla «{substitutionScopeLabel(editing.scope, editing.label)}».</p>}
          <div className={playerSlot ? 'space-y-3' : 'grid gap-3 sm:grid-cols-2'}>
            {!playerSlot && <div className="space-y-1.5">
              <Label htmlFor="substitution-slot">Jugador a reemplazar</Label>
              <Select value={slot?.toString() ?? ''} onValueChange={value => setSelectedSlot(value === '1' ? 1 : 2)} disabled={busy}>
                <SelectTrigger id="substitution-slot"><SelectValue placeholder="Elegí un jugador" /></SelectTrigger>
                <SelectContent><SelectItem value="1">{couple.player1.name}</SelectItem><SelectItem value="2">{couple.player2.name}</SelectItem></SelectContent>
              </Select>
            </div>}
            <div className="space-y-1.5">
              <Label htmlFor="substitution-scope">Alcance</Label>
              <Select value={scope} onValueChange={value => { setScope(value as Scope); if (value === 'ONLY_MATCH' && anchor === 'first') setAnchor('') }} disabled={busy || Boolean(fixedAnchor && editing)}>
                <SelectTrigger id="substitution-scope"><SelectValue /></SelectTrigger>
                <SelectContent>{mode === 'fecha' ? <>
                  <SelectItem value="ONLY_FECHA">Solo esta fecha</SelectItem><SelectItem value="FROM_FECHA">Desde esta fecha en adelante</SelectItem>
                </> : <>
                  <SelectItem value="ONLY_MATCH">Solo este partido</SelectItem><SelectItem value="FROM_MATCH">Desde este partido en adelante</SelectItem>
                </>}</SelectContent>
              </Select>
            </div>
          </div>
          {scope === 'FROM_MATCH' && <p className="text-xs text-muted-foreground">{anchor === 'first'
            ? 'Incluye todos los partidos de la pareja y permite votar en las fechas abiertas.'
            : 'Incluye los partidos posteriores y habilita votar horarios desde la siguiente fecha.'}</p>}
          {scope === 'FROM_FECHA' && <p className="text-xs text-muted-foreground">Incluye esta fecha y las siguientes, también si los partidos se crean más adelante.</p>}
          {fixedAnchor && <p className="text-sm font-medium">{editing ? editing.label : mode === 'fecha' ? fixedFecha?.label : entryMatch && matchName(entryMatch)}</p>}
          {!fixedAnchor && mode === 'fecha' && <div className="space-y-1.5">
            <Label htmlFor="substitution-fecha">{scope === 'FROM_FECHA' ? 'Fecha de inicio' : 'Fecha'}</Label>
            <Select value={anchor} onValueChange={setAnchor} disabled={busy}>
              <SelectTrigger id="substitution-fecha"><SelectValue placeholder="Elegí una fecha" /></SelectTrigger>
              <SelectContent>
                {editing?.fechaId && !fechas.some(item => item.id === editing.fechaId) && <SelectItem value={editing.fechaId}>{editing.label}</SelectItem>}
                {fechas.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {fechas.length === 0 && <p className="text-xs text-muted-foreground">Creá una fecha para asignar la suplencia y habilitar el voto.</p>}
          </div>}
          {!fixedAnchor && mode === 'match' && <div className="space-y-1.5">
            <Label htmlFor="substitution-match">Partido</Label>
            <Select value={anchor} onValueChange={setAnchor} disabled={busy}>
              <SelectTrigger id="substitution-match"><SelectValue placeholder="Elegí el partido" /></SelectTrigger>
              <SelectContent>
                {scope === 'FROM_MATCH' && <SelectItem value="first">{editing?.matchId === null && editing.label !== 'Primer partido' ? editing.label : 'Desde el primer partido'}</SelectItem>}
                {editing?.matchId && !matches.some(item => item.id === editing.matchId) && <SelectItem value={editing.matchId}>{editing.label}</SelectItem>}
                {matches.map(item => <SelectItem key={item.id} value={item.id}>{matchName(item)}</SelectItem>)}
              </SelectContent>
            </Select>
            {scope === 'ONLY_MATCH' && matches.length === 0 && <p className="text-xs text-muted-foreground">Programá un partido para asignar una suplencia puntual.</p>}
          </div>}
          {scope === 'FROM_MATCH' && affectedMatches.length > 0 && <details open={orderConfirmation ? true : undefined} className="text-sm">
            <summary className="cursor-pointer font-medium">Partidos pendientes desde este punto ({affectedMatches.length})</summary>
            <ul className="mt-1 space-y-1 pl-4 text-muted-foreground">{affectedMatches.map(item => <li key={item.id}>{matchName(item)}</li>)}</ul>
          </details>}
          {orderConfirmation && <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4" checked={confirmedOrder === orderConfirmation}
              onChange={event => setConfirmedOrder(event.target.checked ? orderConfirmation : '')} />
            Confirmo el orden de los partidos de esta fecha.
          </label>}
          <fieldset disabled={busy} className="min-w-0">
            <PlayerSelector
              key={couple.id}
              playerNumber={slot ?? 1}
              playerSelection={player ? { type: 'existing', existingPlayer: player } : { type: 'none' }}
              availablePlayers={[]}
              isClubMode
              tournamentId={tournamentId}
              tournamentGender={data?.tournamentGender}
              substitute={{ excludePlayerIds: [couple.player1.id, couple.player2.id], resolveNewPlayer }}
              onUpdateSelection={(_, type, selection) => {
                if (type === 'existing' && selection && 'id' in selection) {
                  setPlayer(selection)
                  setMessage(undefined)
                }
              }}
              onClearSelection={() => { setPlayer(null); setMessage(undefined) }}
            />
          </fieldset>
          <div className="flex justify-end gap-2">
            {editing && <Button type="button" variant="ghost" onClick={handleReset} disabled={busy}>Cancelar edición</Button>}
            <Button type="button" onClick={handleSubmit} disabled={busy || !canSave}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : matchId && scope === 'ONLY_MATCH' && context?.match_rule_id ? 'Asignar para este cruce' : 'Asignar suplente'}</Button>
          </div>
        </div>}
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      </DialogContent>
    </Dialog>
  )
}
