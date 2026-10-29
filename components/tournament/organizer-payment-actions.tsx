'use client'

import { Banknote, ChevronRight, TicketCheck, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface OrganizerPaymentActionsProps {
  hasPlace: boolean
  hasProof: boolean
  individual: boolean
  cashSelected: boolean
  proofOpen: boolean
  canUpload: boolean
  canAssignPlace: boolean
  disabled: boolean
  onCash: () => void
  onProof: () => void
  onAssignPlace: () => void
}

export const OrganizerPaymentActions = ({
  hasPlace, hasProof, individual, cashSelected, proofOpen, canUpload, canAssignPlace,
  disabled, onCash, onProof, onAssignPlace,
}: OrganizerPaymentActionsProps) => <section aria-label="Acciones de pago y cupo" className="space-y-3">
  <Button type="button" variant="outline" disabled={disabled || cashSelected} onClick={onCash}
    className="h-auto min-h-16 w-full justify-start gap-3 whitespace-normal rounded-xl border-slate-200 bg-white p-4 text-left hover:border-slate-400 hover:bg-slate-50">
    <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><Banknote className="h-5 w-5" aria-hidden="true" /></span>
    <span className="min-w-0 flex-1"><span className="block font-semibold">Paga en efectivo</span>
      <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">{cashSelected ? 'Esta forma de pago ya está guardada.' : individual ? 'Guardá esta forma de pago.' : hasPlace ? 'Guardá esta forma de pago. El cupo se conserva.' : 'Guardá esta forma de pago y asigná cupo, si hay lugar.'}</span></span>
    {!cashSelected && <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
  </Button>
  <Button type="button" variant="outline" disabled={disabled || !canUpload} onClick={onProof} aria-expanded={proofOpen}
    className={`h-auto min-h-16 w-full justify-start gap-3 whitespace-normal rounded-xl p-4 text-left ${proofOpen ? 'border-blue-300 bg-blue-50 hover:bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50'}`}>
    <span className="rounded-lg bg-blue-50 p-2 text-blue-700"><Upload className="h-5 w-5" aria-hidden="true" /></span>
    <span className="min-w-0 flex-1"><span className="block font-semibold">{hasProof ? 'Revisar comprobante' : 'Cargar comprobante'}</span>
      <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">{!canUpload ? 'La transferencia no está habilitada para este torneo.' : hasProof ? 'Abrí el archivo, revisalo o reemplazalo.' : 'Adjuntá el archivo de la transferencia de la pareja.'}</span></span>
    <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 ${proofOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
  </Button>
  {!individual && !hasPlace && <Button type="button" variant="outline" disabled={disabled || !canAssignPlace} onClick={onAssignPlace}
    className="h-auto min-h-16 w-full justify-start gap-3 whitespace-normal rounded-xl border-amber-200 bg-amber-50/50 p-4 text-left hover:border-amber-300 hover:bg-amber-50">
    <span className="rounded-lg bg-amber-100 p-2 text-amber-800"><TicketCheck className="h-5 w-5" aria-hidden="true" /></span>
    <span className="min-w-0 flex-1"><span className="block font-semibold">{hasProof ? 'Asignar cupo' : 'Asignar cupo sin comprobante'}</span>
      <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">Reservá el lugar sin cambiar la forma de pago.</span></span>
    <ChevronRight className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
  </Button>}
</section>
