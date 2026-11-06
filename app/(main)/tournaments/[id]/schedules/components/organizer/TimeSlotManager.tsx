'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Plus, Clock, Edit, Trash2, Users, AlertTriangle } from 'lucide-react'
import { TournamentFecha } from '../../types'
import { getScheduleData } from '../../../schedule-management/actions'
import CreateTimeSlotDialog from './CreateTimeSlotDialog'
import EditTimeSlotDialog from './EditTimeSlotDialog'
import DeleteTimeSlotAlert from './DeleteTimeSlotAlert'

interface TimeSlotManagerProps {
  selectedFecha: TournamentFecha | undefined
  tournamentId: string
  onTimeSlotChanged: () => void
  shareAction?: ReactNode
}

interface TimeSlot {
  id: string
  date: string
  start_time: string
  end_time: string
  court_name?: string
  description?: string
  max_matches: number
  totalAvailable: number
}

export default function TimeSlotManager({
  selectedFecha,
  tournamentId,
  onTimeSlotChanged,
  shareAction
}: TimeSlotManagerProps) {
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingTimeSlot, setEditingTimeSlot] = useState<TimeSlot | null>(null)
  const [deletingTimeSlot, setDeletingTimeSlot] = useState<TimeSlot | null>(null)

  useEffect(() => {
    if (!selectedFecha) {
      setTimeSlots([])
      return
    }

    const loadTimeSlots = async () => {
      setLoading(true)
      setError(null)

      try {
        const result = await getScheduleData(tournamentId, selectedFecha.id)
        if (result.success && result.data) {
          setTimeSlots(result.data.timeSlots)
        } else {
          setError(result.error || 'Error al cargar horarios')
        }
      } catch {
        setError('Error inesperado al cargar horarios')
      } finally {
        setLoading(false)
      }
    }

    loadTimeSlots()
  }, [selectedFecha, tournamentId])

  const formatTime = (timeString: string) => timeString.slice(0, 5)

  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('-')
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10))
    return date.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit'
    })
  }

  const handleTimeSlotAction = () => {
    onTimeSlotChanged()
    if (selectedFecha) {
      const loadTimeSlots = async () => {
        const result = await getScheduleData(tournamentId, selectedFecha.id)
        if (result.success && result.data) {
          setTimeSlots(result.data.timeSlots)
        }
      }
      loadTimeSlots()
    }
  }

  if (!selectedFecha) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Selecciona una fecha</p>
            <p className="text-sm">para gestionar sus horarios</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="h-full">
        <CardHeader className="gap-3 space-y-0 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <CardTitle className="flex items-start gap-2 text-xl">
                <Clock className="size-5 shrink-0" aria-hidden />
                <span className="break-words">{selectedFecha.name}</span>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Horarios de la fecha {selectedFecha.fecha_number}
                {selectedFecha.start_date && ` · ${formatDate(selectedFecha.start_date)}`}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setIsCreateDialogOpen(true)}
              size="sm"
              className="max-w-full whitespace-normal text-left"
            >
              <Plus className="h-4 w-4" />
              Nuevo horario
            </Button>
          </div>
          {shareAction && <div className="flex flex-wrap items-center gap-2">{shareAction}</div>}
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
            <div className="p-4">
              {loading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <Skeleton className="h-4 w-3/4 mb-2" />
                        <Skeleton className="h-3 w-1/2 mb-2" />
                        <Skeleton className="h-3 w-1/4" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : error ? (
                <Alert className="border-red-200 bg-red-50">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    {error}
                  </AlertDescription>
                </Alert>
              ) : timeSlots.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No hay horarios disponibles</p>
                  <p className="text-sm">Podés agregar un horario para esta fecha.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {timeSlots.map((timeSlot) => (
                    <Card
                      key={timeSlot.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <h3 className="font-medium">
                                {formatTime(timeSlot.start_time)} - {formatTime(timeSlot.end_time)}
                              </h3>
                              <span className="rounded border px-2 py-0.5 text-xs">
                                {formatDate(timeSlot.date)}
                              </span>
                            </div>
                            {timeSlot.court_name && (
                              <p className="text-sm text-muted-foreground">
                                Cancha: {timeSlot.court_name}
                              </p>
                            )}
                            {timeSlot.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {timeSlot.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={`Editar horario del ${formatDate(timeSlot.date)} a las ${formatTime(timeSlot.start_time)}`}
                              onClick={() => setEditingTimeSlot(timeSlot)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={`Eliminar horario del ${formatDate(timeSlot.date)} a las ${formatTime(timeSlot.start_time)}`}
                              onClick={() => setDeletingTimeSlot(timeSlot)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            {timeSlot.totalAvailable} parejas disponibles
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <CreateTimeSlotDialog
        fechaId={selectedFecha.id}
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onTimeSlotCreated={handleTimeSlotAction}
      />

      {editingTimeSlot && (
        <EditTimeSlotDialog
          timeSlot={editingTimeSlot}
          isOpen={!!editingTimeSlot}
          onClose={() => setEditingTimeSlot(null)}
          onTimeSlotUpdated={handleTimeSlotAction}
        />
      )}

      {deletingTimeSlot && (
        <DeleteTimeSlotAlert
          timeSlot={deletingTimeSlot}
          isOpen={!!deletingTimeSlot}
          onClose={() => setDeletingTimeSlot(null)}
          onTimeSlotDeleted={handleTimeSlotAction}
        />
      )}
    </>
  )
}
