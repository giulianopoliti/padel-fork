'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { ArrowDown, ArrowUp, GripVertical, Loader2, Plus, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { saveTournamentSortSettings } from '@/app/actions/tournament-sort-settings'
import { TOURNAMENT_SORT_FIELDS, describeTournamentSort, type TournamentSortField, type TournamentSortRule, type TournamentSortSettings, type TournamentSortSurface } from '@/lib/tournaments/tournament-sort'

interface SortRowProps {
  rule: TournamentSortRule
  index: number
  total: number
  disabled: boolean
  onDirection: (direction: 'asc' | 'desc') => void
  onMove: (offset: number) => void
  onRemove: () => void
}

const SortRow = ({ rule, index, total, disabled, onDirection, onMove, onRemove }: SortRowProps) => {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: rule.field, disabled })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: rule.field, disabled })
  const label = TOURNAMENT_SORT_FIELDS[rule.field]
  const setNodeRef = (node: HTMLLIElement | null): void => { setDragRef(node); setDropRef(node) }
  return (
    <li ref={setNodeRef} className={`rounded-surface border p-3 transition-colors ${isDragging ? 'opacity-30' : ''} ${isOver && !isDragging ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'bg-card'}`}>
      <div className="flex items-start gap-2">
        <button type="button" {...attributes} {...listeners} disabled={disabled} aria-label={`Arrastrar ${label}`} aria-describedby="sort-drag-help"
          className="flex h-11 w-9 shrink-0 touch-none items-center justify-center rounded-control text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 cursor-grab active:cursor-grabbing">
          <GripVertical className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex min-h-11 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
            <span className="text-sm font-medium">{label}</span>
          </div>
          <Select value={rule.direction} onValueChange={(value: 'asc' | 'desc') => onDirection(value)} disabled={disabled}>
            <SelectTrigger aria-label={`Orden de ${label}`} className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Ascendente</SelectItem>
              <SelectItem value="desc">Descendente</SelectItem>
            </SelectContent>
          </Select>
          {rule.field === 'status' && <p className="mt-2 text-xs text-muted-foreground">{rule.direction === 'asc' ? 'No iniciado → Zonas → Llaves' : 'Llaves → Zonas → No iniciado'}</p>}
          {rule.field === 'category' && <p className="mt-2 text-xs text-muted-foreground">{rule.direction === 'asc' ? '1ra → 9na' : '9na → 1ra'}</p>}
        </div>
        <div className="flex shrink-0 flex-col">
          <Button type="button" variant="ghost" size="icon" className="h-11 w-9" aria-label={`Subir ${label}`} disabled={disabled || index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-11 w-9" aria-label={`Bajar ${label}`} disabled={disabled || index === total - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-9 shrink-0" aria-label={`Quitar ${label}`} disabled={disabled || total === 1} onClick={onRemove}><X className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
    </li>
  )
}

export interface TournamentSortDialogProps {
  surface: TournamentSortSurface
  settings: TournamentSortSettings
  tenantName: string
}

