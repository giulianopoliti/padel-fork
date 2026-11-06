'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Check, Clock3, Loader2, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { ScheduleCreationSource, ScheduleDestinationOptions } from '@/lib/services/schedule-sharing/destinations'
import type { ScheduleReviewedBatch } from '@/lib/services/schedule-sharing/rpc'
import type { ScheduleBatchDraft, ScheduleDestination, ScheduleDraftSlot, ScheduleIssue, ScheduleMetadata } from '@/lib/services/schedule-sharing/types'
import { validateSchedulePeriod, validateScheduleSlots } from '@/lib/services/schedule-sharing/validation'
import { MAX_SCHEDULE_BATCH_PHYSICAL_SLOTS, MAX_SCHEDULE_BATCH_TARGETS } from '@/lib/services/schedule-sharing/batch'
import { commitScheduleBatchAction, loadScheduleDestinationOptionsAction, previewScheduleBatchAction } from '../actions'
import { cupLabels, formatDay, formatPeriod, roundLabels } from '../display'
import { SlotEditor } from '../SlotEditor'
import { ScheduleReview } from './review'

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

type DestinationDraft = ScheduleDestination & { courtConfirmed?: boolean }
type Draft = { metadata: ScheduleMetadata; slots: ScheduleDraftSlot[]; destinations: DestinationDraft[] }
type Review = { data: ScheduleReviewedBatch; payload: ScheduleBatchDraft; draft: Draft; options: ScheduleDestinationOptions }
type OptionsResult = { key: string; data: ScheduleDestinationOptions } | { key: string; error: string }

const selectStyle = 'block h-10 w-full min-w-0 truncate rounded-control border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const sectionStyle = 'min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5'
const errorStyle = 'rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'
const roundKey = (option: Pick<ScheduleDestination, 'round_type' | 'bracket_key'>) => `${option.round_type}:${option.bracket_key}`
const roundLabel = (option: Pick<ScheduleDestination, 'round_type' | 'bracket_key'>) => `${roundLabels[option.round_type]} · ${cupLabels[option.bracket_key]}`
const blankMetadata: ScheduleMetadata = { name: '', description: null, start_date: null, end_date: null }

const defaultDestination = (id: string, fecha?: ScheduleCreationSource['fecha']): DestinationDraft => ({
  tournament_id: id,
  fecha: fecha ? { kind: 'adopt', fecha_id: fecha.id } : { kind: 'create' },
  round_type: fecha?.round_type ?? 'ZONE',
  bracket_key: fecha?.bracket_key ?? 'MAIN',
  estimated_match_duration_minutes: fecha?.estimated_match_duration_minutes ?? 90,
  max_matches_per_couple: fecha?.max_matches_per_couple ?? null,
  court_choice: 'preserve',
})

const focusElement = (id: string) => {
  requestAnimationFrame(() => {
    const element = document.getElementById(id)
    element?.focus({ preventScroll: true })
    element?.scrollIntoView({ block: 'center' })
  })
}

