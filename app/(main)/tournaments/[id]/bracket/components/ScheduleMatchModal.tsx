'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Calendar, Clock, MapPin, Users, AlertTriangle, Loader2 } from 'lucide-react'
import { createMatch } from '../../match-scheduling/actions'
import type { BracketMatchV2 } from '@/components/tournament/bracket-v2/types/bracket-types'

interface ScheduleMatchModalProps {
  match: BracketMatchV2 | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onScheduled: () => void
}

export default function ScheduleMatchModal({
  match,
  open,
  onOpenChange,
  onScheduled
}: ScheduleMatchModalProps) {

  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [court, setCourt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form cuando se abre/cierra el modal
  React.useEffect(() => {
    if (open) {
      setDate('')
      setStartTime('')
      setEndTime('')
      setCourt('')
      setError(null)
    }
  }, [open])

  // Validaciones
  const isFormValid = date && startTime && endTime && match
  const startDateTime = date && startTime ? new Date(`${date}T${startTime}`) : null
  const endDateTime = date && endTime ? new Date(`${date}T${endTime}`) : null
  const isTimeValid = startDateTime && endDateTime && startDateTime < endDateTime

  const handleSchedule = async () => {
    if (!match || !isFormValid || !isTimeValid) return

    const couple1 = match.participants?.slot1?.couple
    const couple2 = match.participants?.slot2?.couple

    if (!couple1 || !couple2) {
      setError('Ambas parejas deben estar definidas para programar el partido')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Reutilizar la función createMatch del sistema de match-scheduling
      const result = await createMatch({
        couple1Id: couple1.id,
        couple2Id: couple2.id,
        date,
        startTime,
        endTime,
        court: court || null
      })

      if (result.success) {
        onScheduled()
        onOpenChange(false)
      } else {
        setError(result.error || 'Error al programar el partido')
      }
    } catch (err) {
      setError('Error inesperado al programar el partido')
      console.error('Error scheduling match:', err)
    } finally {
      setLoading(false)
    }
  }

  // Sugerir horario basado en el tiempo actual
  const suggestTimes = () => {
    const now = new Date()
    const start = new Date(now)
    start.setHours(start.getHours() + 1, 0, 0, 0) // 1 hora desde ahora
    const end = new Date(start)
    end.setHours(end.getHours() + 1, 30, 0, 0) // 1.5 horas después

    setStartTime(start.toTimeString().substring(0, 5))
    setEndTime(end.toTimeString().substring(0, 5))
  }

  if (!match) return null

  const couple1 = match.participants?.slot1?.couple
  const couple2 = match.participants?.slot2?.couple

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Programar Partido
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">

          {/* Información del match */}
          <div className="bg-slate-50 border border-slate-200 rounded-surface p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-slate-600" />
              <span className="text-sm font-medium text-slate-700">
                Match {match.position} - {match.round}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Pareja 1:</span>
                <Badge variant="outline" className="text-xs">
                  {couple1?.name || 'TBD'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Pareja 2:</span>
                <Badge variant="outline" className="text-xs">
                  {couple2?.name || 'TBD'}
                </Badge>
              </div>
            </div>

            {(!couple1 || !couple2) && (
              <Alert className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Atención:</strong> Una o ambas parejas no están definidas aún.
                  El partido se programará y las parejas se asignarán automáticamente cuando estén disponibles.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Formulario de programación */}
          <div className="space-y-4">

            {/* Fecha */}
            <div>
              <Label htmlFor="date" className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4" />
                Fecha
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="mt-1"
              />
            </div>

            {/* Horarios */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startTime" className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" />
                  Hora Inicio
                </Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="endTime" className="text-sm font-medium">
                  Hora Fin
                </Label>
                <Input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Botón de sugerencia rápida */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={suggestTimes}
              className="text-xs"
            >
              💡 Sugerir horario (próxima hora disponible)
            </Button>

            {/* Cancha */}
            <div>
              <Label htmlFor="court" className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="h-4 w-4" />
                Cancha (Opcional)
              </Label>
              <Input
                id="court"
                type="text"
                value={court}
                onChange={(e) => setCourt(e.target.value)}
                placeholder="Ej: Cancha 1, Pista Central"
                className="mt-1"
              />
            </div>
          </div>

          {/* Validación de horarios */}
          {date && startTime && endTime && !isTimeValid && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                La hora de fin debe ser posterior a la hora de inicio.
              </AlertDescription>
            </Alert>
          )}

          {/* Error display */}
          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {error}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={!isFormValid || !isTimeValid || loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Programando...
              </>
            ) : (
              <>
                <Calendar className="h-4 w-4 mr-2" />
                Programar Partido
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}