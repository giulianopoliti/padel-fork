'use client'

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_BRACKET_ENTRIES, buildBracketSeeding } from '@/lib/services/bracket-structure'
import type { FreeBracketSnapshot } from '@/types/americano-libre'

import type { FreeBracketView } from '@/types/americano-libre-editor'
import { AmericanFreeBracketEditor } from './american-free-bracket-editor'
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
      await mutate({ success: true, snapshot: result.snapshot, canManage: true, status: 'BRACKET_PHASE' }, { revalidate: true })
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
        <p className="text-sm text-muted-foreground">Entradas manuales. Las posiciones de zona son una referencia.</p>
      </div>
      {generationError && <p role="alert" className="text-sm text-destructive">{generationError}</p>}
      {!snapshot && isOwner && data.canManage && (
        <div className="max-w-xl space-y-4">
          <p className="text-sm">Parejas inscriptas habilitadas: <strong>{data.suggestedCount}</strong>. No incluye jugadores sueltos ni inscripciones pendientes.</p>
          <div className="space-y-2">
            <Label htmlFor={`free-count-${tournamentId}`}>Cantidad de entradas</Label>
            <Input id={`free-count-${tournamentId}`} type="number" min={2} max={MAX_BRACKET_ENTRIES} step={1}
              value={editedCount ?? data.suggestedCount ?? ''} disabled={isGenerating || Boolean(data.blockedReason)}
              aria-describedby={`free-count-help-${tournamentId}`} aria-invalid={!validCount}
              onChange={(event) => setEditedCount(event.target.value)} className="max-w-40" />
            <p id={`free-count-help-${tournamentId}`} className="text-sm text-muted-foreground">De 2 a {MAX_BRACKET_ENTRIES} entradas. Podés elegir una cantidad diferente de las inscriptas.</p>
          </div>
          {base && <p className="text-sm">Cuadro base: <strong>{base}</strong> · Entradas vacías: <strong>{requested}</strong> · Pases previstos: <strong>{base - requested}</strong></p>}
          <p className="text-sm text-muted-foreground">Se puede generar aunque falten partidos o resultados de zona. Los pases quedan previstos, sin avanzar parejas.</p>
          {data.blockedReason && <p role="status" className="text-sm text-amber-700">{data.blockedReason}</p>}
          <Button onClick={handleGenerate} disabled={!validCount || isGenerating || Boolean(data.blockedReason)}>
            {isGenerating ? 'Generando llave...' : 'Generar llave'}
          </Button>
        </div>
      )}
      {!snapshot && (!isOwner || !data.canManage) && <p className="text-sm text-muted-foreground">La llave todavía no fue generada.</p>}
      {snapshot && isOwner && data.canManage && data.status === 'BRACKET_PHASE' && <AmericanFreeSports tournamentId={tournamentId} editor={data.editor} onSaved={async () => { await mutate(); await finalization.refetch(); onDataRefresh?.() }} />}
      {isOwner && data.canManage && <FinalizeTournamentControl tournamentId={tournamentId} finalization={finalization} onFinalized={() => { void mutate(); onDataRefresh?.() }} />}
      {isOwner && data.canManage && finalization.canShowPointsCalculation && <PointsCalculationBanner tournamentId={tournamentId} winnerId={finalization.winner_id} onPointsCalculated={() => { void mutate(); void finalization.refetch(); onDataRefresh?.() }} />}
      {snapshot && <AmericanFreeBracketEditor
        tournamentId={tournamentId} snapshot={snapshot} editor={data.editor}
        canManage={isOwner && data.canManage && data.status === 'BRACKET_PHASE'}
        onSaved={async (saved) => { await mutate({ ...data, snapshot: saved }, { revalidate: false }) }}
        onReload={async () => { const refreshed = await fetchBracket(url); await mutate(refreshed, { revalidate: false }) }}
      />}

    </section>
  )
}
