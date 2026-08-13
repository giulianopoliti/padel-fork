'use client'

import { useState, useEffect, useMemo } from 'react'
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
import { Edit, Loader2, AlertCircle } from 'lucide-react'
import { TournamentFecha } from '../../types'
import { updateTournamentFecha } from '../../../schedule-management/actions'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from 'sonner'
import { resolveFechaBracketKeyForTournament } from '@/lib/services/fecha-bracket-policy'

// Esquema base para EditFecha
const baseEditFechaSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  description: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  round_type: z.enum(['ZONE', '32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']).default('ZONE'),
  bracket_key: z.enum(['MAIN', 'GOLD', 'SILVER']).default('MAIN'),
  max_matches_per_couple: z.number().min(1).max(10).default(3),
  estimated_match_duration_minutes: z.union([z.literal(60), z.literal(75), z.literal(90)]).default(90),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED']).default('NOT_STARTED'),
}).refine((data) => {
  if (data.start_date && data.end_date) {
    return new Date(data.start_date) <= new Date(data.end_date)
  }
  return true
}, {
  message: "La fecha de fin debe ser posterior a la fecha de inicio",
  path: ["end_date"],
})

type EditFechaFormData = z.infer<typeof baseEditFechaSchema>

interface EditFechaDialogProps {
  fecha: TournamentFecha
  isOpen: boolean
  onClose: () => void
  onFechaUpdated: (fecha: TournamentFecha) => void
}

