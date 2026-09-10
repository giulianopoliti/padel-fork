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
import { Calendar, Loader2, AlertCircle } from 'lucide-react'
import { TournamentFecha } from '../../types'
import {
  createTournamentFecha,
  getAvailableScheduleRoundOptions,
  type ScheduleRoundOption,
} from '../../../schedule-management/actions'
import type { CreateFechaData } from '../../../schedule-management/types'
import { toast } from 'sonner'

type RoundType = 'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL'
type BracketKey = 'MAIN' | 'GOLD' | 'SILVER'

interface RoundSelectionOption {
  value: string
  roundType: RoundType
  bracketKey: BracketKey
  label: string
}

const createFechaSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  description: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  round_selection: z.string().min(1, 'Selecciona una ronda'),
}).refine((data) => {
  if (data.start_date && data.end_date) {
    return new Date(data.start_date) <= new Date(data.end_date)
  }
  return true
}, {
  message: 'La fecha de fin debe ser posterior a la fecha de inicio',
  path: ['end_date'],
})

type CreateFechaFormData = z.infer<typeof createFechaSchema>

interface CreateFechaDialogProps {
  tournamentId: string
  isOpen: boolean
  onClose: () => void
  onFechaCreated: (fecha: TournamentFecha) => void
  nextFechaNumber: number
}

const ROUND_LABELS: Record<RoundType, string> = {
  ZONE: 'Tabla de posiciones',
  '32VOS': '32vos de Final',
  '16VOS': '16vos de Final',
  '8VOS': '8vos de Final',
  '4TOS': 'Cuartos de Final',
  SEMIFINAL: 'Semifinal',
  FINAL: 'Final',
}

export default function CreateFechaDialog({
  tournamentId,
  isOpen,
  onClose,
  onFechaCreated,
  nextFechaNumber
}: CreateFechaDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roundSelectionOptions, setRoundSelectionOptions] = useState<RoundSelectionOption[]>([
    { value: 'ZONE:MAIN', roundType: 'ZONE', bracketKey: 'MAIN', label: ROUND_LABELS.ZONE },
  ])
  const [roundsLoading, setRoundsLoading] = useState(false)

  const form = useForm<CreateFechaFormData>({
    resolver: zodResolver(createFechaSchema),
    defaultValues: {
      name: '',
      description: '',
      start_date: '',
      end_date: '',
      round_selection: 'ZONE:MAIN',
    },
  })

  useEffect(() => {
    const fetchAvailableRounds = async () => {
      setRoundsLoading(true)
      try {
        const result = await getAvailableScheduleRoundOptions(tournamentId)
        if (!result.success || !result.data) {
          setError(result.error || 'No se pudieron cargar las rondas disponibles')
          return
        }

        setRoundSelectionOptions(result.data.map((option: ScheduleRoundOption) => ({
          value: `${option.roundType}:${option.bracketKey}`,
          roundType: option.roundType,
          bracketKey: option.bracketKey,
          label: option.bracketKey === 'MAIN'
            ? ROUND_LABELS[option.roundType]
            : `${ROUND_LABELS[option.roundType]} (${option.bracketKey === 'GOLD' ? 'Copa de Oro' : 'Copa de Plata'})`,
        })))
      } catch (fetchError) {
        console.error('Error fetching available rounds:', fetchError)
        setError('No se pudieron cargar las rondas disponibles')
      } finally {
        setRoundsLoading(false)
      }
    }

    if (tournamentId && isOpen) {
      fetchAvailableRounds()
    }
  }, [tournamentId, isOpen])

  useEffect(() => {
    const currentValue = form.getValues('round_selection')
    const exists = roundSelectionOptions.some((option) => option.value === currentValue)
    if (!exists && roundSelectionOptions.length > 0) {
      form.setValue('round_selection', roundSelectionOptions[0].value, { shouldValidate: true })
    }
  }, [form, roundSelectionOptions])

  const onSubmit = async (data: CreateFechaFormData) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const selectedOption = roundSelectionOptions.find(option => option.value === data.round_selection)
      if (!selectedOption) {
        const message = 'Selecciona una ronda válida antes de crear la fecha.'
        setError(message)
        toast.error(message)
        return
      }

      const fechaData: CreateFechaData = {
        tournament_id: tournamentId,
        fecha_number: nextFechaNumber,
        name: data.name,
        description: data.description || undefined,
        start_date: data.start_date || undefined,
        end_date: data.end_date || undefined,
        round_type: selectedOption.roundType,
        bracket_key: selectedOption.bracketKey,
      }

      const result = await createTournamentFecha(fechaData)
      if (result.success && result.data) {
        onFechaCreated(result.data as TournamentFecha)
        toast.success(`Fecha ${nextFechaNumber} creada exitosamente`)
        form.reset({
          name: '',
          description: '',
          start_date: '',
          end_date: '',
          round_selection: roundSelectionOptions[0]?.value || 'ZONE:MAIN',
        })
        onClose()
        return
      }

      const message = result.error || 'No se pudo crear la fecha'
      setError(message)
      toast.error(message)
    } catch (submitError: any) {
      console.error('Error creating fecha:', submitError)
      setError('Error inesperado al crear la fecha. Intenta nuevamente.')
      toast.error('Error inesperado al crear la fecha.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      form.reset({
        name: '',
        description: '',
        start_date: '',
        end_date: '',
        round_selection: roundSelectionOptions[0]?.value || 'ZONE:MAIN',
      })
      setError(null)
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Nueva Fecha del Torneo
          </DialogTitle>
          <DialogDescription>
            Crea una nueva fecha para organizar los partidos del torneo.
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Fecha *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="ej: Tabla de posiciones, Cuartos de Final..."
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
                      placeholder="Detalles adicionales sobre esta fecha..."
                      disabled={isSubmitting}
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha Inicio</FormLabel>
                    <FormControl>
                      <Input type="date" disabled={isSubmitting} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha Fin</FormLabel>
                    <FormControl>
                      <Input type="date" disabled={isSubmitting} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="round_selection"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ronda</FormLabel>
                  <FormControl>
                    <select
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isSubmitting || roundsLoading}
                      className="w-full px-3 py-2 border border-gray-300 rounded-control focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {roundsLoading ? (
                        <option value="">Cargando rondas disponibles...</option>
                      ) : roundSelectionOptions.length > 0 ? (
                        roundSelectionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))
                      ) : (
                        <option value="ZONE:MAIN">Tabla de posiciones</option>
                      )}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                  'Crear Fecha'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
