'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CalendarDays, CalendarX2, Check, Circle, Clock, Info, Users, X } from 'lucide-react'
import { toast } from 'sonner'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import type { PlayerScheduleData, TimeSlot, UserAccess } from '../types'
import { getPlayerScheduleData, updateCoupleAvailability, updateFreeDatePreference } from '../actions'
import { formatDateWithWeekday } from '../utils'
import { partitionLongScheduleSlots } from '@/lib/services/long-schedule-slots'
import { InlineError } from './ErrorStates'
import { PlayerAvailabilitySkeleton } from './LoadingStates'

interface PlayerViewProps {
  tournamentId: string
  fechaId: string
  userAccess: UserAccess
}

export default function PlayerView({ tournamentId, fechaId, userAccess }: PlayerViewProps) {
  const [scheduleData, setScheduleData] = useState<PlayerScheduleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingSlotId, setSavingSlotId] = useState<string | null>(null)

  const loadPlayerData = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getPlayerScheduleData(tournamentId, fechaId)
      if (!result.success || !result.data) {
        setError(result.error || 'No se pudieron cargar los horarios')
        return
      }
      setScheduleData(result.data)
    } catch (loadError) {
      console.error('Error loading player schedule data:', loadError)
      setError('Error inesperado al cargar los horarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPlayerData()
  }, [tournamentId, fechaId])

  const handleAvailabilityChange = async (timeSlotId: string, isAvailable: boolean, notes?: string) => {
    if (!scheduleData || !userAccess.coupleId) return false
    if (!scheduleData.can_edit_availability) {
      toast.error(scheduleData.availability_restriction_reason || 'No podes responder esta fecha.')
      return false
    }

    setSavingSlotId(timeSlotId)
    try {
      const result = await updateCoupleAvailability({
        time_slot_id: timeSlotId,
        couple_id: userAccess.coupleId,
        is_available: isAvailable,
        notes: notes || undefined,
      })
      if (!result.success) {
        toast.error(result.error)
        return false
      }

      setScheduleData(previous => previous ? {
        ...previous,
        timeSlots: previous.timeSlots.map(slot => slot.id === timeSlotId ? {
          ...slot,
          my_availability: {
            couple_id: userAccess.coupleId!,
            is_available: isAvailable,
            notes: notes || null,
          },
        } : slot),
      } : previous)
      toast.success(isAvailable ? 'Marcado como disponible' : 'Marcado como no disponible')
      return true
    } catch (saveError) {
      console.error('Error updating availability:', saveError)
      toast.error('No se pudo guardar la respuesta')
      return false
    } finally {
      setSavingSlotId(null)
    }
  }

  const handleFreeDateChange = async (timeSlotId: string, requested: boolean, notes?: string) => {
    if (!scheduleData || !userAccess.coupleId) return false
    if (!scheduleData.can_edit_availability) {
      toast.error(scheduleData.availability_restriction_reason || 'No podes responder esta fecha.')
      return false
    }

    setSavingSlotId(timeSlotId)
    try {
      const result = await updateFreeDatePreference({
        time_slot_id: timeSlotId,
        couple_id: userAccess.coupleId,
        requested,
        notes: notes || undefined,
      })
      if (!result.success) {
        toast.error(result.error)
        return false
      }

      setScheduleData(previous => previous ? {
        ...previous,
        timeSlots: previous.timeSlots.map(slot => slot.id === timeSlotId ? {
          ...slot,
          my_availability: requested ? {
            couple_id: userAccess.coupleId!,
            is_available: true,
            notes: notes || null,
          } : undefined,
        } : slot),
      } : previous)
      toast.success(requested ? 'Fecha libre solicitada' : 'Solicitud de fecha libre cancelada')
      return true
    } catch (saveError) {
      console.error('Error updating free date preference:', saveError)
      toast.error('No se pudo guardar la solicitud')
      return false
    } finally {
      setSavingSlotId(null)
    }
  }

  if (loading) return <PlayerAvailabilitySkeleton />
  if (error) return <InlineError message={error} onRetry={() => void loadPlayerData()} />
  if (!scheduleData) return <InlineError message="No se pudieron cargar los horarios" />
  if (!userAccess.coupleId) return <InlineError message="No encontramos una pareja asociada a tu inscripcion." />

  const { timeSlots, coupleInfo, can_edit_availability: canEdit = true, availability_restriction_reason: restrictionReason } = scheduleData
  const { freeDateSlot, playableTimeSlots } = partitionLongScheduleSlots(timeSlots)

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 shadow-sm">
        <CardContent className="flex items-start gap-3 p-4 sm:p-5">
          <div className="rounded-elevated bg-primary p-3 text-primary-foreground"><Users className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Horarios de tu pareja</h2>
            <p className="truncate font-semibold text-primary">{coupleInfo?.player1_name} / {coupleInfo?.player2_name}</p>
            <p className="mt-1 text-sm text-muted-foreground">Responde por ambos jugadores en cada horario.</p>
          </div>
        </CardContent>
      </Card>

      {!canEdit && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex gap-3 p-4 text-amber-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div><p className="font-semibold">Disponibilidad en modo lectura</p><p className="text-sm">{restrictionReason || 'Todavia no podes responder esta fecha.'}</p></div>
          </CardContent>
        </Card>
      )}

      <Accordion type="single" collapsible>
        <AccordionItem value="instructions" className="rounded-elevated border bg-card px-4">
          <AccordionTrigger className="hover:no-underline"><span className="flex items-center gap-2 text-sm font-semibold"><Info className="h-4 w-4 text-primary" />Como responder</span></AccordionTrigger>
          <AccordionContent className="space-y-2 text-sm text-muted-foreground">
            <p>Marca Disponible solo cuando ambos integrantes puedan jugar.</p>
            <p>Disponible y No disponible se guardan como respuestas confirmadas y pueden cambiarse despues.</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {playableTimeSlots.length === 0 ? (
        <Card><CardContent className="p-8 text-center"><Clock className="mx-auto h-10 w-10 text-muted-foreground" /><h3 className="mt-3 font-semibold">Sin horarios publicados</h3><p className="mt-1 text-sm text-muted-foreground">El organizador todavia no configuro horarios para esta fecha.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {playableTimeSlots.map(timeSlot => (
            <TimeSlotAvailabilityCard
              key={timeSlot.id}
              timeSlot={timeSlot}
              onAvailabilityChange={handleAvailabilityChange}
              saving={savingSlotId === timeSlot.id}
              disabled={!canEdit}
            />
          ))}
        </div>
      )}

      {freeDateSlot && (
        <FreeDateRequestCard
          timeSlot={freeDateSlot}
          onPreferenceChange={handleFreeDateChange}
          saving={savingSlotId === freeDateSlot.id}
          disabled={!canEdit}
        />
      )}
    </div>
  )
}

