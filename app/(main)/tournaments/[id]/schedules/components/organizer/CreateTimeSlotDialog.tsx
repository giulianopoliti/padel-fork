'use client'

import { useState } from 'react'
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
import { Clock, Loader2, AlertCircle, Calendar, MapPin } from 'lucide-react'
import { createTimeSlot } from '../../../schedule-management/actions'
import type { CreateTimeSlotData } from '../../types'
import { toast } from 'sonner'

const createTimeSlotSchema = z.object({
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

type CreateTimeSlotFormData = z.infer<typeof createTimeSlotSchema>

interface CreateTimeSlotDialogProps {
  fechaId: string
  isOpen: boolean
  onClose: () => void
  onTimeSlotCreated: () => void
}

export default function CreateTimeSlotDialog({
  fechaId,
  isOpen,
  onClose,
  onTimeSlotCreated
}: CreateTimeSlotDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<CreateTimeSlotFormData>({
    resolver: zodResolver(createTimeSlotSchema),
    defaultValues: {
      date: '',
      start_time: '',
      end_time: '',
      court_name: '',
      description: '',
    },
  })

  const onSubmit = async (data: CreateTimeSlotFormData) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const timeSlotData: CreateTimeSlotData = {
        fecha_id: fechaId,
        date: data.date,
        start_time: data.start_time,
        end_time: data.end_time,
        court_name: data.court_name,
        description: data.description,
        max_matches: 1,
      }

      const result = await createTimeSlot(timeSlotData)

      if (result.success) {
        onTimeSlotCreated()
        toast.success('Horario creado exitosamente')
        form.reset()
        onClose()
      } else {
        throw new Error(result.error || 'Error desconocido al crear el horario')
      }
    } catch (submitError: any) {
      console.error('Error creating time slot:', submitError)
      setError(submitError.message || 'Error al crear el horario. Intenta nuevamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      form.reset()
      setError(null)
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            Crear Nuevo Horario
          </DialogTitle>
          <DialogDescription>
            Configura un nuevo horario para que las parejas puedan marcar su disponibilidad.
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

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-surface">
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">¿Cómo funciona?</p>
                  <ul className="text-xs space-y-1">
                    <li>• Las parejas inscritas podrán marcar su disponibilidad</li>
                    <li>• Solo las parejas disponibles podrán jugar en este horario</li>
                  </ul>
                </div>
              </div>
            </div>

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
                    Creando...
                  </>
                ) : (
                  'Crear Horario'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
