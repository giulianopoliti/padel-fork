'use client'

import { lazy, Suspense } from 'react'
import { CalendarCheck2 } from 'lucide-react'

import type { TournamentFecha } from '../../types'
import { useScheduleAccess } from '../../hooks/useScheduleAccess'
import { PageLoadingState, PlayerAvailabilitySkeleton } from '../LoadingStates'
import { AccessDeniedError, EliminatedCoupleError, InlineError, NetworkError, NotInscribedError } from '../ErrorStates'
import FechaSelector from '../FechaSelector'

const PlayerView = lazy(() => import('../PlayerView'))

interface PlayerScheduleViewProps {
  tournamentId: string
  fechas: TournamentFecha[]
  initialFechaId?: string
  tournamentName: string
  clubName: string
  inscriptionDetails?: unknown
}

export default function PlayerScheduleView({ tournamentId, fechas, initialFechaId, tournamentName, clubName }: PlayerScheduleViewProps) {
  const { userAccess, loading, error, retry } = useScheduleAccess(tournamentId)
  const selectedFechaId = initialFechaId || fechas[0]?.id

  if (loading) return <PageLoadingState />
  if (error?.includes('permisos')) return <AccessDeniedError onRetry={retry} />
  if (error?.includes('eliminada')) return <EliminatedCoupleError />
  if (error?.includes('inscrito')) return <NotInscribedError />
  if (error) return <NetworkError onRetry={retry} />
  if (!userAccess?.isInscribed) return <AccessDeniedError onRetry={retry} />

  return (
    <div className="min-h-screen bg-background/70">
      <header className="border-b border-border/70 bg-card/90 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="rounded-elevated bg-primary/10 p-2 text-primary"><CalendarCheck2 className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold sm:text-2xl">Cargar disponibilidad</h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{tournamentName}{clubName ? ` · ${clubName}` : ''}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        {!fechas.length ? (
          <InlineError message="El organizador todavia no publico fechas para cargar disponibilidad." />
        ) : !selectedFechaId ? (
          <InlineError message="Selecciona una fecha para ver sus horarios." />
        ) : (
          <>
            <FechaSelector tournamentId={tournamentId} fechas={fechas} selectedFechaId={selectedFechaId} />
            <Suspense fallback={<PlayerAvailabilitySkeleton />}>
              <PlayerView tournamentId={tournamentId} fechaId={selectedFechaId} userAccess={userAccess} />
            </Suspense>
          </>
        )}
      </main>
    </div>
  )
}
