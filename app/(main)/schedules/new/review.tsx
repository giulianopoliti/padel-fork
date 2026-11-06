import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ScheduleCreationSource, ScheduleDestinationOptions } from '@/lib/services/schedule-sharing/destinations'
import type { ScheduleReviewedBatch } from '@/lib/services/schedule-sharing/rpc'
import type { ScheduleBatchDraft, ScheduleDestination, ScheduleDraftSlot } from '@/lib/services/schedule-sharing/types'
import { cupLabels, formatDay, formatPeriod, roundLabels } from '../display'

interface Props {
  data: ScheduleReviewedBatch
  payload: ScheduleBatchDraft
  options: ScheduleDestinationOptions
  source: ScheduleCreationSource | null
  clubName: (id: string) => string
  locked: boolean
  editableDestination: (id: string) => ScheduleDestination | undefined
  onAdoptionChange: (id: string, key: string, value: string) => void
  onExclude: (id: string) => void
  canExclude: (id: string) => boolean
}

export const ScheduleReview = ({ data, payload, options, source, clubName, locked, editableDestination, onAdoptionChange, onExclude, canExclude }: Props) => {
  const slotsByDay = new Map<string, ScheduleDraftSlot[]>()
  const orderedSlots = [...payload.slots].sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
  for (const slot of orderedSlots) {
    const day = slotsByDay.get(slot.date)
    if (day) day.push(slot)
    else slotsByDay.set(slot.date, [slot])
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{payload.metadata.name} · {formatPeriod(payload.metadata.start_date, payload.metadata.end_date)}</p>
      {!data.preview.can_commit && <p className="text-sm font-medium text-destructive">Resolvé los conflictos y volvé a revisar para guardar.</p>}
      {data.preview.destinations.map(row => {
        const id = row.tournament_id
        const destination = payload.destinations.find(item => item.tournament_id === id)
        if (!destination) return null
        const editable = editableDestination(id)
        const fechaId = destination.fecha.kind === 'adopt' ? destination.fecha.fecha_id : null
        const fecha = fechaId === source?.fecha.id ? source.fecha
          : options.find(option => option.tournament_id === id)?.fechas.find(item => item.id === fechaId)
        const choice = destination.court_choice
        const additions = new Map(row.new_slots.map(slot => [slot.key, slot]))
        const reused = new Set(row.reused_slots.map(slot => slot.key))
        const conflicts = new Set(row.conflicts.map(conflict => conflict.slot_key))
        return (
          <section key={id} aria-labelledby={`schedule-reviewed-${id}`} className="space-y-3 rounded-lg border bg-background p-3 sm:p-4">
            <div>
              <h3 id={`schedule-reviewed-${id}`} className="font-semibold">{row.tournament_name}</h3>
              <p className="text-sm text-muted-foreground">{clubName(id)}</p>
            </div>
            <div className="space-y-1 text-sm">
              <p className="font-medium">{fechaId ? 'Fecha existente' : 'Fecha nueva'} · Fecha {fecha?.fecha_number ?? row.fecha_number} · {fecha?.name ?? payload.metadata.name}</p>
              <p className="text-muted-foreground">{roundLabels[destination.round_type]} · {cupLabels[destination.bracket_key]}</p>
              {row.transition_to_zone_phase && <p className="text-muted-foreground">El torneo iniciará la fase de zonas.</p>}
              {row.preserves_local_metadata && <p className="text-muted-foreground">Se conservarán los datos locales de la fecha existente.</p>}
            </div>
            {slotsByDay.size ? (
              <ul aria-label="Franjas del torneo" className="divide-y rounded-lg border px-3 text-sm">
                {[...slotsByDay].map(([day, daySlots]) => (
                  <li key={day} className="space-y-1 py-2">
                    <p className="font-semibold tabular-nums">{formatDay(day)}</p>
                    <ul>
                      {daySlots.map(draftSlot => {
                        const addition = additions.get(draftSlot.key)
                        const slot = addition ?? draftSlot
                        const court = addition ? addition.court_name
                          : choice === 'clear' ? null : choice === 'preserve' ? slot.court_name : choice.rename[slot.key]
                        const hasConflict = conflicts.has(slot.key)
                        const status = hasConflict ? 'Conflicto' : addition ? 'Se crea' : reused.has(slot.key) ? 'Se reutiliza' : 'Conflicto'
                        return (
                          <li key={slot.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5">
                            <div className="min-w-0">
                              <p className="font-medium tabular-nums">{slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</p>
                              <p className="text-muted-foreground">{court?.trim() || 'Sin cancha'} · Capacidad {slot.max_matches ?? 1}</p>
                            </div>
                            <Badge variant={status === 'Conflicto' ? 'destructive' : 'secondary'}>{status}</Badge>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Fecha sin franjas.</p>}
            {row.conflicts.map((conflict, index) => {
              const key = conflict.slot_key
              const slot = key && payload.slots.find(item => item.key === key)
              const selected = key && editable?.slot_adoptions?.[key]
              return (
                <div key={`${conflict.code}-${key ?? ''}-${index}`} className="space-y-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm">
                  {slot && <p className="font-medium tabular-nums">{formatDay(slot.date)} · {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</p>}
                  <p>{conflict.message}</p>
                  {editable && key && !!conflict.candidate_ids?.length && (
                    <label className="block space-y-1.5 font-medium">Horario existente a reutilizar
                      <select className="block h-10 w-full min-w-0 rounded-control border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={locked} value={selected || ''} onChange={event => onAdoptionChange(id, key, event.target.value)}>
                        <option value="">Elegir coincidencia</option>
                        {conflict.candidate_ids.map((candidate, i) => <option key={candidate} value={candidate}>Opción {i + 1} · {candidate.slice(-8)}</option>)}
                      </select>
                    </label>
                  )}
                  {key && selected && !conflict.candidate_ids?.length && (
                    <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => onAdoptionChange(id, key, '')}>Quitar coincidencia elegida</Button>
                  )}
                </div>
              )
            })}
            {!!row.conflicts.length && editable && !locked && (
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="outline"><a href={`#schedule-tournament-${id}`}>Editar destino</a></Button>
                {canExclude(id) && <Button type="button" size="sm" variant="ghost" onClick={() => onExclude(id)}>Excluir este destino</Button>}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
