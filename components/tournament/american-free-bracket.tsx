'use client'

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_BRACKET_ENTRIES, buildBracketSeeding } from '@/lib/services/bracket-structure'
import type { FreeBracketSnapshot } from '@/types/americano-libre'
import type { FreeMatchAction } from '@/types/americano-libre-sports'

import type { FreeBracketView } from '@/types/americano-libre-editor'
import { AmericanFreeBracketEditor } from './american-free-bracket-editor'
import BackFromBracketButton from '@/app/(main)/tournaments/[id]/settings/components/BackFromBracketButton'
import { AmericanFreeSports } from './american-free-sports'
import { useTournamentFinalization } from './bracket-v2/hooks/useTournamentFinalization'
import { FinalizeTournamentControl } from './bracket-v2/components/FinalizeTournamentControl'
import { PointsCalculationBanner } from './bracket-v2/components/PointsCalculationBanner'

const fetchBracket = async (url: string): Promise<FreeBracketView> => {
  const response = await fetch(url, { cache: 'no-store' })
  const data: FreeBracketView = await response.json()
  if (!response.ok || !data.success) throw new Error(data.message || 'No se pudo cargar la llave')
  return data
}
export const AmericanFreeBracket = ({ tournamentId, isOwner, onDataRefresh }: {
  tournamentId: string; isOwner: boolean; onDataRefresh?: () => void
}) => {
  const [activeMatch, setActiveMatch] = useState<{ id: string; mode: FreeMatchAction } | null>(null)
  const url = `/api/tournaments/${tournamentId}/american-free-bracket`
  const finalization = useTournamentFinalization(tournamentId)
  const { data, error, isLoading, mutate } = useSWR<FreeBracketView>(url, fetchBracket, { revalidateOnFocus: false })
  const [editedCount, setEditedCount] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const generating = useRef(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const requested = Number(editedCount ?? data?.suggestedCount ?? '')
  const validCount = Number.isInteger(requested) && requested >= 2 && requested <= MAX_BRACKET_ENTRIES
  const base = validCount ? buildBracketSeeding(requested).P : null

  const handleGenerate = async () => {
    if (generating.current || !validCount) return
    generating.current = true
    setIsGenerating(true)
    setGenerationError(null)
    try {
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedCount: requested }),
      })
      const result: { success: boolean; message?: string; snapshot?: FreeBracketSnapshot } = await response.json()
      if (!response.ok || !result.success || !result.snapshot) {
        if (response.status === 409) await mutate()
        throw new Error(result.message || 'No se pudo generar la llave. Recargá para comprobar el estado.')
      }
      await mutate(current => ({ ...current, success: true, snapshot: result.snapshot!, canManage: true, status: 'BRACKET_PHASE' }), { revalidate: true })
      onDataRefresh?.()
    } catch (failure) {
      setGenerationError(failure instanceof Error ? failure.message : 'No se pudo generar la llave')
    } finally {
      generating.current = false
      setIsGenerating(false)
    }
  }

  if (isLoading) return <p role="status" className="p-6 text-sm text-muted-foreground">Cargando llave libre...</p>
  if (!data) return <div role="alert" className="space-y-3 p-6"><p>{error?.message || 'No se pudo cargar la llave'}</p><Button variant="outline" onClick={() => void mutate()}>Reintentar</Button></div>

  const snapshot = data.snapshot
  return (
    <section aria-label="Llave de Americano libre" className="space-y-6 p-4 sm:p-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Americano libre</h2>
        <p className="text-sm text-muted-foreground">Ubicá las parejas en la llave y cargá el resultado desde cada partido. El ganador avanza a la siguiente ronda.</p>
      </div>
      {snapshot && isOwner && data.canManage && data.status === 'BRACKET_PHASE' && <BackFromBracketButton tournamentId={tournamentId} mode="inline" />}
      {generationError && <p role="alert" className="text-sm text-destructive">{generationError}</p>}
      {!snapshot && isOwner && data.canManage && (
        <div className="max-w-xl space-y-4">
          <p className="text-sm">Actualmente hay <strong>{data.suggestedCount} parejas habilitadas</strong> para jugar. No incluye jugadores sueltos ni inscripciones pendientes.</p>
          <div className="space-y-2">
            <Label htmlFor={`free-count-${tournamentId}`}>¿Cuántas parejas van a jugar la llave?</Label>
            <Input id={`free-count-${tournamentId}`} type="number" min={2} max={MAX_BRACKET_ENTRIES} step={1}
              value={editedCount ?? data.suggestedCount ?? ''} disabled={isGenerating || Boolean(data.blockedReason)}
              aria-describedby={`free-count-help-${tournamentId}`} aria-invalid={!validCount}
              onChange={(event) => setEditedCount(event.target.value)} className="max-w-40" />
            <p id={`free-count-help-${tournamentId}`} className="text-sm text-muted-foreground">Ingresá la cantidad de parejas que pasarán a la eliminación directa. Por ejemplo: si clasifican 8 parejas de las zonas, ingresá 8. El mínimo es 2 parejas y el máximo es {MAX_BRACKET_ENTRIES}.</p>
          </div>
          {base && (
            <div className="space-y-2 text-sm" aria-live="polite">
              <p>Se creará una llave vacía para <strong>{requested} parejas</strong>. Después vas a elegir qué pareja ocupa cada lugar.</p>
              {base > requested && <p className="text-muted-foreground">Para completar el cuadro habrá <strong>{base - requested} pases libres</strong>: parejas que avanzan sin jugar su primer partido. Podrás confirmarlos después de ubicar a las parejas.</p>}
            </div>
          )}
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Creá la llave vacía con la cantidad de parejas elegida.</li>
            <li>Entrá a <strong>Reorganizar parejas</strong>, ubicá a las parejas en los cruces y guardá.</li>
            <li>Cargá el resultado desde cada partido. El ganador avanza a la siguiente ronda.</li>
          </ol>
          <p className="text-sm text-muted-foreground">Podés crear la llave antes de que terminen las zonas. Las parejas no se asignan automáticamente según su posición: vos elegís quiénes pasan y dónde juegan.</p>
          {data.blockedReason && <p role="status" className="text-sm text-amber-700">{data.blockedReason}</p>}
          <Button onClick={handleGenerate} disabled={!validCount || isGenerating || Boolean(data.blockedReason)}>
            {isGenerating ? 'Generando llave...' : 'Crear llave vacía'}
          </Button>
        </div>
      )}
      {!snapshot && (!isOwner || !data.canManage) && <p className="text-sm text-muted-foreground">La llave todavía no fue generada.</p>}
      {snapshot && activeMatch && isOwner && data.canManage && data.status === 'BRACKET_PHASE' && <AmericanFreeSports key={activeMatch.id + activeMatch.mode} matchId={activeMatch.id} mode={activeMatch.mode} onClose={() => setActiveMatch(null)} tournamentId={tournamentId} editor={data.editor} onSaved={async () => { await mutate(); await finalization.refetch(); onDataRefresh?.() }} />}
      {snapshot && <AmericanFreeBracketEditor
        onMatchAction={(id, mode) => setActiveMatch({ id, mode })}
        tournamentId={tournamentId} snapshot={snapshot} editor={data.editor}
        showZoneReferences={data.showZoneReferences ?? true}
        onZoneReferencesChange={isOwner && data.canManage ? async (showZoneReferences) => {
          const response = await fetch(`${url}/preferences`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ showZoneReferences }),
          })
          const result: { success: boolean; showZoneReferences?: boolean; message?: string } = await response.json()
          if (!response.ok || !result.success || typeof result.showZoneReferences !== 'boolean') throw new Error(result.message || 'No se pudo guardar la preferencia.')
          await mutate(current => current ? { ...current, showZoneReferences: result.showZoneReferences } : current, { revalidate: false })
        } : undefined}
        canManage={isOwner && data.canManage && data.status === 'BRACKET_PHASE'}
        onSaved={async (saved) => { await mutate(current => current ? { ...current, snapshot: saved } : current, { revalidate: false }) }}
        onReload={async () => { const refreshed = await fetchBracket(url); await mutate(refreshed, { revalidate: false }) }}
      />}
      {isOwner && data.canManage && <FinalizeTournamentControl tournamentId={tournamentId} finalization={finalization} onFinalized={() => { void mutate(); onDataRefresh?.() }} />}
      {isOwner && data.canManage && finalization.canShowPointsCalculation && <PointsCalculationBanner tournamentId={tournamentId} winnerId={finalization.winner_id} onPointsCalculated={() => { void mutate(); void finalization.refetch(); onDataRefresh?.() }} />}

    </section>
  )
}
