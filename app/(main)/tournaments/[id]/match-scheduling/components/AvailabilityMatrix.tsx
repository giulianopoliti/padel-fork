'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Check, Clock, Info, CalendarX, Loader2, Plus, AlertCircle, MessageSquareText } from 'lucide-react'
import { CoupleWithData, SchedulingData } from '../actions'
import { formatTimeRange, formatDateWithDay } from '../utils/dateUtils'
import { getRivalInsight } from '../utils/schedulingInsights'
import CoupleMatchCounts, { CoupleMatchLegend } from './CoupleMatchCounts'
import PlayerContactButton from './PlayerContactButton'

const statusLegend = [
  { background: 'bg-amber-50', border: 'border-amber-300', dot: 'bg-amber-400', text: 'text-amber-800', label: 'Partido en borrador' },
  { background: 'bg-blue-50', border: 'border-blue-300', dot: 'bg-blue-400', text: 'text-blue-800', label: 'Creado sin finalizar' },
  { background: 'bg-emerald-50', border: 'border-emerald-300', dot: 'bg-emerald-400', text: 'text-emerald-800', label: 'Partido finalizado' },
]

const rivalLegend = [
  { background: 'bg-emerald-50', border: 'border-emerald-300', dot: 'bg-emerald-400', text: 'text-emerald-800', label: 'Rival habilitado' },
  { background: 'bg-red-50', border: 'border-red-300', dot: 'bg-red-400', text: 'text-red-800', label: 'Ya se enfrentaron' },
  ...statusLegend.slice(0, 2),
  { background: 'bg-slate-50', border: 'border-slate-300', dot: 'bg-slate-400', text: 'text-slate-700', label: 'No habilitado / por confirmar' },
]

interface AvailabilityMatrixProps {
  couples: CoupleWithData[]
  timeSlots: SchedulingData['timeSlots']
  availability: SchedulingData['availability']
  draggedCouple: CoupleWithData | null
  selectedCouples: CoupleWithData[]
  highlightRivals: boolean
  durationMinutes: number
  onCoupleSelect: (couple: CoupleWithData) => void
  onDragStart: (couple: CoupleWithData) => void
  onDragEnd: () => void
  manualAvailabilityEnabled: boolean
  manualAvailabilitySavingKey: string | null
  onManualAvailabilityToggle: (coupleId: string, timeSlotId: string, isAvailable?: boolean, notes?: string | null) => Promise<boolean>
}

