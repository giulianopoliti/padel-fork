'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Clock3, Copy, Plus, Scissors, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { applyScheduleDraftOperation, secondsToLocalTime, type ScheduleDraftOperation } from '@/lib/services/schedule-sharing/draft'
import type { ScheduleDraftSlot, ScheduleIssue, SchedulePeriod } from '@/lib/services/schedule-sharing/types'
import { getArgentinaToday, isCivilDate, localTimeToSeconds } from '@/lib/services/schedule-sharing/validation'
import { formatDay } from './display'

const timeAt = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

type Edge = 'move' | 'start' | 'end'
const SlotTimeline = ({ slot, onUpdate }: { slot: ScheduleDraftSlot; onUpdate: (operation: ScheduleDraftOperation) => void }) => {
  const drag = useRef<{ edge: Edge; x: number; width: number } | null>(null)
  const [offset, setOffset] = useState(0)
  const startSeconds = localTimeToSeconds(slot.start_time)
  const endSeconds = localTimeToSeconds(slot.end_time)
  const start = startSeconds / 60
  const end = endSeconds / 60
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null

  const handleStart = (event: PointerEvent<SVGRectElement>, edge: Edge) => {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg || event.button !== 0) return
    drag.current = { edge, x: event.clientX, width: svg.getBoundingClientRect().width }
    svg.setPointerCapture(event.pointerId)
  }
  const dragMinutes = (event: PointerEvent<SVGSVGElement>): number => {
    const active = drag.current
    if (!active || active.width <= 0) return 0
    const delta = Math.round((event.clientX - active.x) * 96 / active.width) * 15
    if (active.edge === 'start') return Math.max(Math.ceil(-start / 15) * 15, Math.min(Math.floor((end - start - 1) / 15) * 15, delta))
    if (active.edge === 'end') return Math.max(Math.ceil((start - end + 1) / 15) * 15, Math.min(Math.floor((1439 - end) / 15) * 15, delta))
    return Math.max(Math.ceil(-start / 15) * 15, Math.min(Math.floor((1439 - end) / 15) * 15, delta))
  }
  const handleEnd = (event: PointerEvent<SVGSVGElement>) => {
    const edge = drag.current?.edge
    const minutes = dragMinutes(event)
    drag.current = null
    setOffset(0)
    if (!edge || !minutes) return
    if (edge === 'move') onUpdate({ type: 'move', key: slot.key, minutes })
    else onUpdate({ type: 'update', key: slot.key, patch: edge === 'start'
      ? { start_time: secondsToLocalTime(startSeconds + minutes * 60) }
      : { end_time: secondsToLocalTime(endSeconds + minutes * 60) } })
  }
  const shownStart = start + (drag.current?.edge !== 'end' ? offset : 0)
  const shownEnd = end + (drag.current?.edge !== 'start' ? offset : 0)
  const handleWidth = Math.min(32, (shownEnd - shownStart) / 3)

  return (
    <div className="space-y-1">
      <svg aria-hidden viewBox="0 0 1440 34" preserveAspectRatio="none" className="h-8 w-full touch-none rounded-md bg-muted"
        onPointerMove={event => { if (drag.current) setOffset(dragMinutes(event)) }}
        onPointerUp={handleEnd} onPointerCancel={() => { drag.current = null; setOffset(0) }}>
        {[180, 360, 540, 720, 900, 1080, 1260].map(minute => <line key={minute} x1={minute} x2={minute} y1={0} y2={34} className="stroke-border" strokeWidth={3} />)}
        <rect x={shownStart} y={4} width={shownEnd - shownStart} height={26} rx={8} className="cursor-grab fill-primary/65 active:cursor-grabbing" onPointerDown={event => handleStart(event, 'move')} />
        <rect x={shownStart} y={4} width={handleWidth} height={26} className="cursor-ew-resize fill-primary" onPointerDown={event => handleStart(event, 'start')} />
        <rect x={shownEnd - handleWidth} y={4} width={handleWidth} height={26} className="cursor-ew-resize fill-primary" onPointerDown={event => handleStart(event, 'end')} />
      </svg>
      <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
        {[0, 180, 360, 540, 720, 900, 1080, 1260, 1440].map((minute, index) => (
          <span key={minute} className={index % 2 ? 'hidden sm:inline' : undefined}>{timeAt(minute)}</span>
        ))}
      </div>
      {offset !== 0 && <p className="text-xs font-medium tabular-nums">{timeAt(Math.floor(shownStart))}–{timeAt(Math.floor(shownEnd))}</p>}
    </div>
  )
}

interface SlotEditorProps {
  slots: readonly ScheduleDraftSlot[]
  period: SchedulePeriod
  onChange?: (slots: ScheduleDraftSlot[]) => void
  issue?: ScheduleIssue
  periodInvalid?: boolean
}

