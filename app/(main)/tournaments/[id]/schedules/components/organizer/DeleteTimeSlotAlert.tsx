'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Trash2, Loader2, AlertTriangle, Clock, Users, MapPin } from 'lucide-react'
import { deleteTimeSlot, forceDeleteTimeSlot } from '../../actions'
import { toast } from 'sonner'

interface TimeSlot {
  id: string
  date: string
  start_time: string
  end_time: string
  court_name?: string
  description?: string
  totalAvailable?: number
}

interface DeleteTimeSlotAlertProps {
  timeSlot: TimeSlot
  isOpen: boolean
  onClose: () => void
  onTimeSlotDeleted: () => void
}

export default function DeleteTimeSlotAlert({
  timeSlot,
  isOpen,
  onClose,
  onTimeSlotDeleted
}: DeleteTimeSlotAlertProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasAvailability, setHasAvailability] = useState(false)
  const [availabilityCount, setAvailabilityCount] = useState(0)

  const handleDelete = async () => {
    console.log('🗑️ [DeleteTimeSlotAlert] Starting delete process for:', timeSlot.id)
    setIsDeleting(true)
    setError(null)

    try {
      console.log('🗑️ [DeleteTimeSlotAlert] Calling deleteTimeSlot server action...')
      const result = await deleteTimeSlot(timeSlot.id)
      console.log('🗑️ [DeleteTimeSlotAlert] Server action result:', result)

      if (result.success) {
        console.log('🗑️ [DeleteTimeSlotAlert] Delete successful, triggering callbacks...')
        onTimeSlotDeleted()
        toast.success('Horario eliminado exitosamente')
        onClose()
      } else {
        console.log('🗑️ [DeleteTimeSlotAlert] Delete failed with error:', result.error)
        setError(result.error || 'Error desconocido al eliminar el horario')

        // Check if error is due to availability
        if (result.data?.availabilityCount) {
          setHasAvailability(true)
          setAvailabilityCount(result.data.availabilityCount)
        }
        return
      }

    } catch (error: any) {
      console.error('🗑️ [DeleteTimeSlotAlert] Exception during delete:', error)
      setError(error.message || 'Error al eliminar el horario. Intenta nuevamente.')
    } finally {
      console.log('🗑️ [DeleteTimeSlotAlert] Finishing delete process, setIsDeleting(false)')
      setIsDeleting(false)
    }
  }

  const handleForceDelete = async () => {
    console.log('🗑️ [DeleteTimeSlotAlert] Starting FORCE delete process for:', timeSlot.id)
    setIsDeleting(true)
    setError(null)

    try {
      console.log('🗑️ [DeleteTimeSlotAlert] Calling forceDeleteTimeSlot server action...')
      const result = await forceDeleteTimeSlot(timeSlot.id)
      console.log('🗑️ [DeleteTimeSlotAlert] Force delete result:', result)

      if (result.success) {
        console.log('🗑️ [DeleteTimeSlotAlert] Force delete successful!')
        onTimeSlotDeleted()
        toast.success(result.message || 'Horario eliminado exitosamente')
        onClose()
      } else {
        console.log('🗑️ [DeleteTimeSlotAlert] Force delete failed:', result.error)
        setError(result.error || 'Error al forzar eliminación del horario')
        return
      }

    } catch (error: any) {
      console.error('🗑️ [DeleteTimeSlotAlert] Exception during force delete:', error)
      setError(error.message || 'Error al forzar eliminación. Intenta nuevamente.')
    } finally {
      console.log('🗑️ [DeleteTimeSlotAlert] Finishing force delete process')
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    if (!isDeleting) {
      setError(null)
      setHasAvailability(false)
      setAvailabilityCount(0)
      onClose()
    }
  }

  const formatTime = (timeString: string) => {
    return timeString.slice(0, 5) // "HH:MM"
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const currentHasAvailability = hasAvailability || (timeSlot.totalAvailable && timeSlot.totalAvailable > 0)
  const canDelete = !currentHasAvailability

  return (
    <AlertDialog open={isOpen} onOpenChange={handleClose}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-600" />
            Eliminar Horario
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>¿Estás seguro de que quieres eliminar este horario?</p>

              {/* Time Slot Info */}
              <div className="p-3 bg-slate-50 rounded-surface space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {formatTime(timeSlot.start_time)} - {formatTime(timeSlot.end_time)}
                  </h4>
                  <Badge variant="outline">
                    {formatDate(timeSlot.date)}
                  </Badge>
                </div>

                {timeSlot.court_name && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{timeSlot.court_name}</span>
                  </div>
                )}

                {timeSlot.description && (
                  <p className="text-sm text-muted-foreground">
                    {timeSlot.description}
                  </p>
                )}

                <div className="flex items-center text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{availabilityCount || timeSlot.totalAvailable || 0} parejas disponibles</span>
                  </div>
                </div>
              </div>

              {/* Warning if has availability */}
              {currentHasAvailability && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <strong>¡Atención!</strong> Este horario tiene {availabilityCount || timeSlot.totalAvailable} pareja{(availabilityCount || timeSlot.totalAvailable || 0) > 1 ? 's' : ''} que {(availabilityCount || timeSlot.totalAvailable || 0) > 1 ? 'han' : 'ha'} marcado disponibilidad.
                    <br />
                    <span className="text-sm">
                      Si eliminas el horario, sus disponibilidades también se perderán. Puedes usar "Forzar eliminación" para proceder o contactar con las parejas para que remuevan su disponibilidad.
                    </span>
                  </AlertDescription>
                </Alert>
              )}

              {/* Warning about scheduled matches */}
              {canDelete && (
                <Alert className="border-yellow-200 bg-yellow-50">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800">
                    <strong>Importante:</strong> Si este horario tiene partidos programados, también serán eliminados.
                  </AlertDescription>
                </Alert>
              )}

              {/* Error Display */}
              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {canDelete && (
                <p className="text-sm text-muted-foreground">
                  Esta acción no se puede deshacer.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel
            onClick={handleClose}
            disabled={isDeleting}
          >
            Cancelar
          </AlertDialogCancel>

          {/* Normal delete button - only enabled if no availability */}
          {canDelete && (
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar Horario
                </>
              )}
            </AlertDialogAction>
          )}

          {/* Force delete button - only shown if has availability */}
          {currentHasAvailability && (
            <AlertDialogAction
              onClick={handleForceDelete}
              disabled={isDeleting}
              className="bg-orange-600 hover:bg-orange-700 focus:ring-orange-600"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Forzar Eliminación
                </>
              )}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
