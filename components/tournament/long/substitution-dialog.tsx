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

type Scope = 'ONLY_MATCH' | 'FROM_MATCH'
type Player = { id: string; name: string }
type Couple = { id: string; player1: Player; player2: Player }
type Rule = { id: string; coupleId: string; slot: 1 | 2; player: Player; scope: Scope; matchId: string | null; label: string; editable: boolean }
type MatchOption = { id: string; coupleIds: (string | null)[]; label: string; fechaNumber?: number | null;
  couple1Name: string; couple2Name: string; players?: Record<string, [string, string]> }
type Editor = { couples: Couple[]; substitutions: Rule[]; matches: MatchOption[]; tournamentGender?: string }

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
  if (scope === 'ONLY_MATCH') return `Solo ${label}`
  return label === 'Primer partido' ? 'Desde el primer partido' : `Desde ${label}`
}

interface SubstitutionDialogProps {
  tournamentId: string
  coupleId?: string
  playerSlot?: 1 | 2
  matchId?: string
  onClose: () => void
  onSaved?: () => void
}

export const SubstitutionDialog = ({ tournamentId, coupleId, playerSlot, matchId, onClose, onSaved }: SubstitutionDialogProps) => {
  const url = `/api/tournaments/${tournamentId}/substitutions`
  const editorUrl = `${url}?${matchId ? `matchId=${matchId}` : `coupleId=${coupleId}`}`
  const { data, error, isLoading, mutate } = useSWR(editorUrl, getData<Editor>)
  const { mutate: refreshCache } = useSWRConfig()
  const [selectedCouple, setSelectedCouple] = useState(coupleId ?? '')
  const [selectedSlot, setSelectedSlot] = useState<1 | 2>()
  const [scope, setScope] = useState<Scope>(matchId ? 'ONLY_MATCH' : 'FROM_MATCH')
  const [anchor, setAnchor] = useState(matchId ?? '')
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
  const rules = data?.substitutions.filter(rule => rule.coupleId === activeCoupleId
    && (!matchId || rule.matchId === matchId) && (!playerSlot || rule.slot === playerSlot)) ?? []
  const currentMatch = matches.find(item => item.id === (matchId ?? anchor))
  const currentPlayers = editing ? undefined : currentMatch?.players?.[activeCoupleId]
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
    setScope(matchId ? 'ONLY_MATCH' : 'FROM_MATCH')
    setAnchor(matchId ?? '')
    setMessage(undefined)
  }

  const handleEdit = (rule: Rule) => {
    handleReset()
    setEditing(rule)
    setSelectedSlot(rule.slot)
    setScope(rule.scope)
    setAnchor(rule.matchId ?? (rule.scope === 'FROM_MATCH' ? 'first' : ''))
    setPlayer({ id: rule.player.id, first_name: rule.player.name })
  }

  const save = async (body: Record<string, string | number | null>, close: boolean) => {
    setBusy(true)
    setMessage(undefined)
    try {
      await readResponse(await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }))
      void refreshCache(url)
      onSaved?.()
      if (close) onClose()
      else {
        handleReset()
        void mutate()
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar la suplencia.')
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = () => {
    if (busy || !couple || !slot || !player || !canSave) return
    void save({ action: 'save', ruleId: editing?.id ?? null, coupleId: couple.id, slot, playerId: player.id,
      scope, matchId: anchor === 'first' ? null : anchor }, true)
  }

  const canEditMatch = !matchId || Boolean(currentMatch)
  const showForm = Boolean(couple) && (canEditMatch || Boolean(editing))
  const anchorIndex = matches.findIndex(item => item.id === anchor)
  const affectedMatches = anchor === 'first' ? matches : anchorIndex >= 0 ? matches.slice(anchorIndex) : []
  const matchName = (item: MatchOption) => {
    const opponent = (item.coupleIds[0] === activeCoupleId ? item.couple2Name : item.couple1Name).trim()
    return `${item.label} · ${opponent === '/' ? 'Rival a definir' : `vs. ${opponent}`}`
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Suplencias</DialogTitle>
          <DialogDescription>{playerName ? `Elegí quién reemplaza a ${playerName} y desde cuándo.` : 'Elegí quién entra y en qué partidos juega.'}</DialogDescription>
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

        {couple && rules.length > 0 && <ul aria-label="Suplencias asignadas" className="divide-y rounded-md border px-3">
          {rules.map(rule => <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div><p className="font-medium">{rule.player.name}{!playerSlot && ` · puesto de ${rule.slot === 1 ? couple.player1.name : couple.player2.name}`}</p>
              <p className="text-xs text-muted-foreground">{substitutionScopeLabel(rule.scope, rule.label)}</p></div>
            {rule.editable && <div className="flex gap-1">
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => handleEdit(rule)}>Editar</Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void save({ action: 'remove', ruleId: rule.id, coupleId: rule.coupleId }, false)}>Quitar</Button>
            </div>}
          </li>)}
        </ul>}

        {!canEditMatch && couple && <p className="text-sm text-muted-foreground">Este partido ya no admite cambios de alineación.</p>}
        {showForm && couple && <div className="space-y-4">
          <div className={playerSlot ? 'space-y-3' : 'grid gap-3 sm:grid-cols-2'}>
            {!playerSlot && <div className="space-y-1.5">
              <Label htmlFor="substitution-slot">Puesto a cubrir</Label>
              <Select value={slot?.toString() ?? ''} onValueChange={value => setSelectedSlot(value === '1' ? 1 : 2)} disabled={busy}>
                <SelectTrigger id="substitution-slot"><SelectValue placeholder="Elegí un puesto" /></SelectTrigger>
                <SelectContent><SelectItem value="1">{currentPlayers?.[0] || couple.player1.name}</SelectItem><SelectItem value="2">{currentPlayers?.[1] || couple.player2.name}</SelectItem></SelectContent>
              </Select>
            </div>}
            <div className="space-y-1.5">
              <Label htmlFor="substitution-scope">Alcance</Label>
              <Select value={scope} onValueChange={value => { setScope(value as Scope); if (value === 'ONLY_MATCH' && anchor === 'first') setAnchor('') }} disabled={busy}>
                <SelectTrigger id="substitution-scope"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ONLY_MATCH">Solo un partido</SelectItem><SelectItem value="FROM_MATCH">Desde un partido en adelante</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          {scope === 'FROM_MATCH' && <p className="text-xs text-muted-foreground">Incluye los partidos posteriores que se creen para esta pareja.</p>}
          {!matchId && <div className="space-y-1.5">
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
            <Button type="button" onClick={handleSubmit} disabled={busy || !canSave}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Asignar suplente'}</Button>
          </div>
        </div>}
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      </DialogContent>
    </Dialog>
  )
}