export const SlotEditor = ({ slots, period, onChange, issue, periodInvalid = false }: SlotEditorProps) => {
  const [selection, setSelection] = useState<{ day: string; periodKey: string }>()
  const [copyDate, setCopyDate] = useState('')
  const [copyError, setCopyError] = useState('')
  const [copyNotice, setCopyNotice] = useState('')
  const [splits, setSplits] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const focusSlot = useRef<string | null>(null)
  const today = getArgentinaToday()
  const minDate = period.start_date && period.start_date > today ? period.start_date : today
  const endDate = period.end_date
  const periodKey = `${minDate}/${endDate ?? ''}`
  const canUseDay = (value: string) => isCivilDate(value) && value >= minDate && (!endDate || value <= endDate)
  const expiredPeriodMessage = onChange && !periodInvalid && endDate && endDate < today
    ? `El período de la fecha ya terminó el ${formatDay(endDate)}. Solo se pueden agregar franjas vigentes.`
    : null
  const days = [...new Set(slots.map(slot => slot.date).filter(isCivilDate))].sort()
  const defaultDay = onChange && !periodInvalid && !expiredPeriodMessage ? days.find(canUseDay) ?? minDate : days[0] ?? ''
  // Keep days with draft slots accessible even if the new period excludes them.
  const selectedDay = selection && (
    selection.periodKey === periodKey || canUseDay(selection.day) || days.includes(selection.day)
  ) ? selection.day : defaultDay
  const daySlots = slots.filter(slot => slot.date === selectedDay)
  if (!onChange) daySlots.sort((a, b) => a.start_time.localeCompare(b.start_time))
  const handleDayChange = useCallback((value: string) => {
    setSelection({ day: value, periodKey })
    setCopyDate('')
    setCopyError('')
    setCopyNotice('')
    setError('')
  }, [periodKey])
  useEffect(() => {
    if (!issue?.slot_key) return
    const slot = slots.find(candidate => candidate.key === issue.slot_key)
    if (slot && isCivilDate(slot.date)) handleDayChange(slot.date)
  }, [handleDayChange, issue, slots])

  useEffect(() => {
    setError('')
    setCopyError('')
    setCopyNotice('')
  }, [periodKey])

  const handleCopy = () => {
    if (!onChange) return
    if (!canUseDay(copyDate)) {
      setCopyError('Elegí un día vigente dentro del período de la fecha.')
      return
    }
    if (days.includes(copyDate)) {
      setCopyError('Ese día ya tiene franjas. Elegí un día vacío o editá sus horarios.')
      return
    }
    const result = applyScheduleDraftOperation(slots, { type: 'copy-day', sourceDate: selectedDay, targetDates: [copyDate], mode: 'add' }, { period, today })
    if (!result.ok) {
      setCopyError(result.issues[0].message)
      return
    }
    onChange(result.data)
    handleDayChange(copyDate)
    setCopyNotice(`Franjas del ${formatDay(selectedDay)} copiadas al ${formatDay(copyDate)}.`)
  }
  const apply = (operation: ScheduleDraftOperation) => {
    if (!onChange || periodInvalid) return
    const result = applyScheduleDraftOperation(slots, operation, { period, today })
    if (!result.ok) {
      setError(result.issues[0].message)
      return
    }
    setError('')
    onChange(result.data)
  }
  const edit = (key: string, patch: Partial<ScheduleDraftSlot>) => {
    setError('')
    onChange?.(slots.map(slot => slot.key === key ? { ...slot, ...patch } : slot))
  }
  const add = () => {
    if (!canUseDay(selectedDay)) {
      setError(endDate
        ? `Elegí un día entre el ${formatDay(minDate)} y el ${formatDay(endDate)} para agregar la franja.`
        : `Elegí el ${formatDay(minDate)} o un día posterior para agregar la franja.`)
      return
    }
    const endTimes = daySlots.map(slot => localTimeToSeconds(slot.end_time) / 60).filter(Number.isFinite)
    const lastEnd = endTimes.length ? Math.ceil(Math.max(...endTimes)) : 8 * 60
    const key = crypto.randomUUID()
    focusSlot.current = key
    setSelection({ day: selectedDay, periodKey })
    setError('')
    onChange?.([...slots, { key, date: selectedDay, start_time: lastEnd < 1439 ? timeAt(lastEnd) : '', end_time: lastEnd < 1439 ? timeAt(Math.min(lastEnd + 60, 1439)) : '', max_matches: 1 }])
  }

  return (
    <fieldset aria-label="Días y horarios" disabled={periodInvalid} className="min-w-0 space-y-4 disabled:pointer-events-none">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Franjas por día</h3>
          <p className="text-sm text-muted-foreground">{slots.length} {slots.length === 1 ? 'franja' : 'franjas'} en {days.length} {days.length === 1 ? 'día' : 'días'}</p>
        </div>
        {onChange && <label className="space-y-1 text-sm">Día<Input type="date" min={minDate} max={endDate ?? undefined} value={selectedDay} onChange={event => handleDayChange(event.target.value)} /></label>}
      </div>
      {days.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Días con franjas">
          {days.map(value => (
            <Button key={value} type="button" size="sm" variant={value === selectedDay ? 'default' : 'outline'} aria-pressed={value === selectedDay}
              onClick={() => handleDayChange(value)}>
              {formatDay(value)} · {slots.filter(slot => slot.date === value).length}
            </Button>
          ))}
        </div>
      )}
      {!periodInvalid && (expiredPeriodMessage || error) && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{expiredPeriodMessage || error}</p>}
      {copyNotice && <p role="status" className="rounded-lg bg-muted/50 p-3 text-sm">{copyNotice}</p>}
      {daySlots.length === 0 && !periodInvalid && !expiredPeriodMessage && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{onChange ? 'Este día está libre. Podés agregar una franja o guardar la fecha sin horarios.' : 'No hay horarios compartidos para este día.'}</p>}
      {daySlots.map((slot, index) => (
        <div key={slot.key} className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4 text-primary" aria-hidden />
              {slot.start_time && slot.end_time ? `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}` : 'Horario por definir'}
            </p>
            {onChange && <Button type="button" size="sm" variant="ghost" aria-label={`Eliminar franja ${index + 1}`} onClick={() => { setError(''); onChange(slots.filter(candidate => candidate.key !== slot.key)) }}><Trash2 aria-hidden /></Button>}
          </div>
          {onChange ? (
            <>
              <SlotTimeline slot={slot} onUpdate={apply} />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <label className="space-y-1 text-sm">Inicio<Input className="min-w-0" type="time" step={1} value={slot.start_time}
                  ref={input => {
                    if (!input || focusSlot.current !== slot.key) return
                    focusSlot.current = null
                    input.focus()
                  }}
                  onChange={event => edit(slot.key, { start_time: event.target.value })} /></label>
                <label className="space-y-1 text-sm">Fin<Input className="min-w-0" type="time" step={1} value={slot.end_time} onChange={event => edit(slot.key, { end_time: event.target.value })} /></label>
                <label className="space-y-1 text-sm">Cancha<Input value={slot.court_name ?? ''} onChange={event => edit(slot.key, { court_name: event.target.value })} /></label>
                <label className="space-y-1 text-sm">Capacidad<Input type="number" min={1} step={1} value={slot.max_matches ?? 1} onChange={event => edit(slot.key, { max_matches: Number(event.target.value) })} /></label>
              </div>
              <label className="block space-y-1 text-sm">Descripción de la franja<Input value={slot.description ?? ''} onChange={event => edit(slot.key, { description: event.target.value })} /></label>
              <div className="flex flex-wrap items-end gap-2">
                <label className="space-y-1 text-sm">Dividir a las<Input type="time" value={splits[slot.key] ?? ''} onChange={event => setSplits(previous => ({ ...previous, [slot.key]: event.target.value }))} /></label>
                <Button type="button" variant="outline" disabled={!splits[slot.key]} onClick={() => apply({ type: 'split', key: slot.key, at: splits[slot.key], newKey: crypto.randomUUID() })}><Scissors aria-hidden /> Dividir</Button>
              </div>
            </>
          ) : (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{slot.court_name || 'Sin cancha'} · Capacidad {slot.max_matches ?? 1}</p>
              {slot.description && <p className="break-words">{slot.description}</p>}
            </div>
          )}
        </div>
      ))}
      {onChange && <Button type="button" variant="outline" disabled={!!expiredPeriodMessage} onClick={add}><Plus aria-hidden /> Agregar franja</Button>}
      {onChange && daySlots.length > 0 && (!endDate || minDate < endDate) && (
        <details key={selectedDay} className="space-y-3 rounded-xl border p-4">
          <summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Copy className="mr-2 inline size-4" aria-hidden /> Copiar horarios a otro día</summary>
          <p className="text-sm text-muted-foreground">Repetí los horarios del {formatDay(selectedDay)} en un día vacío.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-sm">Día de destino<Input type="date" min={minDate} max={endDate ?? undefined} value={copyDate}
              onChange={event => { setCopyDate(event.target.value); setCopyError('') }} /></label>
            <Button type="button" variant="secondary" disabled={!copyDate} onClick={handleCopy}>Copiar {daySlots.length} {daySlots.length === 1 ? 'franja' : 'franjas'}</Button>
          </div>
          {copyError && <p role="alert" className="text-sm text-destructive">{copyError}</p>}
        </details>
      )}
    </fieldset>
  )
}
