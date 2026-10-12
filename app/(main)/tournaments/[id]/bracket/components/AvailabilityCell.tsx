'use client'

import { useState } from 'react'
import { Check, Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface AvailabilitySlot {
  id: string
  date: string
  start_time: string
  end_time: string
  slot_type?: string
  is_system?: boolean
}

export type SaveAvailability = (coupleId: string, slotId: string, available: boolean, notes?: string) => Promise<boolean>

interface AvailabilityCellProps {
  coupleId?: string
  coupleName?: string
  slot: AvailabilitySlot
  available: boolean | null
  notes: string | null
  editable: boolean
  saving: boolean
  onSave: SaveAvailability
}

const AvailabilityCell = ({ coupleId, coupleName, slot, available, notes, editable, saving, onSave }: AvailabilityCellProps) => {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const canEdit = editable && !!coupleId && slot.slot_type === 'TIME_RANGE' && !slot.is_system
  const schedule = `${slot.date.split('T')[0]} ${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}`
  const handleOpenNote = () => {
    setDraft(notes || '')
    setOpen(true)
  }
  const handleSave = async () => {
    if (!coupleId || saving) return
    if (await onSave(coupleId, slot.id, true, draft)) setOpen(false)
  }

  return (
    <div className="space-y-0.5" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
      <div className="flex h-7 items-center justify-center gap-1" title={`${schedule}${notes ? ` — Nota: ${notes}` : ''}`}>
        {canEdit ? (
          <>
            <button type="button" disabled={saving} aria-label={`${available ? 'Desmarcar' : 'Marcar'} disponibilidad de ${coupleName} en ${schedule}`}
              className={cn('flex h-7 w-7 items-center justify-center rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50', available ? 'border-green-600 bg-green-600 text-white' : 'border-slate-300 bg-white text-slate-600')}
              onClick={() => { if (available && coupleId) void onSave(coupleId, slot.id, false); else handleOpenNote() }}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : available ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
            {available && <button type="button" disabled={saving} onClick={handleOpenNote} aria-label={`Editar nota de ${coupleName} en ${schedule}`} className="flex h-7 w-7 items-center justify-center rounded text-amber-700 hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-blue-500"><Pencil className="h-3 w-3" /></button>}
          </>
        ) : (
          <TooltipProvider><Tooltip><TooltipTrigger asChild>
          <span tabIndex={0} role="img" aria-label={available === null ? 'Sin datos' : available ? 'Disponible' : 'No disponible'} className={cn('flex h-4 w-4 items-center justify-center rounded border', available === null ? 'border-slate-300 bg-slate-100' : available ? 'border-green-600 bg-green-600 text-white' : 'border-red-300')}>
            {available && <Check className="h-3 w-3" />}
          </span>
          </TooltipTrigger><TooltipContent className="max-w-xs border bg-white text-slate-900"><p>{schedule}</p>{notes && <p className="text-blue-700">Nota: {notes}</p>}</TooltipContent></Tooltip></TooltipProvider>
        )}
      </div>
      <div className="text-[11px] leading-3 text-slate-500">{slot.start_time.slice(0, 5)}</div>
      {canEdit && <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Disponibilidad manual</DialogTitle><DialogDescription>{coupleName} · {schedule}</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor={`availability-note-${coupleId}-${slot.id}`}>Nota (opcional)</Label><Textarea id={`availability-note-${coupleId}-${slot.id}`} value={draft} onChange={event => setDraft(event.target.value)} disabled={saving} placeholder="Por ejemplo: puede jugar a partir de las 18:00" /></div>
          <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={saving} onClick={handleSave}>{saving ? 'Guardando…' : 'Guardar disponibilidad'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  )
}

export default AvailabilityCell
