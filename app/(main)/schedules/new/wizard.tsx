'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { ScheduleCreationSource, ScheduleDestinationOptions } from '@/lib/services/schedule-sharing/destinations'
import type { ScheduleReviewedBatch } from '@/lib/services/schedule-sharing/rpc'
import type { ScheduleBatchDraft, ScheduleDestination, ScheduleDraftSlot, ScheduleMetadata } from '@/lib/services/schedule-sharing/types'
import { validateSchedulePeriod, validateScheduleSlots } from '@/lib/services/schedule-sharing/validation'
import { MAX_SCHEDULE_BATCH_PHYSICAL_SLOTS, MAX_SCHEDULE_BATCH_TARGETS } from '@/lib/services/schedule-sharing/batch'
import { commitScheduleBatchAction, loadScheduleDestinationOptionsAction, previewScheduleBatchAction } from '../actions'
import { cupLabels, formatDay, formatPeriod, roundLabels } from '../display'
import { SlotEditor } from '../SlotEditor'

type Tournament = { id: string; name: string; club_id: string | null; category_name: string | null; eligible: boolean; status: string }
interface Props {
  tournaments: Tournament[]
  clubs: { id: string; name: string }[]
  source: ScheduleCreationSource | null
  initialTournament?: string
  initialClub: string | null
  back: string
  template?: { id: string; metadata: ScheduleMetadata; slots: ScheduleDraftSlot[]; pastCount: number; detached: string[]; completeMemberId?: string }
}
const selectStyle = 'h-10 w-full rounded-control border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const roundKey = (option: Pick<ScheduleDestination, 'round_type' | 'bracket_key'>) => `${option.round_type}:${option.bracket_key}`
const blankMetadata: ScheduleMetadata = { name: '', description: null, start_date: null, end_date: null }
const defaultDestination = (id: string, fecha?: ScheduleCreationSource['fecha']): ScheduleDestination => ({
  tournament_id: id,
  fecha: fecha ? { kind: 'adopt', fecha_id: fecha.id } : { kind: 'create' },
  round_type: fecha?.round_type ?? 'ZONE',
  bracket_key: fecha?.bracket_key ?? 'MAIN',
  estimated_match_duration_minutes: fecha?.estimated_match_duration_minutes ?? 90,
  max_matches_per_couple: fecha?.max_matches_per_couple ?? null,
  court_choice: 'preserve',
})

