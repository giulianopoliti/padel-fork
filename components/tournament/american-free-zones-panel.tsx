'use client'

import type { DragEvent } from 'react'
import { Check, CheckCircle2, GripVertical, Pointer, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getFreeZoneProgress } from '@/lib/services/americano-libre-zone-progress'
import type { FreeSource, FreeZoneCouple } from '@/types/americano-libre-editor'

type Props = {
  zones: Array<{ id: string; couples: FreeZoneCouple[] }>
  assigned: Set<string>; selected: FreeSource | null; isEditing: boolean
  onSelect: (source: FreeSource) => void
  onDragStart: (event: DragEvent<HTMLElement>, source: FreeSource) => void
  onDragEnd: () => void
  targetMatchesPerCouple?: number | null
}

export const AmericanFreeZonesPanel = ({ zones, assigned, selected, isEditing, onSelect, onDragStart, onDragEnd, targetMatchesPerCouple }: Props) => (
  <aside aria-label="Parejas por zona" className="order-first min-w-0 rounded-lg border border-slate-200 bg-white lg:order-last">
    <div className="space-y-3 rounded-t-lg border-b border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold">Parejas por zona</h3>
      <p className="text-xs text-muted-foreground">Todas las zonas. Seleccioná o arrastrá una pareja hasta la llave. El panel se cierra al guardar o terminar la edición.</p>
      <div className="flex flex-wrap gap-x-3 gap-y-2 text-xs">
        <span className="flex items-center gap-1 text-red-800"><Check className="h-3.5 w-3.5" />Ubicada</span>
        <span className="flex items-center gap-1 text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" />Zona completa</span>
        <span className="flex items-center gap-1 text-amber-800"><Timer className="h-3.5 w-3.5" />Partidos pendientes</span>
      </div>
    </div>
    <div>
      {!zones.length ? <p className="p-4 text-sm text-muted-foreground">No hay parejas en zonas para mostrar.</p> : <table className="w-full table-fixed border-separate border-spacing-0 text-left text-xs">
        <caption className="sr-only">Posiciones de zona, parejas, partidos ganados, perdidos y diferencia de games</caption>
        <colgroup><col className="w-10" /><col /><col className="w-10" /><col className="w-10" /><col className="w-10" /></colgroup>
        <thead className="bg-slate-100"><tr>
          {['Pos.', 'Pareja', 'PG', 'PP', 'DG'].map(label => <th key={label} scope="col" className="h-10 border-b border-r border-slate-200 px-2 py-2 text-center font-semibold last:border-r-0">{label}</th>)}
        </tr></thead>
        {zones.map(({ id: zoneId, couples }) => <tbody key={zoneId}>
          <tr><th colSpan={5} scope="rowgroup" className="border-y border-slate-300 bg-slate-200/70 px-3 py-3 text-sm font-semibold text-slate-900">{couples[0].zoneName}<span className="ml-2 text-xs font-normal text-slate-600">{couples.length} parejas</span></th></tr>
          {couples.map((couple) => {
            const inBracket = assigned.has(couple.coupleId)
            const disabled = !isEditing || !couple.eligible || inBracket
            const source: FreeSource = { kind: 'ZONE', zoneId, coupleId: couple.coupleId }
            const isSelected = selected?.kind === 'ZONE' && selected.coupleId === couple.coupleId
            const progress = getFreeZoneProgress(couple.wins, couple.losses, couples.length, targetMatchesPerCouple)
            const color = inBracket ? 'border-red-300 bg-red-50 text-red-950' : progress.complete
              ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-amber-300 bg-amber-50 text-amber-950'
            return <tr key={couple.coupleId} className="bg-white">
              <td className="border-b border-r border-slate-200 px-2 py-3 text-center align-top font-medium tabular-nums">{couple.position}</td>
              <td className="border-b border-r border-slate-200 p-2 align-top">
                <button type="button" disabled={disabled} draggable={!disabled} onClick={() => onSelect(source)}
                  onDragStart={event => onDragStart(event, source)} onDragEnd={onDragEnd}
                  aria-label={`Seleccionar ${couple.name} de ${couple.zoneName}`} aria-pressed={isSelected}
                  className={cn('min-h-11 w-full rounded-md border-2 p-2 text-left text-sm leading-5 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default', color,
                    !disabled && 'cursor-grab hover:border-blue-500 hover:shadow-md active:cursor-grabbing',
                    isSelected && 'border-blue-600 bg-blue-50 ring-2 ring-blue-500 ring-offset-1')}>
                  <span className="flex items-start gap-1.5">
                    {!disabled && <GripVertical aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />}
                    <span>{couple.name.split(' / ').map((name, index) => <span key={index} className="block break-words font-medium">{name}</span>)}</span>
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] leading-4">
                    {inBracket ? <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-1.5 text-[10px] font-semibold text-red-800"><Check className="h-3 w-3" />Ubicada</span>
                      : progress.complete ? <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Zona completa</span>
                        : <span className="flex items-center gap-1"><Timer className="h-3 w-3" />Pendientes</span>}
                    <span className="tabular-nums">{progress.played}/{progress.required} partidos</span>
                  </span>
                  {!disabled && <span className="mt-2 flex items-center gap-1 text-[11px] font-medium text-blue-800"><Pointer className="h-3 w-3" />{isSelected ? 'Elegí un lugar en la llave' : 'Seleccionar o arrastrar'}</span>}
                </button>
                {couple.reason && <p className="mt-1 px-1 text-xs text-slate-600">{couple.reason}</p>}
              </td>
              {[couple.wins, couple.losses, couple.gamesDifference].map((value, index) => <td key={index} className="border-b border-r border-slate-200 px-2 py-3 text-center align-top tabular-nums last:border-r-0">{value}</td>)}
            </tr>
          })}
        </tbody>)}
      </table>}
    </div>
  </aside>
)