interface FreeDateRequestCardProps {
  timeSlot: TimeSlot & { my_availability?: { couple_id: string; is_available: boolean; notes?: string | null } }
  onPreferenceChange: (timeSlotId: string, requested: boolean, notes?: string) => Promise<boolean>
  saving: boolean
  disabled: boolean
}

const FreeDateRequestCard = ({ timeSlot, onPreferenceChange, saving, disabled }: FreeDateRequestCardProps) => {
  const initialRequested = timeSlot.my_availability?.is_available === true
  const [requested, setRequested] = useState(initialRequested)
  const [notes, setNotes] = useState(timeSlot.my_availability?.notes || '')
  const [savedNotes, setSavedNotes] = useState(timeSlot.my_availability?.notes || '')
  const [confirmationOpen, setConfirmationOpen] = useState(false)

  const handleRequestChange = async (nextRequested: boolean) => {
    setRequested(nextRequested)
    const saved = await onPreferenceChange(timeSlot.id, nextRequested, nextRequested ? notes : undefined)
    if (!saved) setRequested(!nextRequested)
    if (saved && !nextRequested) {
      setNotes('')
      setSavedNotes('')
    }
  }

  const handlePrimaryAction = () => {
    if (requested) {
      void handleRequestChange(false)
      return
    }

    setConfirmationOpen(true)
  }

  const handleConfirmRequest = () => {
    setConfirmationOpen(false)
    void handleRequestChange(true)
  }

  const handleNotesBlur = async () => {
    if (!requested || notes === savedNotes) return
    const saved = await onPreferenceChange(timeSlot.id, true, notes)
    if (saved) setSavedNotes(notes)
  }

  return (
    <>
      <Card className={requested ? 'border-amber-400 bg-amber-50/80' : 'border-border bg-card'}>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className={requested ? 'rounded-elevated bg-amber-500 p-3 text-white' : 'rounded-elevated bg-muted p-3 text-muted-foreground'}>
              <CalendarX2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-bold">No podemos jugar este finde</h3>
                {requested && <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-bold text-amber-900">Fecha libre solicitada</span>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Usa esta opción solamente si ninguno de los horarios de arriba les sirve.</p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className={requested ? 'min-h-12 w-full border-amber-500 bg-white text-amber-900 hover:bg-amber-100' : 'min-h-12 w-full'}
            onClick={handlePrimaryAction}
            disabled={saving || disabled}
            aria-pressed={requested}
          >
            <CalendarX2 className="mr-2 h-4 w-4" />
            {requested ? 'Cancelar fecha libre' : 'No podemos jugar este finde'}
          </Button>

          {requested && (
            <div className="space-y-2">
              <label htmlFor={`free-date-note-${timeSlot.id}`} className="text-sm font-semibold">Motivo opcional</label>
              <p className="text-xs text-muted-foreground">Los horarios en los que pueden jugar se cargan arriba.</p>
              <Textarea
                id={`free-date-note-${timeSlot.id}`}
                value={notes}
                onChange={event => setNotes(event.target.value)}
                onBlur={() => void handleNotesBlur()}
                disabled={saving || disabled}
                maxLength={200}
                rows={2}
                placeholder="Ej: estamos de viaje este fin de semana"
              />
            </div>
          )}
          {saving && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Circle className="h-3 w-3 animate-pulse fill-current" />Guardando solicitud...</p>}
        </CardContent>
      </Card>

      <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmás que no pueden jugar en ningún horario este finde?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta opción indica que ninguno de los horarios publicados les sirve. Si pueden jugar en algún horario, márquenlo arriba.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver a los horarios</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRequest} className="bg-amber-600 text-white hover:bg-amber-700">
              Confirmar fecha libre
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

interface TimeSlotAvailabilityCardProps {
  timeSlot: TimeSlot & { my_availability?: { couple_id: string; is_available: boolean; notes?: string | null } }
  onAvailabilityChange: (timeSlotId: string, isAvailable: boolean, notes?: string) => Promise<boolean>
  saving: boolean
  disabled: boolean
}

const TimeSlotAvailabilityCard = ({ timeSlot, onAvailabilityChange, saving, disabled }: TimeSlotAvailabilityCardProps) => {
  const [availability, setAvailability] = useState<boolean | null>(timeSlot.my_availability?.is_available ?? null)
  const [notes, setNotes] = useState(timeSlot.my_availability?.notes || '')
  const [savedNotes, setSavedNotes] = useState(timeSlot.my_availability?.notes || '')

  const handleSelect = async (nextValue: boolean) => {
    const previousValue = availability
    setAvailability(nextValue)
    const saved = await onAvailabilityChange(timeSlot.id, nextValue, notes)
    if (!saved) setAvailability(previousValue)
  }

  const handleNotesBlur = async () => {
    if (availability === null || notes === savedNotes) return
    const saved = await onAvailabilityChange(timeSlot.id, availability, notes)
    if (saved) setSavedNotes(notes)
  }

  const statusClass = availability === true
    ? 'bg-emerald-100 text-emerald-700'
    : availability === false
      ? 'bg-rose-100 text-rose-700'
      : 'bg-muted text-muted-foreground'

  return (
    <Card className={availability === true ? 'border-emerald-300' : availability === false ? 'border-rose-200' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg"><span className="rounded-surface bg-primary/10 p-2 text-primary"><CalendarDays className="h-4 w-4" /></span>{formatDateWithWeekday(timeSlot.date)}</CardTitle>
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Clock className="h-4 w-4" />{timeSlot.start_time.slice(0, 5)} - {timeSlot.end_time.slice(0, 5)}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusClass}`}>{availability === true ? 'Disponible' : availability === false ? 'No disponible' : 'Sin responder'}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {timeSlot.description && <p className="rounded-elevated bg-muted/70 p-3 text-sm text-muted-foreground">{timeSlot.description}</p>}
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={`Disponibilidad para ${formatDateWithWeekday(timeSlot.date)}`}>
          <Button type="button" variant="outline" disabled={saving || disabled} onClick={() => void handleSelect(true)} aria-pressed={availability === true} className={`min-h-12 gap-2 ${availability === true ? 'border-emerald-500 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : ''}`}><Check className="h-4 w-4" />Disponible</Button>
          <Button type="button" variant="outline" disabled={saving || disabled} onClick={() => void handleSelect(false)} aria-pressed={availability === false} className={`min-h-12 gap-2 ${availability === false ? 'border-rose-400 bg-rose-50 text-rose-800 hover:bg-rose-100' : ''}`}><X className="h-4 w-4" />No disponible</Button>
        </div>
        {availability !== null && (
          <Accordion type="single" collapsible>
            <AccordionItem value="notes" className="rounded-elevated border px-3">
              <AccordionTrigger className="py-3 text-sm hover:no-underline">Nota opcional</AccordionTrigger>
              <AccordionContent><Textarea value={notes} onChange={event => setNotes(event.target.value)} onBlur={() => void handleNotesBlur()} disabled={saving || disabled} maxLength={200} rows={2} placeholder="Ej: podemos a partir de las 19" /></AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        {saving && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Circle className="h-3 w-3 animate-pulse fill-current" />Guardando respuesta...</p>}
      </CardContent>
    </Card>
  )
}