const TournamentSortDialog = ({ surface, settings, tenantName }: TournamentSortDialogProps) => {
  const [open, setOpen] = useState(false)
  const [rules, setRules] = useState(settings.rules)
  const [activeField, setActiveField] = useState<TournamentSortField | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 8 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }))
  const available = (Object.keys(TOURNAMENT_SORT_FIELDS) as TournamentSortField[])
    .filter((field) => (surface === 'panel' || field !== 'status') && !rules.some((rule) => rule.field === field))
  const surfaceLabel = surface === 'panel' ? 'Panel' : 'Mis Torneos'

  const handleOpenChange = (nextOpen: boolean): void => {
    if (isPending) return
    if (nextOpen) { setRules(settings.rules.map((rule) => ({ ...rule }))); setError(null) }
    setActiveField(null)
    setOpen(nextOpen)
  }
  const handleMove = (from: number, to: number): void => {
    if (from === to || from < 0 || to < 0 || to >= rules.length) return
    setRules((previous) => {
      const next = [...previous]
      const [rule] = next.splice(from, 1)
      next.splice(to, 0, rule)
      return next
    })
  }
  const handleDragEnd = ({ active, over }: DragEndEvent): void => {
    setActiveField(null)
    if (over) handleMove(rules.findIndex((rule) => rule.field === active.id), rules.findIndex((rule) => rule.field === over.id))
  }
  const handleSave = (): void => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await saveTournamentSortSettings({ surface, rules })
        if (!result.success) { setError(result.error); return }
        setOpen(false)
        toast({ title: 'Orden guardado', description: `Se aplicó al ${surfaceLabel} de ${tenantName}.` })
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', '1')
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        router.refresh()
      } catch {
        setError('No pudimos guardar el orden. Intentá nuevamente.')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild><Button variant="outline" className="min-h-11"><SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />Ordenar por</Button></DialogTrigger>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="pr-6 text-left">
            <DialogTitle>Ordenar torneos · {surfaceLabel}</DialogTitle>
            <DialogDescription>Configuración compartida de {tenantName}. El primer criterio tiene prioridad; los siguientes resuelven los empates.</DialogDescription>
          </DialogHeader>
          <p id="sort-drag-help" className="text-sm text-muted-foreground">Arrastrá desde el ícono para cambiar la prioridad, o usá las flechas para subir y bajar.</p>
          {!settings.configured && surface === 'panel' && <p className="text-xs text-muted-foreground">Hasta el primer guardado se mantiene el orden actual del panel.</p>}
          <DndContext id={`tournament-sort-${surface}`} sensors={sensors} collisionDetection={closestCenter}
            accessibility={{ screenReaderInstructions: { draggable: 'Usá los botones Subir y Bajar para cambiar la prioridad con teclado.' } }}
            onDragStart={({ active }) => setActiveField(active.id as TournamentSortField)} onDragEnd={handleDragEnd} onDragCancel={() => setActiveField(null)}>
            <ol aria-label="Criterios por prioridad" className="space-y-2">
              {rules.map((rule, index) => <SortRow key={rule.field} rule={rule} index={index} total={rules.length} disabled={isPending || !settings.canEdit}
                onDirection={(direction) => setRules((previous) => previous.map((item) => item.field === rule.field ? { ...item, direction } : item))}
                onMove={(offset) => handleMove(index, index + offset)} onRemove={() => setRules((previous) => previous.filter((item) => item.field !== rule.field))} />)}
            </ol>
            <DragOverlay>{activeField ? <div className="flex items-center gap-3 rounded-surface border border-primary bg-card p-4 text-sm font-medium shadow-lg"><GripVertical className="h-5 w-5" />{TOURNAMENT_SORT_FIELDS[activeField]}</div> : null}</DragOverlay>
          </DndContext>
          {settings.canEdit && available.length > 0 && <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Agregar criterio</p>
            <div className="flex flex-wrap gap-2">{available.map((field) => <Button key={field} type="button" variant="outline" size="sm" className="min-h-11" disabled={isPending} onClick={() => setRules((previous) => [...previous, { field, direction: 'asc' }])}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />{TOURNAMENT_SORT_FIELDS[field]}</Button>)}</div>
          </div>}
          <p className="text-xs text-muted-foreground">Las sumas se ordenan por su promedio: SUMA13 equivale a 6.5 y SUMA14 a 7ma. En rangos se usa el número menor. Las fechas vacías y categorías desconocidas aparecen al final.</p>
          {!settings.canEdit && <p className="text-sm text-muted-foreground">Solo los administradores de {tenantName} pueden modificar este orden.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={() => handleOpenChange(false)}>{settings.canEdit ? 'Cancelar' : 'Cerrar'}</Button>
            {settings.canEdit && <Button type="button" disabled={isPending} onClick={handleSave}>{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}{isPending ? 'Guardando…' : 'Guardar'}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <span className="text-xs text-muted-foreground">{settings.configured ? describeTournamentSort(settings.rules) : 'Orden actual'}</span>
    </div>
  )
}

export default TournamentSortDialog