export const ScheduleWizard = ({ tournaments, clubs, source, initialTournament, initialClub, back, template }: Props) => {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(() => {
    const fecha = source?.fecha
    const id = fecha?.tournament_id ?? initialTournament
    return {
      metadata: template?.metadata ?? (fecha ? {
        name: fecha.name, description: fecha.description, start_date: fecha.start_date, end_date: fecha.end_date,
      } : blankMetadata),
      slots: template?.slots ?? source?.slots ?? [],
      destinations: id ? [defaultDestination(id, fecha)] : [],
    }
  })
  const { metadata, slots, destinations } = draft
  const [clubIds, setClubIds] = useState<string[]>(() => {
    const contextClub = initialClub ?? (initialTournament ? 'none' : null)
    return contextClub && tournaments.some(tournament => tournament.eligible && (tournament.club_id ?? 'none') === contextClub)
      ? [contextClub]
      : []
  })
  const [search, setSearch] = useState('')
  const [loadedOptions, setLoadedOptions] = useState<OptionsResult>()
  const [optionAttempt, setOptionAttempt] = useState(0)
  const [review, setReview] = useState<Review>()
  const [reviewInvalid, setReviewInvalid] = useState(false)
  const [status, setStatus] = useState<'reviewing' | 'saving' | 'retry' | 'saved'>()
  const [error, setError] = useState<{ target: string; message: string; slot?: ScheduleIssue }>()
  const initialDraft = useRef(draft)
  const inFlight = useRef(false)
  const operation = useRef<{ draft: Draft; key: string }>(null)

  const ids = destinations.map(destination => destination.tournament_id)
  const selection = ids.join(',')
  const optionKey = `${optionAttempt}:${selection}`

  useEffect(() => {
    if (!selection) return
    let active = true
    const load = async () => {
      try {
        const result = await loadScheduleDestinationOptionsAction(selection.split(','))
        if (!active) return
        setLoadedOptions(result.success ? { key: optionKey, data: result.data } : { key: optionKey, error: result.error })
      } catch {
        if (active) setLoadedOptions({ key: optionKey, error: 'Se interrumpió la conexión al consultar los destinos.' })
      }
    }
    void load()
    return () => { active = false }
  }, [selection, optionKey])

  const dirty = draft !== initialDraft.current
  useEffect(() => {
    if (!dirty || status === 'saved') return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, status])

  const optionsResult = loadedOptions?.key === optionKey ? loadedOptions : undefined
  const options = optionsResult && 'data' in optionsResult ? optionsResult.data : []
  const optionsError = optionsResult && 'error' in optionsResult ? optionsResult.error : undefined
  const loadingOptions = !!selection && !optionsResult
  const byId = new Map(tournaments.map(tournament => [tournament.id, tournament]))
  const byClub = new Map(clubs.map(item => [item.id, item.name]))
  const eligible = tournaments.filter(tournament => tournament.eligible)
  const availableClubs = new Set(eligible.map(tournament => tournament.club_id ?? 'none'))
  const searchTerm = search.trim().toLocaleLowerCase('es')
  const shown = eligible.filter(tournament => (!clubIds.length || clubIds.includes(tournament.club_id ?? 'none'))
    && `${tournament.name} ${tournament.category_name ?? ''}`.toLocaleLowerCase('es').includes(searchTerm))
  const sourceId = source?.fecha.tournament_id
  const complete = !!template?.completeMemberId
  const sharingExisting = !!source && !template
  const multiClub = new Set(ids.map(id => byId.get(id)?.club_id ?? null)).size > 1
  const hasCourtLabels = slots.some(slot => !!slot.court_name?.trim())
  const needsCourtChoice = (id: string): boolean => hasCourtLabels && (!!template || (sourceId
    ? byId.get(id)?.club_id !== byId.get(sourceId)?.club_id : multiClub))
  const physicalCount = slots.length * destinations.length
  const period = formatPeriod(metadata.start_date, metadata.end_date)
  const [periodIssue] = validateSchedulePeriod(metadata)
  const periodMessage = periodIssue && (metadata.start_date && metadata.end_date && metadata.end_date < metadata.start_date
    ? 'El fin del período debe ser igual o posterior al inicio.'
    : periodIssue.message)
  const currentReview = review?.draft === draft && !reviewInvalid ? review : undefined
  const canSave = !!currentReview?.data.preview.can_commit
  const locked = !!status

  const getChoices = (id: string) => options.find(option => option.tournament_id === id)
  const getCandidates = (id: string) => {
    const choices = getChoices(id)
    return choices?.fechas.filter(fecha => fecha.start_date === metadata.start_date && fecha.end_date === metadata.end_date
      && choices.rounds.some(option => roundKey(option) === roundKey(fecha))) ?? []
  }
  const needsCompatibleDate = (destination: DestinationDraft): boolean => {
    if (!optionsResult || optionsError || destination.fecha.kind !== 'adopt' || destination.tournament_id === sourceId) return false
    const id = destination.fecha.fecha_id
    return !getCandidates(destination.tournament_id).some(fecha => fecha.id === id)
  }

  const handleIssue = (target: string, message: string, slot?: ScheduleIssue) => {
    setError({ target, message, slot })
    focusElement(target)
  }
  const handleDraftChange = (update: (previous: Draft) => Draft) => {
    if (inFlight.current || locked) return
    setError(undefined)
    setDraft(update)
  }
  const handleMetadataChange = (patch: Partial<ScheduleMetadata>) => {
    handleDraftChange(previous => ({ ...previous, metadata: { ...previous.metadata, ...patch } }))
  }
  const handleSlotsChange = (next: ScheduleDraftSlot[]) => {
    handleDraftChange(previous => {
      const labelsChanged = previous.slots.length !== next.length || next.some((slot, index) => {
        const old = previous.slots[index]
        return slot.key !== old.key || slot.court_name?.trim() !== old.court_name?.trim()
      })
      return {
        ...previous, slots: next,
        destinations: previous.destinations.map(destination => ({
          ...destination, slot_adoptions: undefined, courtConfirmed: destination.courtConfirmed && !labelsChanged,
        })),
      }
    })
  }
  const handleDestinationChange = (id: string, patch: Partial<DestinationDraft>) => {
    handleDraftChange(previous => ({
      ...previous,
      destinations: previous.destinations.map(destination => destination.tournament_id === id ? { ...destination, ...patch } : destination),
    }))
  }
  const handleSelect = (next: string[]) => {
    const unique = [...new Set(sourceId ? [sourceId, ...next] : next)]
    if (unique.length > MAX_SCHEDULE_BATCH_TARGETS) {
      handleIssue('schedule-tournaments', `Podés elegir hasta ${MAX_SCHEDULE_BATCH_TARGETS} torneos por operación.`)
      return
    }
    handleDraftChange(previous => ({
      ...previous,
      destinations: unique.map(id => previous.destinations.find(destination => destination.tournament_id === id) ?? defaultDestination(id)),
    }))
  }
  const handleCourtChange = (destination: DestinationDraft, value: string) => {
    if (!value) return
    const previous = destination.court_choice
    const rename = value === 'rename' ? Object.fromEntries(slots.map(slot => [
      slot.key, (typeof previous === 'object' ? previous.rename[slot.key] : undefined) ?? slot.court_name ?? '',
    ])) : undefined
    handleDestinationChange(destination.tournament_id, {
      court_choice: rename ? { rename } : value === 'clear' ? 'clear' : 'preserve',
      courtConfirmed: true, slot_adoptions: undefined,
    })
  }

  const handlePreview = async () => {
    if (inFlight.current || locked) return
    if (!metadata.name.trim()) return handleIssue('schedule-name', 'Ingresá un nombre para la fecha.')
    if (periodIssue) return focusElement(source || template ? 'schedule-period-message' : 'schedule-period-end')
    if (!ids.length) return handleIssue('schedule-tournaments', 'Elegí al menos un torneo.')
    if (loadingOptions || optionsError) return focusElement('schedule-tournaments')
    for (const destination of destinations) {
      const id = destination.tournament_id
      if (needsCompatibleDate(destination)) return focusElement(`schedule-destination-${id}`)
      if (destination.fecha.kind === 'create' && !getChoices(id)?.rounds.some(option => roundKey(option) === roundKey(destination))) {
        return handleIssue(`schedule-round-${id}`, 'Elegí una ronda y copa disponibles para este torneo.')
      }
      if (needsCourtChoice(id) && !destination.courtConfirmed) {
        return handleIssue(`schedule-court-${id}`, 'Elegí cómo aplicar los nombres de las canchas en este torneo.')
      }
    }
    if (complete && !slots.length) return handleIssue('schedule-slots-error', 'Ya no hay horarios faltantes vigentes en este torneo.')
    const validation = validateScheduleSlots(slots, { period: metadata })
    if (!validation.ok) {
      const issue = validation.issues[0]
      return handleIssue('schedule-slots-error', issue.message, issue)
    }
    if (physicalCount > MAX_SCHEDULE_BATCH_PHYSICAL_SLOTS) {
      return handleIssue('schedule-slots-error', `Reducí la selección a un máximo de ${MAX_SCHEDULE_BATCH_PHYSICAL_SLOTS} horarios en total.`)
    }

    if (operation.current?.draft !== draft) operation.current = { draft, key: crypto.randomUUID() }
    const payload: ScheduleBatchDraft = {
      operation_key: operation.current.key,
      ...(template ? { group_id: template.id, complete_member_id: template.completeMemberId } : {}),
      source_fecha_id: template ? null : source?.fecha.id ?? null,
      metadata, slots,
      destinations: destinations.map(({ courtConfirmed, ...destination }) => ({
        ...destination, court_choice: courtConfirmed && needsCourtChoice(destination.tournament_id) ? destination.court_choice : 'preserve',
      })),
    }

    inFlight.current = true
    setStatus('reviewing')
    setError(undefined)
    setReviewInvalid(true)
    try {
      const result = await previewScheduleBatchAction(payload)
      if (!result.success) return handleIssue('schedule-review-error', result.error)
      setReview({ data: result.data, payload, draft, options })
      setReviewInvalid(false)
      focusElement('schedule-review')
    } catch {
      handleIssue('schedule-review-error', 'Se interrumpió la conexión. Volvé a revisar la configuración.')
    } finally {
      inFlight.current = false
      setStatus(undefined)
    }
  }

  const handleCommit = async () => {
    if (inFlight.current || !currentReview?.data.preview.can_commit || (status && status !== 'retry')) return
    inFlight.current = true
    setStatus('saving')
    setError(undefined)
    try {
      const result = await commitScheduleBatchAction(currentReview.payload, currentReview.data.revision)
      if (!result.success) {
        setReviewInvalid(true)
        setStatus(undefined)
        handleIssue('schedule-review-error', result.error)
        return
      }
      setStatus('saved')
      router.push(template ? back : `/schedules/${result.data.group_id}?back=${encodeURIComponent(back)}`)
    } catch {
      setStatus('retry')
      handleIssue('schedule-review-error', 'Se interrumpió la conexión. Volvé a confirmar para recuperar el resultado de esta operación.')
    } finally {
      inFlight.current = false
    }
  }

  const handleCancel = () => {
    if (!dirty || window.confirm('¿Descartar los cambios del borrador?')) router.push(back)
  }

  const inlineError = (target: string) => error?.target === target && (
    <p id={`${target}-message`} role="alert" className={errorStyle}>{error.message}</p>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6 break-words [&_a]:scroll-mb-40 [&_button]:scroll-mb-40 [&_input]:scroll-mb-40 [&_select]:scroll-mb-40 [&_summary]:scroll-mb-40 [&_textarea]:scroll-mb-40">
      <header className="space-y-2 border-b pb-5">
        <p className="text-sm font-medium text-primary">Fechas y horarios</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{complete ? 'Completar horarios faltantes' : template ? 'Agregar torneos' : source ? 'Compartir esta fecha' : 'Crear fecha compartida'}</h1>
        <p className="max-w-prose text-sm text-muted-foreground sm:text-base">{complete
          ? 'Revisá los horarios vigentes que faltan en la fecha vinculada.'
          : template ? 'Aplicá la configuración vigente a más torneos.'
            : sharingExisting ? 'Aplicá las franjas de esta fecha a los torneos que elijas.'
              : 'Definí la fecha, elegí los torneos y revisá qué se va a guardar en cada uno.'}</p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-7">
        <fieldset disabled={locked} className="min-w-0 space-y-5 disabled:pointer-events-none lg:space-y-6" aria-label="Borrador de la fecha">
          <section aria-labelledby="schedule-date" className={sectionStyle}>
            <h2 id="schedule-date" className="flex items-center gap-2 text-lg font-semibold"><CalendarDays className="size-5 text-primary" aria-hidden /> Fecha</h2>
            {(source || template) && (
              <div className="space-y-1 rounded-lg border bg-muted/35 p-3 text-sm sm:p-4">
                <p className="text-xs font-semibold text-muted-foreground">{complete ? 'Fecha vinculada' : template ? 'Fecha compartida' : 'Fecha de origen'}</p>
                <p className="font-semibold">{source?.fecha.name ?? template?.metadata.name}</p>
                {source && <p>{byId.get(sourceId ?? '')?.name}</p>}
                <p className="text-muted-foreground">
                  {source ? formatPeriod(source.fecha.start_date, source.fecha.end_date) : period}
                  {!complete && ` · ${source?.slots.length ?? slots.length} franjas vigentes`}
                </p>
                {complete && <p className="text-muted-foreground">Fecha compartida · {template?.metadata.name}</p>}
                {sharingExisting && <p className="text-muted-foreground">Se comparten las franjas del período. Las respuestas de las parejas y los partidos quedan en su torneo.</p>}
              </div>
            )}
            {!template && (
              <>
                <label className="block space-y-1.5 text-sm font-medium">
                  {sharingExisting ? 'Nombre para el grupo y las fechas nuevas' : 'Nombre de la fecha'}
                  <Input id="schedule-name" maxLength={200} value={metadata.name} aria-invalid={error?.target === 'schedule-name' || undefined}
                    aria-describedby={error?.target === 'schedule-name' ? 'schedule-name-message' : undefined}
                    onChange={event => handleMetadataChange({ name: event.target.value })} />
                </label>
                {inlineError('schedule-name')}
                {!source && (
                  <div className="grid grid-cols-2 gap-3" role="group" aria-label="Período">
                    <label className="min-w-0 space-y-1.5 text-sm font-medium">Inicio del período<Input className="min-w-0 aria-invalid:border-destructive" type="date"
                      max={metadata.end_date ?? undefined} aria-invalid={!!periodIssue || undefined}
                      aria-describedby={periodIssue ? 'schedule-period-message' : undefined}
                      value={metadata.start_date ?? ''} onChange={event => handleMetadataChange({ start_date: event.target.value || null })} /></label>
                    <label className="min-w-0 space-y-1.5 text-sm font-medium">Fin del período<Input id="schedule-period-end" className="min-w-0 aria-invalid:border-destructive" type="date"
                      min={metadata.start_date ?? undefined} aria-invalid={!!periodIssue || undefined}
                      aria-describedby={periodIssue ? 'schedule-period-message' : undefined}
                      value={metadata.end_date ?? ''} onChange={event => handleMetadataChange({ end_date: event.target.value || null })} /></label>
                  </div>
                )}
              </>
            )}
            {periodMessage && <p id="schedule-period-message" role="alert" tabIndex={-1} className={errorStyle}>{periodMessage}</p>}
            {!template && (
              <details className="space-y-2">
                <summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Descripción opcional</summary>
                <Textarea aria-label="Descripción de la fecha" value={metadata.description ?? ''}
                  onChange={event => handleMetadataChange({ description: event.target.value || null })} />
              </details>
            )}
          </section>

          <section aria-labelledby="schedule-tournaments" className={sectionStyle}>
            <h2 id="schedule-tournaments" tabIndex={-1} className="flex items-center gap-2 rounded-sm text-lg font-semibold focus-visible:ring-2 focus-visible:ring-ring"><Users className="size-5 text-primary" aria-hidden /> Torneos</h2>
            {inlineError('schedule-tournaments')}
            {!complete && (
              <div className="space-y-3" role="group" aria-label="Buscar y seleccionar torneos">
                {availableClubs.size > 1 && (
                  <fieldset className="min-w-0 space-y-2">
                    <legend className="text-sm font-medium">Filtrar por clubes</legend>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant={clubIds.length ? 'outline' : 'secondary'} size="sm" aria-pressed={!clubIds.length}
                        onClick={() => setClubIds([])}>Todos los clubes</Button>
                      {[...clubs, { id: 'none', name: 'Sin club asignado' }].filter(item => availableClubs.has(item.id)).map(item => (
                        <Button key={item.id} type="button" variant={clubIds.includes(item.id) ? 'secondary' : 'outline'} size="sm"
                          aria-pressed={clubIds.includes(item.id)} className="h-auto min-h-9 max-w-full whitespace-normal [overflow-wrap:anywhere] text-left"
                          onClick={() => setClubIds(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id])}>
                          {item.name}
                        </Button>
                      ))}
                    </div>
                  </fieldset>
                )}
                <label className="block space-y-1.5 text-sm font-medium">Buscar torneo<Input type="search" value={search}
                  onChange={event => setSearch(event.target.value)} placeholder="Nombre o categoría" /></label>
                {shown.length > 0 ? (
                  <>
                    <Button type="button" variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal text-left"
                      disabled={shown.every(tournament => ids.includes(tournament.id))}
                      onClick={() => handleSelect([...ids, ...shown.map(tournament => tournament.id)])}>
                      Seleccionar {shown.length === 1 ? '1 resultado visible' : `los ${shown.length} resultados visibles`}
                    </Button>
                    <ul aria-label="Resultados de búsqueda" className="max-h-56 divide-y overflow-y-auto rounded-lg border bg-background">
                      {shown.map(tournament => (
                        <li key={tournament.id}>
                          <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm">
                            <input className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:ring-2 focus-visible:ring-ring" type="checkbox"
                              checked={ids.includes(tournament.id)} disabled={tournament.id === sourceId}
                              onChange={event => handleSelect(event.target.checked ? [...ids, tournament.id] : ids.filter(id => id !== tournament.id))} />
                            <span className="min-w-0">
                              <span className="block font-medium">{tournament.name}</span>
                              <span className="block text-xs text-muted-foreground">{[
                                byClub.get(tournament.club_id ?? '') ?? 'Sin club asignado', tournament.category_name,
                                tournament.status === 'NOT_STARTED' ? 'Por comenzar' : 'En curso',
                                template?.detached.includes(tournament.id) ? 'Volver a vincular' : null,
                              ].filter(Boolean).join(' · ')}</span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : <p className="text-sm text-muted-foreground">{eligible.length ? 'No hay torneos con estos filtros.' : 'No hay torneos disponibles para aplicar esta fecha.'}</p>}
              </div>
            )}

            <section aria-label="Torneos seleccionados" className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold" aria-live="polite">{ids.length} {ids.length === 1 ? 'torneo seleccionado' : 'torneos seleccionados'}</h3>
              {loadingOptions && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> Cargando opciones de los torneos…</p>}
              {optionsError && (
                <div className="space-y-2">
                  <p role="alert" className={errorStyle}>{optionsError}</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => setOptionAttempt(previous => previous + 1)}>Reintentar consulta</Button>
                </div>
              )}
              {destinations.length > 0 && (
                <ul className="divide-y rounded-lg border bg-background">
                  {destinations.map(destination => {
                    const id = destination.tournament_id
                    const tournament = byId.get(id)
                    const choices = getChoices(id)
                    const candidates = getCandidates(id)
                    const fechaId = destination.fecha.kind === 'adopt' ? destination.fecha.fecha_id : ''
                    const selectedDate = choices?.fechas.find(fecha => fecha.id === fechaId)
                    const incompatible = needsCompatibleDate(destination)
                    const isSource = id === sourceId
                    const court = destination.court_choice
                    const roundAvailable = choices?.rounds.some(option => roundKey(option) === roundKey(destination))
                    return (
                      <li key={id} id={`schedule-tournament-${id}`} tabIndex={-1} className="min-w-0 scroll-mt-24 space-y-3 p-3 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <h4 className="text-sm font-semibold sm:text-base">{tournament?.name}</h4>
                            <p className="text-xs text-muted-foreground">{byClub.get(tournament?.club_id ?? '') ?? 'Sin club asignado'}</p>
                            {(isSource || id === initialTournament) && <Badge variant="secondary">{complete ? 'Vinculado' : isSource ? 'Origen' : 'Torneo actual'}</Badge>}
                          </div>
                          {!isSource && <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label={`Quitar ${tournament?.name}`}
                            onClick={() => {
                              handleSelect(ids.filter(selected => selected !== id))
                              focusElement('schedule-tournaments')
                            }}><X aria-hidden /></Button>}
                        </div>
                        {isSource ? (
                          <p className="text-sm text-muted-foreground">Fecha {source?.fecha.fecha_number} · {source?.fecha.name} · {roundLabel(destination)}</p>
                        ) : choices && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="min-w-0 space-y-1.5">
                              {candidates.length > 0 || fechaId ? (
                                <>
                                  <label className="block min-w-0 space-y-1.5 text-sm font-medium">Fecha de destino
                                    <select id={`schedule-destination-${id}`} aria-label={`Dónde aplicar las franjas en ${tournament?.name}`} className={selectStyle}
                                      value={fechaId} aria-invalid={incompatible || undefined}
                                      aria-describedby={incompatible ? `schedule-incompatible-${id}` : undefined}
                                      onChange={event => {
                                        const fecha = candidates.find(candidate => candidate.id === event.target.value)
                                        handleDestinationChange(id, {
                                          ...defaultDestination(id, fecha), court_choice: court,
                                          courtConfirmed: destination.courtConfirmed, slot_adoptions: undefined,
                                        })
                                      }}>
                                      <option value="">Crear una fecha en este torneo</option>
                                      {incompatible && <option value={fechaId} disabled>{selectedDate ? `Fecha ${selectedDate.fecha_number} · ${selectedDate.name}` : 'Fecha existente'} (incompatible)</option>}
                                      {candidates.map(fecha => <option key={fecha.id} value={fecha.id}>Usar fecha existente · {fecha.fecha_number} · {fecha.name}</option>)}
                                    </select>
                                  </label>
                                  {incompatible ? <p id={`schedule-incompatible-${id}`} role="alert" className="text-sm text-destructive">La fecha elegida ya no es compatible. Elegí otra fecha del mismo período o creá una nueva.</p>
                                    : <p className="text-xs text-muted-foreground">Una fecha existente conserva sus datos. Se reutilizan las franjas que coinciden y se agregan las faltantes si son compatibles.</p>}
                                </>
                              ) : <p className="self-center text-sm text-muted-foreground">Se va a crear una fecha en este torneo.</p>}
                            </div>
                            {fechaId ? <p className="self-start text-sm"><span className="block font-medium">Ronda y copa</span>{roundLabel(destination)}</p> : (
                              <div className="min-w-0 space-y-1.5">
                                <label className="block min-w-0 space-y-1.5 text-sm font-medium">Ronda y copa
                                  <select id={`schedule-round-${id}`} aria-label={`Ronda y copa para ${tournament?.name}`} className={selectStyle}
                                    value={roundAvailable ? roundKey(destination) : ''} onChange={event => {
                                      const option = choices.rounds.find(row => roundKey(row) === event.target.value)
                                      if (option) handleDestinationChange(id, option)
                                    }}>
                                    {!roundAvailable && <option value="" disabled>Elegí una ronda y copa</option>}
                                    {choices.rounds.map(option => <option key={roundKey(option)} value={roundKey(option)}>{roundLabel(option)}</option>)}
                                  </select>
                                </label>
                                {inlineError(`schedule-round-${id}`)}
                              </div>
                            )}
                          </div>
                        )}
                        {needsCourtChoice(id) && (
                          <div className="space-y-2 border-t pt-3">
                            <label className="block space-y-1.5 text-sm font-medium">Nombres de las canchas
                              <select id={`schedule-court-${id}`} aria-label={`Nombres de las canchas en ${tournament?.name}`} className={selectStyle}
                                value={destination.courtConfirmed ? typeof court === 'string' ? court : 'rename' : ''}
                                onChange={event => handleCourtChange(destination, event.target.value)}>
                                <option value="" disabled>Elegí cómo copiar las canchas</option>
                                <option value="preserve">Conservar nombres</option><option value="clear">Dejar sin cancha</option><option value="rename">Cambiar nombres</option>
                              </select>
                            </label>
                            {inlineError(`schedule-court-${id}`)}
                            {destination.courtConfirmed && typeof court === 'object' && slots.map(slot => (
                              <label key={slot.key} className="block space-y-1.5 text-sm">{formatDay(slot.date)} · {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                                <Input value={court.rename[slot.key] ?? ''} onChange={event => handleDestinationChange(id, {
                                  court_choice: { rename: { ...court.rename, [slot.key]: event.target.value } }, slot_adoptions: undefined,
                                })} />
                              </label>
                            ))}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </section>

          <section aria-labelledby="schedule-slots" className={sectionStyle}>
            <h2 id="schedule-slots" className="flex items-center gap-2 text-lg font-semibold"><Clock3 className="size-5 text-primary" aria-hidden /> Horarios</h2>
            {sharingExisting && !!source?.pastCount && <p className="text-sm text-muted-foreground">{source.pastCount} franjas pasadas se conservan en la fecha de origen.</p>}
            {!!template?.pastCount && <p className="text-sm text-muted-foreground">{template.pastCount} franjas pasadas quedan en el historial. Los destinos reciben las vigentes.</p>}
            {error?.target === 'schedule-slots-error' && <p id="schedule-slots-error" role="alert" tabIndex={-1} className={errorStyle}>{error.message}</p>}
            <SlotEditor slots={slots} period={metadata} onChange={template ? undefined : handleSlotsChange} issue={error?.slot}
              periodInvalid={!!periodIssue} />
          </section>
        </fieldset>

        <aside aria-labelledby="schedule-summary" className="min-w-0 space-y-3 rounded-xl border bg-muted/35 p-4 lg:sticky lg:top-24">
          <h2 id="schedule-summary" className="font-semibold">Resumen</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-x-3"><dt className="text-muted-foreground">Período</dt><dd className="font-medium tabular-nums">{period}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Torneos</dt><dd className="font-medium tabular-nums">{ids.length}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Franjas en el borrador</dt><dd className="font-medium tabular-nums">{slots.length}</dd></div>
            {currentReview && (
              <>
                <div className="flex justify-between gap-3 border-t pt-2"><dt className="text-muted-foreground">Franjas que se crean</dt><dd className="font-medium tabular-nums">{currentReview.data.preview.physical_slots_to_create}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Franjas que se reutilizan</dt><dd className="font-medium tabular-nums">{currentReview.data.preview.physical_slots_to_reuse}</dd></div>
              </>
            )}
          </dl>
        </aside>
      </div>

      {(review || status === 'reviewing' || error?.target === 'schedule-review-error') && (
        <section aria-labelledby="schedule-review" className={sectionStyle}>
          <h2 id="schedule-review" tabIndex={-1} className="rounded-sm text-lg font-semibold focus-visible:ring-2 focus-visible:ring-ring">Revisión</h2>
          {status === 'reviewing' && <p role="status" className="text-sm text-muted-foreground">Consultando fechas y franjas de los torneos…</p>}
          {error?.target === 'schedule-review-error' && <p id="schedule-review-error" role="alert" tabIndex={-1} className={errorStyle}>{error.message}</p>}
          {review && (
            <>
              {!currentReview && status !== 'reviewing' && <p role="status" className="rounded-lg bg-muted p-3 text-sm">La revisión quedó desactualizada. Volvé a revisar para poder guardar.</p>}
              <ScheduleReview data={review.data} payload={review.payload} options={review.options} source={source}
                clubName={id => byClub.get(byId.get(id)?.club_id ?? '') ?? 'Sin club asignado'}
                locked={locked}
                editableDestination={id => {
                  const current = destinations.find(destination => destination.tournament_id === id)
                  const reviewed = review.draft.destinations.find(destination => destination.tournament_id === id)
                  return slots === review.draft.slots && metadata.start_date === review.draft.metadata.start_date
                    && metadata.end_date === review.draft.metadata.end_date && current?.fecha === reviewed?.fecha
                    && current?.court_choice === reviewed?.court_choice ? current : undefined
                }}
                onAdoptionChange={(id, key, value) => {
                  const destination = destinations.find(item => item.tournament_id === id)
                  if (!destination) return
                  const adoptions = { ...destination.slot_adoptions }
                  if (value) adoptions[key] = value
                  else delete adoptions[key]
                  handleDestinationChange(id, { slot_adoptions: adoptions })
                }}
                onExclude={id => {
                  handleSelect(ids.filter(selected => selected !== id))
                  focusElement('schedule-tournaments')
                }}
                canExclude={id => id !== sourceId && ids.length > 1 && ids.includes(id)}
              />
            </>
          )}
        </section>
      )}

      <footer aria-label="Acciones de la fecha" className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-2 border-t bg-background pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={handleCancel}>Cancelar</Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" size="sm" variant={canSave ? 'outline' : 'default'}
            disabled={locked || loadingOptions || !!optionsError} onClick={handlePreview}>
            {status === 'reviewing' && <Loader2 className="animate-spin" aria-hidden />}
            {status === 'reviewing' ? 'Revisando…' : review ? 'Volver a revisar' : 'Revisar'}
          </Button>
          {review && (
            <Button type="button" size="sm" disabled={!canSave || (locked && status !== 'retry')} onClick={handleCommit}>
              {status === 'saving' ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
              {status === 'saving' ? 'Guardando…' : status === 'retry' ? 'Reintentar guardado' : 'Guardar'}
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}
