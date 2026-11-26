'use client'

import { useState } from 'react'
import { Calculator, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PointsReviewDialog } from './points-review-dialog'
import { ReopenTournamentButton } from './reopen-tournament-button'
import { FinalizeTournamentControl } from './bracket-v2/components/FinalizeTournamentControl'
import { useTournamentFinalization } from './bracket-v2/hooks/useTournamentFinalization'

export const TournamentPointsControl = ({ tournamentId, onUpdated, zoneOnly }: { tournamentId: string; onUpdated?: () => void; zoneOnly?: boolean }) => {
  const finalization = useTournamentFinalization(tournamentId)
  const [reviewOpen, setReviewOpen] = useState(false)
  const applied = finalization.status === 'FINISHED_POINTS_CALCULATED'
  const pending = finalization.status === 'FINISHED_POINTS_PENDING'
  const handleUpdated = (): void => { void finalization.refetch(); onUpdated?.() }
  if (zoneOnly && (!finalization.fixedRanking || finalization.bracketKeys.length !== 0)) return null
  return (
    <>
      <FinalizeTournamentControl tournamentId={tournamentId} finalization={finalization}
        onFinalized={handleUpdated} onReviewPoints={() => setReviewOpen(true)} />
      {(pending || applied) && <div className="mb-4 flex flex-col gap-4 rounded-surface border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold">{applied && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{applied ? 'Puntos acreditados' : 'Torneo cerrado · puntos pendientes'}</p>
          <p className="text-xs text-muted-foreground">{applied ? 'Consultá el resumen acreditado. Para corregir el cierre, reabrí el torneo.' : 'Revisá los puntos y los cambios de categoría antes de acreditar.'}</p>
          {pending && finalization.reason && <p role="alert" className="text-sm text-destructive">{finalization.reason}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <ReopenTournamentButton tournamentId={tournamentId} onReopened={handleUpdated} />
          <Button size="sm" onClick={() => setReviewOpen(true)} disabled={pending && !finalization.canShowPointsCalculation}>
            <Calculator className="mr-2 h-4 w-4" />{applied ? 'Ver resumen de puntos' : 'Revisar puntos y ascensos'}
          </Button>
        </div>
      </div>}
      <PointsReviewDialog tournamentId={tournamentId} isOpen={reviewOpen} onClose={() => setReviewOpen(false)} onApplied={handleUpdated} />
    </>
  )
}
