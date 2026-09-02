'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { AlertCircle, Loader2, Clock, Calendar, Check, ChevronsUpDown } from 'lucide-react'
import { ExistingMatch, modifyMatchSchedule, ModifyScheduleData } from '../actions'
import { cn } from '@/lib/utils'

interface Club {
  id: string
  name: string
}

interface ModifyScheduleDialogProps {
  match: ExistingMatch
  open: boolean
  onOpenChange: (open: boolean) => void
  onScheduleModified: () => void
  onModifySchedule?: (scheduleData: {matchId: string, date: string | null, startTime: string | null, endTime: string | null, court: string | null, notes?: string, clubId?: string}) => Promise<{success: boolean, error?: string}>
  clubes: Club[]
}

const ModifyScheduleDialog: React.FC<ModifyScheduleDialogProps> = ({
  match,
  open,
  onOpenChange,
  onScheduleModified,
  onModifySchedule,
  clubes
}) => {
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [court, setCourt] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedClubId, setSelectedClubId] = useState('')
  const [openClubCombobox, setOpenClubCombobox] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-fill form with current match schedule
  useEffect(() => {
    if (open && match) {
      setDate(match.scheduled_date || '')
      setStartTime(match.scheduled_start_time || '')
      setEndTime(match.scheduled_end_time || '')
      setCourt(match.court_assignment || '')
      setSelectedClubId(match.club_id || '')
      setNotes('')
      setError(null)
    }
  }, [open, match])

  // Get couple players for display
  const getCouple1Players = () => {
    if (match.couple1?.player1 && match.couple1?.player2) {
      return {
        player1: `${match.couple1.player1.first_name} ${match.couple1.player1.last_name}`,
        player2: `${match.couple1.player2.first_name} ${match.couple1.player2.last_name}`
      }
    }
    return { player1: 'Jugador 1A', player2: 'Jugador 1B' }
  }

  const getCouple2Players = () => {
    if (match.couple2?.player1 && match.couple2?.player2) {
      return {
        player1: `${match.couple2.player1.first_name} ${match.couple2.player1.last_name}`,
        player2: `${match.couple2.player2.first_name} ${match.couple2.player2.last_name}`
      }
    }
    return { player1: 'Jugador 2A', player2: 'Jugador 2B' }
  }

  // Validate form data
  const isValidForm = (): boolean => {
    // Check if there are any changes at all
    const hasChanges =
      date !== (match.scheduled_date || '') ||
      startTime !== (match.scheduled_start_time || '') ||
      endTime !== (match.scheduled_end_time || '') ||
      court !== (match.court_assignment || '') ||
      selectedClubId !== (match.club_id || '') ||
      notes.trim() !== ''

    if (!hasChanges) return false

    // If date, startTime, or endTime are provided, validate time consistency
    if ((startTime || endTime) && startTime && endTime) {
      if (startTime >= endTime) return false
    }

    return true
  }

  // Handle form submission
  const handleSubmit = async () => {
    if (!isValidForm()) {
      setError('Por favor realiza al menos un cambio. Si estableces horarios, la hora de fin debe ser posterior a la de inicio.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const scheduleData = {
        matchId: match.id,
        date: date || null,
        startTime: startTime || null,
        endTime: endTime || null,
        court: court || null,
        notes: notes || undefined,
        clubId: selectedClubId || undefined
      }

      let result

      // Try optimistic update first if available
      if (onModifySchedule) {
        result = await onModifySchedule(scheduleData)
      } else {
        // Fallback to direct server action
        const serverScheduleData: ModifyScheduleData = {
          matchId: match.id,
          date: date || null,
          startTime: startTime || null,
          endTime: endTime || null,
          court: court || null,
          notes: notes || undefined,
          clubId: selectedClubId || undefined
        }
        result = await modifyMatchSchedule(serverScheduleData)
      }

      if (result.success) {
        onScheduleModified()
        onOpenChange(false)
        // Reset form is handled by useEffect when dialog closes
      } else {
        setError(result.error || 'Error al modificar el horario')
      }
    } catch (err) {
      setError('Error inesperado al modificar el horario')
      console.error('Error modifying match schedule:', err)
    } finally {
      setLoading(false)
    }
  }

  // Handle dialog close
  const handleClose = () => {
    if (!loading) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md bg-white border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-slate-900 text-center flex items-center gap-2 justify-center">
            <Clock className="h-5 w-5 text-blue-600" />
            Modificar Datos del Partido
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Match Info */}
          <div className="bg-slate-50 p-3 rounded-surface">
            <div className="text-center text-sm text-slate-600 mb-2">Partido</div>
            <div className="text-center">
              <div className="font-semibold text-slate-900 text-sm">
                {getCouple1Players().player1} / {getCouple1Players().player2}
              </div>
              <div className="text-slate-500 text-xs my-1">vs</div>
              <div className="font-semibold text-slate-900 text-sm">
                {getCouple2Players().player1} / {getCouple2Players().player2}
              </div>
            </div>
          </div>

          {/* Date Field */}
          <div className="space-y-2">
            <Label htmlFor="date" className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Fecha (Opcional)
            </Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full"
              disabled={loading}
            />
          </div>

          {/* Time Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime" className="text-sm font-medium text-slate-700">
                Hora Inicio (Opcional)
              </Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime" className="text-sm font-medium text-slate-700">
                Hora Fin (Opcional)
              </Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full"
                disabled={loading}
              />
            </div>
          </div>

          {/* Court Field */}
          <div className="space-y-2">
            <Label htmlFor="court" className="text-sm font-medium text-slate-700">
              Cancha
            </Label>
            <Input
              id="court"
              type="text"
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              placeholder="Ej: Cancha 1, Central, etc."
              className="w-full"
              disabled={loading}
            />
          </div>

          {/* Club Field */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">
              Club (Opcional)
            </Label>
            <Popover open={openClubCombobox} onOpenChange={setOpenClubCombobox}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openClubCombobox}
                  className="w-full justify-between bg-white border-gray-300 text-slate-900 hover:bg-gray-50"
                  disabled={loading}
                >
                  {selectedClubId
                    ? clubes.find((club) => club.id === selectedClubId)?.name
                    : "Seleccionar club..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Buscar club..." className="h-9" />
                  <CommandList>
                    <CommandEmpty>No se encontró el club.</CommandEmpty>
                    <CommandGroup>
                      {clubes.map((club) => (
                        <CommandItem
                          key={club.id}
                          value={club.name}
                          onSelect={() => {
                            setSelectedClubId(club.id === selectedClubId ? '' : club.id)
                            setOpenClubCombobox(false)
                          }}
                        >
                          {club.name}
                          <Check
                            className={cn(
                              "ml-auto h-4 w-4",
                              selectedClubId === club.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Notes Field */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-medium text-slate-700">
              Notas (opcional)
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones adicionales..."
              className="w-full h-20 resize-none"
              disabled={loading}
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-surface flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
            className="border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValidForm() || loading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando...
              </div>
            ) : (
              'Guardar Cambios'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ModifyScheduleDialog
