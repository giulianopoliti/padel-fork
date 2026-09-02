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
import { Trash2, Loader2, AlertTriangle, Clock } from 'lucide-react'
import { TournamentFecha } from '../../types'
import { deleteTournamentFecha } from '../../../schedule-management/actions'
import { toast } from 'sonner'

interface DeleteFechaAlertProps {
  fecha: TournamentFecha
  isOpen: boolean
  onClose: () => void
  onFechaDeleted: (fechaId: string) => void
}

export default function DeleteFechaAlert({
  fecha,
  isOpen,
  onClose,
  onFechaDeleted
}: DeleteFechaAlertProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setIsDeleting(true)
    setError(null)

    try {
      const result = await deleteTournamentFecha(fecha.id)

      if (result.success) {
        onFechaDeleted(fecha.id)
        toast.success('Fecha eliminada exitosamente')
        onClose()
      } else {
        throw new Error(result.error || 'Error desconocido al eliminar la fecha')
      }

    } catch (error: any) {
      console.error('Error deleting fecha:', error)
      setError(error.message || 'Error al eliminar la fecha. Intenta nuevamente.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    if (!isDeleting) {
      setError(null)
      onClose()
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-green-100 text-green-800">Activa</Badge>
      case 'COMPLETED':
        return <Badge className="bg-blue-100 text-blue-800">Completada</Badge>
      case 'CANCELED':
        return <Badge className="bg-red-100 text-red-800">Cancelada</Badge>
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Pendiente</Badge>
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  // Get time slots count from fecha data
  const timeSlotCount = (fecha as any)._count_time_slots?.[0]?.count || 0
  const hasTimeSlots = timeSlotCount > 0

  return (
    <AlertDialog open={isOpen} onOpenChange={handleClose}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-600" />
            Eliminar Fecha
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>¿Estás seguro de que quieres eliminar esta fecha?</p>

              {/* Fecha Info */}
              <div className="p-3 bg-slate-50 rounded-surface space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{fecha.name}</h4>
                  {getStatusBadge(fecha.status)}
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Fecha #{fecha.fecha_number}</span>
                  {fecha.start_date && (
                    <span>{formatDate(fecha.start_date)}</span>
                  )}
                </div>

                {fecha.description && (
                  <p className="text-sm text-muted-foreground">
                    {fecha.description}
                  </p>
                )}

                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{timeSlotCount} horarios configurados</span>
                </div>
              </div>

              {/* Warning if has time slots */}
              {hasTimeSlots && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <strong>¡Advertencia!</strong> Esta fecha tiene {timeSlotCount} horarios configurados.
                    <br />
                    Para eliminar la fecha, primero debes eliminar todos sus horarios.
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

              <p className="text-sm text-muted-foreground">
                Esta acción no se puede deshacer.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={handleClose}
            disabled={isDeleting}
          >
            Cancelar
          </AlertDialogCancel>

          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting || hasTimeSlots}
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
                Eliminar Fecha
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