export default function EditFechaDialog({
  fecha,
  isOpen,
  onClose,
  onFechaUpdated
}: EditFechaDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Estado para rondas disponibles
  const [availableRounds, setAvailableRounds] = useState<string[]>(['ZONE']) // Siempre incluir ZONE
  const [roundsLoading, setRoundsLoading] = useState(false)
  const [isGoldSilverLong, setIsGoldSilverLong] = useState(false)

  // Función simple para obtener solo las rondas del bracket
  useEffect(() => {
    const fetchAvailableRounds = async () => {
      setRoundsLoading(true)
      try {
        const supabase = createClientComponentClient()

        // Solo obtener las rondas únicas de los matches
        const { data: matches, error } = await supabase
          .from('matches')
          .select('round')
          .eq('tournament_id', fecha.tournament_id)
          .not('round', 'is', null)

        if (error) {
          console.error('Error fetching rounds:', error)
          return
        }

        const bracketRounds = new Set<string>()
        matches?.forEach(match => {
          if (match.round) {
            bracketRounds.add(match.round)
          }
        })

        // Siempre incluir ZONE (para clasificatorias/qualify) + rondas del bracket
        const allRounds = new Set(['ZONE', ...Array.from(bracketRounds)])

        // Ordenar por jerarquía
        const orderedRounds = ['ZONE', '32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']
        const sortedRounds = Array.from(allRounds).sort((a, b) => {
          return orderedRounds.indexOf(a) - orderedRounds.indexOf(b)
        })

        setAvailableRounds(sortedRounds)

      } catch (error) {
        console.error('Error fetching available rounds:', error)
      } finally {
        setRoundsLoading(false)
      }
    }

    if (fecha.tournament_id) {
      fetchAvailableRounds()
    }
  }, [fecha.tournament_id])

  // Crear esquema dinámico basado en rondas disponibles
  const dynamicEditFechaSchema = useMemo(() => {
    const availableRoundValues = availableRounds.length > 0
      ? availableRounds as Array<'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL'>
      : ['ZONE'] as const // fallback si no hay rondas

    return z.object({
      name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
      description: z.string().optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      round_type: z.enum(availableRoundValues as [string, ...string[]]).default(availableRoundValues[0] || 'ZONE'),
      bracket_key: z.enum(['MAIN', 'GOLD', 'SILVER']).default('MAIN'),
      max_matches_per_couple: z.number().min(1).max(10).default(3),
      estimated_match_duration_minutes: z.union([z.literal(60), z.literal(75), z.literal(90)]).default(90),
      status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED']).default('NOT_STARTED'),
    }).refine((data) => {
      if (data.start_date && data.end_date) {
        return new Date(data.start_date) <= new Date(data.end_date)
      }
      return true
    }, {
      message: "La fecha de fin debe ser posterior a la fecha de inicio",
      path: ["end_date"],
    })
  }, [availableRounds])

  const form = useForm<EditFechaFormData>({
    resolver: zodResolver(dynamicEditFechaSchema),
    defaultValues: {
      name: fecha.name,
      description: fecha.description || '',
      start_date: fecha.start_date ? fecha.start_date.split('T')[0] : '',
      end_date: fecha.end_date ? fecha.end_date.split('T')[0] : '',
      round_type: fecha.round_type || 'ZONE',
      bracket_key: fecha.bracket_key || 'MAIN',
      max_matches_per_couple: fecha.max_matches_per_couple || 3,
      estimated_match_duration_minutes: fecha.estimated_match_duration_minutes || 90,
      status: fecha.status as any || 'NOT_STARTED',
    },
  })

  // Reset form when fecha changes
  useEffect(() => {
    form.reset({
      name: fecha.name,
      description: fecha.description || '',
      start_date: fecha.start_date ? fecha.start_date.split('T')[0] : '',
      end_date: fecha.end_date ? fecha.end_date.split('T')[0] : '',
      round_type: fecha.round_type || 'ZONE',
      bracket_key: fecha.bracket_key || 'MAIN',
      max_matches_per_couple: fecha.max_matches_per_couple || 3,
      estimated_match_duration_minutes: fecha.estimated_match_duration_minutes || 90,
      status: fecha.status as any || 'NOT_STARTED',
    })
  }, [fecha, form])

  const selectedRoundType = form.watch('round_type')

  useEffect(() => {
    const fetchTournamentFormat = async () => {
      try {
        const supabase = createClientComponentClient()
        const { data: tournament } = await supabase
          .from('tournaments')
          .select('type, format_config')
          .eq('id', fecha.tournament_id)
          .single()

        if (!tournament) {
          setIsGoldSilverLong(false)
          return
        }

        const checkResult = resolveFechaBracketKeyForTournament(tournament as any, {
          roundType: 'SEMIFINAL',
          requestedBracketKey: 'GOLD',
        })

        setIsGoldSilverLong(tournament.type === 'LONG' && checkResult.ok)
      } catch (error) {
        console.error('Error fetching tournament format:', error)
        setIsGoldSilverLong(false)
      }
    }

    fetchTournamentFormat()
  }, [fecha.tournament_id])

  useEffect(() => {
    if (selectedRoundType === 'ZONE' && form.getValues('bracket_key') !== 'MAIN') {
      form.setValue('bracket_key', 'MAIN')
    }
  }, [selectedRoundType, form])

  const onSubmit = async (data: EditFechaFormData) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const updateData = {
        name: data.name,
        description: data.description || undefined,
        start_date: data.start_date || undefined,
        end_date: data.end_date || undefined,
        round_type: data.round_type,
        bracket_key: data.bracket_key,
        max_matches_per_couple: data.max_matches_per_couple,
        estimated_match_duration_minutes: data.estimated_match_duration_minutes,
        status: data.status,
      }

      const result = await updateTournamentFecha(fecha.id, updateData)

      if (result.success && result.data) {
        onFechaUpdated(result.data as TournamentFecha)
        toast.success('Fecha actualizada exitosamente')
        onClose()
      } else {
        throw new Error(result.error || 'Error desconocido al actualizar la fecha')
      }

    } catch (error: any) {
      console.error('Error updating fecha:', error)
      setError(error.message || 'Error al actualizar la fecha. Intenta nuevamente.')
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS':
        return 'bg-green-100 text-green-800'
      case 'COMPLETED':
        return 'bg-blue-100 text-blue-800'
      case 'CANCELED':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-yellow-100 text-yellow-800'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS':
        return 'En Curso'
      case 'COMPLETED':
        return 'Finalizada'
      case 'CANCELED':
        return 'Cancelada'
      default:
        return 'No Iniciada'
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-blue-600" />
            Editar Fecha - {fecha.name}
          </DialogTitle>
          <DialogDescription>
            Modifica los detalles de la fecha del torneo.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Fecha Info */}
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
              <Badge variant="outline" className="text-xs">
                Fecha #{fecha.fecha_number}
              </Badge>
              <Badge className={`text-xs ${getStatusColor(fecha.status)}`}>
                {getStatusLabel(fecha.status)}
              </Badge>
            </div>

            {/* Name */}
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

            {/* Description */}
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

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha Inicio</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
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
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha Fin</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        disabled={isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Status */}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado de la Fecha</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-2 gap-2">
                      {(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] as const).map((status) => (
                        <Button
                          key={status}
                          type="button"
                          variant={field.value === status ? "default" : "outline"}
                          size="sm"
                          onClick={() => field.onChange(status)}
                          disabled={isSubmitting}
                          className="text-xs"
                        >
                          {getStatusLabel(status)}
                        </Button>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Max Matches per Couple */}
            <FormField
              control={form.control}
              name="max_matches_per_couple"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Máximo partidos por pareja</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      disabled={isSubmitting}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estimated_match_duration_minutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duracion reservada por partido</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-3 gap-2">
                      {([60, 75, 90] as const).map(duration => (
                        <Button
                          key={duration}
                          type="button"
                          variant={field.value === duration ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => field.onChange(duration)}
                          disabled={isSubmitting}
                        >
                          {duration} min
                        </Button>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Round Type - Dinámico basado en bracket */}
            <FormField
              control={form.control}
              name="round_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Ronda</FormLabel>
                  <FormControl>
                    <select
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isSubmitting || roundsLoading}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {roundsLoading ? (
                        <option value="">Cargando rondas disponibles...</option>
                      ) : availableRounds.length > 0 ? (
                        availableRounds.map((round) => {
                          const labels: Record<string, string> = {
                            'ZONE': 'TABLA DE POSICIONES',
                            '32VOS': '32vos de Final',
                            '16VOS': '16vos de Final',
                            '8VOS': '8vos de Final',
                            '4TOS': 'Cuartos de Final',
                            'SEMIFINAL': 'Semifinal',
                            'FINAL': 'Final'
                          }
                          return (
                            <option key={round} value={round}>
                              {labels[round] || round}
                            </option>
                          )
                        })
                      ) : (
                        <option value="ZONE">TABLA DE POSICIONES - Por defecto</option>
                      )}
                    </select>
                  </FormControl>
                  <FormMessage />
                  {availableRounds.length === 0 && !roundsLoading && (
                    <p className="text-sm text-muted-foreground">
                      No se encontraron rondas en el bracket. Se usará "Zona" por defecto.
                    </p>
                  )}
                  {availableRounds.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Rondas disponibles basadas en el bracket del torneo: {availableRounds.join(', ')}
                    </p>
                  )}
                </FormItem>
              )}
            />

            {selectedRoundType !== 'ZONE' && isGoldSilverLong && (
              <FormField
                control={form.control}
                name="bracket_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Copa de la Llave</FormLabel>
                    <FormControl>
                      <select
                        value={field.value}
                        onChange={field.onChange}
                        disabled={isSubmitting}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="GOLD">Copa de Oro</option>
                        <option value="SILVER">Copa de Plata</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                    <p className="text-sm text-muted-foreground">
                      Esta fecha quedará vinculada únicamente a la copa seleccionada.
                    </p>
                  </FormItem>
                )}
              />
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
              >
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
