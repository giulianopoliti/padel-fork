"use client"

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/use-toast'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Save, FileText, Users, AlertCircle, Tag, Clock3, EyeOff } from 'lucide-react'
import { updateTournamentBasicInfo } from '../actions'
import { MAX_TOURNAMENT_PRICE } from '@/lib/constants/tournaments'

const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires'
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const toInputDate = (value?: string | null) => {
  if (!value) return ''

  if (DATE_ONLY_PATTERN.test(value)) {
    return value
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    timeZone: ARGENTINA_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(date)

  const dateParts = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`
}

const toInputTime = (value?: string | null) => {
  if (!value || !value.includes('T')) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: ARGENTINA_TIME_ZONE,
  }).formatToParts(date)

  const timeParts = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${timeParts.hour}:${timeParts.minute}`
}

const toArgentinaDateTimeISOString = (date: string, time: string) => {
  const normalizedTime = time.length === 5 ? `${time}:00` : time
  return `${date}T${normalizedTime}-03:00`
}

interface TournamentBasicInfoFormProps {
  tournamentId: string
  initialData: {
    name: string
    description?: string | null
    max_participants?: number | null
    price?: number | null
    start_date?: string | null
    end_date?: string | null
    type?: string | null
    hide_venue?: boolean | null
  }
  inscriptionsCount: number
}

export default function TournamentBasicInfoForm({
  tournamentId,
  initialData,
  inscriptionsCount
}: TournamentBasicInfoFormProps) {
  const initialStartDate = toInputDate(initialData.start_date)
  const initialStartTime = toInputTime(initialData.start_date)
  const initialEndDate = toInputDate(initialData.end_date)
  const isAmericanTournament = initialData.type === 'AMERICAN' || initialData.type === 'AMERICANO'

  const [isLoading, setIsLoading] = useState(false)
  const [name, setName] = useState(initialData.name)
  const [description, setDescription] = useState(initialData.description || '')
  const [maxParticipants, setMaxParticipants] = useState<number | ''>(
    initialData.max_participants || ''
  )
  const [price, setPrice] = useState<number | ''>(
    initialData.price ?? ''
  )
  const [startDate, setStartDate] = useState(initialStartDate)
  const [startTime, setStartTime] = useState(initialStartTime)
  const [endDate, setEndDate] = useState(initialEndDate)
  const [hideVenue, setHideVenue] = useState(Boolean(initialData.hide_venue))
  const [hasChanges, setHasChanges] = useState(false)
  const { toast } = useToast()

  const handleInputChange = () => {
    setHasChanges(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!hasChanges) {
      toast({
        title: "Sin cambios",
        description: "No hay cambios para guardar",
        variant: "default"
      })
      return
    }

    setIsLoading(true)

    try {
      const updatePayload: Parameters<typeof updateTournamentBasicInfo>[0] = {
        tournamentId,
        name: name.trim(),
        description: description.trim() || null,
        max_participants: maxParticipants === '' ? null : Number(maxParticipants),
        price: price === '' ? null : Number(price),
        hide_venue: hideVenue,
      }

      if (startDate !== initialStartDate || startTime !== initialStartTime) {
        updatePayload.start_date = startDate
          ? startTime
            ? toArgentinaDateTimeISOString(startDate, startTime)
            : startDate
          : null
      }

      if (endDate !== initialEndDate) {
        updatePayload.end_date = endDate || null
      }

      const result = await updateTournamentBasicInfo(updatePayload)

      if (result.success) {
        toast({
          title: "Cambios guardados",
          description: "La información del torneo se actualizó correctamente",
          variant: "default"
        })
        setHasChanges(false)

        // Refresh the page to show updated data everywhere
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } else {
        toast({
          title: "Error al guardar",
          description: result.error || "No se pudieron guardar los cambios",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Error saving tournament info:', error)
      toast({
        title: "Error inesperado",
        description: "Ocurrió un error al guardar. Por favor, intenta nuevamente.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setName(initialData.name)
    setDescription(initialData.description || '')
    setMaxParticipants(initialData.max_participants || '')
    setPrice(initialData.price ?? '')
    setStartDate(initialStartDate)
    setStartTime(initialStartTime)
    setEndDate(initialEndDate)
    setHideVenue(Boolean(initialData.hide_venue))
    setHasChanges(false)
  }

  const isMaxParticipantsValid = () => {
    if (maxParticipants === '') return true
    const value = Number(maxParticipants)
    return value >= inscriptionsCount && value <= 256
  }

  const isPriceValid = () => {
    if (price === '') return true
    const value = Number(price)
    return Number.isInteger(value) && value >= 0 && value <= MAX_TOURNAMENT_PRICE
  }

  const areDatesValid = () => {
    if (!startDate || !endDate) return true
    return startDate <= endDate
  }

  const isStartTimeValid = () => {
    return !isAmericanTournament || !startDate || Boolean(startTime)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Tournament Name */}
      <div className="space-y-2">
        <Label htmlFor="tournament-name" className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-600" />
          Nombre del Torneo *
        </Label>
        <Input
          id="tournament-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            handleInputChange()
          }}
          placeholder="Ej: Torneo de Pádel Verano 2025"
          maxLength={100}
          required
          disabled={isLoading}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          {name.length}/100 caracteres
        </p>
      </div>

      {/* Tournament Price */}
      <div className="space-y-2">
        <Label htmlFor="tournament-price" className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-emerald-600" />
          Precio de inscripcion
        </Label>
        <Input
          id="tournament-price"
          type="number"
          value={price}
          onChange={(e) => {
            const value = e.target.value
            setPrice(value === '' ? '' : Number(value))
            handleInputChange()
          }}
          placeholder="Sin definir"
          min={0}
          max={MAX_TOURNAMENT_PRICE}
          step={1}
          disabled={isLoading}
          className="w-full"
        />
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Opcional. Solo numeros enteros.
          </p>
          {price !== '' && !isPriceValid() && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                El precio debe ser un entero entre 0 y {MAX_TOURNAMENT_PRICE.toLocaleString('es-AR')}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      {/* Tournament Description */}
      <div className="space-y-2">
        <Label htmlFor="tournament-description" className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-600" />
          Descripción
        </Label>
        <Textarea
          id="tournament-description"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value)
            handleInputChange()
          }}
          placeholder="Describe el torneo, premios, reglas especiales, etc."
          rows={4}
          maxLength={500}
          disabled={isLoading}
          className="w-full resize-none"
        />
        <p className="text-xs text-muted-foreground">
          {description.length}/500 caracteres • Opcional
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="tournament-start-date" className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-sky-600" />
            Fecha de inicio
          </Label>
          <Input
            id="tournament-start-date"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              handleInputChange()
            }}
            disabled={isLoading}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">Opcional. Se usa en listados y resumenes del torneo.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tournament-start-time" className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-sky-600" />
            Hora de inicio
          </Label>
          <Input
            id="tournament-start-time"
            type="time"
            value={startTime}
            onChange={(e) => {
              setStartTime(e.target.value)
              handleInputChange()
            }}
            disabled={isLoading || !startDate}
            className="w-full"
          />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {isAmericanTournament ? 'Obligatoria para torneos americanos.' : 'Opcional. Conserva el horario publico del torneo.'}
            </p>
            {!isStartTimeValid() && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  La hora de inicio es obligatoria para torneos americanos.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tournament-end-date" className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-sky-600" />
            Fecha de cierre
          </Label>
          <Input
            id="tournament-end-date"
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value)
              handleInputChange()
            }}
            disabled={isLoading}
            className="w-full"
          />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Opcional. Si existe, debe ser igual o posterior a la fecha de inicio.
            </p>
            {!areDatesValid() && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  La fecha de cierre no puede ser anterior a la fecha de inicio.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </div>

      {/* Max Participants */}
      <div className="space-y-2">
        <Label htmlFor="max-participants" className="flex items-center gap-2">
          <Users className="h-4 w-4 text-purple-600" />
          Máximo de Participantes
        </Label>
        <Input
          id="max-participants"
          type="number"
          value={maxParticipants}
          onChange={(e) => {
            const value = e.target.value
            setMaxParticipants(value === '' ? '' : Number(value))
            handleInputChange()
          }}
          placeholder="Sin límite"
          min={inscriptionsCount}
          max={256}
          disabled={isLoading}
          className="w-full"
        />
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Inscripciones actuales: <strong>{inscriptionsCount} parejas</strong>
          </p>
          {maxParticipants !== '' && !isMaxParticipantsValid() && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                El máximo debe ser al menos {inscriptionsCount} (inscripciones actuales) y no más de 256
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-surface border border-slate-200 bg-slate-50/70 p-4">
        <Checkbox
          id="hide-venue"
          checked={hideVenue}
          onCheckedChange={(checked) => {
            setHideVenue(checked === true)
            handleInputChange()
          }}
          disabled={isLoading}
          className="mt-0.5"
        />
        <div className="space-y-1">
          <Label htmlFor="hide-venue" className="flex cursor-pointer items-center gap-2 font-medium">
            <EyeOff className="h-4 w-4 text-slate-600" />
            Ocultar sede
          </Label>
          <p className="text-xs text-muted-foreground">
            No muestra el club, direccion ni telefonos de la sede en vistas publicas y de jugador.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t">
        <Button
          type="submit"
          disabled={isLoading || !hasChanges || !isMaxParticipantsValid() || !isPriceValid() || !areDatesValid() || !isStartTimeValid()}
          className="flex-1"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Guardar Cambios
            </>
          )}
        </Button>

        {hasChanges && (
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={isLoading}
          >
            Cancelar
          </Button>
        )}
      </div>

      {/* Info Alert */}
      {hasChanges && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800 text-sm">
            Tienes cambios sin guardar. Haz clic en "Guardar Cambios" para aplicarlos.
          </AlertDescription>
        </Alert>
      )}
    </form>
  )
}
