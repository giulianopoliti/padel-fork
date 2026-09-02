'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Trophy, Calendar, ChevronDown, Info } from 'lucide-react'
import LongBracketView from './LongBracketView'
import LongScheduleView from './LongScheduleView'
import { LongBracketGenerator } from '@/components/tournament/long/LongBracketGenerator'
import PublicBracketTreeView from '@/components/tournament/bracket-v2/components/PublicBracketTreeView'
import { PointsCalculationBanner } from '@/components/tournament/bracket-v2/components/PointsCalculationBanner'
import { useTournament } from '@/hooks/use-tournament'
import { useTournamentFinalization } from '@/components/tournament/bracket-v2/hooks/useTournamentFinalization'
import BackFromBracketButton from '../../settings/components/BackFromBracketButton'

type ViewMode = 'bracket' | 'schedule'

const ACTIVE_BRACKET_STATUSES = ['BRACKET_PHASE', 'FINISHED_POINTS_PENDING', 'FINISHED_POINTS_CALCULATED']

function BracketInstructions({ showBackToZones }: { showBackToZones: boolean }) {
  return (
    <div className="space-y-2 text-sm text-slate-700">
        <p>
          <strong>Procesar BYE:</strong> usalo cuando un partido tiene una sola pareja real y el otro lado quedo vacio.
          El sistema lo finaliza y avanza la pareja a la siguiente ronda.
        </p>
        <p>
          <strong>Desprocesar BYE:</strong> revierte esa accion. El partido vuelve a pendiente y se quita el avance del cruce siguiente.
        </p>
        <p>
          <strong>Reorganizar parejas:</strong> en modo edicion podes mover o intercambiar parejas dentro de la misma ronda. Nada se aplica hasta guardar.
        </p>
        <p>
          <strong>Si te confundiste y queres borrar la llave:</strong> usa el boton <strong>Volver a zonas</strong>.
          Elimina la llave actual y devuelve el torneo a zonas para corregir y generar de nuevo.
          {showBackToZones ? ' Lo vas a encontrar arriba en esta misma pantalla.' : ''}
        </p>
    </div>
  )
}

function BracketInstructionsSection({
  showBackToZones,
}: {
  showBackToZones: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="px-4 pb-3 lg:px-6">
      <div className="mx-auto min-w-0 max-w-none lg:max-w-7xl xl:pr-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]">
        <Collapsible
          open={isOpen}
          onOpenChange={setIsOpen}
          className="rounded-surface border border-slate-200 bg-white shadow-sm"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
              aria-label={isOpen ? 'Ocultar instructivo de la llave' : 'Mostrar instructivo de la llave'}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Info className="h-4 w-4 shrink-0 text-blue-700" />
                <span>Instructivo de llave</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                {isOpen ? 'Ocultar' : 'Ver guia'}
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-slate-200 px-3 py-3">
              <BracketInstructions showBackToZones={showBackToZones} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}

interface BracketContainerProps {
  tournamentId: string
  isOwner: boolean
  isPublicView: boolean
}

export default function BracketContainer({
  tournamentId,
  isOwner,
  isPublicView
}: BracketContainerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('bracket')
  const { tournament, isLoading } = useTournament(tournamentId)
  const finalization = useTournamentFinalization(tournamentId)

  const isInOrFinishedBracketPhase = ACTIVE_BRACKET_STATUSES.includes(tournament?.status ?? '')
  const shouldShowReadOnlyView = !isOwner || tournament?.status === 'FINISHED_POINTS_CALCULATED'

  // Loading state
  if (isLoading) {
    return (
      <div className="px-4 lg:px-6 py-6">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-muted-foreground">Cargando torneo...</p>
        </div>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div className="px-4 lg:px-6 py-6">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-destructive">Error al cargar el torneo</p>
        </div>
      </div>
    )
  }

  if (shouldShowReadOnlyView) {
    return (
      <div className="py-6">
        <BracketInstructionsSection showBackToZones={false} />
        <div className="px-4 lg:px-6">
          <div className="max-w-7xl mx-auto">
            <PublicBracketTreeView
              tournamentId={tournamentId}
              tournamentType={(tournament.type || 'LONG') as 'AMERICAN' | 'LONG'}
              tournamentFormatConfig={tournament.format_config}
            />
          </div>
        </div>
      </div>
    )
  }

  // Para organizadores: Solo mostrar el generador si el bracket nunca fue creado
  if (!isInOrFinishedBracketPhase) {
    return (
      <div className="py-4">
        <BracketInstructionsSection showBackToZones={false} />
        <div className="px-4 lg:px-6">
          <div className="max-w-2xl mx-auto">
            <LongBracketGenerator
              tournamentId={tournamentId}
              tournament={tournament}
              onBracketGenerated={() => {
                window.location.reload()
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  // Bracket activo o finalizado: mostrar interfaz de gestión
  return (
    <div className="min-w-0 overflow-x-hidden">
      {/* Banner de puntos (solo cuando el torneo está finalizado y hay puntos pendientes) */}
      {isOwner && finalization.canShowPointsCalculation && (
        <div className="px-4 lg:px-6 pt-3">
          <PointsCalculationBanner
            tournamentId={tournamentId}
            winnerId={finalization.winner_id}
            onPointsCalculated={() => finalization.refetch()}
          />
        </div>
      )}

      {/* Header con toggle */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 lg:px-6 py-3">
          <div className="max-w-none lg:max-w-7xl lg:mx-auto">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <Button
                  variant={viewMode === 'bracket' ? 'default' : 'outline'}
                  onClick={() => setViewMode('bracket')}
                  className="flex w-full items-center justify-center gap-2 sm:w-auto"
                  size="sm"
                >
                  <Trophy className="h-4 w-4" />
                  <span className="hidden sm:inline">Vista Llave</span>
                  <span className="sm:hidden">Llave</span>
                </Button>
                <Button
                  variant={viewMode === 'schedule' ? 'default' : 'outline'}
                  onClick={() => setViewMode('schedule')}
                  className="flex w-full items-center justify-center gap-2 sm:w-auto"
                  size="sm"
                >
                  <Calendar className="h-4 w-4" />
                  <span className="hidden sm:inline">Vista Horarios</span>
                  <span className="sm:hidden">Horarios</span>
                </Button>
                {isOwner && tournament.status === 'BRACKET_PHASE' && (
                  <BackFromBracketButton
                    tournamentId={tournamentId}
                    mode="inline"
                    buttonLabel="Volver a zonas"
                    tooltipMessage="Si tuviste algun problema con la llave y queres borrarla, usa este boton para volver el torneo a fase de zonas."
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
                {viewMode === 'schedule' && (
                  <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs sm:text-sm font-medium">
                    Vista Matriz
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <BracketInstructionsSection showBackToZones={isOwner && tournament.status === 'BRACKET_PHASE'} />

      {/* Content */}
      <div className="px-4 py-3 lg:px-6 lg:py-4">
        <div className="mx-auto min-w-0 max-w-none lg:max-w-7xl xl:pr-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]">
          {viewMode === 'bracket' ? (
            <LongBracketView
              tournamentId={tournamentId}
              onMatchUpdate={() => finalization.refetch()}
            />
          ) : (
            <LongScheduleView tournamentId={tournamentId} />
          )}
        </div>
      </div>
    </div>
  )
}
