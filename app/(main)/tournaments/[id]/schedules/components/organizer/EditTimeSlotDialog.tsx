'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Edit, Loader2, AlertCircle, Calendar, MapPin, Users } from 'lucide-react'
import { updateTimeSlot } from '../../actions'
import type { CreateTimeSlotData } from '../../types'
import { toast } from 'sonner'

const editTimeSlotSchema = z.object({
  date: z.string().min(1, 'La fecha es requerida'),
  start_time: z.string().min(1, 'La hora de inicio es requerida'),
  end_time: z.string().min(1, 'La hora de fin es requerida'),
  court_name: z.string().optional(),
  description: z.string().optional(),
}).refine((data) => {
  if (data.start_time && data.end_time) {
    return data.start_time < data.end_time
  }
  return true
}, {
  message: 'La hora de fin debe ser posterior a la hora de inicio',
  path: ['end_time'],
})

type EditTimeSlotFormData = z.infer<typeof editTimeSlotSchema>

interface TimeSlot {
  id: string
  date: string
  start_time: string
  end_time: string
  court_name?: string
  description?: string
  max_matches: number
  totalAvailable?: number
}

interface EditTimeSlotDialogProps {
  timeSlot: TimeSlot
  isOpen: boolean
  onClose: () => void
  onTimeSlotUpdated: () => void
}

export default function EditTimeSlotDialog({
  timeSlot,
  isOpen,
  onClose,
  onTimeSlotUpdated
}: EditTimeSlotDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<EditTimeSlotFormData>({
    resolver: zodResolver(editTimeSlotSchema),
    defaultValues: {
      date: timeSlot.date,
      start_time: timeSlot.start_time,
      end_time: timeSlot.end_time,
      court_name: timeSlot.court_name || '',
      description: timeSlot.description || '',
    },
  })

  useEffect(() => {
    form.reset({
      date: timeSlot.date,
      start_time: timeSlot.start_time,
      end_time: timeSlot.end_time,
      court_name: timeSlot.court_name || '',
      description: timeSlot.description || '',
    })
  }, [timeSlot, form])

  const onSubmit = async (data: EditTimeSlotFormData) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const updateData: Partial<CreateTimeSlotData> = {
        date: data.date,
        start_time: data.start_time,
        end_time: data.end_time,
        court_name: data.court_name,
        description: data.description,
        max_matches: 1,
      }

      const result = await updateTimeSlot(timeSlot.id, updateData)

      if (result.success) {
        onTimeSlotUpdated()
        toast.success('Horario actualizado exitosamente')
        onClose()
      } else {
        throw new Error(result.error || 'Error desconocido al actualizar el horario')
      }
    } catch (submitError: any) {
      console.error('Error updating time slot:', submitError)
      setError(submitError.message || 'Error al actualizar el horario. Intenta nuevamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setError(null)
      onClose()
    }
  }

  const formatTime = (timeString: string) => timeString.slice(0, 5)

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('es-ES', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit'
    })

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-blue-600" />
            Editar Horario
          </DialogTitle>
          <DialogDescription>
            Modifica los detalles del horario configurado.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="p-3 bg-slate-50 rounded-surface">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm">
                  {formatTime(timeSlot.start_time)} - {formatTime(timeSlot.end_time)}
                </h4>
                <Badge variant="outline">
                  {formatDate(timeSlot.date)}
                </Badge>
              </div>

              {timeSlot.totalAvailable !== undefined && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{timeSlot.totalAvailable} parejas disponibles</span>
                </div>
              )}
            </div>

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Fecha del Horario *
                  </FormLabel>
                  <FormControl>
                    <Input type="date" disabled={isSubmitting} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora Inicio *</FormLabel>
                    <FormControl>
                      <Input type="time" disabled={isSubmitting} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora Fin *</FormLabel>
                    <FormControl>
                      <Input type="time" disabled={isSubmitting} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="court_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Nombre de Cancha (opcional)
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="ej: Cancha 1, Cancha Principal..."
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="ej: Horario de mañana, canchas exteriores..."
                      disabled={isSubmitting}
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {timeSlot.totalAvailable && timeSlot.totalAvailable > 0 && (
              <Alert className="border-yellow-200 bg-yellow-50">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  <strong>Atención:</strong> Este horario ya tiene {timeSlot.totalAvailable} parejas que marcaron disponibilidad.
                  Los cambios pueden afectar la planificación existente.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar Cambios'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