export const ScheduleWizard = ({ tournaments, clubs, source, initialTournament, initialClub, back, template }: Props) => {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [ids, setIds] = useState(initialTournament ? [initialTournament] : [])
  const [clubIds, setClubIds] = useState<string[]>(() => {
    const contextClub = initialClub ?? (initialTournament ? 'none' : null)
    return contextClub && tournaments.some(tournament => tournament.eligible && (tournament.club_id ?? 'none') === contextClub)
      ? [contextClub]
      : []
  })
  const [search, setSearch] = useState('')
  const [metadata, setMetadata] = useState<ScheduleMetadata>(() => template?.metadata ?? (source ? {
    name: source.fecha.name, description: source.fecha.description, start_date: source.fecha.start_date, end_date: source.fecha.end_date,
  } : blankMetadata))
  const [slots, setSlots] = useState<ScheduleDraftSlot[]>(template?.slots ?? source?.slots ?? [])
  const [options, setOptions] = useState<ScheduleDestinationOptions>([])
  const [destinations, setDestinations] = useState<ScheduleDestination[]>([])
  const [courtsReviewed, setCourtsReviewed] = useState<string[]>([])
  const [review, setReview] = useState<{ data: ScheduleReviewedBatch; payload: ScheduleBatchDraft; signature: string }>()
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [confirmAgain, setConfirmAgain] = useState(false)
  const [dirty, setDirty] = useState(false)
  const operation = useRef<{ signature: string; key: string } | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!dirty || saved) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, saved])

  const byId = new Map(tournaments.map(tournament => [tournament.id, tournament]))
  const byClub = new Map(clubs.map(item => [item.id, item.name]))
  const eligible = tournaments.filter(tournament => tournament.eligible)
  const availableClubs = new Set(eligible.map(tournament => tournament.club_id ?? 'none'))
  const searchTerm = search.trim().toLocaleLowerCase('es')
  const shown = eligible.filter(tournament => (!clubIds.length || clubIds.includes(tournament.club_id ?? 'none'))
    && `${tournament.name} ${tournament.category_name ?? ''}`.toLocaleLowerCase('es').includes(searchTerm))
  const sourceId = source?.fecha.tournament_id
  const sharingExisting = source && !template ? source : null
  const steps = ['Torneos', sharingExisting ? 'Fechas de destino' : 'Datos de la fecha', 'Días y horarios', 'Revisión']
  const multiClub = new Set(ids.map(id => byId.get(id)?.club_id ?? null)).size > 1
  const crossClub = (id: string) => !!template || (sourceId ? byId.get(id)?.club_id !== byId.get(sourceId)?.club_id : multiClub)
  const hasCourtLabels = slots.some(slot => !!slot.court_name?.trim())
  const needsCourtReview = hasCourtLabels && ids.some(id => crossClub(id) && !courtsReviewed.includes(id))
  const physicalCount = slots.length * ids.length
  const body = { ...(template ? { group_id: template.id, complete_member_id: template.completeMemberId } : {}), source_fecha_id: template ? null : source?.fecha.id ?? null, metadata, slots, destinations }
  const signature = JSON.stringify(body)
  const currentReview = review?.signature === signature ? review : undefined

  const go = (next: number) => {
    setError('')
    setStep(next)
    requestAnimationFrame(() => heading.current?.focus())
  }
  const updateMetadata = (patch: Partial<ScheduleMetadata>) => {
    setDirty(true)
    setMetadata(previous => ({ ...previous, ...patch }))
  }
  const updateSlots = (next: ScheduleDraftSlot[]) => {
    setDirty(true)
    setCourtsReviewed([])
    setDestinations(previous => previous.map(destination => ({ ...destination, slot_adoptions: undefined })))
    setSlots(next)
  }
  const updateDestination = (id: string, patch: Partial<ScheduleDestination>) => {
    setDirty(true)
    setDestinations(previous => previous.map(destination => destination.tournament_id === id ? { ...destination, ...patch } : destination))
  }
  const select = (next: string[]) => {
    const unique = [...new Set(next)]
    if (unique.length > MAX_SCHEDULE_BATCH_TARGETS) {
      setError(`Podés elegir hasta ${MAX_SCHEDULE_BATCH_TARGETS} torneos por operación.`)
      return
    }
    setDirty(true)
    setError('')
    setCourtsReviewed([])
    setIds(unique)
  }
  const handleDestinations = () => {
    setError('')
    startTransition(async () => {
      try {
        const result = await loadScheduleDestinationOptionsAction(ids)
        if (!result.success) return setError(result.error)
        setOptions(result.data)
        setDestinations(ids.map(id => destinations.find(destination => destination.tournament_id === id)
          ?? defaultDestination(id, id === sourceId ? source?.fecha : undefined)))
        go(1)
      } catch {
        setError('Se interrumpió la conexión. Volvé a intentar.')
      }
    })
  }
  const handleMetadata = () => {
    if (!metadata.name.trim()) return setError('Ingresá un nombre para la fecha.')
    const issues = validateSchedulePeriod(metadata)
    if (issues.length) return setError(issues[0].message)
    for (const destination of destinations) {
      if (destination.fecha.kind !== 'adopt' || template?.completeMemberId) continue
      const id = destination.fecha.fecha_id
      const date = id === source?.fecha.id ? source.fecha : options.find(option => option.tournament_id === destination.tournament_id)?.fechas.find(fecha => fecha.id === id)
      if (!date || date.start_date !== metadata.start_date || date.end_date !== metadata.end_date) {
        return setError('La fecha existente tiene otro período. Elegí una fecha compatible o creá una nueva en ese torneo.')
      }
    }
    go(2)
  }
  const handleReviewStep = () => {
    if (template?.completeMemberId && !slots.length) return setError('Ya no hay horarios faltantes vigentes en este torneo.')
    const result = validateScheduleSlots(slots, { period: metadata })
    if (!result.ok) return setError(result.issues[0].message)
    if (physicalCount > MAX_SCHEDULE_BATCH_PHYSICAL_SLOTS) return setError(`Reducí la selección a un máximo de ${MAX_SCHEDULE_BATCH_PHYSICAL_SLOTS} horarios en total.`)
    if (needsCourtReview) return setError('Elegí cómo aplicar los nombres de las canchas en cada club.')
    go(3)
    if (!currentReview) handlePreview()
  }
  const handlePreview = () => {
    setError('')
    if (operation.current?.signature !== signature) operation.current = { signature, key: crypto.randomUUID() }
    const payload = { ...body, operation_key: operation.current.key }
    startTransition(async () => {
      try {
        const result = await previewScheduleBatchAction(payload)
        if (!result.success) return setError(result.error)
        setReview({ data: result.data, payload, signature })
      } catch {
        setError('Se interrumpió la conexión. Volvé a revisar los destinos.')
      }
    })
  }
  const handleCommit = () => {
    if (!currentReview?.data.preview.can_commit) return
    setError('')
    startTransition(async () => {
      try {
        const result = await commitScheduleBatchAction(currentReview.payload, currentReview.data.revision)
        setConfirmAgain(false)
        if (!result.success) {
          setReview(undefined)
          return setError(result.error)
        }
        setSaved(true)
        router.push(template ? back : `/schedules/${result.data.group_id}?back=${encodeURIComponent(back)}`)
      } catch {
        setConfirmAgain(true)
        setError('Se interrumpió la conexión. Volvé a confirmar para recuperar el resultado de esta operación.')
      }
    })
  }
  const handleCancel = () => {
    if (!dirty || window.confirm('¿Descartar los cambios del borrador?')) router.push(back)
  }
  const commonRounds = options[0]?.rounds.filter(option => options.every(row => row.rounds.some(candidate => roundKey(candidate) === roundKey(option)))) ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2 border-b pb-5">
        <p className="text-sm font-medium text-primary">Fechas y horarios</p>
        <h1 className="text-3xl font-bold tracking-tight">{template?.completeMemberId ? 'Completar horarios faltantes' : template ? 'Agregar torneos' : source ? 'Compartir esta fecha' : 'Crear fecha compartida'}</h1>
        <p className="text-muted-foreground">{template?.metadata.name ?? (sharingExisting
          ? 'Elegí en qué torneos querés usar los horarios de una fecha que ya existe.'
          : 'Configurá una fecha y elegí los torneos donde querés aplicarla.')}</p>
        {sharingExisting && (
          <div className="space-y-1 rounded-lg border bg-muted/35 p-3 sm:p-4">
            <p className="text-xs font-medium text-muted-foreground">Fecha de origen</p>
            <p className="break-words font-semibold">{sharingExisting.fecha.name} · {byId.get(sharingExisting.fecha.tournament_id)?.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatPeriod(sharingExisting.fecha.start_date, sharingExisting.fecha.end_date)} · {sharingExisting.slots.length} {sharingExisting.slots.length === 1 ? 'franja vigente' : 'franjas vigentes'}
            </p>
            <p className="text-sm text-muted-foreground">Se comparten las franjas del período. Las respuestas de las parejas y los partidos quedan en su torneo.</p>
          </div>
        )}
      </header>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Pasos de la configuración">
        {steps.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className={`rounded-lg border px-3 py-2 text-sm ${index === step ? 'border-primary bg-primary/5 font-semibold' : 'text-muted-foreground'}`}>{index + 1}. {label}</li>)}
      </ol>
      <fieldset disabled={pending || saved} className="min-w-0 space-y-5">
        <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">{steps[step]}</h2>
        {step === 0 && (
          <div className="space-y-4">
            {availableClubs.size > 1 && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Filtrar por clubes</legend>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant={clubIds.length ? 'outline' : 'secondary'} size="sm" aria-pressed={!clubIds.length} onClick={() => setClubIds([])}>Todos los clubes</Button>
                  {[...clubs, { id: 'none', name: 'Sin club asignado' }].filter(item => availableClubs.has(item.id)).map(item => (
                    <Button key={item.id} type="button" variant={clubIds.includes(item.id) ? 'secondary' : 'outline'} size="sm"
                      aria-pressed={clubIds.includes(item.id)} className="h-auto min-h-8 max-w-full whitespace-normal"
                      onClick={() => setClubIds(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id])}>
                      {item.name}
                    </Button>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="block space-y-1 text-sm">Buscar torneo<Input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre o categoría" /></label>
            <section aria-label="Torneos seleccionados" className="space-y-2 rounded-lg bg-muted/40 p-3">
              <p className="text-sm font-semibold" aria-live="polite">{ids.length} {ids.length === 1 ? 'torneo seleccionado' : 'torneos seleccionados'}</p>
              {ids.length > 0 && <ul className="flex flex-wrap gap-2">
                {ids.map(id => <li key={id} className="flex max-w-full items-center gap-1 rounded-md border bg-background py-0.5 pl-2 pr-1 text-sm">
                  <span className="break-words">{byId.get(id)?.name}</span>
                  {id === sourceId ? <span className="pr-1 text-xs text-muted-foreground">Origen</span> : (
                    <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Quitar ${byId.get(id)?.name}`}
                      onClick={() => select(ids.filter(selected => selected !== id))}><X aria-hidden /></Button>
                  )}
                </li>)}
              </ul>}
            </section>
            {shown.length > 0 && (
              <Button type="button" variant="outline" size="sm" disabled={shown.every(tournament => ids.includes(tournament.id))}
                onClick={() => select([...ids, ...shown.map(tournament => tournament.id)])}>
                Seleccionar {shown.length === 1 ? '1 resultado visible' : `los ${shown.length} resultados visibles`}
              </Button>
            )}
            {shown.length === 0 && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{eligible.length ? 'No hay torneos con estos filtros.' : 'No hay torneos disponibles para aplicar esta fecha.'}</p>}
            {[...new Set(shown.map(tournament => tournament.club_id))].map(clubId => {
              const clubRows = shown.filter(tournament => tournament.club_id === clubId)
              return (
                <section key={clubId ?? 'none'} className="overflow-hidden rounded-xl border bg-card">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2">
                    <h3 className="text-sm font-semibold">{byClub.get(clubId ?? '') ?? 'Sin club asignado'}</h3>
                  </div>
                  <div className="divide-y">
                    {clubRows.map(tournament => (
                      <label key={tournament.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                        <input className="mt-1 size-4 accent-primary" type="checkbox" checked={ids.includes(tournament.id)} disabled={tournament.id === sourceId}
                          onChange={event => select(event.target.checked ? [...ids, tournament.id] : ids.filter(id => id !== tournament.id))} />
                        <span className="min-w-0"><span className="block break-words font-medium">{tournament.name}{tournament.id === initialTournament ? ' · Torneo actual' : ''}</span>
                          <span className="text-xs text-muted-foreground">{[tournament.category_name, tournament.status === 'NOT_STARTED' ? 'Por comenzar' : 'En curso', template?.detached.includes(tournament.id) ? 'Volver a vincular' : null].filter(Boolean).join(' · ')}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
        {step === 1 && (
          <div className="space-y-4">
            <label className="block space-y-1 text-sm">{sharingExisting ? 'Nombre para el grupo y las fechas nuevas' : 'Nombre de la fecha'}<Input readOnly={!!template} maxLength={200} value={metadata.name} onChange={event => updateMetadata({ name: event.target.value })} /></label>
            <label className="block space-y-1 text-sm">Descripción opcional<Textarea readOnly={!!template} value={metadata.description ?? ''} onChange={event => updateMetadata({ description: event.target.value || null })} /></label>
            {source || template ? (
              <p className="text-sm text-muted-foreground">Período compartido · {formatPeriod(metadata.start_date, metadata.end_date)}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-sm">Inicio del período<Input className="min-w-0" type="date" value={metadata.start_date ?? ''} onChange={event => updateMetadata({ start_date: event.target.value || null })} /></label>
                <label className="space-y-1 text-sm">Fin del período<Input className="min-w-0" type="date" value={metadata.end_date ?? ''} onChange={event => updateMetadata({ end_date: event.target.value || null })} /></label>
              </div>
            )}
            {sharingExisting && <p className="text-sm text-muted-foreground">Por cada torneo, elegí dónde aplicar las franjas. Las fechas que ya existen conservan sus datos.</p>}
            {commonRounds.length > 1 && (
              <label className="block space-y-1 text-sm">Ronda y copa común para fechas nuevas
                <select className={selectStyle} value="" onChange={event => {
                  const selected = commonRounds.find(option => roundKey(option) === event.target.value)
                  if (!selected) return
                  setDirty(true)
                  setDestinations(previous => previous.map(destination => destination.fecha.kind === 'create' ? { ...destination, ...selected } : destination))
                }}>
                  <option value="">Elegir para aplicar</option>
                  {commonRounds.map(option => <option key={roundKey(option)} value={roundKey(option)}>{roundLabels[option.round_type]} · {cupLabels[option.bracket_key]}</option>)}
                </select>
              </label>
            )}
            {destinations.map(destination => {
              const tournament = byId.get(destination.tournament_id)
              const choices = options.find(option => option.tournament_id === destination.tournament_id)
              const candidates = choices?.fechas.filter(fecha => fecha.start_date === metadata.start_date && fecha.end_date === metadata.end_date
                && choices.rounds.some(option => roundKey(option) === roundKey(fecha))) ?? []
              const isNew = destination.fecha.kind === 'create'
              const isSource = destination.tournament_id === sourceId
              return (
                <section key={destination.tournament_id} className="space-y-3 rounded-xl border bg-card p-4">
                  <h3 className="break-words font-semibold">{tournament?.name}</h3>
                  {isSource ? (
                    <p className="text-sm text-muted-foreground">{sharingExisting
                      ? `Se conserva ${sharingExisting.fecha.name} como fecha de origen.`
                      : `Se completan los horarios faltantes en ${source?.fecha.name}.`}</p>
                  ) : (source || template) && (
                    <div className="space-y-1.5">
                      {candidates.length > 0 ? (
                        <label className="block space-y-1 text-sm">Dónde aplicar las franjas
                          <select aria-label={`Dónde aplicar las franjas en ${tournament?.name}`} className={selectStyle} value={destination.fecha.kind === 'adopt' ? destination.fecha.fecha_id : ''} onChange={event => {
                            const fecha = candidates.find(candidate => candidate.id === event.target.value)
                            updateDestination(destination.tournament_id, { ...defaultDestination(destination.tournament_id, fecha), slot_adoptions: undefined })
                          }}>
                            <option value="">Crear una fecha en este torneo</option>
                            {candidates.map(fecha => <option key={fecha.id} value={fecha.id}>Usar fecha {fecha.fecha_number} · {fecha.name}</option>)}
                          </select>
                        </label>
                      ) : <p className="text-sm font-medium">Se va a crear una fecha en este torneo.</p>}
                      <p className="text-sm text-muted-foreground">{isNew
                        ? candidates.length ? 'La nueva fecha recibe las franjas compartidas.' : 'No hay fechas del mismo período disponibles para vincular.'
                        : 'Se reutilizan las franjas que coinciden y se agregan las que faltan. Si hay un conflicto, aparece en la revisión.'}</p>
                    </div>
                  )}
                  <label className="block space-y-1 text-sm">Ronda y copa
                    <select aria-label={`Ronda y copa para ${tournament?.name}`} className={selectStyle} disabled={!isNew} value={roundKey(destination)} onChange={event => {
                      const option = choices?.rounds.find(row => roundKey(row) === event.target.value)
                      if (option) updateDestination(destination.tournament_id, option)
                    }}>
                      {!isNew ? <option value={roundKey(destination)}>{roundLabels[destination.round_type]} · {cupLabels[destination.bracket_key]}</option>
                        : choices?.rounds.map(option => <option key={roundKey(option)} value={roundKey(option)}>{roundLabels[option.round_type]} · {cupLabels[option.bracket_key]}</option>)}
                    </select>
                  </label>
                </section>
              )
            })}
          </div>
        )}
        {step === 2 && (
          <>
            {!template && !!source?.pastCount && <p className="rounded-lg border bg-muted/30 p-3 text-sm">{source.pastCount} franjas pasadas se conservan en la fecha de origen.</p>}
            {!!template?.pastCount && <p className="rounded-lg border bg-muted/30 p-3 text-sm">{template.pastCount} franjas pasadas quedan en el historial. Los destinos nuevos reciben las vigentes.</p>}
            <SlotEditor slots={slots} period={metadata} onChange={template ? undefined : updateSlots} />
            {hasCourtLabels && destinations.some(destination => crossClub(destination.tournament_id)) && (
              <section aria-label="Canchas por destino" className="space-y-3 rounded-xl border p-4">
                <h3 className="font-semibold">Canchas por destino</h3>
                {destinations.filter(destination => crossClub(destination.tournament_id)).map(destination => {
                  const id = destination.tournament_id
                  const choice = destination.court_choice
                  const choiceValue = typeof choice === 'string' ? choice : 'rename'
                  return (
                    <div key={id} className="space-y-2">
                      <label className="block space-y-1 text-sm">{byId.get(id)?.name}
                        <select className={selectStyle} value={courtsReviewed.includes(id) ? choiceValue : ''} onChange={event => {
                          const value = event.target.value
                          if (!value) return
                          setCourtsReviewed(previous => [...new Set([...previous, id])])
                          updateDestination(id, { court_choice: value === 'rename' ? { rename: Object.fromEntries(slots.map(slot => [slot.key, slot.court_name ?? ''])) } : value === 'clear' ? 'clear' : 'preserve', slot_adoptions: undefined })
                        }}>
                          <option value="" disabled>Elegí cómo copiar las canchas</option>
                          <option value="preserve">Conservar nombres</option><option value="clear">Dejar sin cancha</option><option value="rename">Cambiar nombres</option>
                        </select>
                      </label>
                      {courtsReviewed.includes(id) && typeof choice === 'object' && slots.map(slot => (
                        <label key={slot.key} className="block space-y-1 text-sm">{formatDay(slot.date)} · {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                          <Input value={choice.rename[slot.key] ?? ''} onChange={event => updateDestination(id, { court_choice: { rename: { ...choice.rename, [slot.key]: event.target.value } }, slot_adoptions: undefined })} />
                        </label>
                      ))}
                    </div>
                  )
                })}
              </section>
            )}
          </>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{metadata.name} · {formatPeriod(metadata.start_date, metadata.end_date)} · {ids.length} {ids.length === 1 ? 'torneo' : 'torneos'}</p>
            {destinations.map(destination => {
              const id = destination.tournament_id
              const row = review?.data.preview.destinations.find(item => item.tournament_id === id)
              const choice = destination.court_choice
              const tournament = byId.get(id)
              const fechaId = destination.fecha.kind === 'adopt' ? destination.fecha.fecha_id : null
              const fechaName = fechaId === source?.fecha.id ? source.fecha.name
                : options.find(option => option.tournament_id === id)?.fechas.find(fecha => fecha.id === fechaId)?.name
              const newSlots = new Map(row?.new_slots.map(slot => [slot.key, slot]))
              const reusedSlots = new Set(row?.reused_slots.map(slot => slot.key))
              const conflictSlots = new Set(row?.conflicts.map(conflict => conflict.slot_key))
              return (
                <section key={id} className="space-y-3 rounded-xl border bg-card p-4">
                  <div>
                    <h3 className="font-semibold">{tournament?.name}</h3>
                    <p className="text-sm text-muted-foreground">{byClub.get(tournament?.club_id ?? '') ?? 'Sin club asignado'}</p>
                  </div>
                  <p className="break-words text-sm text-muted-foreground">{fechaId ? 'Vincular fecha existente' : 'Crear fecha'}{currentReview && row ? ` · Fecha ${row.fecha_number}` : ''}{fechaName ? ` · ${fechaName}` : ''} · {roundLabels[destination.round_type]} · {cupLabels[destination.bracket_key]}</p>
                  {currentReview && row && (
                    <div className="space-y-2 text-sm">
                      {row.transition_to_zone_phase && <p>El torneo iniciará la fase de zonas.</p>}
                      {row.preserves_local_metadata && <p>Se conservarán los datos locales de la fecha existente.</p>}
                      {slots.length ? (
                        <ul aria-label="Franjas del torneo" className="divide-y rounded-lg border px-3">
                          {[...slots].sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)).map(draftSlot => {
                            const slot = newSlots.get(draftSlot.key) ?? draftSlot
                            const court = newSlots.has(slot.key) ? slot.court_name : choice === 'clear' ? null : choice === 'preserve' ? slot.court_name : choice.rename[slot.key]
                            const hasConflict = conflictSlots.has(slot.key)
                            const status = hasConflict ? 'Conflicto' : newSlots.has(slot.key) ? 'Se crea' : reusedSlots.has(slot.key) ? 'Se reutiliza' : 'Pendiente'
                            return (
                              <li key={slot.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                <div>
                                  <p className="font-medium tabular-nums">{formatDay(slot.date)} · {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</p>
                                  <p className="text-muted-foreground">{court?.trim() || 'Sin cancha'} · Capacidad {slot.max_matches ?? 1}</p>
                                </div>
                                <Badge variant={hasConflict ? 'destructive' : 'secondary'}>{status}</Badge>
                              </li>
                            )
                          })}
                        </ul>
                      ) : <p className="text-muted-foreground">Fecha sin franjas.</p>}
                    </div>
                  )}
                  {row?.conflicts.map((conflict, index) => {
                    const key = conflict.slot_key
                    return (
                      <div key={`${conflict.code}-${key ?? ''}-${index}`} className="space-y-1 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
                        <p>{conflict.message}</p>
                        {key && !!conflict.candidate_ids?.length && (
                          <label className="block space-y-1">Horario existente a reutilizar
                            <select className={selectStyle} value={destination.slot_adoptions?.[key] ?? ''} onChange={event => {
                              const selected = { ...destination.slot_adoptions }
                              if (event.target.value) selected[key] = event.target.value
                              else delete selected[key]
                              updateDestination(id, { slot_adoptions: selected })
                            }}>
                              <option value="">Elegir coincidencia</option>
                              {conflict.candidate_ids.map((candidate, i) => <option key={candidate} value={candidate}>Opción {i + 1} · {candidate.slice(-8)}</option>)}
                            </select>
                          </label>
                        )}
                      </div>
                    )
                  })}
                  {!!row?.conflicts.length && id !== sourceId && ids.length > 1 && (
                    <Button type="button" size="sm" variant="outline" onClick={() => {
                      setIds(previous => previous.filter(value => value !== id))
                      setDestinations(previous => previous.filter(value => value.tournament_id !== id))
                      setCourtsReviewed(previous => previous.filter(value => value !== id))
                      setReview(undefined)
                      setError('')
                    }}>Excluir este destino</Button>
                  )}
                </section>
              )
            })}
          </div>
        )}
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" disabled={confirmAgain} onClick={handleCancel}>Cancelar</Button>
            {step > 0 && <Button type="button" variant="outline" disabled={confirmAgain} onClick={() => go(step - 1)}><ArrowLeft aria-hidden /> Atrás</Button>}
          </div>
          <div className="flex flex-wrap gap-2">
            {pending && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" aria-hidden /> Procesando…</p>}
            {step === 0 && <Button type="button" disabled={!ids.length} onClick={handleDestinations}>Continuar <ArrowRight aria-hidden /></Button>}
            {step === 1 && <Button type="button" onClick={handleMetadata}>Continuar <ArrowRight aria-hidden /></Button>}
            {step === 2 && <Button type="button" onClick={handleReviewStep}>Revisar <ArrowRight aria-hidden /></Button>}
            {step === 3 && !pending && !currentReview?.data.preview.can_commit && <Button type="button" disabled={confirmAgain} onClick={handlePreview}>Actualizar revisión</Button>}
            {step === 3 && currentReview?.data.preview.can_commit && !needsCourtReview && <Button type="button" onClick={handleCommit}><Check aria-hidden /> Guardar en {ids.length} {ids.length === 1 ? 'torneo' : 'torneos'} · {currentReview.data.preview.physical_slots_to_create} franjas nuevas</Button>}
          </div>
        </div>
      </fieldset>
    </div>
  )
}
