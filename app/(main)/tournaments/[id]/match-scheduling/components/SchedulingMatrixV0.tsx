'use client'

import React, { useEffect, useState } from 'react'
import { Edit3, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SchedulingData } from '../actions'
import AvailabilityMatrix from './AvailabilityMatrix'
import MatchCreationPanel from './MatchCreationPanel'
import ScheduledMatchesDataTable from './ScheduledMatchesDataTable'
import { useMatchScheduling } from '../hooks/useMatchScheduling'

interface SchedulingMatrixV0Props {
  fechaId: string
  tournamentId: string
  allowFechaSubstitutions?: boolean
  schedulingData: SchedulingData
  onMatchCreated: () => void
  onMatchResultSaved?: () => void
  clubes: Club[]
}

interface Club {
  id: string
  name: string
}

const SchedulingMatrixV0: React.FC<SchedulingMatrixV0Props> = ({
  fechaId,
  tournamentId,
  allowFechaSubstitutions,
  schedulingData,
  onMatchCreated,
  onMatchResultSaved,
  clubes
}) => {
  const [manualAvailabilityEnabled, setManualAvailabilityEnabled] = useState(false)
  const [highlightRivals, setHighlightRivals] = useState(false)
  const {
    couples,
    timeSlots,
    availability,
    selectedCouples,
    createdMatches,
    draggedCouple,
    manualAvailabilitySavingKey,
    loading,
    error,
    actions
  } = useMatchScheduling(schedulingData, fechaId, onMatchCreated)

  useEffect(() => {
    actions.updateData(schedulingData)
  }, [schedulingData, actions.updateData])

  const handleMatchResultSaved = () => {
    (onMatchResultSaved ?? onMatchCreated)()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-2">
            Programación de Partidos - Matriz Unificada
          </h1>
          <p className="text-slate-600">Todos los horarios disponibles en una sola matriz</p>
        </div>

        <div className="mb-4 flex flex-col gap-2 rounded-surface border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Carga manual de disponibilidad</p>
            <p className="text-sm text-slate-600">
              Activalo cuando una pareja avise sus horarios por WhatsApp.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={highlightRivals ? 'default' : 'outline'}
              aria-pressed={highlightRivals}
              onClick={() => setHighlightRivals(value => !value)}
              className="h-auto min-h-10 whitespace-normal"
            >
              {highlightRivals ? 'Desactivar resaltado de rivales' : 'Resaltar rivales'}
            </Button>
            <Button
              type="button"
              disabled={timeSlots.length === 0}
              aria-pressed={manualAvailabilityEnabled}
              variant={manualAvailabilityEnabled ? 'default' : 'outline'}
              className={`h-auto min-h-10 whitespace-normal ${manualAvailabilityEnabled ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
              onClick={() => setManualAvailabilityEnabled(value => !value)}
            >
              {manualAvailabilityEnabled ? (
                <>
                  <Lock className="mr-2 h-4 w-4 shrink-0" />
                  Desactivar carga manual
                </>
              ) : (
                <>
                  <Edit3 className="mr-2 h-4 w-4 shrink-0" />
                  Habilitar carga manual de horarios
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="min-w-0 lg:col-span-2">
            <AvailabilityMatrix
              couples={couples}
              timeSlots={timeSlots}
              availability={availability}
              draggedCouple={draggedCouple}
              selectedCouples={selectedCouples}
              highlightRivals={highlightRivals}
              durationMinutes={schedulingData.estimatedMatchDurationMinutes || 90}
              onCoupleSelect={actions.handleCoupleSelect}
              onDragStart={actions.handleDragStart}
              onDragEnd={actions.handleDragEnd}
              manualAvailabilityEnabled={manualAvailabilityEnabled}
              manualAvailabilitySavingKey={manualAvailabilitySavingKey}
              onManualAvailabilityToggle={actions.handleManualAvailabilityToggle}
              substitution={allowFechaSubstitutions ? { tournamentId, fechaId, onSaved: onMatchCreated } : undefined}
            />
          </div>

          <div className="min-w-0">
            <MatchCreationPanel
              selectedCouples={selectedCouples}
              createdMatches={[]}
              timeSlots={timeSlots}
              error={error}
              loading={loading}
              onCoupleRemove={actions.handleCoupleRemove}
              onMatchCreate={actions.handleCreateMatch}
              onMatchDelete={actions.handleDeleteMatch}
              onDragOver={actions.handleDragOver}
              onDrop={actions.handleDrop}
              showMatchesList={false}
              clubes={clubes}
            />
          </div>
        </div>

        <div className="w-full">
          <ScheduledMatchesDataTable
            createdMatches={createdMatches}
            onMatchDelete={actions.handleDeleteMatch}
            onMatchResultSaved={handleMatchResultSaved}
            onUpdateMatchResult={actions.handleUpdateMatchResult}
            onModifyMatchResult={actions.handleModifyMatchResult}
            onModifySchedule={actions.handleModifySchedule}
            onScheduleModified={handleMatchResultSaved} // Reuse same callback since both trigger refresh
            clubes={clubes}
          />
        </div>
      </div>
    </div>
  )
}

export default SchedulingMatrixV0