const AvailabilityMatrix: React.FC<AvailabilityMatrixProps> = ({
  couples,
  timeSlots,
  availability,
  draggedCouple,
  selectedCouples,
  highlightRivals,
  durationMinutes,
  onCoupleSelect,
  onDragStart,
  onDragEnd,
  manualAvailabilityEnabled,
  manualAvailabilitySavingKey,
  onManualAvailabilityToggle
}) => {
  const [noteDialog, setNoteDialog] = React.useState<{ coupleId: string; timeSlotId: string } | null>(null)
  const [noteDraft, setNoteDraft] = React.useState('')
  const [savingNote, setSavingNote] = React.useState(false)
  const referenceCouple = selectedCouples[0]
  const availabilityByCell = React.useMemo(() => new Map(
    availability.map(item => [`${item.couple_id}:${item.time_slot_id}`, item]),
  ), [availability])

  const handleDragStart = (couple: CoupleWithData, e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', couple.id)
    e.dataTransfer.effectAllowed = 'move'
    onDragStart(couple)
  }

  const handleDragEnd = () => {
    onDragEnd()
  }

  const handleCoupleClick = (couple: CoupleWithData) => {
    onCoupleSelect(couple)
  }

  // Check if couple is available for a specific time slot
  const isCoupleAvailable = (coupleId: string, timeSlotId: string): boolean => {
    const coupleAvailability = availabilityByCell.get(`${coupleId}:${timeSlotId}`)
    return coupleAvailability ? coupleAvailability.is_available : false
  }

  // Get availability notes for tooltip
  const getAvailabilityNotes = (coupleId: string, timeSlotId: string): string | null => {
    const coupleAvailability = availabilityByCell.get(`${coupleId}:${timeSlotId}`)
    return coupleAvailability?.notes || null
  }

  const openNoteDialog = (coupleId: string, timeSlotId: string) => {
    setNoteDraft(getAvailabilityNotes(coupleId, timeSlotId) || '')
    setNoteDialog({ coupleId, timeSlotId })
  }

  const handleNoteSave = async () => {
    if (!noteDialog) return

    setSavingNote(true)
    const saved = await onManualAvailabilityToggle(
      noteDialog.coupleId,
      noteDialog.timeSlotId,
      true,
      noteDraft
    )
    setSavingNote(false)

    if (saved) setNoteDialog(null)
  }

  // Get couple display name
  const getCoupleDisplayName = (couple: CoupleWithData): string => {
    const player1Name = `${couple.player1.name} ${couple.player1.last_name || ''}`.trim()
    const player2Name = `${couple.player2.name} ${couple.player2.last_name || ''}`.trim()
    return `${player1Name} / ${player2Name}`
  }

  // Format time slot display using utility
  const formatTimeSlot = (timeSlot: SchedulingData['timeSlots'][0]): string => {
    return formatTimeRange(timeSlot.start_time, timeSlot.end_time)
  }

  // Show all couples - don't filter by has_played_in_this_date
  // We'll use visual indicators (colors) to show which couples have matches
  const displayedCouples = couples

  // Helper function to get row background color based on match status
  const getRowBackgroundColor = (couple: CoupleWithData): string => {
    if (couple.free_date_blocked) {
      return 'bg-red-50'
    }
    if (!couple.match_status) {
      return 'bg-white' // No match - normal white background
    }
    if (couple.match_status === 'DRAFT') {
      return 'bg-amber-50'
    }
    if (couple.match_status === 'PENDING') return 'bg-blue-50'
    if (couple.match_status === 'FINISHED') return 'bg-emerald-50'
    return 'bg-white'
  }


  if (displayedCouples.length === 0) {
    return (
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardContent className="p-8 text-center">
          <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">
            No hay parejas registradas para esta fecha
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-white border-gray-200 shadow-sm hover:shadow-lg transition-shadow">
      <CardHeader className="pb-4">
        <CardTitle className="text-slate-900 flex items-center gap-2">
          <div className="bg-blue-100 p-2 rounded-surface">
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
          Matriz de Disponibilidad
        </CardTitle>
        <p className="text-sm text-slate-600 mt-1">
          Arrastra las parejas para seleccionarlas o haz clic para alternar selección
        </p>
        {highlightRivals && (
          <div className="mt-3 space-y-1 text-sm text-slate-700" aria-live="polite">
            <p>{referenceCouple ? `Rivales de ${getCoupleDisplayName(referenceCouple)}` : 'Seleccioná una pareja para comparar sus rivales.'}</p>
            {referenceCouple?.has_played_in_this_date && (
              <p role="status" className="text-xs font-medium">
                {referenceCouple.match_status === 'FINISHED'
                  ? 'La pareja seleccionada ya jugó en esta fecha.'
                  : referenceCouple.match_status === 'DRAFT'
                    ? 'La pareja seleccionada tiene un partido en borrador en esta fecha.'
                    : 'La pareja seleccionada ya tiene un partido creado en esta fecha.'}
                {' '}No se puede crear otro partido para ella en esta fecha. El rojo sigue indicando enfrentamientos previos.
              </p>
            )}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          {(highlightRivals ? rivalLegend : statusLegend).map(item => (
            <div key={item.label} className={`inline-flex items-center gap-2 px-3 py-2 border rounded-surface ${item.background} ${item.border}`}>
              <div className={`w-3 h-3 rounded-full ${item.dot}`} />
              <span className={`text-sm font-medium ${item.text}`}>{item.label}</span>
            </div>
          ))}
          {!highlightRivals && (
          <div className="inline-flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-300 rounded-surface">
            <CalendarX className="w-3 h-3 text-red-600" />
            <span className="text-sm font-medium text-red-800">FECHA LIBRE</span>
          </div>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">Borde oscuro: pareja seleccionada.</p>
        <CoupleMatchLegend />
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left p-3 text-slate-700 font-semibold min-w-[200px] sticky left-0 bg-white z-10">
                  Parejas
                </th>
                {timeSlots.map((timeSlot) => (
                  <th 
                    key={timeSlot.id} 
                    className="text-center p-3 text-slate-700 font-semibold min-w-[80px] text-xs"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{formatTimeSlot(timeSlot)}</span>
                      {timeSlot.date && (
                        <span className="text-xs text-blue-600 font-medium">
                          {formatDateWithDay(timeSlot.date)}
                        </span>
                      )}
                      {timeSlot.court_name && (
                        <span className="text-xs text-slate-500 mt-1">
                          {timeSlot.court_name}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedCouples.map((couple) => {
                const isSelected = selectedCouples.some(selected => selected.id === couple.id)
                const insight = highlightRivals && referenceCouple && referenceCouple.id !== couple.id
                  ? getRivalInsight(referenceCouple, couple, timeSlots, availabilityByCell, durationMinutes)
                  : null
                const rowBgColor = insight?.tone === 'green' ? 'bg-emerald-50'
                  : insight?.tone === 'red' ? 'bg-red-50'
                  : insight?.tone === 'amber' ? 'bg-amber-50'
                  : insight?.tone === 'blue' ? 'bg-blue-50'
                  : insight?.tone === 'neutral' ? 'bg-slate-50'
                  : getRowBackgroundColor(couple)

                return (
                  <tr
                    key={couple.id}
                    title={insight?.reason}
                    className={`
                      border-b border-gray-100 hover:bg-blue-50/50
                      transition-colors duration-200
                      ${couple.free_date_blocked ? 'cursor-grab active:cursor-grabbing opacity-80' : 'cursor-grab active:cursor-grabbing'}
                      ${draggedCouple?.id === couple.id ? 'opacity-50 bg-blue-100' : rowBgColor}
                    `}
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation()
                      if ((e.target as HTMLElement).closest('button, a')) {
                        e.preventDefault()
                        return
                      }
                      handleDragStart(couple, e)
                    }}
                    onDragEnd={(e) => {
                      e.stopPropagation()
                      handleDragEnd()
                    }}
                    onClick={(e) => {
                      // Only handle click if not dragging
                      if (e.detail === 1) { // Single click only
                        handleCoupleClick(couple)
                      }
                    }}
                  >
                    <td className={`p-3 sticky left-0 z-10 border-r border-gray-100 ${rowBgColor} ${isSelected ? 'ring-2 ring-inset ring-slate-600' : ''}`}>
                      <div className="space-y-1">
                        <button
                          type="button"
                          aria-label={`Seleccionar pareja: ${getCoupleDisplayName(couple)}`}
                          aria-pressed={isSelected}
                          aria-description={insight?.reason}
                          className="sr-only focus:not-sr-only focus:rounded focus:px-2 focus:py-1 focus:text-sm focus:ring-2 focus:ring-blue-500"
                          onClick={event => { event.stopPropagation(); handleCoupleClick(couple) }}
                        >
                          {isSelected ? 'Quitar selección' : 'Seleccionar pareja'}
                        </button>
                        <div className="text-sm font-semibold text-slate-900">
                          <PlayerContactButton player={couple.player1} />
                          {' / '}
                          <PlayerContactButton player={couple.player2} />
                        </div>
                        <CoupleMatchCounts counts={couple.zone_match_counts} />
                        {/* Zone info if available */}
                        {couple.zone_position && (
                          <div className="flex items-center gap-1 text-xs text-blue-600">
                            <Info className="w-3 h-3" />
                            <span>
                              {couple.zone_position.zone_name} - Pos {couple.zone_position.position}
                            </span>
                          </div>
                        )}
                        {couple.free_date_blocked && (
                          <div className="flex items-center gap-1 text-xs text-red-700">
                            <CalendarX className="w-3 h-3" />
                            <span>
                              FECHA LIBRE{couple.free_date_notes ? ` - ${couple.free_date_notes}` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    {timeSlots.map((timeSlot) => {
                      const isAvailable = isCoupleAvailable(couple.id, timeSlot.id)
                      const notes = getAvailabilityNotes(couple.id, timeSlot.id)

                      return <td
                        key={timeSlot.id}
                        className={`text-center p-3 ${rowBgColor} ${insight?.commonSlotIds.includes(timeSlot.id) ? 'ring-2 ring-inset ring-emerald-500' : ''} ${manualAvailabilityEnabled ? 'cursor-pointer hover:bg-blue-50' : ''}`}
                        onClick={(e) => {
                          if (!manualAvailabilityEnabled) return
                          e.stopPropagation()
                          if (!isAvailable) {
                            openNoteDialog(couple.id, timeSlot.id)
                          } else {
                            void onManualAvailabilityToggle(couple.id, timeSlot.id, false)
                          }
                        }}
                      >
                        {manualAvailabilityEnabled ? (
                          <div className="mx-auto flex w-fit items-center gap-1">
                            <button
                              type="button"
                              disabled={manualAvailabilitySavingKey === `${couple.id}:${timeSlot.id}`}
                              className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                                isAvailable
                                  ? 'border-blue-700 bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                                  : 'border-slate-300 bg-white text-slate-500 hover:border-blue-400 hover:text-blue-600'
                              } disabled:cursor-wait disabled:opacity-70`}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (!isAvailable) {
                                  openNoteDialog(couple.id, timeSlot.id)
                                } else {
                                  void onManualAvailabilityToggle(couple.id, timeSlot.id, false)
                                }
                              }}
                              aria-label={`${isAvailable ? 'Desmarcar' : 'Marcar'} disponibilidad de ${getCoupleDisplayName(couple)} en ${formatTimeSlot(timeSlot)}`}
                            >
                              {manualAvailabilitySavingKey === `${couple.id}:${timeSlot.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : isAvailable ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <Plus className="h-3.5 w-3.5" />
                              )}
                            </button>
                            {isAvailable && (
                              <button
                                type="button"
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openNoteDialog(couple.id, timeSlot.id)
                                }}
                                aria-label={notes ? 'Editar nota de disponibilidad' : 'Agregar nota de disponibilidad'}
                              >
                                <AlertCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ) : isAvailable ? (
                          <div className="mx-auto flex w-fit items-center gap-1">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-blue-700 bg-blue-600 shadow-sm">
                              <Check className="h-3.5 w-3.5 text-white" />
                            </div>
                            {notes && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700" aria-label="Esta disponibilidad tiene una nota">
                                      <AlertCircle className="h-3.5 w-3.5" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs bg-white text-slate-900 shadow-lg">
                                    <strong>Nota:</strong> {notes}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        ) : null}
                      </td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <Dialog open={Boolean(noteDialog)} onOpenChange={(open) => !open && setNoteDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar nota a la disponibilidad</DialogTitle>
              <DialogDescription>
                Esta nota quedará visible para quienes organizan el torneo.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="organizer-availability-note">Nota</Label>
              <Textarea
                id="organizer-availability-note"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="Ej.: confirmó por WhatsApp"
                maxLength={500}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNoteDialog(null)} disabled={savingNote}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleNoteSave} disabled={savingNote}>
                {savingNote ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquareText className="mr-2 h-4 w-4" />}
                Guardar disponibilidad
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </CardContent>
    </Card>
  )
}

export default AvailabilityMatrix
